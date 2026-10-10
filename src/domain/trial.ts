import type { JudgmentOutcome, SentenceType, Side } from "@prisma/client";

// 01 최종 변론인 선정 3단계, 02 단계별 세부 규칙

/**
 * 최종 변론인 선정 단계는 앞 절반이 배심원 추천 투표, 뒤 절반이 운영자 선정 기간입니다.
 * 추천 투표가 마감되면 AI가 진영별 추천을 내고, 운영자는 단계 마감 전에 단 한 번 선정합니다.
 */
export function nominationDeadline(startsAt: Date, endsAt: Date): Date {
  return new Date(startsAt.getTime() + Math.floor((endsAt.getTime() - startsAt.getTime()) / 2));
}

export function isNominationOpen(now: Date, startsAt: Date, endsAt: Date): boolean {
  return now < nominationDeadline(startsAt, endsAt);
}

type NominationLike = { candidateParticipationId: string; createdAt: Date };

/** 후보별 추천 수 */
export function tallyNominations(nominations: NominationLike[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const n of nominations) tally.set(n.candidateParticipationId, (tally.get(n.candidateParticipationId) ?? 0) + 1);
  return tally;
}

/**
 * AI 추천도 운영자 선정도 없을 때의 기본값 (02): 추천 표를 가장 많이 받은 후보.
 * 표가 같으면 먼저 추천을 받은 후보로 정합니다.
 */
export function pickByVotes(nominations: NominationLike[]): string | null {
  if (nominations.length === 0) return null;
  const tally = tallyNominations(nominations);
  const firstSeen = new Map<string, number>();
  for (const n of nominations) {
    const t = n.createdAt.getTime();
    if (!firstSeen.has(n.candidateParticipationId) || t < firstSeen.get(n.candidateParticipationId)!) firstSeen.set(n.candidateParticipationId, t);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || firstSeen.get(a[0])! - firstSeen.get(b[0])!)[0][0];
}

/** 추천이 한 건도 없는 진영은 가장 먼저 서명한 배심원을 기본 후보로 씁니다. */
export function pickEarliestSigned<T extends { id: string; signedAt: Date | null }>(jurors: T[]): string | null {
  const signed = jurors.filter((j) => j.signedAt).sort((a, b) => a.signedAt!.getTime() - b.signedAt!.getTime());
  return signed[0]?.id ?? null;
}

export type Persuasion = {
  baselineIndictRatio: number;
  guiltyRatio: number;
  deltaPoints: number;
  persuadedSide: Side | null;
};

/**
 * 설득 지표 (02 투표 공개 원칙): 처음 공소 투표의 공소 제기 비율과 비공개 평결의 유죄 비율을 비교합니다.
 * 유죄 비율이 낮아졌으면 불기소 측이, 높아졌으면 공소 제기 측이 그만큼 배심원을 설득한 것입니다.
 */
export function persuasion(baselineIndictRatio: number, guilty: number, notGuilty: number): Persuasion {
  const total = guilty + notGuilty;
  const guiltyRatio = total === 0 ? 0 : Math.round((guilty / total) * 1000) / 10;
  const deltaPoints = Math.round((guiltyRatio - baselineIndictRatio) * 10) / 10;
  return {
    baselineIndictRatio,
    guiltyRatio,
    deltaPoints,
    persuadedSide: total === 0 || deltaPoints === 0 ? null : deltaPoints > 0 ? "indict" : "dismiss",
  };
}

export const OUTCOME_LABELS: Record<JudgmentOutcome, string> = { guilty: "유죄", not_guilty: "무죄" };
export const SENTENCE_LABELS: Record<SentenceType, string> = { prison: "징역", probation: "집행유예", fine: "벌금" };

export type JudgmentInput = {
  outcome: JudgmentOutcome;
  sentenceType: SentenceType | null;
  sentenceDetail: string;
  reasoning: string;
};

export type JudgmentCheck = { ok: true } | { ok: false; error: string };

/** 판결은 무죄 또는 유죄(징역·집행유예·벌금)로 선고하고, 선고 이유를 함께 제공합니다 (01). */
export function checkJudgment(input: JudgmentInput): JudgmentCheck {
  if (!input.reasoning.trim()) return { ok: false, error: "선고 이유를 적어 주세요." };
  if (input.outcome === "guilty") {
    if (!input.sentenceType) return { ok: false, error: "유죄라면 형의 종류(징역·집행유예·벌금)를 골라 주세요." };
    if (!input.sentenceDetail.trim()) return { ok: false, error: "형량(기간 또는 금액)을 적어 주세요." };
  } else if (input.sentenceType) {
    return { ok: false, error: "무죄에는 형을 정할 수 없습니다." };
  }
  return { ok: true };
}
