// 06 단계 자동 전환 워커: 1분마다 마감이 지난 단계를 다음 단계로 넘깁니다.
import { PrismaClient } from "@prisma/client";
import { advanceDueStages } from "../src/server/lifecycle";

const INTERVAL_MS = 60_000;
const db = new PrismaClient();

async function tick() {
  try {
    const log = await advanceDueStages(db);
    for (const line of log) console.info(`[worker] ${new Date().toISOString()} ${line}`);
  } catch (error) {
    console.error("[worker] 단계 전환 중 오류", error);
  }
}

console.info("[worker] 단계 자동 전환 워커를 시작합니다.");
void tick();
const timer = setInterval(tick, INTERVAL_MS);

async function shutdown() {
  clearInterval(timer);
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
