// 만 14세 미만 회원의 법정대리인 동의 (05 만 14세 미만: 법정대리인 동의 후 가입, 03 U-08).
// 웹 앱과 워커(기한 초과 정리)가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import type { PrismaClient } from "@prisma/client";
import { GUARDIAN_CONSENT_DAYS, GUARDIAN_REQUESTS_PER_DAY, daysFromNow, hoursAgo } from "@/domain/account";
import { randomToken, sha256 } from "./crypto";
import { sendMail } from "./mailer";

export type Result = { ok: true } | { ok: false; error: string };

/** 동의 화면 주소. 토큰 원문은 이메일에만 있고 DB에는 해시만 저장합니다. */
function consentUrl(token: string): string {
  return `${process.env.SITE_URL ?? "http://localhost:3000"}/guardian/${token}`;
}

/**
 * 법정대리인에게 동의 요청 이메일을 보냅니다. 가입자가 자기 이메일 인증을 마친 뒤에 보내므로,
 * 아무 주소로나 메일을 보내는 데 가입 화면을 악용하기 어렵습니다 (M6 결정). 보낼 때마다 링크를 새로 만들고 기한을 7일로 다시 셉니다.
 */
export async function sendGuardianRequest(db: PrismaClient, userId: string, now = new Date()): Promise<Result> {
  const consent = await db.guardianConsent.findUnique({ where: { userId }, include: { user: { select: { nickname: true, emailVerifiedAt: true } } } });
  if (!consent || consent.status !== "pending") return { ok: false, error: "동의를 기다리는 가입 신청이 없습니다." };
  if (!consent.user.emailVerifiedAt) return { ok: false, error: "먼저 가입한 이메일의 인증을 마쳐 주세요." };

  const key = `guardian:${userId}`;
  const sent = await db.rateLimitEvent.count({ where: { key, createdAt: { gte: hoursAgo(24, now) } } });
  if (sent >= GUARDIAN_REQUESTS_PER_DAY) return { ok: false, error: `동의 요청 이메일은 하루 ${GUARDIAN_REQUESTS_PER_DAY}번까지 보낼 수 있습니다. 내일 다시 시도해 주세요.` };

  const token = randomToken();
  const expiresAt = daysFromNow(GUARDIAN_CONSENT_DAYS, now);
  await db.$transaction([
    db.guardianConsent.update({ where: { userId }, data: { tokenHash: sha256(token), requestedAt: now, expiresAt } }),
    db.rateLimitEvent.create({ data: { key, createdAt: now } }),
  ]);

  const until = expiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" });
  await sendMail({
    to: consent.guardianEmail,
    subject: "[Virtual Courtroom] 자녀의 회원가입에 법정대리인 동의를 요청합니다",
    text: [
      `${consent.guardianName}님, 안녕하세요.`,
      `만 14세 미만 회원(닉네임: ${consent.user.nickname})이 Virtual Courtroom에 가입하면서 법정대리인으로 ${consent.guardianName}님을 적었습니다. 개인정보 보호법에 따라 만 14세 미만은 법정대리인의 동의를 받아야 가입할 수 있습니다.`,
      "Virtual Courtroom은 AI가 만든 가상의 형사 사건에서 배심원이 되어 재판 과정을 경험하는 교육용 시뮬레이션입니다. 자녀는 절도·사기 같은 범죄를 다루는 가상 사건을 읽고, 투표하고, 다른 회원과 게시판에서 토론하게 됩니다.",
      "수집하는 정보: 자녀의 이메일, 비밀번호(해시), 닉네임, 접속 IP(해시), 작성한 글과 참여 기록, 그리고 동의 확인을 위한 법정대리인의 이름과 이메일. 모든 정보는 사건이 끝나 사이트를 폐쇄할 때 파기합니다.",
      `아래 링크에서 내용을 확인하고 동의 또는 거부를 선택해 주세요. 링크는 ${until}까지 유효합니다.`,
      consentUrl(token),
      "거부하거나 기한 안에 응답하지 않으면 가입 신청은 취소되고, 입력된 정보는 모두 바로 삭제됩니다. 법정대리인이 아니라면 이 메일을 무시해 주세요.",
    ].join("\n\n"),
  });
  return { ok: true };
}

