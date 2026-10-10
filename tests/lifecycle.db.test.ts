import { PrismaClient, type Side } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { advanceDueStages, indictCase } from "@/server/lifecycle";
import { dispatchEmails } from "@/server/outbox";

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다.
// 주의: 이 DB의 데이터를 모두 지우므로 테스트 전용 DB를 쓰세요.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("단계 전환 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const past = new Date(Date.now() - 60_000);

  async function setupVote(minParticipants: number, votes: Side[]) {
    await db.caseEvent.deleteMany();
    await db.stageSchedule.deleteMany();
    await db.case.deleteMany();
    await db.user.deleteMany();
    await db.case.create({
      data: { id: 1, title: "테스트 사건", summary: "요약", body: "정리본", aiOriginalBody: "원본", status: "INDICTMENT_VOTE", minParticipants },
    });
    await db.stageSchedule.createMany({
      data: [
        { round: 1, stage: "INDICTMENT_VOTE", durationMinutes: 1, startsAt: past, endsAt: past },
        { round: 1, stage: "INDICTMENT_PENDING", durationMinutes: 60 },
      ],
    });
    for (const [index, choice] of votes.entries()) {
      const user = await db.user.create({ data: { email: `v${index}@test.local`, passwordHash: "x", nickname: `voter${index}`, emailVerifiedAt: new Date() } });
      await db.indictmentVote.create({ data: { userId: user.id, choice } });
      await db.participation.create({ data: { userId: user.id, round: 1, side: choice, joinedVia: "indictment_vote", status: "voted" } });
    }
  }

  beforeEach(async () => {
    await db.notification.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("동점이면 공소 제기 대기로 넘어가고, 다음 단계 마감이 시작된다", async () => {
    await setupVote(2, ["indict", "dismiss"]);
    await advanceDueStages(db);
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("INDICTMENT_PENDING");
    const next = await db.stageSchedule.findUniqueOrThrow({ where: { round_stage: { round: 1, stage: "INDICTMENT_PENDING" } } });
    expect(next.endsAt).not.toBeNull();
    expect(await db.notification.count()).toBe(2);
  });

  it("불기소가 더 많으면 폐기된다", async () => {
    await setupVote(2, ["indict", "dismiss", "dismiss"]);
    await advanceDueStages(db);
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("DISMISSED");
  });

  it("최소 인원에 못 미치면 연장 없이 폐기되고, 결정이 공개 기록으로 남는다", async () => {
    await setupVote(3, ["indict", "indict"]);
    await advanceDueStages(db);
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("DISMISSED");
    const event = await db.caseEvent.findFirstOrThrow({ where: { toStatus: "DISMISSED" } });
    expect(event.decision).toBe("dismiss_for_quorum");
    expect(event.isPublic).toBe(true);
    expect(event.actorType).toBe("system");
  });

  it("운영자가 공소를 제기하면 공판준비가 시작되고, 투표한 배심원에게 서명 요청 이메일이 예약된다", async () => {
    await setupVote(1, ["indict", "dismiss"]);
    await advanceDueStages(db);
    await db.stageSchedule.create({ data: { round: 1, stage: "PRETRIAL", durationMinutes: 60 } });
    const operator = await db.user.create({ data: { email: "op@test.local", passwordHash: "x", nickname: "op", role: "operator" } });
    await db.notification.deleteMany();

    await indictCase(db, operator.id, "");
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("PRETRIAL");
    expect(await db.notification.count({ where: { sendEmail: true, emailedAt: null } })).toBe(2);
    expect((await db.caseEvent.findFirstOrThrow({ where: { toStatus: "PRETRIAL" } })).decision).toBe("indict");

    // 워커의 이메일 발송: 보낸 알림은 다시 보내지 않음
    expect(await dispatchEmails(db)).toBe(2);
    expect(await dispatchEmails(db)).toBe(0);
  });

  it("공판준비 마감: 서명하지 않은 배심원은 제외되고 증거 제출이 시작된다", async () => {
    await setupVote(1, ["indict", "dismiss"]);
    await db.case.update({ where: { id: 1 }, data: { status: "PRETRIAL" } });
    await db.stageSchedule.deleteMany();
    await db.stageSchedule.createMany({
      data: [
        { round: 1, stage: "PRETRIAL", durationMinutes: 1, startsAt: past, endsAt: past },
        { round: 1, stage: "EVIDENCE", durationMinutes: 60 },
      ],
    });
    const [first] = await db.participation.findMany({ orderBy: { createdAt: "asc" } });
    await db.participation.update({ where: { id: first.id }, data: { status: "signed", signedAt: new Date() } });

    await advanceDueStages(db);
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("EVIDENCE");
    const statuses = (await db.participation.findMany()).map((p) => `${p.status}:${p.excludedReason ?? ""}`).sort();
    expect(statuses).toEqual(["excluded:unsigned", "signed:"]);
    // 서명하지 않은 사람의 공소 투표 표는 그대로 (02 결정 7)
    expect(await db.indictmentVote.count()).toBe(2);
  });

  it("증거 제출 마감: 최종 변론인 선정으로 넘어간다", async () => {
    await setupVote(1, ["indict"]);
    await db.case.update({ where: { id: 1 }, data: { status: "EVIDENCE" } });
    await db.stageSchedule.deleteMany();
    await db.stageSchedule.create({ data: { round: 1, stage: "EVIDENCE", durationMinutes: 1, startsAt: past, endsAt: past } });
    await advanceDueStages(db);
    expect((await db.case.findUniqueOrThrow({ where: { id: 1 } })).status).toBe("ADVOCATE_SELECTION");
  });

  it("두 번 실행해도 전환은 한 번만 일어난다", async () => {
    await setupVote(1, ["indict"]);
    await Promise.all([advanceDueStages(db), advanceDueStages(db)]);
    expect(await db.caseEvent.count({ where: { toStatus: "INDICTMENT_PENDING" } })).toBe(1);
  });
});
