import type { CaseStatus, Side } from "@prisma/client";

const MINUTE = 1;
const DAY = 24 * 60 * MINUTE;

/** 02 상태별 정의의 한국어 이름 */
export const STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: "초안",
  INDICTMENT_VOTE: "공소 투표",
  DISMISSED: "폐기",
  INDICTMENT_PENDING: "공소 제기 대기",
  PRETRIAL: "공판준비",
  EVIDENCE: "증거 제출",
  ADVOCATE_SELECTION: "최종 변론인 선정",
  FINAL_ARGUMENT: "최종 변론",
  DELIBERATION: "배심원 평결",
  SENTENCING: "판결 작성",
  REVIEW: "리뷰",
  APPEAL_DECISION: "2심 결정",
  APPEAL_RECRUITMENT: "2심 배심원 모집",
  FINALIZED: "확정",
  SITE_CLOSED: "사이트 폐쇄",
};

export const SIDE_LABELS: Record<Side, string> = {
  indict: "공소 제기",
  dismiss: "불기소",
};

/**
 * MVP(1심 한 바퀴)에서 일정을 갖는 단계와 기본 기간 (02 상태별 정의, 06 MVP 범위).
 * - timed: 마감이 되면 시스템이 다음 단계로 넘김
 * - operator: 운영자가 처리해야 넘어감. 마감은 "운영자 조치 지연" 표시에만 씀 (05)
 */
export const MVP_STAGES = [
  { stage: "INDICTMENT_VOTE", kind: "timed", defaultMinutes: 7 * DAY },
  { stage: "INDICTMENT_PENDING", kind: "operator", defaultMinutes: 3 * DAY },
  { stage: "PRETRIAL", kind: "timed", defaultMinutes: 3 * DAY },
  { stage: "EVIDENCE", kind: "timed", defaultMinutes: 30 * DAY },
  { stage: "ADVOCATE_SELECTION", kind: "timed", defaultMinutes: 7 * DAY },
  { stage: "FINAL_ARGUMENT", kind: "timed", defaultMinutes: 3 * DAY },
  { stage: "DELIBERATION", kind: "timed", defaultMinutes: 3 * DAY },
  { stage: "SENTENCING", kind: "operator", defaultMinutes: 3 * DAY },
] as const satisfies ReadonlyArray<{ stage: CaseStatus; kind: "timed" | "operator"; defaultMinutes: number }>;

export type ScheduledStage = (typeof MVP_STAGES)[number]["stage"];

/** 사건 페이지의 단계 진행 막대에 보여 줄 순서 */
export const PROGRESS_STAGES: CaseStatus[] = [
  "INDICTMENT_VOTE",
  "PRETRIAL",
  "EVIDENCE",
  "ADVOCATE_SELECTION",
  "FINAL_ARGUMENT",
  "DELIBERATION",
  "SENTENCING",
  "FINALIZED",
];

export function progressIndex(status: CaseStatus): number {
  if (status === "INDICTMENT_PENDING") return PROGRESS_STAGES.indexOf("INDICTMENT_VOTE");
  if (status === "DISMISSED") return PROGRESS_STAGES.indexOf("INDICTMENT_VOTE");
  return PROGRESS_STAGES.indexOf(status);
}

// 01: 사건의 최소 참여 인원은 50명. 시연 모드에서만 더 적게 설정할 수 있음 (06 시연 모드)
export const MIN_PARTICIPANTS = 50;

export type DurationInput = Record<ScheduledStage, number>;

export function defaultDurations(): DurationInput {
  return Object.fromEntries(MVP_STAGES.map((s) => [s.stage, s.defaultMinutes])) as DurationInput;
}

export type CaseSettingsCheck = { ok: true } | { ok: false; error: string };

