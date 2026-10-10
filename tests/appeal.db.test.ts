import { PrismaClient, type Side } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { applyForRound2, chooseRound2, commentOnReview, signRound2, writeReview } from "@/server/appeal";
import { advanceDueStages, openAppeal, pronounceJudgment, rejectAppeal } from "@/server/lifecycle";

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다. 이 DB의 데이터를 모두 지웁니다.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("리뷰 · 2심 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const minutes = (m: number) => new Date(Date.now() + m * 60_000);
  type Member = { id: string; role: string; emailVerifiedAt: Date | null };
  let users: Record<string, Member> = {};
  let operator: Member;

  afterAll(async () => {
    await db.$disconnect();
  });

  /** 1심 판결 작성 단계: 공소 제기 측 a, b와 불기소 측 c가 서명했고, x·y·z·w는 사건에 참여하지 않은 회원 */
  async function setup() {
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
    await db.case.create({ data: { id: 1, title: "테스트", summary: "요약", body: "정리본", aiOriginalBody: "원본", status: "SENTENCING", minParticipants: 1 } });
    const stages = ["SENTENCING", "REVIEW", "APPEAL_DECISION", "APPEAL_RECRUITMENT", "EVIDENCE", "ADVOCATE_SELECTION", "FINAL_ARGUMENT", "DELIBERATION"] as const;
    await db.stageSchedule.createMany({ data: stages.map((stage) => ({ round: 1, stage, durationMinutes: stage === "APPEAL_RECRUITMENT" ? 6 : 10 })) });

    users = {};
    for (const name of ["a", "b", "c", "x", "y", "z", "w"]) {
      users[name] = await db.user.create({ data: { email: `${name}@t.local`, passwordHash: "x", nickname: name, emailVerifiedAt: new Date() } });
    }
    operator = await db.user.create({ data: { email: "op@t.local", passwordHash: "x", nickname: "op", role: "operator", emailVerifiedAt: new Date() } });
    const jurors: [string, Side][] = [["a", "indict"], ["b", "indict"], ["c", "dismiss"]];
    for (const [name, side] of jurors) {
      await db.indictmentVote.create({ data: { userId: users[name].id, choice: side } });
      await db.participation.create({ data: { userId: users[name].id, round: 1, side, joinedVia: "indictment_vote", status: "signed", signedAt: new Date() } });
    }
  }

  const status = async () => (await db.case.findUniqueOrThrow({ where: { id: 1 } })).status;
  const endStage = (round: number, stage: "REVIEW" | "APPEAL_RECRUITMENT", startsAt: Date, endsAt: Date) =>
    db.stageSchedule.update({ where: { round_stage: { round, stage } }, data: { startsAt, endsAt } });

  it("판결을 선고하면 리뷰가 시작되고, 이의 신청이 없으면 리뷰 마감 후 확정된다", async () => {
    await setup();
    await pronounceJudgment(db, operator.id, { outcome: "guilty", sentenceType: "fine", sentenceDetail: "100만 원", reasoning: "이유" });
    expect(await status()).toBe("REVIEW");
    expect((await writeReview(db, users.a, { body: "좋은 재판이었습니다", rating: 5, isAppeal: false })).ok).toBe(true);
    // 사건에 참여하지 않은 회원은 리뷰를 쓸 수 없음
    expect((await writeReview(db, users.x, { body: "리뷰", rating: null, isAppeal: false })).ok).toBe(false);

    await endStage(1, "REVIEW", minutes(-10), minutes(-1));
    await advanceDueStages(db);
    expect(await status()).toBe("FINALIZED");
  });

  it("운영자가 2심을 기각하면 1심 판결이 확정된다", async () => {
    await setup();
    await pronounceJudgment(db, operator.id, { outcome: "not_guilty", sentenceType: null, sentenceDetail: "", reasoning: "이유" });
    await writeReview(db, users.c, { body: "판결에 이의가 있습니다", rating: 1, isAppeal: true });
    await endStage(1, "REVIEW", minutes(-10), minutes(-1));
    await advanceDueStages(db);
    expect(await status()).toBe("APPEAL_DECISION");
    await rejectAppeal(db, operator.id, "새로운 쟁점이 없음");
    expect(await status()).toBe("FINALIZED");
    expect((await db.caseEvent.findFirstOrThrow({ where: { decision: "reject_appeal" } })).reason).toContain("새로운 쟁점이 없음");
  });

  it("이의 신청 → 2심 개시 → 참여 선택·신청 → 기준대로 승인 → 서명 → 2심 재판 → 2심 리뷰 → 확정", async () => {
    await setup();
    await pronounceJudgment(db, operator.id, { outcome: "guilty", sentenceType: "fine", sentenceDetail: "100만 원", reasoning: "이유" });
    expect((await writeReview(db, users.c, { body: "판결에 이의가 있습니다", rating: 2, isAppeal: true })).ok).toBe(true);
    const review = await db.review.findFirstOrThrow();
    for (const name of ["x", "y", "z"]) expect((await commentOnReview(db, users[name], review.id, `${name}의 의견`)).ok).toBe(true);
    expect((await commentOnReview(db, operator, review.id, "운영자 댓글")).ok).toBe(false);

    await endStage(1, "REVIEW", minutes(-10), minutes(-1));
    await advanceDueStages(db);
    expect(await status()).toBe("APPEAL_DECISION");
    // 2심 결정 기간에도 1심 리뷰 댓글을 받음
    expect((await commentOnReview(db, users.y, review.id, "한 번 더")).ok).toBe(true);

    await openAppeal(db, operator.id, { reason: "평결과 판결의 차이가 큼", criteria: "기준", perSideCap: 1 });
    const opened = await db.case.findUniqueOrThrow({ where: { id: 1 } });
    expect(opened).toMatchObject({ status: "APPEAL_RECRUITMENT", round: 2, appealSideCap: 1 });
    expect(await db.stageSchedule.count({ where: { round: 2 } })).toBe(7);
    // 1심 배심원 3명과 리뷰 댓글 작성자 3명에게 이메일 알림
    expect(await db.notification.count({ where: { type: "appeal_opened", sendEmail: true } })).toBe(6);
    // 2심이 열리면 댓글을 받지 않음
    expect((await commentOnReview(db, users.w, review.id, "늦은 댓글")).ok).toBe(false);

    expect((await chooseRound2(db, users.a.id, true)).ok).toBe(true);
    expect((await chooseRound2(db, users.c.id, true)).ok).toBe(true);
    expect((await chooseRound2(db, users.b.id, false)).ok).toBe(true);
    expect((await chooseRound2(db, users.a.id, false)).ok).toBe(false);
    expect((await applyForRound2(db, users.x, "indict")).ok).toBe(true);
    expect((await applyForRound2(db, users.y, "dismiss")).ok).toBe(true);
    expect((await applyForRound2(db, users.z, "dismiss")).ok).toBe(true);
    expect((await applyForRound2(db, users.w, "dismiss")).ok).toBe(false); // 리뷰 댓글 없음
    expect((await applyForRound2(db, users.a, "dismiss")).ok).toBe(false); // 1심 배심원은 신청하지 않음
    expect((await db.participation.findUniqueOrThrow({ where: { userId_round: { userId: users.a.id, round: 2 } } })).side).toBe("indict");

    // 신청 마감(모집 기간의 절반)이 지나면 기준을 기계적으로 적용: 진영별 상한 1명
    await endStage(2, "APPEAL_RECRUITMENT", minutes(-4), minutes(2));
    await advanceDueStages(db);
    expect(await status()).toBe("APPEAL_RECRUITMENT");
    const applications = await db.appealApplication.findMany({ include: { user: true } });
    expect(applications.find((a) => a.user.nickname === "x")!.status).toBe("approved");
    expect(applications.filter((a) => a.requestedSide === "dismiss" && a.status === "approved")).toHaveLength(1);
    expect(applications.filter((a) => a.status === "rejected")).toHaveLength(1);
    expect((await db.caseEvent.findFirstOrThrow({ where: { reason: { contains: "승인 기준을 적용" } } })).reason).toContain("진영별 1명씩");
    expect((await chooseRound2(db, users.b.id, true)).ok).toBe(false); // 마감 후

    expect((await signRound2(db, users.x.id)).ok).toBe(true);
    await endStage(2, "APPEAL_RECRUITMENT", minutes(-7), minutes(-1));
    await advanceDueStages(db);
    expect(await status()).toBe("EVIDENCE");
    const round2 = await db.participation.findMany({ where: { round: 2 }, include: { user: true } });
    expect(round2.filter((p) => p.status === "signed").map((p) => p.user.nickname).sort()).toEqual(["a", "c", "x"]);
    expect(round2.find((p) => p.excludedReason === "unsigned")).toBeTruthy();
    expect(await db.stageSchedule.findUniqueOrThrow({ where: { round_stage: { round: 2, stage: "EVIDENCE" } } })).toMatchObject({ durationMinutes: 10 });

    // 2심 판결: 설득 지표의 기준은 2심 시작 때의 공소 제기 측 인원 비율 (2명 / 3명)
    await db.case.update({ where: { id: 1 }, data: { status: "SENTENCING" } });
    await pronounceJudgment(db, operator.id, { outcome: "not_guilty", sentenceType: null, sentenceDetail: "", reasoning: "2심 이유" });
    expect((await db.judgment.findUniqueOrThrow({ where: { round: 2 } })).baselineIndictRatio).toBe(66.7);
    expect(await status()).toBe("REVIEW");
    expect((await writeReview(db, users.a, { body: "다시 항소", rating: null, isAppeal: true })).ok).toBe(false);
    expect((await writeReview(db, users.a, { body: "2심 소감", rating: 4, isAppeal: false })).ok).toBe(true);

    await endStage(2, "REVIEW", minutes(-10), minutes(-1));
    await advanceDueStages(db);
    expect(await status()).toBe("FINALIZED");
  });
});
