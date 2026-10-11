import type { ParticipationStatus, Side } from "@prisma/client";

// 03 U-06 배지 (M8). 재판의 각 단계를 직접 해 보면 받는 배지입니다.
// 따로 저장하지 않고 참여 기록에서 그때그때 계산하므로, 사이트를 폐쇄해 참여 기록을 파기하면 배지도 함께 사라집니다.
// 평결 내용은 사람과 연결되지 않으므로(04) 무엇에 평결했는지는 배지에 쓰지 않고, 평결에 참여했는지만 씁니다.

export type BadgeId = "first_vote" | "signed" | "evidence" | "advocate" | "verdict" | "persuader" | "reviewer" | "appeal_juror";

/** description: 받은 뒤 보여 주는 설명, how: 받기 전에 보여 주는 받는 방법 */
export type Badge = { id: BadgeId; name: string; stage: string; description: string; how: string };

/** 재판 순서대로. 받지 못한 배지도 보여 주어 다음에 무엇을 하면 되는지 알 수 있게 함 */
export const BADGES: Badge[] = [
  { id: "first_vote", name: "첫 표", stage: "공소 투표", description: "공소 제기와 불기소 중 하나에 투표해 진영을 정했습니다.", how: "공소 투표 기간에 투표하면 받습니다." },
  { id: "signed", name: "배심원 선서", stage: "공판준비 서명", description: "허구 사건이며 법률 자문이 아님을 확인하는 서명을 마치고 재판에 참여했습니다.", how: "공소가 제기된 뒤 공판준비 서명을 하면 받습니다." },
  { id: "evidence", name: "증거 제출자", stage: "증거 제출", description: "진영 게시판에 생각과 증거를 담은 글을 올렸습니다.", how: "증거 제출 기간에 진영 게시판에 글을 올리면 받습니다." },
  { id: "advocate", name: "최종 변론인", stage: "최종 변론인 선정", description: "진영을 대표하는 최종 변론인으로 선정되었습니다.", how: "최종 변론인으로 선정되면 받습니다." },
  { id: "verdict", name: "평결 참여", stage: "배심원 평결", description: "모든 주장과 최종 변론을 듣고 비공개 평결에 참여했습니다.", how: "배심원 평결 기간에 평결하면 받습니다." },
  { id: "persuader", name: "설득한 진영", stage: "판결 선고", description: "내 진영이 공소 투표 때보다 더 많은 배심원을 설득했습니다 (설득 지표).", how: "판결의 설득 지표가 내 진영 쪽으로 움직이면 받습니다." },
  { id: "reviewer", name: "리뷰어", stage: "리뷰", description: "판결 뒤 재판을 돌아보는 리뷰를 남겼습니다.", how: "판결이 선고된 뒤 리뷰를 쓰면 받습니다." },
  { id: "appeal_juror", name: "항소심 배심원", stage: "2심", description: "2심(항소심)에 배심원으로 서명하고 참여했습니다.", how: "2심이 열렸을 때 참여해 서명하면 받습니다." },
];

export type RoundFacts = {
  round: number;
  side: Side;
  status: ParticipationStatus;
  signed: boolean;
  wrotePost: boolean;
  advocate: boolean;
  verdictCast: boolean;
  reviewed: boolean;
  /** 그 심급 판결의 설득 지표가 가리키는 진영. 판결 전이거나 변화가 없으면 null */
  persuadedSide: Side | null;
};

export type BadgeFacts = { indictmentVoted: boolean; rounds: RoundFacts[] };

/** 받은 배지 목록. 어느 심급에서든 한 번 받으면 받은 것으로 봅니다. */
export function earnedBadges(facts: BadgeFacts): Set<BadgeId> {
  const earned = new Set<BadgeId>();
  if (facts.indictmentVoted) earned.add("first_vote");
  for (const r of facts.rounds) {
    if (r.signed) earned.add("signed");
    if (r.wrotePost) earned.add("evidence");
    if (r.advocate) earned.add("advocate");
    if (r.verdictCast) earned.add("verdict");
    if (r.reviewed) earned.add("reviewer");
    // 제재로 사건에서 제외된 사람은 진영의 설득에 함께했다고 보지 않음
    if (r.signed && r.status !== "excluded" && r.persuadedSide === r.side) earned.add("persuader");
    if (r.round >= 2 && r.signed) earned.add("appeal_juror");
  }
  return earned;
}