/** 게시 전 설정값 검사. 실제 운영에서는 하루 단위, 시연 모드에서는 분 단위까지 허용 */
export function checkCaseSettings(
  input: { minParticipants: number; maxParticipants: number | null; durations: DurationInput },
  demoMode: boolean,
): CaseSettingsCheck {
  const minAllowed = demoMode ? 1 : MIN_PARTICIPANTS;
  if (!Number.isInteger(input.minParticipants) || input.minParticipants < minAllowed) {
    return { ok: false, error: `최소 참여 인원은 ${minAllowed}명 이상이어야 합니다.` };
  }
  if (input.maxParticipants !== null && input.maxParticipants < input.minParticipants) {
    return { ok: false, error: "최대 참여 인원은 최소 참여 인원보다 적을 수 없습니다." };
  }
  const minMinutes = demoMode ? 1 : DAY;
  for (const { stage } of MVP_STAGES) {
    const minutes = input.durations[stage];
    if (!Number.isInteger(minutes) || minutes < minMinutes) {
      return { ok: false, error: `${STATUS_LABELS[stage]} 기간은 ${demoMode ? "1분" : "1일"} 이상이어야 합니다.` };
    }
  }
  return { ok: true };
}

export type IndictmentOutcome =
  | { result: "indicted"; indict: number; dismiss: number; total: number }
  | { result: "dismissed_by_vote"; indict: number; dismiss: number; total: number }
  | { result: "dismissed_for_quorum"; indict: number; dismiss: number; total: number };

/**
 * 공소 투표 결과 판정 (01, 02, 05)
 * - 참여자가 최소 인원에 못 미치면 연장 없이 바로 폐기
 * - 공소 제기가 더 많거나 같으면 공소 제기 (동점은 공소 제기)
 * - 불기소가 더 많으면 폐기
 */
export function resolveIndictmentVote(indict: number, dismiss: number, minParticipants: number): IndictmentOutcome {
  const total = indict + dismiss;
  if (total < minParticipants) return { result: "dismissed_for_quorum", indict, dismiss, total };
  if (indict >= dismiss) return { result: "indicted", indict, dismiss, total };
  return { result: "dismissed_by_vote", indict, dismiss, total };
}

export function ratio(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

/** 03 C-01 사건 페이지 맨 위의 "지금 할 일" */
export function todoFor(input: { status: CaseStatus; loggedIn: boolean; isOperator: boolean; hasVoted: boolean }): string {
  switch (input.status) {
    case "INDICTMENT_VOTE":
      if (input.isOperator) return "운영자는 투표할 수 없습니다. 투표 마감을 기다려 주세요.";
      if (!input.loggedIn) return "로그인하고 공소 투표에 참여하세요.";
      if (input.hasVoted) return "투표를 마쳤습니다. 마감 후 결과가 공개됩니다.";
      return "사건을 읽고 공소 제기 또는 불기소에 투표하세요.";
    case "INDICTMENT_PENDING":
      return input.isOperator ? "공소를 제기해 재판을 시작해 주세요." : "운영자의 공소 제기를 기다리고 있습니다.";
    case "DISMISSED":
      return "사건이 폐기되었습니다. 사건이 끝나 사이트는 곧 폐쇄됩니다.";
    default:
      return `${STATUS_LABELS[input.status]} 단계입니다.`;
  }
}

/** 05 게시 전 검수 체크리스트 */
export const REVIEW_CHECKLIST = [
  { key: "no_real_names", label: "등장인물, 회사, 단체, 지명이 실존하지 않는지 검색으로 확인했다" },
  { key: "no_real_case", label: "최근의 실제 사건과 핵심 줄거리가 비슷하지 않은지 확인했다" },
  { key: "law_accurate", label: "적용되는 죄명과 형량의 범위가 실제 법과 맞다" },
  { key: "both_sides", label: "양측 모두 다툴 여지가 있다" },
  { key: "ai_marked", label: "사건 페이지에 \"AI가 만든 사건\" 표시가 된다 (게시하면 자동 표시)" },
  { key: "original_and_edited", label: "AI 원본과 운영자 정리본을 모두 입력했다" },
  { key: "ai_recorded", label: "사건을 생성한 AI 모델과 생성 일시를 기록했다" },
] as const;

export type ChecklistKey = (typeof REVIEW_CHECKLIST)[number]["key"];

export function missingChecklistItems(checked: readonly string[]): string[] {
  return REVIEW_CHECKLIST.filter((item) => !checked.includes(item.key)).map((item) => item.label);
}
