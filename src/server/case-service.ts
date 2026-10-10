import "server-only";
import { Prisma, type Side } from "@prisma/client";
import {
  type ChecklistKey,
  type DurationInput,
  MVP_STAGES,
  SIDE_LABELS,
  checkCaseSettings,
  missingChecklistItems,
  ratio,
} from "@/domain/case";
import { db } from "./db";
import { env } from "./env";
import { CASE_ID, StatusConflictError, advanceDueStages, indictCase, transition } from "./lifecycle";

export type Result = { ok: true } | { ok: false; error: string };

export type DraftInput = {
  title: string;
  summary: string;
  body: string;
  aiOriginalBody: string;
  aiModel: string;
  aiGeneratedAt: Date | null;
  minParticipants: number;
  maxParticipants: number | null;
  durations: DurationInput;
  checklist: ChecklistKey[];
  reviewNote: string;
};

export async function getCase() {
  return db.case.findUnique({ where: { id: CASE_ID } });
}

/** 03 O-02: 게시 전까지는 몇 번이든 고쳐 저장할 수 있습니다. 게시 후에는 수정할 수 없습니다 (05). */
export async function saveDraft(input: DraftInput): Promise<Result> {
  const settings = checkCaseSettings(input, env.demoMode);
  if (!settings.ok) return settings;

  const existing = await getCase();
  if (existing && existing.status !== "DRAFT") return { ok: false, error: "이미 게시한 사건은 수정할 수 없습니다." };

  const data = {
    title: input.title,
    summary: input.summary,
    body: input.body,
    aiOriginalBody: input.aiOriginalBody,
    aiModel: input.aiModel,
    aiGeneratedAt: input.aiGeneratedAt,
    generatedBy: "ai" as const,
    minParticipants: input.minParticipants,
    maxParticipants: input.maxParticipants,
    reviewChecklist: input.checklist,
    reviewNote: input.reviewNote || null,
  };

  await db.$transaction(async (tx) => {
    await tx.case.upsert({ where: { id: CASE_ID }, create: { id: CASE_ID, ...data }, update: data });
    for (const { stage } of MVP_STAGES) {
      await tx.stageSchedule.upsert({
        where: { round_stage: { round: 1, stage } },
        create: { round: 1, stage, durationMinutes: input.durations[stage] },
        update: { durationMinutes: input.durations[stage] },
      });
    }
  });
  return { ok: true };
}

/** 사건 게시: 공소 투표를 시작하고 "이 사건은 AI가 만들었습니다" 공지를 올립니다 (01, 05). */
export async function publishCase(operatorId: string): Promise<Result> {
  const current = await getCase();
  if (!current) return { ok: false, error: "먼저 사건을 저장해 주세요." };
  if (current.status !== "DRAFT") return { ok: false, error: "이미 게시한 사건입니다." };

  const missing = missingChecklistItems((current.reviewChecklist as string[] | null) ?? []);
  if (missing.length > 0) return { ok: false, error: `검수 체크리스트를 모두 확인해야 게시할 수 있습니다. 남은 항목: ${missing[0]}` };
  if (!current.aiOriginalBody.trim() || !current.body.trim()) return { ok: false, error: "AI 원본과 정리본을 모두 입력해 주세요." };
  if (!current.aiModel?.trim() || !current.aiGeneratedAt) return { ok: false, error: "AI 모델과 생성 일시를 기록해 주세요." };

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      await tx.case.update({ where: { id: CASE_ID }, data: { publishedAt: now } });
      await transition(tx, {
        round: 1,
        from: "DRAFT",
        to: "INDICTMENT_VOTE",
        actorType: "operator",
        actorUserId: operatorId,
        reason: "운영자가 사건을 게시해 공소 투표를 시작했습니다.",
        now,
      });
      await tx.notice.create({
        data: {
          title: "이 사건은 AI가 만들었습니다",
          body: [
            `「${current.title}」 사건은 운영자가 AI(${current.aiModel})에게 생성을 부탁해 만든 허구의 사건입니다. 실존 인물이나 사건과 관계가 없습니다.`,
            "운영자는 AI가 만든 원본을 문제없도록 정리해 올렸습니다. 사건 페이지에서 정리본을 기준으로 보되, 'AI 원본 보기'로 원본과 비교할 수 있습니다.",
            "본 서비스는 교육과 토론을 위한 시뮬레이션이며 법률 자문이 아닙니다.",
          ].join("\n\n"),
          authorUserId: operatorId,
          isPinned: true,
          publishedAt: now,
        },
      });
    });
  } catch (error) {
    if (error instanceof StatusConflictError) return { ok: false, error: "이미 게시한 사건입니다." };
    throw error;
  }
  return { ok: true };
}

