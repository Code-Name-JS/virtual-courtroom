import "server-only";
import { hoursAgo } from "@/domain/account";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import { env } from "./env";
import { consumeRateLimit } from "./rate-limit";
import { markSessionTotpVerified } from "./session";
import { generateTotpSecret, verifyTotp } from "./totp";

const PURPOSE = "admin-totp";
const TOTP_ATTEMPTS_PER_HOUR = 10;

export type TwoFactorResult = { ok: true } | { ok: false; error: string };

/** 2단계 인증 설정을 시작합니다. 아직 확인하지 않은 비밀 값이 있으면 새로 만듭니다. */
export async function startTotpSetup(userId: string): Promise<void> {
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: userId, totpEnabledAt: null },
    data: { totpSecretEnc: encrypt(env.sessionSecret, PURPOSE, secret) },
  });
}

export function readTotpSecret(totpSecretEnc: string): string {
  return decrypt(env.sessionSecret, PURPOSE, totpSecretEnc);
}

async function checkCode(user: { id: string; totpSecretEnc: string | null }, code: string): Promise<TwoFactorResult> {
  if (!user.totpSecretEnc) return { ok: false, error: "2단계 인증 설정을 먼저 시작해 주세요." };
  if (!(await consumeRateLimit(`totp:${user.id}`, TOTP_ATTEMPTS_PER_HOUR, hoursAgo(1)))) {
    return { ok: false, error: "인증 시도가 너무 많습니다. 1시간 뒤에 다시 시도해 주세요." };
  }
  if (!verifyTotp(readTotpSecret(user.totpSecretEnc), code.trim())) {
    return { ok: false, error: "인증 코드가 맞지 않습니다. 인증 앱의 시간이 맞는지 확인해 주세요." };
  }
  return { ok: true };
}

/** 인증 앱에 등록한 뒤 첫 코드를 확인하면 2단계 인증이 켜집니다. */
export async function confirmTotpSetup(
  user: { id: string; totpSecretEnc: string | null },
  sessionId: string,
  code: string,
): Promise<TwoFactorResult> {
  const result = await checkCode(user, code);
  if (!result.ok) return result;
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
  await markSessionTotpVerified(sessionId);
  return { ok: true };
}

/** 로그인할 때마다 관리자 영역에 들어가기 전 코드를 확인합니다. */
export async function verifyTotpForSession(
  user: { id: string; totpSecretEnc: string | null },
  sessionId: string,
  code: string,
): Promise<TwoFactorResult> {
  const result = await checkCode(user, code);
  if (!result.ok) return result;
  await markSessionTotpVerified(sessionId);
  return { ok: true };
}
