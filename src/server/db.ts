import "server-only";
import { PrismaClient } from "@prisma/client";

// 개발 중 핫 리로드로 연결이 계속 늘어나지 않도록 하나만 재사용
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
