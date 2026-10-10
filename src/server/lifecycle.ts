// 02 사건 생애주기의 상태 전환. 웹 앱과 워커(worker/index.ts)가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import type { ActorType, CaseDecision, CaseStatus, JudgmentOutcome, ParticipationStatus, Prisma, PrismaClient, SentenceType, Side } from "@prisma/client";
import { SIDE_LABELS, ratio, resolveIndictmentVote } from "@/domain/case";
import { OUTCOME_LABELS, SENTENCE_LABELS, nominationDeadline, pickByVotes, pickEarliestSigned } from "@/domain/trial";
import { type AdvocateRecommender, buildPrompt, parseRecommendation } from "./ai/recommender";

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

const SIDES: Side[] = ["indict", "dismiss"];
const ACTIVE: ParticipationStatus[] = ["signed", "advocate"];

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";
}

/** 재판에 참여 중인 배심원 (서명했고 제외되지 않은 사람) */
function activeJurors(tx: Tx, round: number, side: Side) {
  return tx.participation.findMany({ where: { round, side, status: { in: ACTIVE } }, include: { user: { select: { nickname: true } } } });
}

/** 최종 변론인 후보: 추천을 받은 배심원. 추천이 한 건도 없으면 그 진영의 모든 배심원 (05 진행 중 생길 수 있는 상황) */
export async function advocateCandidates(tx: Tx, round: number, side: Side) {
  const jurors = await activeJurors(tx, round, side);
  const nominations = await tx.advocateNomination.findMany({
    where: { round, candidate: { side, status: { in: ACTIVE } } },
    orderBy: { createdAt: "asc" },
  });
  const nominated = new Set(nominations.map((n) => n.candidateParticipationId));
  const pool = nominated.size > 0 ? jurors.filter((j) => nominated.has(j.id)) : jurors;
  return pool.map((j) => {
    const received = nominations.filter((n) => n.candidateParticipationId === j.id);
    return {
      participationId: j.id,
      nickname: j.user.nickname,
      signedAt: j.signedAt,
      nominationCount: received.length,
      nominationReasons: received.map((n) => n.reason),
    };
  });
}

const AI_ATTEMPTS = 3;

/**
 * 추천 투표가 마감되면 AI가 진영별 추천과 이유를 냅니다 (01 최종 변론인 선정 2단계).
 * AI가 설정되지 않았거나 세 번 시도해도 응답하지 않으면 "AI 추천 없음"으로 기록하고, 운영자가 AI 추천 없이 선정합니다 (02).
 * 네트워크 호출이 있으므로 워커와 운영자의 요청에서만 부릅니다.
 */
export async function runAdvocateRecommendations(db: PrismaClient, recommender: AdvocateRecommender | null, now = new Date()): Promise<string[]> {
  const log: string[] = [];
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  if (current?.status !== "ADVOCATE_SELECTION") return log;
  const schedule = await db.stageSchedule.findUnique({ where: { round_stage: { round: current.round, stage: "ADVOCATE_SELECTION" } } });
  if (!schedule?.startsAt || !schedule.endsAt || now < nominationDeadline(schedule.startsAt, schedule.endsAt)) return log;

  for (const side of SIDES) {
    const existing = await db.advocateRecommendation.findUnique({ where: { round_side: { round: current.round, side } } });
    if (existing) continue;
    const candidates = await advocateCandidates(db, current.round, side);
    if (candidates.length === 0) continue;

    let result: { participationId: string; rationale: string; request: string; response: string } | null = null;
    let failure = "AI가 설정되지 않아 AI 추천 없이 진행합니다. 운영자가 배심원의 추천 이유를 참고해 선정합니다.";
    if (recommender) {
      const posts = await db.post.findMany({
        where: { round: current.round, side, isHidden: false, authorParticipationId: { in: candidates.map((c) => c.participationId) } },
        orderBy: { createdAt: "asc" },
      });
      const prompt = buildPrompt({
        caseTitle: current.title,
        caseBody: current.body,
        sideLabel: SIDE_LABELS[side],
        candidates: candidates.map((c) => ({
          participationId: c.participationId,
          nickname: c.nickname,
          nominationCount: c.nominationCount,
          nominationReasons: c.nominationReasons,
          posts: posts.filter((p) => p.authorParticipationId === c.participationId).map((p) => p.body),
        })),
      });
      for (let attempt = 1; attempt <= AI_ATTEMPTS && !result; attempt++) {
        try {
          const raw = await recommender.complete(prompt);
          const parsed = parseRecommendation(raw.text, candidates.map((c) => c.participationId));
          if (parsed) result = { ...parsed, request: `${prompt.system}\n\n${prompt.user}`, response: raw.text };
        } catch (error) {
          console.error(`[ai] ${SIDE_LABELS[side]} 측 추천 실패 (${attempt}/${AI_ATTEMPTS})`, error);
        }
      }
      failure = "AI가 응답하지 않아 AI 추천 없이 진행합니다. 운영자가 배심원의 추천 이유를 참고해 선정합니다.";
    }

    try {
      await db.advocateRecommendation.create({
        data: {
          round: current.round,
          side,
          participationId: result?.participationId ?? null,
          rationale: result?.rationale ?? failure,
          provider: recommender?.provider ?? null,
          model: recommender?.model ?? null,
          request: result?.request ?? null,
          response: result?.response ?? null,
        },
      });
    } catch (error) {
      // 다른 프로세스가 먼저 기록한 경우
      if (isUniqueViolation(error)) continue;
      throw error;
    }
    const nickname = candidates.find((c) => c.participationId === result?.participationId)?.nickname;
    log.push(`${SIDE_LABELS[side]} 측 AI 추천: ${nickname ?? "없음"}`);
  }
  return log;
}

