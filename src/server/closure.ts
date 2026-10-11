// 사이트 폐쇄와 개인정보 파기 (01 한 사이트 한 사건, 04 사이트 폐쇄 때 파기하는 데이터, 05 파기).
// 웹 앱과 파기 스크립트(scripts/purge.ts)가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import { Prisma, type PrismaClient } from "@prisma/client";
import { caseHasEnded, canExecuteClosure, checkClosureSchedule } from "@/domain/closure";
import { CASE_ID, StatusConflictError, transition } from "./lifecycle";
import { deleteAllUploads } from "./uploads";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * 폐쇄 일시와 종료 안내 문구를 공지합니다. 공지를 올리고, 모든 회원에게 알림과 이메일(워커가 발송)을 보냅니다.
 * 폐쇄 전이라면 다시 공지해 일시를 바꿀 수 있습니다.
 */
export async function announceClosure(
  db: PrismaClient,
  operatorId: string,
  input: { scheduledAt: Date; summary: string },
  options: { demoMode: boolean; now?: Date },
): Promise<Result> {
  const now = options.now ?? new Date();
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!current || !caseHasEnded(current.status)) return { ok: false, error: "사건이 폐기되거나 확정된 뒤에만 폐쇄를 공지할 수 있습니다." };
  const schedule = checkClosureSchedule(input.scheduledAt, now, options.demoMode);
  if (!schedule.ok) return schedule;
  if (!input.summary.trim()) return { ok: false, error: "종료 안내 페이지에 남길 결과 요약을 적어 주세요." };

  const when = input.scheduledAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" });
  const message = `사건이 끝나 사이트가 ${when}에 폐쇄됩니다. 그 전에 사건 페이지에서 결과를 확인해 주세요. 폐쇄하면 회원 정보와 작성한 글은 모두 파기되고, 종료 안내 페이지만 남습니다.`;

  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id: CASE_ID }, data: { closureScheduledAt: input.scheduledAt, closureSummary: input.summary.trim() } });
    await tx.notice.create({ data: { title: "사이트 폐쇄 안내", body: message, authorUserId: operatorId, isPinned: true, publishedAt: now } });
    await tx.caseEvent.create({ data: { round: current.round, actorType: "operator", actorUserId: operatorId, decision: "close_site", reason: `운영자가 사이트 폐쇄를 공지했습니다 (${when}).`, createdAt: now } });
    const users = await tx.user.findMany({ select: { id: true } });
    await tx.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: "closure_announced", payload: { message }, link: "/case", sendEmail: true })),
    });
  });
  return { ok: true };
}

export type PurgeReport = Record<string, number>;

/**
 * 개인정보 파기. 종료 안내 페이지에 쓰는 사건명, 개요, 결과 요약, 판결 숫자만 남기고 나머지는 모두 지웁니다 (04).
 * 업로드한 증거 이미지 파일도 지웁니다.
 * 여러 번 실행해도 안전합니다.
 */
export async function purgePersonalData(db: PrismaClient): Promise<PurgeReport> {
  const before = {
    회원: await db.user.count(),
    참여: await db.participation.count(),
    게시글: await db.post.count(),
    열람기록: await db.viewLog.count(),
    문의: await db.inquiry.count(),
    알림: await db.notification.count(),
  };
  await db.$transaction(async (tx) => {
    await tx.advocateRecommendation.deleteMany();
    await tx.verdictBallot.deleteMany();
    await tx.caseEvent.deleteMany();
    await tx.notice.deleteMany();
    await tx.stageSchedule.deleteMany();
    await tx.leakDetection.deleteMany();
    await tx.rateLimitEvent.deleteMany();
    // 회원을 지우면 세션, IP, 인증 코드, 참여, 투표, 글, 열람 기록, 신고, 제재, 문의, 알림이 함께 지워짐 (스키마의 onDelete: Cascade)
    await tx.user.deleteMany();
    await tx.judgment.updateMany({ data: { pronouncedBy: "파기됨" } });
    await tx.case.updateMany({ data: { body: "", aiOriginalBody: "", reviewNote: null, reviewChecklist: Prisma.DbNull } });
  });
  // 증거자료 이미지 파일 (글과 함께 파기)
  const images = await deleteAllUploads();
  return { ...before, 이미지: images };
}

/**
 * 폐쇄 실행: 공지한 일시가 지나면 사이트 폐쇄 상태로 바꾸고 바로 개인정보를 파기합니다.
 * 파기 후에는 운영자 계정도 사라지며, 사이트에는 종료 안내 페이지만 남습니다.
 */
export async function executeClosure(db: PrismaClient, operatorId: string, now = new Date()): Promise<{ ok: true; report: PurgeReport } | { ok: false; error: string }> {
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!current) return { ok: false, error: "사건이 없습니다." };
  const check = canExecuteClosure(current.status, current.closureScheduledAt, now);
  if (!check.ok) return check;

  try {
    await db.$transaction(async (tx) => {
      await tx.case.update({ where: { id: CASE_ID }, data: { closedAt: now } });
      await transition(tx, {
        round: current.round,
        from: current.status,
        to: "SITE_CLOSED",
        actorType: "operator",
        actorUserId: operatorId,
        decision: "close_site",
        reason: "운영자가 사이트를 폐쇄했습니다.",
        now,
      });
    });
  } catch (error) {
    if (error instanceof StatusConflictError) return { ok: false, error: "이미 폐쇄되었습니다." };
    throw error;
  }
  return { ok: true, report: await purgePersonalData(db) };
}

export async function isSiteClosed(db: PrismaClient): Promise<boolean> {
  const current = await db.case.findUnique({ where: { id: CASE_ID }, select: { status: true } });
  return current?.status === "SITE_CLOSED";
}
