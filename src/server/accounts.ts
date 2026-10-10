import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import {
  LOGIN_ATTEMPTS_PER_IP_PER_HOUR,
  SIGNUP_ATTEMPTS_PER_IP_PER_DAY,
  type SignupInput,
  decideIpChange,
  hoursAgo,
  isStaleUnverified,
} from "@/domain/account";
import { isSiteClosed } from "./closure";
import { db } from "./db";
import { env } from "./env";
import { consumeRateLimit } from "./rate-limit";
import { issueCode, verifyCode } from "./verification";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const IP_IN_USE_MESSAGE = "이 네트워크(IP)에서는 이미 다른 계정이 이용 중입니다. 다른 네트워크에서 접속해 주세요.";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** 이메일 인증을 24시간 넘게 마치지 않은 계정은 지워서, 그 계정이 차지한 IP·이메일·닉네임을 풀어 줍니다. */
async function removeIfStaleUnverified(user: { id: string; emailVerifiedAt: Date | null; createdAt: Date } | null) {
  if (user && isStaleUnverified(user, new Date())) {
    await db.user.delete({ where: { id: user.id } });
    return true;
  }
  return false;
}

/** 회원가입 (01: 계정 하나, IP 하나에 계정 하나 / 05: 같은 IP 가입 시도 하루 3회) */
const CLOSED_MESSAGE = "사건이 끝나 사이트가 폐쇄되었습니다.";

export async function signUp(input: SignupInput, ipHash: string): Promise<Result<{ userId: string }>> {
  if (await isSiteClosed(db)) return { ok: false, error: CLOSED_MESSAGE };
  if (!(await consumeRateLimit(`signup:${ipHash}`, SIGNUP_ATTEMPTS_PER_IP_PER_DAY, hoursAgo(24)))) {
    return { ok: false, error: "이 네트워크에서 오늘 가입을 시도할 수 있는 횟수를 넘었습니다. 내일 다시 시도해 주세요." };
  }

  if (env.ipRuleEnabled) {
    const binding = await db.ipBinding.findUnique({ where: { ipHash }, include: { user: true } });
    if (binding && !(await removeIfStaleUnverified(binding.user))) return { ok: false, error: IP_IN_USE_MESSAGE };
  }

  const sameEmail = await db.user.findUnique({ where: { email: input.email } });
  if (sameEmail && !(await removeIfStaleUnverified(sameEmail))) return { ok: false, error: "이미 가입된 이메일입니다." };

  const sameNickname = await db.user.findUnique({ where: { nickname: input.nickname } });
  if (sameNickname && !(await removeIfStaleUnverified(sameNickname))) return { ok: false, error: "이미 쓰이고 있는 닉네임입니다." };

  const passwordHash = await hash(input.password);
  const role = env.operatorEmail === input.email ? "operator" : "member";

  let user;
  try {
    user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        nickname: input.nickname,
        role,
        isUnder14: false,
        // 가입한 IP를 등록 IP로 정함. IP 규칙을 끈 시연 모드에서는 등록하지 않음
        ipBinding: env.ipRuleEnabled ? { create: { ipHash, verifiedAt: new Date() } } : undefined,
      },
    });
  } catch (error) {
    // 같은 순간에 같은 IP·이메일·닉네임으로 가입한 경우
    if (isUniqueViolation(error)) return { ok: false, error: "이미 쓰이고 있는 이메일, 닉네임 또는 네트워크입니다." };
    throw error;
  }

  const issued = await issueCode(user, "signup");
  if (!issued.ok) return issued;
  return { ok: true, value: { userId: user.id } };
}

export async function logIn(email: string, password: string, ipHash: string): Promise<Result<{ userId: string }>> {
  if (await isSiteClosed(db)) return { ok: false, error: CLOSED_MESSAGE };
  if (!(await consumeRateLimit(`login:${ipHash}`, LOGIN_ATTEMPTS_PER_IP_PER_HOUR, hoursAgo(1)))) {
    return { ok: false, error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." };
  }
  const user = await db.user.findUnique({ where: { email } });
  // 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분해서 알려 주지 않음
  if (!user || !(await verify(user.passwordHash, password))) {
    return { ok: false, error: "이메일 또는 비밀번호가 맞지 않습니다." };
  }
  return { ok: true, value: { userId: user.id } };
}

export async function confirmSignupEmail(userId: string, code: string): Promise<Result> {
  const result = await verifyCode(userId, "signup", code);
  if (!result.ok) return result;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return { ok: true, value: undefined };
}

async function approvedChangesLast24h(userId: string) {
  return db.ipChangeLog.count({ where: { userId, result: "approved", createdAt: { gte: hoursAgo(24) } } });
}

/** 새 IP로 바꾸기 위한 인증 코드 요청 (05: 하루 5회, 다른 계정이 쓰는 IP는 차단) */
export async function requestIpChange(user: { id: string; email: string }, ipHash: string): Promise<Result> {
  const current = await db.ipBinding.findUnique({ where: { userId: user.id } });
  const otherOwner = await db.ipBinding.findUnique({ where: { ipHash } });
  const decision = decideIpChange({
    approvedChangesLast24h: await approvedChangesLast24h(user.id),
    newIpBoundToOtherUser: otherOwner !== null && otherOwner.userId !== user.id,
  });

  if (decision === "in_use") {
    await db.ipChangeLog.create({
      data: { userId: user.id, oldIpHash: current?.ipHash, newIpHash: ipHash, result: "blocked_in_use" },
    });
    return { ok: false, error: IP_IN_USE_MESSAGE };
  }
  if (decision === "limit_exceeded") {
    return { ok: false, error: "오늘은 접속 위치를 더 바꿀 수 없습니다(하루 5회). 마지막으로 인증한 네트워크에서 이용해 주세요." };
  }

  const issued = await issueCode(user, "ip_change", ipHash);
  return issued.ok ? { ok: true, value: undefined } : issued;
}

export async function confirmIpChange(userId: string, code: string, ipHash: string): Promise<Result> {
  const result = await verifyCode(userId, "ip_change", code);
  const current = await db.ipBinding.findUnique({ where: { userId } });

  if (!result.ok) {
    await db.ipChangeLog.create({ data: { userId, oldIpHash: current?.ipHash, newIpHash: ipHash, result: "failed_verification" } });
    return result;
  }
  // 코드를 요청한 네트워크와 같은 곳에서 입력해야 함
  if (result.pendingIpHash !== ipHash) {
    return { ok: false, error: "인증 코드를 요청한 네트워크와 지금 접속한 네트워크가 다릅니다. 코드를 다시 받아 주세요." };
  }

  try {
    await db.$transaction([
      db.ipBinding.upsert({
        where: { userId },
        create: { userId, ipHash, verifiedAt: new Date() },
        update: { ipHash, verifiedAt: new Date() },
      }),
      db.ipChangeLog.create({ data: { userId, oldIpHash: current?.ipHash, newIpHash: ipHash, result: "approved" } }),
    ]);
  } catch (error) {
    // 코드를 확인하는 사이 다른 계정이 이 IP를 먼저 등록한 경우
    if (isUniqueViolation(error)) {
      await db.ipChangeLog.create({ data: { userId, oldIpHash: current?.ipHash, newIpHash: ipHash, result: "blocked_in_use" } });
      return { ok: false, error: IP_IN_USE_MESSAGE };
    }
    throw error;
  }
  return { ok: true, value: undefined };
}
