import "server-only";
import { headers } from "next/headers";
import { hmac } from "./crypto";
import { env } from "./env";

/**
 * 실제 접속 IP. 앞단 프록시(Caddy)가 덮어쓰는 헤더(CLIENT_IP_HEADER)만 읽습니다.
 * 사용자가 직접 보내는 X-Forwarded-For는 속일 수 있으므로 쓰지 않습니다 (06 기술적으로 주의할 점).
 */
export async function getClientIp(): Promise<string | null> {
  const value = (await headers()).get(env.clientIpHeader)?.trim();
  if (value) return value;
  // 개발 중에는 프록시 없이 실행하므로 로컬 주소로 간주
  return env.isProduction ? null : "127.0.0.1";
}

export function hashIp(ip: string): string {
  return hmac(env.ipHashSecret, ip);
}

export class MissingClientIpError extends Error {
  constructor() {
    super("접속 IP를 확인할 수 없습니다. 운영자는 프록시의 CLIENT_IP_HEADER 설정을 확인해 주세요.");
  }
}

export async function requireClientIpHash(): Promise<string> {
  const ip = await getClientIp();
  if (!ip) throw new MissingClientIpError();
  return hashIp(ip);
}
