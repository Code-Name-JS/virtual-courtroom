import { PrismaClient, type Side } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AdvocateRecommender } from "@/server/ai/recommender";
import { advanceDueStages, pronounceJudgment, selectAdvocates } from "@/server/lifecycle";

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다. 이 DB의 데이터를 모두 지웁니다.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("최종 변론인 선정 · 최종 변론 · 평결 · 판결 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  let ids: Record<string, string> = {};
  let operatorId = "";

  /** 공소 제기 측 2명, 불기소 측 1명이 서명한 상태에서 최종 변론인 선정 단계를 만듭니다. */
  async function setup(selectionStartsMinutesAgo: number, selectionEndsMinutesAgo: number) {
    await db.$transaction([
      db.advocateRecommendation.deleteMany(),
      db.caseEvent.deleteMany(),
      db.stageSchedule.deleteMany(),
      db.verdictBallot.deleteMany(),
      db.judgment.deleteMany(),
      db.case.deleteMany(),
      db.user.deleteMany(),
    ]);
    await db.case.create({ data: { id: 1, title: "테스트", summary: "요약", body: "정리본", aiOriginalBody: "원본", status: "ADVOCATE_SELECTION", minParticipants: 1 } });
    await db.stageSchedule.createMany({
      data: [
        { round: 1, stage: "ADVOCATE_SELECTION", durationMinutes: 10, startsAt: minutesAgo(selectionStartsMinutesAgo), endsAt: minutesAgo(selectionEndsMinutesAgo) },
        { round: 1, stage: "FINAL_ARGUMENT", durationMinutes: 10 },
        { round: 1, stage: "DELIBERATION", durationMinutes: 10 },
        { round: 1, stage: "SENTENCING", durationMinutes: 10 },
      ],
    });
    ids = {};
    const jurors: [string, Side, "indict" | "dismiss"][] = [["a", "indict", "indict"], ["b", "indict", "indict"], ["c", "dismiss", "dismiss"]];
    for (const [name, side, vote] of jurors) {
      const user = await db.user.create({ data: { email: `${name}@t.local`, passwordHash: "x", nickname: name, emailVerifiedAt: new Date() } });
      await db.indictmentVote.create({ data: { userId: user.id, choice: vote } });
      const p = await db.participation.create({ data: { userId: user.id, round: 1, side, joinedVia: "indictment_vote", status: "signed", signedAt: new Date() } });
      ids[name] = p.id;
    }
    operatorId = (await db.user.create({ data: { email: "op@t.local", passwordHash: "x", nickname: "op", role: "operator" } })).id;
    // a가 b를, b가 a를 추천, c는 추천 없음
    await db.advocateNomination.create({ data: { round: 1, voterParticipationId: ids.a, candidateParticipationId: ids.b, reason: "근거가 탄탄함" } });
    await db.advocateNomination.create({ data: { round: 1, voterParticipationId: ids.b, candidateParticipationId: ids.a, reason: "말을 잘함" } });
  }

  const fakeAi = (pick: (candidates: string[]) => string): AdvocateRecommender => ({
    provider: "fake",
    model: "fake-model",
    async complete(prompt) {
      const candidates = (prompt.schema as { properties: { participationId: { enum: string[] } } }).properties.participationId.enum;
      return { text: JSON.stringify({ participationId: pick(candidates), rationale: "테스트 추천 이유" }) };
    },
  });

  beforeEach(async () => {
    await db.notification.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("추천 투표 기간에는 AI 추천을 하지 않는다", async () => {
    await setup(1, -9); // 시작 1분 전, 마감 9분 후 → 추천 투표 진행 중
    await advanceDueStages(db, new Date(), { recommender: fakeAi((c) => c[0]) });
    expect(await db.advocateRecommendation.count()).toBe(0);
  });

  it("추천 투표 마감 후 AI가 진영별 추천을 내고, 추천받은 후보 중에서만 고른다", async () => {
    await setup(8, -2); // 추천 투표 마감(5분)은 지났고 단계는 진행 중
    await advanceDueStages(db, new Date(), { recommender: fakeAi((c) => c[c.length - 1]) });
    const recs = await db.advocateRecommendation.findMany();
    expect(recs).toHaveLength(2);
    const indictRec = recs.find((r) => r.side === "indict")!;
    expect([ids.a, ids.b]).toContain(indictRec.participationId);
    // 추천이 없는 진영은 그 진영 배심원 전체가 후보
    expect(recs.find((r) => r.side === "dismiss")!.participationId).toBe(ids.c);
  });

  it("AI가 설정되지 않으면 'AI 추천 없음'으로 기록한다", async () => {
    await setup(8, -2);
    await advanceDueStages(db, new Date(), { recommender: null });
    const recs = await db.advocateRecommendation.findMany();
    expect(recs.every((r) => r.participationId === null)).toBe(true);
  });

  it("운영자는 단 한 번 선정하고, AI 추천과 다르면 이유가 필요하다", async () => {
    await setup(8, -2);
    await advanceDueStages(db, new Date(), { recommender: fakeAi(() => ids.b) });
    const noReason = await selectAdvocates(db, operatorId, [
      { side: "indict", participationId: ids.a, reason: "" },
      { side: "dismiss", participationId: ids.c, reason: "" },
    ]);
    expect(noReason.ok).toBe(false);

    const ok = await selectAdvocates(db, operatorId, [
      { side: "indict", participationId: ids.a, reason: "쟁점을 더 정확히 짚음" },
      { side: "dismiss", participationId: ids.c, reason: "" },
    ]);
    expect(ok.ok).toBe(true);
    const again = await selectAdvocates(db, operatorId, [{ side: "indict", participationId: ids.b, reason: "" }]);
    expect(again.ok).toBe(false);
    expect((await db.participation.findUniqueOrThrow({ where: { id: ids.a } })).status).toBe("advocate");
    expect((await db.caseEvent.findFirstOrThrow({ where: { decision: "select_advocate" } })).reason).toContain("AI 추천과 다르게 선정");
  });

  it("운영자가 선정하지 않으면 마감 때 AI 추천으로, AI 추천이 없으면 추천 표로 확정된다", async () => {
    await setup(12, 1); // 단계 마감이 지남
    await db.advocateRecommendation.create({ data: { round: 1, side: "indict", participationId: ids.b, rationale: "AI" } });
    await advanceDueStages(db);
    const advocates = await db.advocate.findMany();
    expect(advocates.find((a) => a.side === "indict")).toMatchObject({ participationId: ids.b, selectedBy: "ai_default" });
    expect(advocates.find((a) => a.side === "dismiss")).toMatchObject({ participationId: ids.c, selectedBy: "vote_default" });
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("FINAL_ARGUMENT");
    expect(await db.notification.count({ where: { type: "advocate_selected", sendEmail: true } })).toBe(2);
  });

  it("평결은 누가 어디에 투표했는지 알 수 없게 저장되고, 판결을 선고하면 리뷰가 시작된다", async () => {
    await setup(12, 1);
    await advanceDueStages(db); // → FINAL_ARGUMENT
    await db.stageSchedule.update({ where: { round_stage: { round: 1, stage: "FINAL_ARGUMENT" } }, data: { endsAt: minutesAgo(1) } });
    await advanceDueStages(db); // → DELIBERATION
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("DELIBERATION");

    // 평결: 참여 여부와 내용을 같은 처리 안에서 따로 저장 (trial-service.castVerdict와 같은 방식)
    for (const [name, choice] of [["a", "guilty"], ["b", "not_guilty"], ["c", "not_guilty"]] as const) {
      await db.$transaction([
        db.verdictReceipt.create({ data: { participationId: ids[name], round: 1 } }),
        db.verdictBallot.create({ data: { round: 1, choice } }),
      ]);
    }
    const ballot = await db.verdictBallot.findFirstOrThrow();
    expect(Object.keys(ballot).sort()).toEqual(["choice", "id", "round"]);

    await db.stageSchedule.update({ where: { round_stage: { round: 1, stage: "DELIBERATION" } }, data: { endsAt: minutesAgo(1) } });
    await advanceDueStages(db); // → SENTENCING (운영자 단계라 더 넘어가지 않음)
    await advanceDueStages(db);
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("SENTENCING");

    await pronounceJudgment(db, operatorId, { outcome: "not_guilty", sentenceType: null, sentenceDetail: "", reasoning: "증거 부족" });
    const judgment = await db.judgment.findUniqueOrThrow({ where: { round: 1 } });
    expect(judgment).toMatchObject({ outcome: "not_guilty", verdictGuilty: 1, verdictNotGuilty: 2, baselineIndictRatio: 66.7 });
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("REVIEW");
  });
});
