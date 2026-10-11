import "server-only";
import { type BadgeFacts, earnedBadges } from "@/domain/badge";
import { persuasion } from "@/domain/trial";
import { db } from "./db";

/** 03 U-06 배지: 참여 기록에서 받은 배지를 계산합니다 (M8). */
export async function getEarnedBadges(userId: string) {
  const [vote, participations, judgments] = await Promise.all([
    db.indictmentVote.findUnique({ where: { userId }, select: { id: true } }),
    db.participation.findMany({
      where: { userId },
      select: {
        round: true,
        side: true,
        status: true,
        signedAt: true,
        verdictReceipt: { select: { participationId: true } },
        advocateAsSelected: { select: { id: true }, take: 1 },
        reviews: { select: { id: true }, take: 1 },
        // 운영자가 숨긴 글은 빼고, 작성자가 지운 글은 올린 것으로 셈
        posts: { where: { OR: [{ isHidden: false }, { hiddenReason: "작성자가 삭제" }] }, select: { id: true }, take: 1 },
      },
    }),
    db.judgment.findMany({ select: { round: true, baselineIndictRatio: true, verdictGuilty: true, verdictNotGuilty: true } }),
  ]);
  const persuaded = new Map(judgments.map((j) => [j.round, persuasion(j.baselineIndictRatio, j.verdictGuilty, j.verdictNotGuilty).persuadedSide]));

  const facts: BadgeFacts = {
    indictmentVoted: vote !== null,
    rounds: participations.map((p) => ({
      round: p.round,
      side: p.side,
      status: p.status,
      signed: p.signedAt !== null,
      wrotePost: p.posts.length > 0,
      advocate: p.advocateAsSelected.length > 0,
      verdictCast: p.verdictReceipt !== null,
      reviewed: p.reviews.length > 0,
      persuadedSide: persuaded.get(p.round) ?? null,
    })),
  };
  return earnedBadges(facts);
}
