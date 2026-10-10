import "server-only";
import { cookies } from "next/headers";
import { SESSION_TTL_DAYS, daysFromNow } from "@/domain/account";
import { randomToken, sha256 } from "./crypto";
import { db } from "./db";
import { env } from "./env";

const COOKIE_NAME = "vc_session";

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = daysFromNow(SESSION_TTL_DAYS);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** 쿠키의 세션을 찾습니다. 만료된 세션은 없는 것으로 봅니다. */
export async function getSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  store.delete(COOKIE_NAME);
}

export async function markSessionTotpVerified(sessionId: string): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { totpVerified: true } });
}
