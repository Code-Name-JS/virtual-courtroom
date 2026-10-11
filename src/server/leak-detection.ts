// 유출 자동 탐지 (01 정보 유출과 제재, 05 자동 탐지 기준, M7).
// 탐지 결과는 근거와 함께 운영자 화면(03 O-05)에 올리기만 하고, 제재는 운영자가 확인한 뒤에만 합니다.
// 웹 앱과 워커가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import { Prisma, type PrismaClient } from "@prisma/client";
import { BOT_MIN_PAGE_VIEWS, VIEW_WINDOW_MINUTES, type ViewAnalysis, analyzeViews, compareCopy, shingles } from "@/domain/leak";
import { CASE_ID } from "./lifecycle";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * 양측이 함께 볼 수 있는 글. 이 문장들이 겹치는 것은 유출이 아니므로 비교에서 뺍니다.
 * 사건 본문·개요, 그리고 2심이라면 공개된 지난 심급의 게시글과 판결 이유.
 */
export async function publicShingles(db: PrismaClient, round: number): Promise<Set<string>> {
  const current = await db.case.findUnique({ where: { id: CASE_ID }, select: { title: true, summary: true, body: true } });
  const texts = current ? [current.title, current.summary, current.body] : [];
  if (round > 1) {
    const [posts, judgments] = await Promise.all([
      db.post.findMany({ where: { round: { lt: round } }, select: { body: true } }),
      db.judgment.findMany({ where: { round: { lt: round } }, select: { reasoning: true } }),
    ]);
    texts.push(...posts.map((p) => p.body), ...judgments.map((j) => j.reasoning));
  }
  const result = new Set<string>();
  for (const text of texts) for (const s of shingles(text)) result.add(s);
  return result;
}

/**
 * 복사 글 탐지: 방금 올리거나 고친 글이 상대 측 게시판의 글과 얼마나 겹치는지 비교합니다.
 * 증거 제출 기간에는 상대 측 게시판을 볼 수 없으므로, 많이 겹치면 상대 측 정보를 전달받아 올린 글일 수 있습니다.
 * 방금 쓴 글을 '의심 글'(target), 상대 측의 글을 '원본'(source)으로 기록합니다. 돌려주는 값은 탐지한 건수입니다.
 */
