import "server-only";
import { db } from "./db";

/** 기간 안의 시도 횟수를 세고, 한도 안이면 이번 시도를 기록합니다. */
export async function consumeRateLimit(key: string, limit: number, since: Date): Promise<boolean> {
  const count = await db.rateLimitEvent.count({ where: { key, createdAt: { gte: since } } });
  if (count >= limit) return false;
  await db.rateLimitEvent.create({ data: { key } });
  return true;
}
