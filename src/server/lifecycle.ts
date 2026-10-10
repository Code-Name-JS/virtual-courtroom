// 02 사건 생애주기의 상태 전환. 웹 앱과 워커(worker/index.ts)가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import type { ActorType, CaseDecision, CaseStatus, ParticipationStatus, Prisma, PrismaClient } from "@prisma/client";
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

type NotifyOptions = {
  /** 이 진행 상태의 배심원에게만 보냄. 생략하면 이번 심급의 모든 참여자 */
  statuses?: ParticipationStatus[];
  /** 06 MVP: 꼭 필요한 알림은 워커가 이메일로도 보냄 */
  sendEmail?: boolean;
  link?: string;
};

async function notifyParticipants(tx: Tx, round: number, type: string, message: string, options: NotifyOptions = {}): Promise<void> {
  const participants = await tx.participation.findMany({
    where: { round, ...(options.statuses ? { status: { in: options.statuses } } : {}) },
    select: { userId: true },
  });
  if (participants.length === 0) return;
  await tx.notification.createMany({
    data: participants.map((p) => ({
      userId: p.userId,
      type,
      payload: { message },
      link: options.link ?? "/case",
      sendEmail: options.sendEmail ?? false,
    })),
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

/** 운영자의 공소 제기: 재판을 열고 공판준비 서명을 시작합니다 (01: AI는 공소를 제기할 수 없음). */
export async function indictCase(db: PrismaClient, operatorId: string, note: string, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: CASE_ID } });
    const reason = `운영자가 공소를 제기했습니다. 공소 투표에 참여한 배심원은 공판준비절차 서명을 해 주세요.${note ? ` 운영자 메모: ${note}` : ""}`;
    await transition(tx, {
      round: current.round,
      from: "INDICTMENT_PENDING",
      to: "PRETRIAL",
      actorType: "operator",
      actorUserId: operatorId,
      decision: "indict",
      reason,
      now,
    });
    await notifyParticipants(
      tx,
      current.round,
      "pretrial_started",
      "재판이 열렸습니다. 공판준비절차 서명을 해야 재판에 계속 참여할 수 있습니다. 서명하지 않으면 재판 단계부터 제외됩니다.",
      { statuses: ["voted"], sendEmail: true },
    );
  });
}

/** 공판준비 마감: 서명하지 않은 배심원은 제외하고 증거 제출을 시작합니다 (02 결정 7: 표는 그대로 유지). */
async function closePretrial(tx: Tx, round: number, now: Date): Promise<string> {
  const unsigned = await tx.participation.updateMany({
    where: { round, status: "voted" },
    data: { status: "excluded", excludedReason: "unsigned" },
  });
  const signed = await tx.participation.count({ where: { round, status: "signed" } });
  const reason = `공판준비 서명 마감. 서명한 배심원 ${signed}명으로 증거 제출을 시작합니다.${unsigned.count > 0 ? ` 서명하지 않은 ${unsigned.count}명은 재판 단계부터 제외되었습니다.` : ""}`;
  await transition(tx, { round, from: "PRETRIAL", to: "EVIDENCE", actorType: "system", reason, now });
  await notifyParticipants(tx, round, "evidence_started", "증거 제출이 시작되었습니다. 진영 게시판에 생각과 증거자료를 담은 스레드를 써 주세요. 이 기간에는 자기 측 게시판만 볼 수 있습니다.", {
    statuses: ["signed"],
    link: "/case",
  });
  return reason;
}

/** 증거 제출 마감: 양측 게시판을 공개하고 읽기 전용으로 바꿉니다 (02 진영 게시판 규칙). */
async function closeEvidence(tx: Tx, round: number, now: Date): Promise<string> {
  const reason = "증거 제출 마감. 양측 진영 게시판이 모두 공개되고 읽기 전용이 되었습니다. 최종 변론인 선정을 시작합니다.";
  await transition(tx, { round, from: "EVIDENCE", to: "ADVOCATE_SELECTION", actorType: "system", reason, now });
  await notifyParticipants(tx, round, "evidence_closed", "증거 제출이 끝나 양측 게시판이 공개되었습니다. 상대 측의 주장과 증거를 확인해 보세요.", {
    statuses: ["signed", "advocate"],
  });
  return reason;
}

/**
 * 마감이 지난 단계를 다음 단계로 넘깁니다. 워커가 1분마다 부르고, 사건 페이지를 열 때도 부릅니다.
 * 운영자가 처리해야 하는 단계(공소 제기 대기, 판결 작성)는 마감이 지나도 넘기지 않습니다.
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
    } else if (current.status === "PRETRIAL") {
      log.push(await db.$transaction((tx) => closePretrial(tx, current.round, now)));
    } else if (current.status === "EVIDENCE") {
      log.push(await db.$transaction((tx) => closeEvidence(tx, current.round, now)));
    }
  } catch (error) {
    // 다른 프로세스가 먼저 처리한 경우
    if (!(error instanceof StatusConflictError)) throw error;
  }
  return log;
}
