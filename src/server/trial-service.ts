import "server-only";
import { Prisma, type Side, type VerdictChoice } from "@prisma/client";
import { POST_MAX_LENGTH } from "@/domain/board";
import { ratio } from "@/domain/case";
import { type JudgmentInput, checkJudgment, isNominationOpen, nominationDeadline, persuasion, tallyNominations } from "@/domain/trial";
import { createRecommenderFromEnv } from "./ai/recommender";
import { db } from "./db";
import { CASE_ID, StatusConflictError, advanceDueStages, advocateCandidates, pronounceJudgment, runAdvocateRecommendations, selectAdvocates } from "./lifecycle";

export type Result = { ok: true } | { ok: false; error: string };

const SIDES: Side[] = ["indict", "dismiss"];

async function current() {
  await advanceDueStages(db);
  return db.case.findUnique({ where: { id: CASE_ID } });
}

async function activeParticipation(userId: string, round: number) {
  const p = await db.participation.findUnique({ where: { userId_round: { userId, round } } });
  return p && (p.status === "signed" || p.status === "advocate") ? p : null;
}

/** 03 C-07 최종 변론인 후보 추천: 자기 측 다른 배심원 한 명에게, 이유와 함께, 추천 투표 기간에만 (01, 02 결정 18) */
export async function nominate(userId: string, candidateId: string, reason: string): Promise<Result> {
  const c = await current();
  if (c?.status !== "ADVOCATE_SELECTION") return { ok: false, error: "지금은 최종 변론인 추천 기간이 아닙니다." };
  const schedule = await db.stageSchedule.findUnique({ where: { round_stage: { round: c.round, stage: "ADVOCATE_SELECTION" } } });
  if (!schedule?.startsAt || !schedule.endsAt || !isNominationOpen(new Date(), schedule.startsAt, schedule.endsAt)) {
    return { ok: false, error: "추천 투표가 마감되었습니다." };
  }
  const me = await activeParticipation(userId, c.round);
  if (!me) return { ok: false, error: "재판에 참여 중인 배심원만 추천할 수 있습니다." };
  const candidate = await db.participation.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.round !== c.round || candidate.side !== me.side || (candidate.status !== "signed" && candidate.status !== "advocate")) {
    return { ok: false, error: "자기 측 배심원 중에서만 추천할 수 있습니다." };
  }
  if (candidate.id === me.id) return { ok: false, error: "자기 자신은 추천할 수 없습니다." };
  if (!reason.trim()) return { ok: false, error: "추천 이유를 적어 주세요. 운영자가 선정할 때 참고합니다." };

  try {
    await db.advocateNomination.create({
      data: { round: c.round, voterParticipationId: me.id, candidateParticipationId: candidate.id, reason: reason.trim().slice(0, 1000) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "이미 추천했습니다. 추천은 한 번만 할 수 있습니다." };
    throw error;
  }
  return { ok: true };
}

/** 03 C-08 최종 변론: 진영별 대표 배심원만, 최종 변론 기간에. 마감 전까지는 고칠 수 있습니다. */
export async function submitFinalArgument(userId: string, body: string): Promise<Result> {
  const c = await current();
  if (c?.status !== "FINAL_ARGUMENT") return { ok: false, error: "지금은 최종 변론 기간이 아닙니다." };
  const me = await db.participation.findUnique({ where: { userId_round: { userId, round: c.round } } });
  const advocate = me ? await db.advocate.findFirst({ where: { round: c.round, participationId: me.id } }) : null;
  if (!advocate) return { ok: false, error: "최종 변론인만 최종 변론을 쓸 수 있습니다." };
  const text = body.trim();
  if (!text || text.length > POST_MAX_LENGTH * 2) return { ok: false, error: `최종 변론은 1~${POST_MAX_LENGTH * 2}자로 써 주세요.` };

  await db.finalArgument.upsert({
    where: { advocateId: advocate.id },
    create: { round: c.round, side: advocate.side, advocateId: advocate.id, body: text },
    update: { body: text, submittedAt: new Date() },
  });
  return { ok: true };
}

/**
 * 03 C-09 평결: 재판에 참여 중인 배심원이 한 번만. '투표했다는 사실'과 '투표 내용'을 서로 연결되지 않는
 * 두 테이블에 같은 처리 안에서 기록해, 저장된 데이터로는 누가 어디에 투표했는지 알 수 없게 합니다 (04 설계 원칙 3).
 */
export async function castVerdict(userId: string, choice: VerdictChoice): Promise<Result> {
  const c = await current();
  if (c?.status !== "DELIBERATION") return { ok: false, error: "지금은 평결 기간이 아닙니다." };
  const me = await activeParticipation(userId, c.round);
  if (!me) return { ok: false, error: "재판에 참여 중인 배심원만 평결할 수 있습니다." };
  try {
    await db.$transaction([
      db.verdictReceipt.create({ data: { participationId: me.id, round: c.round } }),
      db.verdictBallot.create({ data: { round: c.round, choice } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "이미 평결했습니다. 평결은 한 번만 할 수 있습니다." };
    throw error;
  }
  return { ok: true };
}

/** 운영자가 AI 추천을 요청합니다 (워커가 없거나 실패했을 때). AI는 추천만 하고, 선정은 운영자가 합니다. */
export async function requestRecommendations(): Promise<string[]> {
  return runAdvocateRecommendations(db, createRecommenderFromEnv());
}

export async function chooseAdvocates(operatorId: string, choices: { side: Side; participationId: string; reason: string }[]): Promise<Result> {
  return selectAdvocates(db, operatorId, choices);
}

export async function pronounce(operatorId: string, input: JudgmentInput): Promise<Result> {
  const check = checkJudgment(input);
  if (!check.ok) return check;
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (c?.status !== "SENTENCING") return { ok: false, error: "판결 작성 단계가 아닙니다." };
  try {
    await pronounceJudgment(db, operatorId, input);
  } catch (error) {
    if (error instanceof StatusConflictError) return { ok: false, error: "이미 판결을 선고했습니다." };
    throw error;
  }
  return { ok: true };
}

/** 사건 페이지의 최종 변론인 선정 · 최종 변론 · 평결 · 판결 화면용 데이터 */
export async function getTrialView(userId: string | null) {
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!c) return null;
  const round = c.round;

  const [schedule, me, recommendations, advocates, finalArguments, nominations, judgment, verdictCount] = await Promise.all([
    db.stageSchedule.findUnique({ where: { round_stage: { round, stage: "ADVOCATE_SELECTION" } } }),
    userId ? db.participation.findUnique({ where: { userId_round: { userId, round } }, include: { nominationsGiven: true, verdictReceipt: true } }) : null,
    db.advocateRecommendation.findMany({ where: { round }, include: { participation: { include: { user: { select: { nickname: true } } } } } }),
    db.advocate.findMany({
      where: { round },
      include: {
        participation: { include: { user: { select: { nickname: true } } } },
        aiRecommended: { include: { user: { select: { nickname: true } } } },
      },
    }),
    db.finalArgument.findMany({ where: { round } }),
    db.advocateNomination.findMany({ where: { round }, include: { candidate: { include: { user: { select: { nickname: true } } } } } }),
    db.judgment.findUnique({ where: { round } }),
    db.verdictReceipt.count({ where: { round } }),
  ]);

  const now = new Date();
  const nominationOpen = schedule?.startsAt && schedule.endsAt ? isNominationOpen(now, schedule.startsAt, schedule.endsAt) : false;
  const isActive = me?.status === "signed" || me?.status === "advocate";

  // 추천 투표 대상: 내 진영의 다른 배심원
  const nominees =
    isActive && me && nominationOpen
      ? (await advocateCandidatesForNomination(round, me.side)).filter((p) => p.participationId !== me.id)
      : [];

  // 추천 결과는 추천 투표가 끝난 뒤에만 공개 (02 투표 공개 원칙)
  const tallies = nominationOpen
    ? null
    : Object.fromEntries(
        SIDES.map((side) => {
          const sideNominations = nominations.filter((n) => n.candidate.side === side);
          const tally = tallyNominations(sideNominations);
          return [
            side,
            [...tally.entries()]
              .map(([id, count]) => ({ nickname: sideNominations.find((n) => n.candidateParticipationId === id)!.candidate.user.nickname, count }))
              .sort((a, b) => b.count - a.count),
          ];
        }),
      );

  const myAdvocate = me ? advocates.find((a) => a.participationId === me.id) ?? null : null;
  const activeCounts = Object.fromEntries(
    await Promise.all(SIDES.map(async (side) => [side, await db.participation.count({ where: { round, side, status: { in: ["signed", "advocate"] } } })] as const)),
  ) as Record<Side, number>;

  return {
    nominationOpen,
    activeCounts,
    nominationDeadline: schedule?.startsAt && schedule.endsAt ? nominationDeadline(schedule.startsAt, schedule.endsAt) : null,
    isActive,
    myNomination: me?.nominationsGiven.find((n) => n.round === round) ?? null,
    nominees,
    tallies,
    recommendations,
    advocates,
    finalArguments,
    myAdvocate,
    myArgument: myAdvocate ? finalArguments.find((f) => f.advocateId === myAdvocate.id) ?? null : null,
    hasVerdict: Boolean(me?.verdictReceipt),
    verdictCount,
    judgment,
    persuasion: judgment ? persuasion(judgment.baselineIndictRatio, judgment.verdictGuilty, judgment.verdictNotGuilty) : null,
  };
}

async function advocateCandidatesForNomination(round: number, side: Side) {
  const jurors = await db.participation.findMany({
    where: { round, side, status: { in: ["signed", "advocate"] } },
    include: { user: { select: { nickname: true } } },
    orderBy: { signedAt: "asc" },
  });
  return jurors.map((j) => ({ participationId: j.id, nickname: j.user.nickname }));
}

/** 운영자의 선정 화면용: 진영별 후보, 받은 추천과 이유, AI 추천 */
export async function getSelectionView() {
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!c) return null;
  const sides = await Promise.all(
    SIDES.map(async (side) => ({
      side,
      candidates: await advocateCandidates(db, c.round, side),
      recommendation: await db.advocateRecommendation.findUnique({ where: { round_side: { round: c.round, side } } }),
    })),
  );
  const alreadySelected = (await db.advocate.count({ where: { round: c.round } })) > 0;
  return { sides, alreadySelected };
}

/** 판결 작성 화면용: 평결 집계와 설득 지표 미리보기 */
export async function getSentencingView() {
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!c) return null;
  const [votes, ballots] = await Promise.all([
    db.indictmentVote.groupBy({ by: ["choice"], _count: true }),
    db.verdictBallot.groupBy({ by: ["choice"], where: { round: c.round }, _count: true }),
  ]);
  const indict = votes.find((v) => v.choice === "indict")?._count ?? 0;
  const dismiss = votes.find((v) => v.choice === "dismiss")?._count ?? 0;
  const guilty = ballots.find((b) => b.choice === "guilty")?._count ?? 0;
  const notGuilty = ballots.find((b) => b.choice === "not_guilty")?._count ?? 0;
  return { guilty, notGuilty, persuasion: persuasion(ratio(indict, indict + dismiss), guilty, notGuilty) };
}