/** 가입자가 법정대리인 정보를 고쳐 다시 요청합니다 (이메일 오타 등). */
export async function changeGuardianAndResend(db: PrismaClient, userId: string, guardian: { name: string; email: string }, now = new Date()): Promise<Result> {
  const consent = await db.guardianConsent.findUnique({ where: { userId }, include: { user: { select: { email: true } } } });
  if (!consent || consent.status !== "pending") return { ok: false, error: "동의를 기다리는 가입 신청이 없습니다." };
  if (guardian.email === consent.user.email) return { ok: false, error: "법정대리인의 이메일은 가입하는 이메일과 달라야 합니다." };
  await db.guardianConsent.update({ where: { userId }, data: { guardianName: guardian.name, guardianEmail: guardian.email } });
  return sendGuardianRequest(db, userId, now);
}

/** 동의 화면에서 보여 줄 신청 정보. 링크가 틀렸거나 이미 처리됐으면 null */
export async function findPendingConsent(db: PrismaClient, token: string, now = new Date()) {
  const consent = await db.guardianConsent.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { select: { nickname: true, email: true } } } });
  if (!consent || consent.status !== "pending") return null;
  if (consent.expiresAt < now) {
    await expireGuardianConsents(db, now);
    return null;
  }
  return { guardianName: consent.guardianName, nickname: consent.user.nickname, email: consent.user.email, expiresAt: consent.expiresAt };
}

/**
 * 법정대리인의 응답. 동의하면 계정이 활성화되고, 거부하면 가입 신청 정보와 법정대리인 정보를 바로 삭제합니다 (04, 05).
 */
export async function respondToConsent(db: PrismaClient, token: string, agree: boolean, now = new Date()): Promise<Result & { agreed?: boolean }> {
  const consent = await db.guardianConsent.findUnique({ where: { tokenHash: sha256(token) } });
  if (!consent || consent.status !== "pending" || consent.expiresAt < now) {
    return { ok: false, error: "이미 처리되었거나 기한이 지난 요청입니다. 가입 신청이 취소되었다면 자녀가 다시 가입해야 합니다." };
  }
  if (agree) {
    const updated = await db.$transaction([
      db.guardianConsent.updateMany({ where: { id: consent.id, status: "pending" }, data: { status: "consented", respondedAt: now } }),
      db.user.update({ where: { id: consent.userId }, data: { guardianConsentedAt: now } }),
    ]);
    if (updated[0].count !== 1) return { ok: false, error: "이미 처리된 요청입니다." };
    await db.notification.create({
      data: { userId: consent.userId, type: "guardian_consented", payload: { message: "법정대리인이 동의해 가입이 완료되었습니다. 이제 사건에 참여할 수 있습니다." }, link: "/case" },
    });
    return { ok: true, agreed: true };
  }
  // 회원을 지우면 동의 요청, 세션, IP, 인증 코드도 함께 지워짐 (스키마의 onDelete: Cascade)
  await db.user.deleteMany({ where: { id: consent.userId } });
  return { ok: true, agreed: false };
}

/** 7일 안에 응답이 없으면 가입 신청을 취소하고 정보를 삭제합니다. 워커가 1분마다 부릅니다. */
export async function expireGuardianConsents(db: PrismaClient, now = new Date()): Promise<number> {
  const expired = await db.guardianConsent.findMany({ where: { status: "pending", expiresAt: { lt: now } }, select: { userId: true } });
  if (expired.length === 0) return 0;
  const deleted = await db.user.deleteMany({ where: { id: { in: expired.map((e) => e.userId) }, guardianConsentedAt: null } });
  return deleted.count;
}