export async function detectCopiedPost(db: PrismaClient, postId: string, now = new Date()): Promise<number> {
  const post = await db.post.findUnique({ where: { id: postId }, include: { author: { select: { userId: true } } } });
  if (!post) return 0;
  const [others, exclude] = await Promise.all([
    db.post.findMany({ where: { round: post.round, side: { not: post.side } }, select: { id: true, body: true } }),
    publicShingles(db, post.round),
  ]);

  let found = 0;
  for (const other of others) {
    const result = compareCopy(post.body, other.body, exclude);
    if (!result.flagged) continue;
    // 상대 글이 먼저 이 글을 베낀 것으로 이미 탐지되었다면(이 글을 고친 경우) 거꾸로 다시 기록하지 않음
    const reverse = await db.leakDetection.findFirst({ where: { type: "copy_similarity", targetPostId: other.id, sourcePostId: post.id } });
    if (reverse) continue;

    const existing = await db.leakDetection.findFirst({ where: { type: "copy_similarity", targetPostId: post.id, sourcePostId: other.id } });
    if (existing) {
      // 글을 고쳐 더 많이 겹치게 되었으면 점수만 갱신. 운영자가 이미 처리한 탐지는 그대로 둠
      if (existing.status === "open" && result.score !== existing.score) {
        await db.leakDetection.update({ where: { id: existing.id }, data: { score: result.score, detail: { shared: result.shared } } });
      }
      continue;
    }
    try {
      await db.leakDetection.create({
        data: {
          type: "copy_similarity",
          round: post.round,
          targetPostId: post.id,
          sourcePostId: other.id,
          suspectUserId: post.author.userId,
          score: result.score,
          detail: { shared: result.shared },
          detectedAt: now,
        },
      });
      found++;
    } catch (error) {
      // 같은 글을 동시에 두 번 검사한 경우
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return found;
}

export type ViewDetail = {
  pageViews: number;
  distinctPosts: number;
  medianIntervalMs: number | null;
  firstAt: string | null;
  lastAt: string | null;
  reasons: ViewAnalysis["reasons"];
};

function toDetail(analysis: ViewAnalysis): ViewDetail {
  return { ...analysis, firstAt: analysis.firstAt?.toISOString() ?? null, lastAt: analysis.lastAt?.toISOString() ?? null };
}

/**
 * 비정상 열람 탐지: 최근 10분의 열람 기록을 회원별로 보고, 짧은 시간의 대량 열람이나 자동화 도구로 보이는 열람을 찾습니다.
 * 워커가 1분마다 실행합니다. 같은 회원의 처리되지 않은 탐지가 있으면 새로 만들지 않고 더 심한 쪽으로 갱신하며,
 * 운영자가 이미 판단한 열람은 다시 탐지하지 않습니다. 돌려주는 값은 새로 탐지한 건수입니다.
 */
export async function detectAbnormalViews(db: PrismaClient, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - VIEW_WINDOW_MINUTES * 60_000);
  // 열람 기록 줄 수는 화면 열람 수보다 많거나 같으므로, 기준에 못 미치는 회원은 먼저 거름
  const counts = await db.viewLog.groupBy({ by: ["userId"], where: { viewedAt: { gte: since, lte: now } }, _count: { _all: true } });
  const candidates = counts.filter((c) => c._count._all > BOT_MIN_PAGE_VIEWS).map((c) => c.userId);
  if (candidates.length === 0) return 0;

  const current = await db.case.findUnique({ where: { id: CASE_ID }, select: { round: true } });
  const members = await db.user.findMany({ where: { id: { in: candidates }, role: "member" }, select: { id: true } });
  let found = 0;
  for (const { id: userId } of members) {
    const latest = await db.leakDetection.findFirst({ where: { type: "abnormal_view", suspectUserId: userId }, orderBy: { detectedAt: "desc" } });
    // 운영자가 처리한 탐지 이후의 열람만 봄
    const from = latest && latest.status !== "open" && latest.handledAt && latest.handledAt > since ? latest.handledAt : since;
    const records = await db.viewLog.findMany({
      where: { userId, viewedAt: { gt: from, lte: now } },
      select: { watermarkCode: true, postId: true, viewedAt: true },
    });
    const analysis = analyzeViews(records);
    if (analysis.reasons.length === 0) continue;

    if (latest?.status === "open") {
      if (analysis.pageViews > latest.score) {
        await db.leakDetection.update({ where: { id: latest.id }, data: { score: analysis.pageViews, detail: toDetail(analysis) } });
      }
      continue;
    }
    await db.leakDetection.create({
      data: { type: "abnormal_view", round: current?.round ?? 1, suspectUserId: userId, score: analysis.pageViews, detail: toDetail(analysis), detectedAt: now },
    });
    found++;
  }
  return found;
}

/**
 * 워터마크 일치: 퍼진 캡처나 이미지에서 찾은 코드로 열람자를 확인했을 때, 제재의 근거로 남기기 위해 탐지 결과로 기록합니다.
 * 같은 코드는 한 번만 기록합니다.
 */
export async function recordWatermarkMatch(db: PrismaClient, rawCode: string, now = new Date()): Promise<Result<{ detectionId: string }>> {
  const code = rawCode.trim().toUpperCase();
  const logs = await db.viewLog.findMany({
    where: { watermarkCode: code },
    include: { post: { select: { round: true, side: true } } },
    orderBy: { viewedAt: "asc" },
  });
  if (logs.length === 0) return { ok: false, error: "이 코드의 열람 기록이 없습니다." };
  const existing = await db.leakDetection.findFirst({ where: { type: "watermark_match", detail: { path: ["code"], equals: code } } });
  if (existing) return { ok: true, value: { detectionId: existing.id } };
  const detection = await db.leakDetection.create({
    data: {
      type: "watermark_match",
      round: logs[0].post.round,
      suspectUserId: logs[0].userId,
      score: logs.length,
      detail: { code, viewedAt: logs[0].viewedAt.toISOString(), side: logs[0].post.side },
      detectedAt: now,
    },
  });
  return { ok: true, value: { detectionId: detection.id } };
}

/** 운영자가 확인해 보니 문제가 없는 탐지를 기각합니다. 이유는 기록으로 남깁니다. */
export async function dismissDetection(db: PrismaClient, operatorId: string, detectionId: string, note: string, now = new Date()): Promise<Result> {
  const detection = await db.leakDetection.findUnique({ where: { id: detectionId } });
  if (!detection || detection.status !== "open") return { ok: false, error: "처리할 수 있는 탐지 결과가 아닙니다." };
  if (!note.trim()) return { ok: false, error: "제재하지 않는 이유를 적어 주세요." };
  await db.leakDetection.update({
    where: { id: detectionId },
    data: { status: "dismissed", handledBy: operatorId, handledAt: now, resolutionNote: note.trim().slice(0, 1000) },
  });
  return { ok: true, value: undefined };
}

const postSelect = {
  select: {
    id: true,
    round: true,
    side: true,
    body: true,
    isHidden: true,
    createdAt: true,
    author: { select: { userId: true, user: { select: { nickname: true } } } },
  },
} as const;

/** 운영자가 처리할 탐지 결과 (03 O-05) */
export async function listOpenDetections(db: PrismaClient) {
  return db.leakDetection.findMany({
    where: { status: "open" },
    include: { targetPost: postSelect, sourcePost: postSelect, suspect: { select: { id: true, nickname: true } } },
    orderBy: { detectedAt: "asc" },
  });
}

/** 처리한 탐지 결과. 복사 글은 올린 사람을 제재한 뒤에도 원본을 전달한 사람을 찾는 데 다시 볼 수 있어야 함 */
export async function listHandledDetections(db: PrismaClient, take = 20) {
  return db.leakDetection.findMany({
    where: { status: { not: "open" } },
    include: { targetPost: postSelect, sourcePost: postSelect, suspect: { select: { id: true, nickname: true } }, handler: { select: { nickname: true } } },
    orderBy: { handledAt: "desc" },
    take,
  });
}

export async function countOpenDetections(db: PrismaClient): Promise<number> {
  return db.leakDetection.count({ where: { status: "open" } });
}

/**
 * 복사 글 탐지의 원본을 의심 글이 올라오기 전에 열람한 사람. 증거 제출 기간에 원본은 같은 진영만 볼 수 있었으므로,
 * 이 중에 정보를 전달한 사람이 있을 수 있습니다. 운영자는 제외합니다.
 */
export async function listSourceViewers(db: PrismaClient, sourcePostId: string, before: Date, limit = 30) {
  const views = await db.viewLog.groupBy({
    by: ["userId"],
    where: { postId: sourcePostId, viewedAt: { lt: before }, user: { role: "member" } },
    _count: { _all: true },
    _min: { viewedAt: true },
    orderBy: { _min: { viewedAt: "asc" } },
    take: limit,
  });
  const users = await db.user.findMany({ where: { id: { in: views.map((v) => v.userId) } }, select: { id: true, nickname: true } });
  const names = new Map(users.map((u) => [u.id, u.nickname]));
  return views.map((v) => ({ userId: v.userId, nickname: names.get(v.userId) ?? "(알 수 없음)", views: v._count._all, firstAt: v._min.viewedAt }));
}
