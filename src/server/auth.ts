import "server-only";
import { notFound, redirect } from "next/navigation";
import { checkIpAccess } from "@/domain/account";
import { db } from "./db";
import { env } from "./env";
import { requireClientIpHash } from "./ip";
import { getSession } from "./session";

type RequireUserOptions = {
  /** 이메일 인증 화면처럼, 인증 전 계정도 들어와야 하는 곳 */
  allowUnverifiedEmail?: boolean;
  /** IP 변경 인증 화면처럼, 등록 IP와 달라도 들어와야 하는 곳 */
  allowIpMismatch?: boolean;
};

/**
 * 로그인한 회원만 통과시킵니다.
 * 이메일 인증을 마치지 않았으면 /verify-email, 등록 IP와 접속 IP가 다르면 /verify-ip로 보냅니다 (01, 05).
 */
export async function requireUser(options: RequireUserOptions = {}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { user } = session;

  if (!user.emailVerifiedAt && !options.allowUnverifiedEmail) redirect("/verify-email");

  const ipHash = await requireClientIpHash();
  let ipMatches = true;
  if (env.ipRuleEnabled && user.emailVerifiedAt) {
    const binding = await db.ipBinding.findUnique({ where: { userId: user.id } });
    ipMatches = checkIpAccess(binding?.ipHash ?? null, ipHash) === "ok";
    if (!ipMatches && !options.allowIpMismatch) redirect("/verify-ip");
  }

  return { session, user, ipHash, ipMatches };
}

type RequireOperatorOptions = {
  /** 2단계 인증을 아직 설정하지 않은 운영자가 설정 화면에 들어올 때 */
  allowTotpSetup?: boolean;
  /** 2단계 인증 코드 입력 화면 */
  allowTotpPending?: boolean;
};

/** 운영자만 통과시킵니다. 관리자 영역은 2단계 인증을 거쳐야 합니다 (05 IP · 계정 정책). */
export async function requireOperator(options: RequireOperatorOptions = {}) {
  const result = await requireUser();
  if (result.user.role !== "operator") notFound();
  if (!result.user.totpEnabledAt && !options.allowTotpSetup) redirect("/admin/2fa/setup");
  if (result.user.totpEnabledAt && !result.session.totpVerified && !options.allowTotpPending) redirect("/admin/2fa");
  return result;
}

/** 로그인 여부만 확인합니다 (헤더 표시용). 리다이렉트하지 않습니다. */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}