/** 03 C-02 공소 투표. 투표하면 그 진영의 배심원이 됩니다 (02). */
export async function castIndictmentVote(user: { id: string; role: string }, choice: Side): Promise<Result> {
  if (user.role === "operator") return { ok: false, error: "운영자는 배심원으로 참여할 수 없습니다." };

  await advanceDueStages(db);
  const current = await getCase();
  if (current?.status !== "INDICTMENT_VOTE") return { ok: false, error: "지금은 공소 투표 기간이 아닙니다." };

  if (current.maxParticipants !== null) {
    const count = await db.indictmentVote.count();
    if (count >= current.maxParticipants) return { ok: false, error: "최대 참여 인원이 모두 찼습니다." };
  }

  try {
    await db.$transaction([
      db.indictmentVote.create({ data: { userId: user.id, choice } }),
      db.participation.create({ data: { userId: user.id, round: 1, side: choice, joinedVia: "indictment_vote", status: "voted" } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "이미 투표했습니다. 투표는 한 번만 할 수 있습니다." };
    }
    throw error;
  }
  return { ok: true };
}

/** 03 O-03 운영자의 공소 제기 */
export async function indict(operatorId: string, note: string): Promise<Result> {
  const current = await getCase();
  if (current?.status !== "INDICTMENT_PENDING") return { ok: false, error: "공소 제기 대기 상태가 아닙니다." };
  try {
    await indictCase(db, operatorId, note.trim().slice(0, 500));
  } catch (error) {
    if (error instanceof StatusConflictError) return { ok: false, error: "이미 공소가 제기되었습니다." };
    throw error;
  }
  return { ok: true };
}

/** 03 C-04 공판준비절차 서명: 투표에 참여한 배심원만, 공판준비 기간에만 (01) */
export async function signPretrial(userId: string): Promise<Result> {
  await advanceDueStages(db);
  const current = await getCase();
  if (current?.status !== "PRETRIAL") return { ok: false, error: "지금은 공판준비절차 서명 기간이 아닙니다." };
  const signed = await db.participation.updateMany({
    where: { userId, round: current.round, status: "voted" },
    data: { status: "signed", signedAt: new Date() },
  });
  if (signed.count !== 1) return { ok: false, error: "공소 투표에 참여한 배심원만 서명할 수 있습니다. 이미 서명했다면 다시 할 필요가 없습니다." };
  return { ok: true };
}

/** 사건 페이지와 홈에서 쓰는 화면용 데이터. 진행 중인 투표의 득표율은 담지 않습니다 (02 투표 공개 원칙). */
export async function getCaseView(userId: string | null) {
  await advanceDueStages(db);
  const current = await getCase();
  if (!current || current.status === "DRAFT") return null;

  const [schedule, voteCount, events, participation] = await Promise.all([
    db.stageSchedule.findUnique({ where: { round_stage: { round: current.round, stage: current.status } } }),
    db.indictmentVote.count(),
    db.caseEvent.findMany({ where: { isPublic: true }, orderBy: { createdAt: "asc" } }),
    userId ? db.participation.findUnique({ where: { userId_round: { userId, round: current.round } } }) : null,
  ]);

  // 공소 투표가 끝난 뒤에만 득표를 공개
  let indictmentResult: { indict: number; dismiss: number; indictRatio: number; dismissRatio: number } | null = null;
  if (current.status !== "INDICTMENT_VOTE") {
    const counts = await db.indictmentVote.groupBy({ by: ["choice"], _count: true });
    const indict = counts.find((c) => c.choice === "indict")?._count ?? 0;
    const dismiss = counts.find((c) => c.choice === "dismiss")?._count ?? 0;
    indictmentResult = { indict, dismiss, indictRatio: ratio(indict, indict + dismiss), dismissRatio: ratio(dismiss, indict + dismiss) };
  }

  const stageKind = MVP_STAGES.find((s) => s.stage === current.status)?.kind ?? null;
  const operatorOverdue = stageKind === "operator" && schedule?.endsAt != null && schedule.endsAt < new Date();

  return {
    case: current,
    deadline: schedule?.endsAt ?? null,
    stageKind,
    operatorOverdue,
    voteCount,
    indictmentResult,
    events,
    mySide: participation ? SIDE_LABELS[participation.side] : null,
    participation,
  };
}

export type CaseView = NonNullable<Awaited<ReturnType<typeof getCaseView>>>;