/**
 * 운영자의 최종 변론인 선정: 진영별 1명을 단 한 번 (01). AI 추천과 다른 사람을 고르면 이유가 필요하고,
 * 선정 결과와 이유는 모두 진행 기록에 공개됩니다.
 */
export async function selectAdvocates(
  db: PrismaClient,
  operatorId: string,
  choices: { side: Side; participationId: string; reason: string }[],
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await db.case.findUniqueOrThrow({ where: { id: CASE_ID } });
  if (current.status !== "ADVOCATE_SELECTION") return { ok: false, error: "최종 변론인 선정 단계가 아닙니다." };
  const schedule = await db.stageSchedule.findUnique({ where: { round_stage: { round: current.round, stage: "ADVOCATE_SELECTION" } } });
  if (!schedule?.startsAt || !schedule.endsAt || now < nominationDeadline(schedule.startsAt, schedule.endsAt)) {
    return { ok: false, error: "배심원의 추천 투표가 끝난 뒤에 선정할 수 있습니다." };
  }
  if ((await db.advocate.count({ where: { round: current.round } })) > 0) {
    return { ok: false, error: "이미 최종 변론인을 선정했습니다. 선정은 단 한 번만 할 수 있습니다." };
  }

  const rows: Prisma.AdvocateCreateManyInput[] = [];
  const summary: string[] = [];
  for (const side of SIDES) {
    const candidates = await advocateCandidates(db, current.round, side);
    if (candidates.length === 0) continue;
    const choice = choices.find((c) => c.side === side);
    const picked = candidates.find((c) => c.participationId === choice?.participationId);
    if (!choice || !picked) return { ok: false, error: `${SIDE_LABELS[side]} 측 최종 변론인을 후보 중에서 골라 주세요.` };
    const rec = await db.advocateRecommendation.findUnique({ where: { round_side: { round: current.round, side } } });
    const differsFromAi = rec?.participationId != null && rec.participationId !== picked.participationId;
    if (differsFromAi && !choice.reason.trim()) {
      return { ok: false, error: `${SIDE_LABELS[side]} 측: AI 추천과 다른 사람을 선정하려면 이유를 적어야 합니다.` };
    }
    rows.push({
      round: current.round,
      side,
      participationId: picked.participationId,
      aiRecommendedParticipationId: rec?.participationId ?? null,
      aiRationale: rec?.rationale ?? null,
      aiRequest: rec?.request ?? null,
      aiResponse: rec?.response ?? null,
      selectedBy: "operator",
      operatorReason: choice.reason.trim() || null,
      selectedAt: now,
    });
    const note = differsFromAi ? ` (AI 추천과 다르게 선정. 이유: ${choice.reason.trim()})` : rec?.participationId ? " (AI 추천과 같음)" : "";
    summary.push(`${SIDE_LABELS[side]} 측 ${picked.nickname}${note}`);
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.advocate.createMany({ data: rows });
      await tx.participation.updateMany({ where: { id: { in: rows.map((r) => r.participationId) } }, data: { status: "advocate" } });
      await tx.caseEvent.create({
        data: {
          round: current.round,
          actorType: "operator",
          actorUserId: operatorId,
          decision: "select_advocate",
          reason: `운영자가 최종 변론인을 선정했습니다: ${summary.join(", ")}.`,
          createdAt: now,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "이미 최종 변론인을 선정했습니다. 선정은 단 한 번만 할 수 있습니다." };
    throw error;
  }
  return { ok: true };
}

/**
 * 최종 변론인 선정 마감. 운영자가 선정하지 않은 진영은 AI 추천으로, AI 추천도 없으면 추천 표를 가장 많이 받은 후보로 확정합니다 (02).
 * 배심원이 한 명도 없는 진영은 변론인 없이 진행합니다 (05).
 */
async function closeAdvocateSelection(tx: Tx, round: number, now: Date): Promise<string> {
  const notes: string[] = [];
  for (const side of SIDES) {
    if (await tx.advocate.findUnique({ where: { round_side: { round, side } } })) continue;
    const candidates = await advocateCandidates(tx, round, side);
    if (candidates.length === 0) {
      notes.push(`${SIDE_LABELS[side]} 측은 참여 중인 배심원이 없어 최종 변론인 없이 진행합니다`);
      continue;
    }
    const rec = await tx.advocateRecommendation.findUnique({ where: { round_side: { round, side } } });
    const nominations = await tx.advocateNomination.findMany({ where: { round, candidate: { side, status: { in: ACTIVE } } } });
    const byVotes = pickByVotes(nominations) ?? pickEarliestSigned(candidates.map((c) => ({ id: c.participationId, signedAt: c.signedAt })));
    const participationId = rec?.participationId ?? byVotes;
    if (!participationId) continue;
    const selectedBy = rec?.participationId ? "ai_default" : "vote_default";
    await tx.advocate.create({
      data: {
        round,
        side,
        participationId,
        aiRecommendedParticipationId: rec?.participationId ?? null,
        aiRationale: rec?.rationale ?? null,
        aiRequest: rec?.request ?? null,
        aiResponse: rec?.response ?? null,
        selectedBy,
        selectedAt: now,
      },
    });
    await tx.participation.update({ where: { id: participationId }, data: { status: "advocate" } });
    const nickname = candidates.find((c) => c.participationId === participationId)?.nickname;
    notes.push(
      `${SIDE_LABELS[side]} 측은 운영자가 기한 안에 선정하지 않아 ${selectedBy === "ai_default" ? "AI 추천" : "추천 표가 가장 많은 후보"}인 ${nickname}(으)로 확정했습니다`,
    );
  }

  const reason = `최종 변론인 선정 마감.${notes.length ? ` ${notes.join(". ")}.` : ""} 최종 변론을 시작합니다. 공소 제기 측이 먼저, 불기소 측이 나중에 변론합니다.`;
  await transition(tx, { round, from: "ADVOCATE_SELECTION", to: "FINAL_ARGUMENT", actorType: "system", reason, now });
  await notifyParticipants(tx, round, "advocate_selected", "최종 변론인으로 선정되었습니다. 마감 전에 사건 페이지에서 최종 변론을 써 주세요.", {
    statuses: ["advocate"],
    sendEmail: true,
  });
  await notifyParticipants(tx, round, "final_argument_started", "최종 변론이 시작되었습니다. 양측 최종 변론인의 변론을 읽어 보세요.", { statuses: ["signed"] });
  return reason;
}

/** 최종 변론 마감: 비공개 평결을 시작합니다. */
async function closeFinalArgument(tx: Tx, round: number, now: Date): Promise<string> {
  const reason = "최종 변론 마감. 배심원 평결을 시작합니다. 평결은 비공개이며 개인 표는 공개되지 않습니다.";
  await transition(tx, { round, from: "FINAL_ARGUMENT", to: "DELIBERATION", actorType: "system", reason, now });
  await notifyParticipants(
    tx,
    round,
    "deliberation_started",
    "배심원 평결이 시작되었습니다. 양측의 주장과 증거, 최종 변론을 보고 유죄 또는 무죄로 평결해 주세요. 개인 표는 공개되지 않습니다.",
    { statuses: ACTIVE, sendEmail: true },
  );
  return reason;
}

/** 평결 마감: 운영자의 판결 작성을 기다립니다. 평결 집계는 판결과 함께 공개합니다. */
async function closeDeliberation(tx: Tx, round: number, now: Date): Promise<string> {
  const voted = await tx.verdictReceipt.count({ where: { round } });
  const reason = `배심원 평결 마감 (참여 ${voted}명). 운영자가 평결을 참고해 판결을 작성합니다.`;
  await transition(tx, { round, from: "DELIBERATION", to: "SENTENCING", actorType: "system", reason, now });
  await notifyParticipants(tx, round, "deliberation_closed", "평결이 마감되었습니다. 운영자의 판결 선고를 기다려 주세요.", { statuses: ACTIVE });
  return reason;
}

/**
 * 운영자의 판결 선고 (01: 평결을 참고해 무죄 또는 유죄로 선고하고 이유를 제공).
 * MVP(06 결정 2)에서는 리뷰와 2심 없이 1심 판결이 곧 확정됩니다.
 */
export async function pronounceJudgment(
  db: PrismaClient,
  operatorId: string,
  input: { outcome: JudgmentOutcome; sentenceType: SentenceType | null; sentenceDetail: string; reasoning: string },
  now = new Date(),
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.case.findUniqueOrThrow({ where: { id: CASE_ID } });
    const votes = await tx.indictmentVote.groupBy({ by: ["choice"], _count: true });
    const indict = votes.find((v) => v.choice === "indict")?._count ?? 0;
    const dismiss = votes.find((v) => v.choice === "dismiss")?._count ?? 0;
    const ballots = await tx.verdictBallot.groupBy({ by: ["choice"], where: { round: current.round }, _count: true });
    const guilty = ballots.find((b) => b.choice === "guilty")?._count ?? 0;
    const notGuilty = ballots.find((b) => b.choice === "not_guilty")?._count ?? 0;
    const sentenced = input.outcome === "guilty" && input.sentenceType;

    await tx.judgment.create({
      data: {
        round: current.round,
        outcome: input.outcome,
        sentenceType: sentenced ? input.sentenceType : null,
        sentenceDetail: sentenced ? input.sentenceDetail.trim() : null,
        reasoning: input.reasoning.trim(),
        baselineIndictRatio: ratio(indict, indict + dismiss),
        verdictGuilty: guilty,
        verdictNotGuilty: notGuilty,
        pronouncedBy: operatorId,
        pronouncedAt: now,
      },
    });
    const sentence = sentenced ? ` (${SENTENCE_LABELS[input.sentenceType!]} ${input.sentenceDetail.trim()})` : "";
    const reason = `운영자가 판결을 선고했습니다: ${OUTCOME_LABELS[input.outcome]}${sentence}. 배심원 평결 유죄 ${guilty}표, 무죄 ${notGuilty}표.`;
    await transition(tx, {
      round: current.round,
      from: "SENTENCING",
      to: "FINALIZED",
      actorType: "operator",
      actorUserId: operatorId,
      decision: "pronounce",
      reason,
      now,
    });
    await notifyParticipants(
      tx,
      current.round,
      "judgment_pronounced",
      `판결이 선고되었습니다: ${OUTCOME_LABELS[input.outcome]}${sentence}. 사건 페이지에서 선고 이유와 설득 지표를 확인해 보세요.`,
    );
  });
}

