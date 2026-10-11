import "server-only";
import type { SanctionLevel, Violation } from "@prisma/client";
import { APPEAL_RESPONSE_DAYS, SANCTION_LABELS, VIOLATION_LABELS, canAppeal, suggestSanction } from "@/domain/board";
import { db } from "./db";
import { CASE_ID } from "./lifecycle";

export type Result = { ok: true } | { ok: false; error: string };

/** 이의가 받아들여지지 않은, 효력이 있는 제재 수 (05: 제재는 사람 단위로 누적) */
export async function countActiveSanctions(userId: string): Promise<number> {
  return db.sanction.count({ where: { userId, OR: [{ appeal: null }, { appeal: { status: { not: "accepted" } } }] } });
}

export async function suggestFor(userId: string, violation: Violation, clearEvidence: boolean) {
  return suggestSanction(violation, await countActiveSanctions(userId), clearEvidence);
}

export async function listReports() {
  return db.report.findMany({
    where: { status: { in: ["open", "reviewing"] } },
    include: { reporter: { select: { nickname: true } }, targetPost: { include: { author: { include: { user: { select: { nickname: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
}

/** 워터마크 코드로 캡처를 찍은 열람자를 찾습니다 (05 열람자별 워터마크). */
export async function lookupWatermark(code: string) {
  const logs = await db.viewLog.findMany({
    where: { watermarkCode: code.trim().toUpperCase() },
    include: { user: { select: { id: true, nickname: true } } },
    orderBy: { viewedAt: "asc" },
  });
  if (logs.length === 0) return null;
  return { user: logs[0].user, viewedAt: logs[0].viewedAt, postCount: logs.length };
}

type IssueInput = {
  userId: string;
  violation: Violation;
  level: SanctionLevel;
  reason: string;
  reportId?: string;
  /** 근거가 된 자동 탐지 결과 (M7) */
  detectionId?: string;
  hidePostId?: string;
};

/**
 * 제재 부과 (05 제재 정책). 자동 탐지만으로는 제재하지 않고, 운영자가 확인한 뒤 근거와 함께 기록합니다.
 * '사건에서 제외'면 참여 상태가 제외됨으로 바뀌어 이후 투표와 게시판에 참여할 수 없습니다.
 */
export async function issueSanction(operatorId: string, input: IssueInput): Promise<Result> {
  if (!input.reason.trim()) return { ok: false, error: "제재 이유를 적어 주세요. 제재 받은 사람에게 그대로 전달됩니다." };
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!current) return { ok: false, error: "사건이 없습니다." };
  const target = await db.user.findUnique({ where: { id: input.userId } });
  if (!target || target.role === "operator") return { ok: false, error: "제재할 수 없는 계정입니다." };

  await db.$transaction(async (tx) => {
    await tx.sanction.create({
      data: {
        userId: input.userId,
        round: current.round,
        level: input.level,
        violation: input.violation,
        reason: input.reason.trim(),
        reportId: input.reportId,
        detectionId: input.detectionId,
        issuedBy: operatorId,
      },
    });
    if (input.level === "excluded") {
      await tx.participation.updateMany({
        where: { userId: input.userId, round: current.round },
        data: { status: "excluded", excludedReason: "sanction" },
      });
    }
    if (input.hidePostId) {
      await tx.post.update({ where: { id: input.hidePostId }, data: { isHidden: true, hiddenReason: `운영자 제재: ${VIOLATION_LABELS[input.violation]}` } });
    }
    if (input.reportId) {
      await tx.report.update({
        where: { id: input.reportId },
        data: { status: "resolved", handledBy: operatorId, handledAt: new Date(), resolutionNote: `${SANCTION_LABELS[input.level]} 제재` },
      });
    }
    // 운영자가 탐지 결과를 확인해 제재했으므로 '확인됨'으로 처리. 복사 글처럼 여러 사람(올린 사람, 전달한 사람)을
    // 제재할 수 있는 탐지는 이미 처리되었어도 근거로 다시 쓸 수 있음
    if (input.detectionId) {
      await tx.leakDetection.updateMany({
        where: { id: input.detectionId, status: "open" },
        data: { status: "confirmed", handledBy: operatorId, handledAt: new Date(), resolutionNote: `${target.nickname}님 ${SANCTION_LABELS[input.level]} 제재` },
      });
    }
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: "sanction_issued",
        payload: {
          message: `${SANCTION_LABELS[input.level]} 제재를 받았습니다. 위반: ${VIOLATION_LABELS[input.violation]}. 이유: ${input.reason.trim()} 제재 후 3일 안에 이의를 신청할 수 있습니다.`,
        },
        link: "/me/sanctions",
      },
    });
  });
  return { ok: true };
}

export async function rejectReport(operatorId: string, reportId: string, note: string): Promise<Result> {
  await db.report.update({
    where: { id: reportId },
    data: { status: "rejected", handledBy: operatorId, handledAt: new Date(), resolutionNote: note.trim() || "제재하지 않음" },
  });
  return { ok: true };
}

export async function fileAppeal(userId: string, sanctionId: string, body: string): Promise<Result> {
  const sanction = await db.sanction.findUnique({ where: { id: sanctionId }, include: { appeal: true } });
  if (!sanction || sanction.userId !== userId) return { ok: false, error: "이의를 신청할 수 있는 제재가 아닙니다." };
  if (sanction.appeal) return { ok: false, error: "이미 이의를 신청했습니다." };
  if (!canAppeal(sanction.issuedAt, new Date())) return { ok: false, error: "이의 신청 기간(제재 후 3일)이 지났습니다." };
  if (!body.trim()) return { ok: false, error: "이의 신청 내용을 적어 주세요." };
  await db.sanctionAppeal.create({ data: { sanctionId, body: body.trim().slice(0, 3000) } });
  return { ok: true };
}

export async function listPendingAppeals() {
  return db.sanctionAppeal.findMany({
    where: { status: "pending" },
    include: { sanction: { include: { user: { select: { nickname: true } } } } },
    orderBy: { createdAt: "asc" },
  });
}

/** 이의가 받아들여지면 제재를 취소하고, '사건에서 제외'였다면 참여 상태를 되돌립니다 (05 이의 신청). */
export async function decideAppeal(operatorId: string, appealId: string, accept: boolean, note: string): Promise<Result> {
  const appeal = await db.sanctionAppeal.findUnique({ where: { id: appealId }, include: { sanction: true } });
  if (!appeal || appeal.status !== "pending") return { ok: false, error: "처리할 수 있는 이의 신청이 아닙니다." };
  if (!note.trim()) return { ok: false, error: "결정 이유를 적어 주세요. 신청자에게 그대로 전달됩니다." };

  await db.$transaction(async (tx) => {
    await tx.sanctionAppeal.update({
      where: { id: appealId },
      data: { status: accept ? "accepted" : "rejected", decidedBy: operatorId, decisionNote: note.trim(), decidedAt: new Date() },
    });
    if (accept && appeal.sanction.level === "excluded") {
      await tx.participation.updateMany({
        where: { userId: appeal.sanction.userId, round: appeal.sanction.round, status: "excluded", excludedReason: "sanction" },
        data: { status: "signed", excludedReason: null },
      });
    }
    await tx.notification.create({
      data: {
        userId: appeal.sanction.userId,
        type: "appeal_decided",
        payload: { message: `이의 신청이 ${accept ? "받아들여져 제재가 취소되었습니다" : "받아들여지지 않았습니다"}. 이유: ${note.trim()}` },
        link: "/me/sanctions",
      },
    });
  });
  return { ok: true };
}

export function appealDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + APPEAL_RESPONSE_DAYS * 24 * 60 * 60 * 1000);
}
