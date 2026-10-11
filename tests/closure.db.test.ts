import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { announceClosure, executeClosure, isSiteClosed, purgePersonalData } from "@/server/closure";
import { readUpload, saveUpload } from "@/server/uploads";

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다. 이 DB의 데이터를 모두 지웁니다.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("사이트 폐쇄와 개인정보 파기 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function setupFinalizedCase() {
    await db.$transaction([
      db.advocateRecommendation.deleteMany(),
      db.verdictBallot.deleteMany(),
      db.caseEvent.deleteMany(),
      db.notice.deleteMany(),
      db.stageSchedule.deleteMany(),
      db.judgment.deleteMany(),
      db.case.deleteMany(),
      db.user.deleteMany(),
    ]);
    await db.case.create({
      data: { id: 1, title: "표절 사건", summary: "요약", body: "정리본 내용", aiOriginalBody: "AI 원본", reviewNote: "검수 메모", status: "FINALIZED" },
    });
    const operator = await db.user.create({ data: { email: "op@t.local", passwordHash: "x", nickname: "op", role: "operator" } });
    const juror = await db.user.create({ data: { email: "j@t.local", passwordHash: "x", nickname: "juror", emailVerifiedAt: new Date() } });
    await db.session.create({ data: { tokenHash: "t", userId: juror.id, expiresAt: new Date(Date.now() + 1e9) } });
    await db.ipBinding.create({ data: { userId: juror.id, ipHash: "h", verifiedAt: new Date() } });
    await db.indictmentVote.create({ data: { userId: juror.id, choice: "indict" } });
    const p = await db.participation.create({ data: { userId: juror.id, round: 1, side: "indict", joinedVia: "indictment_vote", status: "signed" } });
    const post = await db.post.create({ data: { round: 1, side: "indict", authorParticipationId: p.id, body: "게시글" } });
    await db.viewLog.create({ data: { userId: juror.id, postId: post.id, watermarkCode: "ABCD1234" } });
    const imageKey = await saveUpload(Buffer.from("image"), "png");
    await db.evidence.create({ data: { postId: post.id, type: "image", urlOrFileKey: imageKey, sourceNote: "" } });
    await db.leakDetection.create({ data: { type: "abnormal_view", suspectUserId: juror.id, score: 70, detail: { pageViews: 70 } } });
    await db.verdictBallot.create({ data: { round: 1, choice: "guilty" } });
    await db.rateLimitEvent.create({ data: { key: "signup:h" } });
    await db.judgment.create({
      data: { round: 1, outcome: "guilty", sentenceType: "fine", sentenceDetail: "300만 원", reasoning: "이유", baselineIndictRatio: 100, verdictGuilty: 1, verdictNotGuilty: 0, pronouncedBy: operator.id },
    });
    return { operatorId: operator.id, imageKey };
  }

  it("폐쇄를 공지하면 공지와 모든 회원에게 이메일 알림이 예약된다", async () => {
    const { operatorId } = await setupFinalizedCase();
    const tooSoon = await announceClosure(db, operatorId, { scheduledAt: new Date(Date.now() + 60_000), summary: "요약" }, { demoMode: false });
    expect(tooSoon.ok).toBe(false);
    const ok = await announceClosure(db, operatorId, { scheduledAt: new Date(Date.now() + 2 * 60_000), summary: "결과 요약" }, { demoMode: true });
    expect(ok.ok).toBe(true);
    expect(await db.notice.count({ where: { title: "사이트 폐쇄 안내" } })).toBe(1);
    expect(await db.notification.count({ where: { type: "closure_announced", sendEmail: true } })).toBe(2);
  });

  it("공지한 일시 전에는 실행할 수 없고, 실행하면 폐쇄되며 개인정보가 남지 않는다", async () => {
    const { operatorId, imageKey } = await setupFinalizedCase();
    await announceClosure(db, operatorId, { scheduledAt: new Date(Date.now() + 2 * 60_000), summary: "결과 요약" }, { demoMode: true });
    expect((await executeClosure(db, operatorId)).ok).toBe(false);
    expect(await readUpload(imageKey)).not.toBeNull();

    const result = await executeClosure(db, operatorId, new Date(Date.now() + 3 * 60_000));
    expect(result.ok).toBe(true);
    expect(await isSiteClosed(db)).toBe(true);

    // 개인정보가 담긴 테이블은 모두 비어 있어야 함 (04 사이트 폐쇄 때 파기하는 데이터)
    const counts = await Promise.all([
      db.user.count(),
      db.session.count(),
      db.ipBinding.count(),
      db.participation.count(),
      db.indictmentVote.count(),
      db.post.count(),
      db.viewLog.count(),
      db.notification.count(),
      db.verdictBallot.count(),
      db.caseEvent.count(),
      db.notice.count(),
      db.rateLimitEvent.count(),
      db.evidence.count(),
      db.leakDetection.count(),
    ]);
    expect(counts.every((c) => c === 0)).toBe(true);
    // 증거 이미지 파일도 파기
    expect(await readUpload(imageKey)).toBeNull();

    // 종료 안내 페이지에 쓰는 데이터만 남음
    const c = await db.case.findUniqueOrThrow({ where: { id: 1 } });
    expect(c).toMatchObject({ title: "표절 사건", summary: "요약", closureSummary: "결과 요약", status: "SITE_CLOSED", body: "", aiOriginalBody: "", reviewNote: null });
    expect(c.closedAt).not.toBeNull();
    expect(await db.judgment.findUniqueOrThrow({ where: { round: 1 } })).toMatchObject({ outcome: "guilty", pronouncedBy: "파기됨" });

    // 다시 실행해도 안전
    await purgePersonalData(db);
    expect(await db.user.count()).toBe(0);
  });
});