export type AdvanceOptions = {
  /**
   * 추천 투표 마감 후의 AI 추천까지 처리할지. 워커만 넘깁니다 (null이면 "AI 추천 없음"으로 기록).
   * 생략하면 AI 호출 없이 상태 전환만 합니다 (사건 페이지를 열 때).
   */
  recommender?: AdvocateRecommender | null;
};

/**
 * 마감이 지난 단계를 다음 단계로 넘깁니다. 워커가 1분마다 부르고, 사건 페이지를 열 때도 부릅니다.
 * 운영자가 처리해야 하는 단계(공소 제기 대기, 판결 작성)는 마감이 지나도 넘기지 않습니다.
 */
export async function advanceDueStages(db: PrismaClient, now = new Date(), options: AdvanceOptions = {}): Promise<string[]> {
  const log: string[] = [];
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!current) return log;

  if (current.status === "ADVOCATE_SELECTION" && options.recommender !== undefined) {
    log.push(...(await runAdvocateRecommendations(db, options.recommender, now)));
  }

  const schedule = await db.stageSchedule.findUnique({ where: { round_stage: { round: current.round, stage: current.status } } });
  if (!schedule?.endsAt || schedule.endsAt > now) return log;

  try {
    if (current.status === "INDICTMENT_VOTE") {
      log.push(await db.$transaction((tx) => closeIndictmentVote(tx, current.round, current.minParticipants, now)));
    } else if (current.status === "PRETRIAL") {
      log.push(await db.$transaction((tx) => closePretrial(tx, current.round, now)));
    } else if (current.status === "EVIDENCE") {
      log.push(await db.$transaction((tx) => closeEvidence(tx, current.round, now)));
    } else if (current.status === "ADVOCATE_SELECTION") {
      log.push(await db.$transaction((tx) => closeAdvocateSelection(tx, current.round, now)));
    } else if (current.status === "FINAL_ARGUMENT") {
      log.push(await db.$transaction((tx) => closeFinalArgument(tx, current.round, now)));
    } else if (current.status === "DELIBERATION") {
      log.push(await db.$transaction((tx) => closeDeliberation(tx, current.round, now)));
    }
  } catch (error) {
    // 다른 프로세스가 먼저 처리한 경우
    if (!(error instanceof StatusConflictError)) throw error;
  }
  return log;
}
