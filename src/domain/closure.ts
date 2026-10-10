import type { CaseStatus, JudgmentOutcome, SentenceType } from "@prisma/client";
import { OUTCOME_LABELS, SENTENCE_LABELS } from "./trial";

// 01 한 사이트, 한 사건 / 02 폐기 · 확정 → 사이트 폐쇄 / 05 파기

/** 사건이 끝난 뒤(폐기 또는 확정)에만 폐쇄할 수 있습니다. */
export function caseHasEnded(status: CaseStatus): boolean {
  return status === "DISMISSED" || status === "FINALIZED";
}

/**
 * 폐쇄 일시는 회원들이 결과를 확인하고 알림 이메일을 받을 수 있도록 실제 운영에서는 최소 하루 뒤,
 * 시연 모드에서는 최소 1분 뒤로만 정할 수 있습니다.
 */
export function minimumClosureLeadMinutes(demoMode: boolean): number {
  return demoMode ? 1 : 24 * 60;
}

export type ClosureCheck = { ok: true } | { ok: false; error: string };

export function checkClosureSchedule(scheduledAt: Date, now: Date, demoMode: boolean): ClosureCheck {
  const lead = minimumClosureLeadMinutes(demoMode);
  if (Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "폐쇄 일시를 입력해 주세요." };
  if (scheduledAt.getTime() < now.getTime() + lead * 60 * 1000) {
    return { ok: false, error: `폐쇄 일시는 지금부터 ${demoMode ? "1분" : "하루"} 이후로 정해 주세요. 회원들이 결과를 확인하고 알림을 받을 시간이 필요합니다.` };
  }
  return { ok: true };
}

/** 공지한 폐쇄 일시가 지나야 폐쇄를 실행할 수 있습니다. */
export function canExecuteClosure(status: CaseStatus, scheduledAt: Date | null, now: Date): ClosureCheck {
  if (!caseHasEnded(status)) return { ok: false, error: "사건이 폐기되거나 확정된 뒤에만 폐쇄할 수 있습니다." };
  if (!scheduledAt) return { ok: false, error: "먼저 폐쇄 일시를 공지해 주세요." };
  if (now < scheduledAt) return { ok: false, error: "공지한 폐쇄 일시가 지난 뒤에 실행할 수 있습니다." };
  return { ok: true };
}

/**
 * 종료 안내 페이지에 남길 결과 요약의 초안. 닉네임이나 글 내용 같은 개인정보는 넣지 않습니다 (04).
 */
export function draftClosureSummary(input: {
  title: string;
  status: CaseStatus;
  judgment: { outcome: JudgmentOutcome; sentenceType: SentenceType | null; sentenceDetail: string | null; baselineIndictRatio: number; verdictGuilty: number; verdictNotGuilty: number } | null;
}): string {
  if (input.status === "DISMISSED" || !input.judgment) {
    return `「${input.title}」 사건은 공소 투표 결과 폐기되어 재판이 열리지 않았습니다. 참여해 주신 모든 분께 감사드립니다.`;
  }
  const j = input.judgment;
  const total = j.verdictGuilty + j.verdictNotGuilty;
  const guiltyRatio = total === 0 ? 0 : Math.round((j.verdictGuilty / total) * 1000) / 10;
  const sentence = j.outcome === "guilty" && j.sentenceType ? ` (${SENTENCE_LABELS[j.sentenceType]} ${j.sentenceDetail ?? ""})`.replace(" )", ")") : "";
  return [
    `「${input.title}」 사건은 ${OUTCOME_LABELS[j.outcome]}${sentence} 판결로 확정되었습니다.`,
    `공소 투표에서 공소 제기는 ${j.baselineIndictRatio}%였고, 비공개 평결에서 유죄는 ${guiltyRatio}%였습니다.`,
    "참여해 주신 모든 배심원께 감사드립니다.",
  ].join(" ");
}
