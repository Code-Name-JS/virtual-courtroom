// 06 단계 자동 전환 워커: 1분마다 마감이 지난 단계를 다음 단계로 넘기고, 알림 이메일을 보냅니다.
import { PrismaClient } from "@prisma/client";
import { createRecommenderFromEnv } from "../src/server/ai/recommender";
import { advanceDueStages } from "../src/server/lifecycle";
import { dispatchEmails } from "../src/server/outbox";

const INTERVAL_MS = 60_000;
const db = new PrismaClient();
// 최종 변론인 AI 추천용. 설정이 없으면 null이고, 이때는 "AI 추천 없음"으로 기록됩니다
const recommender = createRecommenderFromEnv();

async function tick() {
  try {
    const log = await advanceDueStages(db, new Date(), { recommender });
    for (const line of log) console.info(`[worker] ${new Date().toISOString()} ${line}`);
    const sent = await dispatchEmails(db);
    if (sent > 0) console.info(`[worker] 알림 이메일 ${sent}통을 보냈습니다.`);
  } catch (error) {
    console.error("[worker] 단계 전환 중 오류", error);
  }
}

console.info(`[worker] 단계 자동 전환 워커를 시작합니다. AI 추천: ${recommender ? `${recommender.provider} · ${recommender.model}` : "설정되지 않음"}`);
void tick();
const timer = setInterval(tick, INTERVAL_MS);

async function shutdown() {
  clearInterval(timer);
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
