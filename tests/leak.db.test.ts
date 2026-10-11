import { PrismaClient, type Side } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  detectAbnormalViews,
  detectCopiedPost,
  dismissDetection,
  listOpenDetections,
  listSourceViewers,
  recordWatermarkMatch,
} from "@/server/leak-detection";

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다. 이 DB의 데이터를 모두 지웁니다.
const url = process.env.TEST_DATABASE_URL;

const CASE_BODY = "피고인은 사건 당일 밤 열한 시경 편의점 앞 CCTV에 찍혔다. 편의점 직원은 피고인이 담배를 샀다고 진술했다.";
const ORIGINAL =
  "그 영상의 시각 표시가 실제보다 이십 분 빠르게 맞춰져 있었다는 점을 생각하면, 피고인이 현장에 있었다는 주장은 성립하기 어렵습니다. 알리바이 증인의 진술과도 정확히 맞아떨어집니다.";

describe.skipIf(!url)("유출 자동 탐지 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let n = 0;

  async function juror(side: Side) {
    n++;
    const user = await db.user.create({ data: { email: `j${n}@t.local`, passwordHash: "x", nickname: `배심원${n}`, emailVerifiedAt: new Date() } });
    const participation = await db.participation.create({ data: { userId: user.id, round: 1, side, joinedVia: "indictment_vote", status: "signed" } });
    return { user, participation };
  }

  async function post(author: Awaited<ReturnType<typeof juror>>, body: string, createdAt = new Date()) {
    return db.post.create({ data: { round: 1, side: author.participation.side, authorParticipationId: author.participation.id, body, createdAt } });
  }

  beforeEach(async () => {
    await db.$transaction([db.leakDetection.deleteMany(), db.case.deleteMany(), db.user.deleteMany()]);
    await db.case.create({ data: { id: 1, title: "편의점 사건", summary: "요약", body: CASE_BODY, aiOriginalBody: "원본", status: "EVIDENCE" } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("상대 측 글을 옮겨 적은 글을 탐지하고, 원본을 열람한 같은 진영 회원을 근거로 보여 준다", async () => {
    const author = await juror("dismiss");
    const leaker = await juror("dismiss");
    const poster = await juror("indict");
    const source = await post(author, ORIGINAL, new Date(Date.now() - 60 * 60_000));
    await db.viewLog.create({ data: { userId: leaker.user.id, postId: source.id, watermarkCode: "LEAK0001", viewedAt: new Date(Date.now() - 30 * 60_000) } });

    const copied = await post(poster, `상대 측 주장은 이렇답니다. ${ORIGINAL.slice(0, 70)} 반박이 필요합니다.`);
    expect(await detectCopiedPost(db, copied.id)).toBe(1);
    // 같은 글을 다시 검사해도 한 건만
    expect(await detectCopiedPost(db, copied.id)).toBe(0);

    const [detection] = await listOpenDetections(db);
    expect(detection).toMatchObject({ type: "copy_similarity", targetPostId: copied.id, sourcePostId: source.id, suspectUserId: poster.user.id, status: "open" });
    expect(detection.score).toBeGreaterThanOrEqual(40);

    const viewers = await listSourceViewers(db, source.id, detection.detectedAt);
    expect(viewers.map((v) => v.nickname)).toEqual([leaker.user.nickname]);

    // 원본 글을 나중에 고쳐도 거꾸로(원본이 베낀 것으로) 기록하지 않음
    expect(await detectCopiedPost(db, source.id)).toBe(0);
  });

  it("같은 진영의 글, 사건 본문을 함께 인용한 글은 탐지하지 않는다", async () => {
    const a = await juror("indict");
    const b = await juror("indict");
    const c = await juror("dismiss");
    await post(a, ORIGINAL);
    const sameSide = await post(b, ORIGINAL);
    expect(await detectCopiedPost(db, sameSide.id)).toBe(0);

    await post(a, `사건 본문에 따르면 ${CASE_BODY} 그러니 현장 근처에 있었습니다.`);
    const quoting = await post(c, `${CASE_BODY} 하지만 담배를 산 것은 범행과 무관합니다.`);
    expect(await detectCopiedPost(db, quoting.id)).toBe(0);
  });

  it("짧은 시간에 화면을 대량으로 연 회원을 탐지하고, 운영자가 기각한 열람은 다시 탐지하지 않는다", async () => {
    const reader = await juror("indict");
    const normal = await juror("indict");
    const target = await post(reader, "읽을 글");
    const now = new Date();
    const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000);
    await db.viewLog.createMany({
      data: [
        ...Array.from({ length: 70 }, (_, i) => ({ userId: reader.user.id, postId: target.id, watermarkCode: `R${i}`, viewedAt: at(500 - i * 7) })),
        ...Array.from({ length: 10 }, (_, i) => ({ userId: normal.user.id, postId: target.id, watermarkCode: `N${i}`, viewedAt: at(500 - i * 40) })),
      ],
    });

    expect(await detectAbnormalViews(db, now)).toBe(1);
    // 처리 전 탐지가 있으면 새로 만들지 않음
    expect(await detectAbnormalViews(db, now)).toBe(0);
    const [detection] = await listOpenDetections(db);
    expect(detection).toMatchObject({ type: "abnormal_view", suspectUserId: reader.user.id, score: 70 });
    expect(detection.detail).toMatchObject({ pageViews: 70, reasons: ["burst"] });

    const operator = await db.user.create({ data: { email: "op@t.local", passwordHash: "x", nickname: "운영자", role: "operator" } });
    expect((await dismissDetection(db, operator.id, detection.id, "")).ok).toBe(false);
    expect((await dismissDetection(db, operator.id, detection.id, "빠르게 넘겨 읽은 것으로 확인")).ok).toBe(true);
    expect(await detectAbnormalViews(db, new Date(now.getTime() + 1000))).toBe(0);
    expect(await db.leakDetection.findUniqueOrThrow({ where: { id: detection.id } })).toMatchObject({ status: "dismissed", handledBy: operator.id });
  });

  it("운영자의 열람은 탐지하지 않는다", async () => {
    const writer = await juror("indict");
    const target = await post(writer, "글");
    const operator = await db.user.create({ data: { email: "op@t.local", passwordHash: "x", nickname: "운영자", role: "operator" } });
    const now = new Date();
    await db.viewLog.createMany({
      data: Array.from({ length: 80 }, (_, i) => ({ userId: operator.id, postId: target.id, watermarkCode: `O${i}`, viewedAt: new Date(now.getTime() - 400_000 + i * 1000) })),
    });
    expect(await detectAbnormalViews(db, now)).toBe(0);
  });

  it("워터마크 코드로 찾은 열람자를 탐지 결과로 남겨 제재의 근거로 쓴다", async () => {
    const reader = await juror("dismiss");
    const p1 = await post(reader, "글 하나");
    const p2 = await post(reader, "글 둘");
    await db.viewLog.createMany({ data: [p1, p2].map((p) => ({ userId: reader.user.id, postId: p.id, watermarkCode: "WM12AB34" })) });

    expect((await recordWatermarkMatch(db, "nope")).ok).toBe(false);
    const first = await recordWatermarkMatch(db, "wm12ab34");
    expect(first.ok).toBe(true);
    const again = await recordWatermarkMatch(db, "WM12AB34");
    expect(again.ok && first.ok && again.value.detectionId === first.value.detectionId).toBe(true);
    const [detection] = await listOpenDetections(db);
    expect(detection).toMatchObject({ type: "watermark_match", suspectUserId: reader.user.id, score: 2, detail: { code: "WM12AB34", side: "dismiss" } });
  });
});
