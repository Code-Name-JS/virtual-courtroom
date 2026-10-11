import "server-only";
import type { CaseStatus, Side } from "@prisma/client";
import { type EvidenceInput, POST_MAX_LENGTH, type Viewer, canReadBoard, canWriteBoard, checkEvidence } from "@/domain/board";
import { isActiveMember } from "@/domain/account";
import { randomToken } from "./crypto";
import { db } from "./db";
import { sanitizeImage, watermarkImage } from "./images";
import { detectCopiedPost } from "./leak-detection";
import { CASE_ID } from "./lifecycle";
import { contentTypeOf, deleteUploads, readUpload, saveUpload } from "./uploads";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** 현재 심급에서 이 사용자의 참여 상태와 쓰기 제한 여부 */
export type BoardUser = { id: string; role: string; emailVerifiedAt: Date | null; isUnder14: boolean; guardianConsentedAt: Date | null };

export async function getViewer(user: BoardUser | null): Promise<{ viewer: Viewer; round: number; status: CaseStatus }> {
  const { round, status } = await getStatus();
  if (!user) return { viewer: { loggedIn: false, isOperator: false, participation: null, writeBanned: false }, round, status };

  const [participation, writeBan] = await Promise.all([
    db.participation.findUnique({ where: { userId_round: { userId: user.id, round } } }),
    db.sanction.findFirst({
      where: { userId: user.id, round, level: "write_ban", OR: [{ appeal: null }, { appeal: { status: { not: "accepted" } } }] },
    }),
  ]);
  return {
    viewer: {
      loggedIn: isActiveMember(user),
      isOperator: user.role === "operator",
      participation: participation ? { side: participation.side, status: participation.status } : null,
      writeBanned: writeBan !== null,
    },
    round,
    status,
  };
}

async function getStatus(): Promise<{ status: CaseStatus; round: number }> {
  const current = await db.case.findUnique({ where: { id: CASE_ID }, select: { status: true, round: true } });
  return { status: current?.status ?? "DRAFT", round: current?.round ?? 1 };
}

const authorSelect = { author: { select: { id: true, user: { select: { nickname: true } } } } } as const;

/** 진영 게시판의 스레드 목록 (첫 글만, 최신순). 숨긴 글은 운영자에게만 보입니다. */
export async function listThreads(round: number, side: Side, includeHidden: boolean) {
  const roots = await db.post.findMany({
    where: { round, side, rootPostId: null, ...(includeHidden ? {} : { isHidden: false }) },
    include: { ...authorSelect, evidence: true, _count: { select: { threadAll: { where: includeHidden ? {} : { isHidden: false } } } } },
    orderBy: { createdAt: "desc" },
  });
  return roots;
}

export async function getThread(rootId: string, includeHidden: boolean) {
  const root = await db.post.findUnique({ where: { id: rootId }, include: { ...authorSelect, evidence: true, revisions: true } });
  if (!root || root.rootPostId !== null || (root.isHidden && !includeHidden)) return null;
  const replies = await db.post.findMany({
    where: { rootPostId: rootId, ...(includeHidden ? {} : { isHidden: false }) },
    include: { ...authorSelect, evidence: true, revisions: true },
    orderBy: { createdAt: "asc" },
  });
  return { root, replies };
}

/**
 * 열람 기록과 워터마크 (05 정보 유출 확인 방법). 화면을 열 때마다 계정과 연결된 코드를 새로 만들어
 * 화면에 겹쳐 표시하고, 어떤 글을 봤는지 기록합니다. 캡처가 퍼지면 이 코드로 열람자를 찾습니다.
 */
export async function recordViews(userId: string, postIds: string[]): Promise<string> {
  const code = randomToken(6).replace(/[-_]/g, "x").slice(0, 8).toUpperCase();
  if (postIds.length > 0) {
    await db.viewLog.createMany({ data: postIds.map((postId) => ({ userId, postId, watermarkCode: code })) });
  }
  return code;
}

/** 이미지 증거자료는 브라우저가 보낸 파일 그대로 받습니다 */
export type NewEvidence = Exclude<EvidenceInput, { type: "image" }> | { type: "image"; file: File; source: string };

type NewPost = { side: Side; body: string; evidence: NewEvidence[]; parentPostId?: string };

/**
 * 복사 글 탐지 (M7). 글은 이미 저장되었으므로, 탐지에 실패해도 글쓰기는 실패로 돌리지 않고 기록만 남깁니다.
 */
async function detectCopies(postId: string) {
  try {
    await detectCopiedPost(db, postId);
  } catch (error) {
    console.error("[leak] 복사 글 탐지 실패", error);
  }
}

/** 이미지를 검사하고 메타데이터(EXIF)를 지워 저장합니다. 하나라도 실패하면 저장한 파일을 지우고 실패로 돌려줍니다. */
async function storeImages(items: NewEvidence[]): Promise<Result<Map<number, string>>> {
  const keys = new Map<number, string>();
  for (const [i, item] of items.entries()) {
    if (item.type !== "image") continue;
    const clean = await sanitizeImage(Buffer.from(await item.file.arrayBuffer()));
    if (!clean.ok) {
      await deleteUploads([...keys.values()]);
      return clean;
    }
    keys.set(i, await saveUpload(clean.data, clean.format));
  }
  return { ok: true, value: keys };
}

