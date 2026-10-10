// 02 사건 생애주기의 상태 전환. 웹 앱과 워커(worker/index.ts)가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import type { ActorType, CaseDecision, CaseStatus, Prisma, PrismaClient } from "@prisma/client";
import { SIDE_LABELS, resolveIndictmentVote } from "@/domain/case";

export const CASE_ID = 1;

type Tx = Prisma.TransactionClient;

export class StatusConflictError extends Error {
  constructor(expected: CaseStatus) {
    super(`사건 상태가 이미 바뀌었습니다 (예상: ${expected}).`);
  }
}

type TransitionInput = {
  round: number;
  from: CaseStatus;
  to: CaseStatus;
  actorType: ActorType;
  actorUserId?: string;
  decision?: CaseDecision;
  reason?: string;
  isPublic?: boolean;
  now: Date;
};

/**
 * 상태를 한 단계 바꾸고 기록을 남깁니다. 현재 상태가 from일 때만 바꾸므로,
 * 워커와 웹 요청이 동시에 같은 전환을 시도해도 한 번만 일어납니다.
 */
export async function transition(tx: Tx, input: TransitionInput): Promise<void> {
  const updated = await tx.case.updateMany({ where: { id: CASE_ID, status: input.from }, data: { status: input.to } });
  if (updated.count !== 1) throw new StatusConflictError(input.from);
  await tx.caseEvent.create({
    data: {
      round: input.round,
      fromStatus: input.from,
      toStatus: input.to,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      decision: input.decision,
      reason: input.reason,
      isPublic: input.isPublic ?? true,
      createdAt: input.now,
    },
  });
  await startStage(tx, input.round, input.to, input.now);
}

/** 단계에 일정이 있으면 지금부터 기간을 셉니다. */
export async function startStage(tx: Tx, round: number, stage: CaseStatus, now: Date): Promise<void> {
  const schedule = await tx.stageSchedule.findUnique({ where: { round_stage: { round, stage } } });
  if (!schedule) return;
  await tx.stageSchedule.update({
    where: { id: schedule.id },
    data: { startsAt: now, endsAt: new Date(now.getTime() + schedule.durationMinutes * 60 * 1000) },
  });
}

async function notifyParticipants(tx: Tx, round: number, type: string, message: string): Promise<void> {
  const participants = await tx.participation.findMany({ where: { round }, select: { userId: true } });
  if (participants.length === 0) return;
  await tx.notification.createMany({
    data: participants.map((p) => ({ userId: p.userId, type, payload: { message }, link: "/case" })),
  });
}

/** 공소 투표 마감: 결과를 판정해 공소 제기 대기 또는 폐기로 넘깁니다 (01, 02, 05). */
async function closeIndictmentVote(tx: Tx, round: number, minParticipants: number, now: Date): Promise<string> {
  const counts = await tx.indictmentVote.groupBy({ by: ["choice"], _count: true });
  const indict = counts.find((c) => c.choice === "indict")?._count ?? 0;
  const dismiss = counts.find((c) => c.choice === "dismiss")?._count ?? 0;
  const outcome = resolveIndictmentVote(indict, dismiss, minParticipants);
  const tally = `${SIDE_LABELS.indict} ${indict}표, ${SIDE_LABELS.dismiss} ${dismiss}표 (참여 ${outcome.total}명)`;

  if (outcome.result === "indicted") {
    const reason = `공소 투표 마감. ${tally}. 공소 제기가 ${indict === dismiss ? "불기소와 같아" : "더 많아"} 운영자의 공소 제기를 기다립니다.`;
    await transition(tx, { round, from: "INDICTMENT_VOTE", to: "INDICTMENT_PENDING", actorType: "system", reason, now });
    await notifyParticipants(tx, round, "indictment_vote_closed", reason);
    return reason;
  }

  const reason =
    outcome.result === "dismissed_for_quorum"
      ? `공소 투표 마감. 참여자 ${outcome.total}명으로 최소 인원 ${minParticipants}명에 못 미쳐 사건이 폐기되었습니다. ${tally}.`
      : `공소 투표 마감. ${tally}. 불기소가 더 많아 사건이 폐기되었습니다.`;
  await transition(tx, {
    round,
    from: "INDICTMENT_VOTE",
    to: "DISMISSED",
    actorType: "system",
    decision: outcome.result === "dismissed_for_quorum" ? "dismiss_for_quorum" : undefined,
    reason,
    now,
  });
  await notifyParticipants(tx, round, "indictment_vote_closed", `${reason} 사건이 끝나 사이트는 폐쇄될 예정입니다.`);
  return reason;
}

/**
 * 마감이 지난 단계를 다음 단계로 넘깁니다. 워커가 1분마다 부르고, 사건 페이지를 열 때도 부릅니다.
 * M1에서는 공소 투표 마감을 처리합니다. 다른 단계의 마감 처리는 각 마일스톤(M2~M3)에서 추가합니다.
 */
export async function advanceDueStages(db: PrismaClient, now = new Date()): Promise<string[]> {
  const log: string[] = [];
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!current) return log;

  const schedule = await db.stageSchedule.findUnique({ where: { round_stage: { round: current.round, stage: current.status } } });
  if (!schedule?.endsAt || schedule.endsAt > now) return log;

  try {
    if (current.status === "INDICTMENT_VOTE") {
      log.push(await db.$transaction((tx) => closeIndictmentVote(tx, current.round, current.minParticipants, now)));
    }
  } catch (error) {
    // 다른 프로세스가 먼저 처리한 경우
    if (!(error instanceof StatusConflictError)) throw error;
  }
  return log;
}
