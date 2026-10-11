import "server-only";
import { type IpUse, findSharedIps } from "@/domain/leak";
import { db } from "./db";

/**
 * 다중 계정 의심 (03 O-07, M7). 등록 IP와 IP 변경 기록에서 같은 IP를 두 계정 이상이 쓴 경우를 모읍니다.
 * IP 원문은 저장하지 않으므로(04) 해시끼리 비교합니다. 판단과 제재는 운영자가 합니다 (05).
 */
export async function findMultiAccountSuspicions() {
  const [bindings, logs] = await Promise.all([
    db.ipBinding.findMany({ select: { userId: true, ipHash: true, verifiedAt: true } }),
    db.ipChangeLog.findMany({ select: { userId: true, oldIpHash: true, newIpHash: true, result: true, createdAt: true } }),
  ]);

  const uses: IpUse[] = [];
  const seen = new Set<string>();
  const add = (use: IpUse) => {
    // 등록 IP는 IP 변경 기록(승인)과 같은 내용이 겹치므로 한 번만
    const key = `${use.userId}|${use.ipHash}|${use.kind}|${Math.floor(use.at.getTime() / 1000)}`;
    if (seen.has(key)) return;
    seen.add(key);
    uses.push(use);
  };
  for (const log of logs) {
    if (log.result === "approved") {
      add({ userId: log.userId, ipHash: log.newIpHash, at: log.createdAt, kind: "registered" });
      if (log.oldIpHash) add({ userId: log.userId, ipHash: log.oldIpHash, at: log.createdAt, kind: "left" });
    } else {
      add({ userId: log.userId, ipHash: log.newIpHash, at: log.createdAt, kind: log.result === "blocked_in_use" ? "blocked" : "failed" });
    }
  }
  for (const b of bindings) add({ userId: b.userId, ipHash: b.ipHash, at: b.verifiedAt, kind: "registered" });

  const groups = findSharedIps(uses);
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(groups.flatMap((g) => g.userIds))] } },
    select: { id: true, nickname: true },
  });
  return { groups, nicknames: new Map(users.map((u) => [u.id, u.nickname])) };
}

/** 회원 검색 (03 O-07). 닉네임이나 이메일 일부로 찾습니다. */
export async function searchMembers(query: string, round: number, take = 100) {
  const q = query.trim();
  return db.user.findMany({
    where: q ? { OR: [{ nickname: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      emailVerifiedAt: true,
      isUnder14: true,
      guardianConsentedAt: true,
      createdAt: true,
      participations: { where: { round }, select: { side: true, status: true } },
      _count: { select: { ipChangeLogs: true, sanctions: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