export async function createPost(user: BoardUser, input: NewPost): Promise<Result<{ rootId: string }>> {
  const { viewer, round, status } = await getViewer(user);
  const check = canWriteBoard(status, viewer, input.side);
  if (!check.ok) return { ok: false, error: check.reason };

  const body = input.body.trim();
  if (!body) return { ok: false, error: "내용을 입력해 주세요." };
  if (body.length > POST_MAX_LENGTH) return { ok: false, error: `글은 ${POST_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  const evidence = checkEvidence(input.evidence);
  if (!evidence.ok) return evidence;

  let rootPostId: string | null = null;
  if (input.parentPostId) {
    const parent = await db.post.findUnique({ where: { id: input.parentPostId } });
    if (!parent || parent.round !== round || parent.side !== input.side || parent.isHidden) {
      return { ok: false, error: "답글을 달 글을 찾을 수 없습니다." };
    }
    rootPostId = parent.rootPostId ?? parent.id;
  }

  const participation = await db.participation.findUniqueOrThrow({ where: { userId_round: { userId: user.id, round } } });
  const images = await storeImages(input.evidence);
  if (!images.ok) return images;
  let post;
  try {
    post = await db.post.create({
      data: {
        round,
        side: input.side,
        authorParticipationId: participation.id,
        rootPostId,
        parentPostId: input.parentPostId ?? null,
        body,
        evidence: {
          create: input.evidence.map((item, i) => ({
            type: item.type,
            urlOrFileKey: item.type === "image" ? images.value.get(i)! : item.value.trim(),
            sourceNote: item.source.trim(),
          })),
        },
      },
    });
  } catch (error) {
    await deleteUploads([...images.value.values()]);
    throw error;
  }
  await detectCopies(post.id);
  return { ok: true, value: { rootId: rootPostId ?? post.id } };
}

async function getOwnPost(user: BoardUser, postId: string) {
  const { viewer, status } = await getViewer(user);
  const post = await db.post.findUnique({ where: { id: postId }, include: { author: true } });
  if (!post || post.author.userId !== user.id || post.isHidden) return { ok: false as const, error: "고칠 수 있는 글이 아닙니다." };
  const check = canWriteBoard(status, viewer, post.side);
  if (!check.ok) return { ok: false as const, error: check.reason };
  return { ok: true as const, post };
}

/** 증거 제출 기간에만 고칠 수 있고, 고치기 전 내용은 기록으로 남깁니다 (04 post_revision). */
export async function editPost(user: BoardUser, postId: string, body: string): Promise<Result<{ rootId: string }>> {
  const found = await getOwnPost(user, postId);
  if (!found.ok) return { ok: false, error: found.error };
  const text = body.trim();
  if (!text || text.length > POST_MAX_LENGTH) return { ok: false, error: `내용은 1~${POST_MAX_LENGTH}자로 입력해 주세요.` };
  await db.$transaction([
    db.postRevision.create({ data: { postId, body: found.post.body } }),
    db.post.update({ where: { id: postId }, data: { body: text } }),
  ]);
  await detectCopies(postId);
  return { ok: true, value: { rootId: found.post.rootPostId ?? found.post.id } };
}

/** 삭제하면 배심원에게는 숨기되 실제로 지우지 않습니다. 운영자는 계속 볼 수 있습니다 (04 결정). */
export async function deletePost(user: BoardUser, postId: string): Promise<Result<{ rootId: string | null }>> {
  const found = await getOwnPost(user, postId);
  if (!found.ok) return { ok: false, error: found.error };
  await db.post.update({ where: { id: postId }, data: { isHidden: true, hiddenReason: "작성자가 삭제" } });
  return { ok: true, value: { rootId: found.post.rootPostId } };
}

export async function reportPost(
  user: BoardUser,
  postId: string,
  reason: "leak" | "abuse" | "other",
  detail: string,
): Promise<Result> {
  const { viewer, status, round } = await getViewer(user);
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || !canReadBoard(status, viewer, post.side, post.round < round)) return { ok: false, error: "신고할 수 있는 글이 아닙니다." };
  if (!detail.trim()) return { ok: false, error: "신고 내용을 적어 주세요." };
  await db.report.create({ data: { reporterUserId: user.id, targetPostId: postId, reason, detail: detail.trim().slice(0, 2000) } });
  return { ok: true, value: undefined };
}

/**
 * 증거 이미지. 그 글을 읽을 수 있고, 이 코드로 그 글을 연 열람 기록이 있을 때만 돌려줍니다.
 * 화면의 워터마크와 같은 코드를 이미지에도 새겨, 이미지만 따로 저장해 퍼뜨려도 열람자를 찾을 수 있게 합니다 (M7).
 */
export async function getEvidenceImage(user: BoardUser, evidenceId: string, code: string) {
  const evidence = await db.evidence.findUnique({ where: { id: evidenceId }, include: { post: true } });
  if (!evidence || evidence.type !== "image") return null;
  const { viewer, status, round } = await getViewer(user);
  if (evidence.post.isHidden && !viewer.isOperator) return null;
  if (!canReadBoard(status, viewer, evidence.post.side, evidence.post.round < round)) return null;
  const view = await db.viewLog.findFirst({ where: { userId: user.id, postId: evidence.postId, watermarkCode: code.trim().toUpperCase() } });
  if (!view) return null;
  const data = await readUpload(evidence.urlOrFileKey);
  if (!data) return null;
  return { data: await watermarkImage(data, view.watermarkCode), contentType: contentTypeOf(evidence.urlOrFileKey) };
}

export async function countPosts(round: number, side: Side): Promise<number> {
  return db.post.count({ where: { round, side, isHidden: false } });
}
