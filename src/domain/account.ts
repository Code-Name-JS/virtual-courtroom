import { z } from "zod";

// 05. 정책 · 리스크 > IP · 계정 정책
export const SIGNUP_ATTEMPTS_PER_IP_PER_DAY = 3;
export const LOGIN_ATTEMPTS_PER_IP_PER_HOUR = 20;
export const IP_CHANGES_PER_DAY = 5;
export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_COOLDOWN_SECONDS = 60;
// 이메일 인증을 마치지 않은 계정이 IP·이메일·닉네임을 계속 차지하지 않도록 정리하는 기준
export const UNVERIFIED_ACCOUNT_TTL_HOURS = 24;
export const SESSION_TTL_DAYS = 30;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "올바른 이메일 주소를 입력해 주세요." }).max(254)),
  password: z
    .string()
    .min(8, { error: "비밀번호는 8자 이상이어야 합니다." })
    .max(128, { error: "비밀번호는 128자 이하로 입력해 주세요." }),
  nickname: z
    .string()
    .trim()
    .min(2, { error: "닉네임은 2자 이상이어야 합니다." })
    .max(16, { error: "닉네임은 16자 이하로 입력해 주세요." })
    .regex(/^[가-힣a-zA-Z0-9_]+$/, { error: "닉네임은 한글, 영문, 숫자, 밑줄(_)만 쓸 수 있습니다." }),
  // MVP는 테스트 기간이므로 만 14세 미만 가입을 막음 (06 결정 3)
  over14: z.literal("on", { error: "만 14세 이상만 가입할 수 있습니다." }),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, { error: "이메일을 입력해 주세요." }),
  password: z.string().min(1, { error: "비밀번호를 입력해 주세요." }),
});

export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "6자리 숫자 코드를 입력해 주세요." });

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
}

/** 이메일 인증을 오래 마치지 않은 계정인지 (IP·이메일·닉네임을 다시 쓸 수 있게 정리 대상) */
export function isStaleUnverified(user: { emailVerifiedAt: Date | null; createdAt: Date }, now: Date): boolean {
  return user.emailVerifiedAt === null && now.getTime() - user.createdAt.getTime() > UNVERIFIED_ACCOUNT_TTL_HOURS * HOUR_MS;
}

export type IpAccess = "ok" | "needs_verification";

/** 접속 IP가 등록 IP와 같은지 (01: IP 하나에 계정 하나, IP가 바뀌면 이메일 인증) */
export function checkIpAccess(boundIpHash: string | null, currentIpHash: string): IpAccess {
  return boundIpHash !== null && boundIpHash === currentIpHash ? "ok" : "needs_verification";
}

export type IpChangeDecision = "allowed" | "limit_exceeded" | "in_use";

/** 새 IP로 바꿀 수 있는지 (05: 하루 5회, 다른 계정이 쓰는 IP는 차단) */
export function decideIpChange(input: { approvedChangesLast24h: number; newIpBoundToOtherUser: boolean }): IpChangeDecision {
  if (input.newIpBoundToOtherUser) return "in_use";
  if (input.approvedChangesLast24h >= IP_CHANGES_PER_DAY) return "limit_exceeded";
  return "allowed";
}

export function daysFromNow(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

export function minutesFromNow(minutes: number, now = new Date()): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

export function hoursAgo(hours: number, now = new Date()): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}
