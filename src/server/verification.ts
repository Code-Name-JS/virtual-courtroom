import "server-only";
import type { VerificationPurpose } from "@prisma/client";
import { CODE_MAX_ATTEMPTS, CODE_RESEND_COOLDOWN_SECONDS, CODE_TTL_MINUTES, minutesFromNow } from "@/domain/account";
import { hmac, randomCode, safeEqual } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";

function hashCode(code: string): string {
  return hmac(env.sessionSecret, `email-code:${code}`);
}

const SUBJECTS: Record<VerificationPurpose, string> = {
  signup: "[Virtual Courtroom] 이메일 인증 코드",
  ip_change: "[Virtual Courtroom] 접속 위치 변경 인증 코드",
};

const INTROS: Record<VerificationPurpose, string> = {
  signup: "회원가입을 마치려면 아래 인증 코드를 입력해 주세요.",
  ip_change:
    "새로운 네트워크(IP)에서 접속을 시도했습니다. 본인이 맞다면 아래 인증 코드를 입력해 주세요.\n본인이 아니라면 이 메일을 무시하고 비밀번호를 바꿔 주세요.",
};

export type IssueResult = { ok: true } | { ok: false; error: string };

/** 인증 코드를 새로 만들어 이메일로 보냅니다. 직전 코드를 보낸 지 60초가 안 됐으면 보내지 않습니다. */
export async function issueCode(
  user: { id: string; email: string },
  purpose: VerificationPurpose,
  pendingIpHash?: string,
): Promise<IssueResult> {
  const latest = await db.emailVerification.findFirst({
    where: { userId: user.id, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < CODE_RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: false, error: `인증 코드는 ${CODE_RESEND_COOLDOWN_SECONDS}초에 한 번만 보낼 수 있습니다. 잠시 후 다시 시도해 주세요.` };
  }

  const code = randomCode();
  await db.$transaction([
    // 이전 코드는 쓸 수 없게 함
    db.emailVerification.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    db.emailVerification.create({
      data: { userId: user.id, purpose, codeHash: hashCode(code), pendingIpHash, expiresAt: minutesFromNow(CODE_TTL_MINUTES) },
    }),
  ]);

  await sendMail({
    to: user.email,
    subject: SUBJECTS[purpose],
    text: `${INTROS[purpose]}\n\n인증 코드: ${code}\n\n이 코드는 ${CODE_TTL_MINUTES}분 동안 유효합니다.`,
  });
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; pendingIpHash: string | null }
  | { ok: false; error: string };

export async function verifyCode(userId: string, purpose: VerificationPurpose, code: string): Promise<VerifyResult> {
  const record = await db.emailVerification.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, error: "유효한 인증 코드가 없습니다. 코드를 다시 받아 주세요." };
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    return { ok: false, error: `${CODE_MAX_ATTEMPTS}번 틀려 이 코드는 더 이상 쓸 수 없습니다. 코드를 다시 받아 주세요.` };
  }
  if (!safeEqual(record.codeHash, hashCode(code))) {
    await db.emailVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "인증 코드가 맞지 않습니다." };
  }
  await db.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return { ok: true, pendingIpHash: record.pendingIpHash };
}
