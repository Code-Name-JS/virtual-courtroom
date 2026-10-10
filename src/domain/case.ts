import type { CaseStatus, ParticipationStatus, Side } from "@prisma/client";

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
 * 일정을 갖는 단계와 기본 기간 (02 상태별 정의). 운영자가 사건을 게시하기 전에 조정합니다.
 * - timed: 마감이 되면 시스템이 다음 단계로 넘김
 * - operator: 운영자가 처리해야 넘어감. 마감은 "운영자 조치 지연" 표시에만 씀 (05)
 * 2심은 2심 배심원 모집부터 리뷰까지 1심과 같은 기간으로 다시 진행합니다 (ROUND2_STAGES).
 */
export const CASE_STAGES = [
  { stage: "INDICTMENT_VOTE", kind: "timed", defaultMinutes: 7 * DAY, demoMinutes: 5 },
  { stage: "INDICTMENT_PENDING", kind: "operator", defaultMinutes: 3 * DAY, demoMinutes: 5 },
  { stage: "PRETRIAL", kind: "timed", defaultMinutes: 3 * DAY, demoMinutes: 3 },
  { stage: "EVIDENCE", kind: "timed", defaultMinutes: 30 * DAY, demoMinutes: 10 },
  { stage: "ADVOCATE_SELECTION", kind: "timed", defaultMinutes: 7 * DAY, demoMinutes: 5 },
  { stage: "FINAL_ARGUMENT", kind: "timed", defaultMinutes: 3 * DAY, demoMinutes: 5 },
  { stage: "DELIBERATION", kind: "timed", defaultMinutes: 3 * DAY, demoMinutes: 3 },
  { stage: "SENTENCING", kind: "operator", defaultMinutes: 3 * DAY, demoMinutes: 5 },
  { stage: "REVIEW", kind: "timed", defaultMinutes: 7 * DAY, demoMinutes: 5 },
  { stage: "APPEAL_DECISION", kind: "operator", defaultMinutes: 3 * DAY, demoMinutes: 5 },
  { stage: "APPEAL_RECRUITMENT", kind: "timed", defaultMinutes: 3 * DAY, demoMinutes: 6 },
] as const satisfies ReadonlyArray<{ stage: CaseStatus; kind: "timed" | "operator"; defaultMinutes: number; demoMinutes: number }>;

export type ScheduledStage = (typeof CASE_STAGES)[number]["stage"];

/** 2심에서 다시 진행하는 단계. 공소 투표와 공판준비는 반복하지 않습니다 (02) */
export const ROUND2_STAGES: ScheduledStage[] = [
  "APPEAL_RECRUITMENT",
  "EVIDENCE",
  "ADVOCATE_SELECTION",
  "FINAL_ARGUMENT",
  "DELIBERATION",
  "SENTENCING",
  "REVIEW",
];

export function stageKind(status: CaseStatus): "timed" | "operator" | null {
  return CASE_STAGES.find((s) => s.stage === status)?.kind ?? null;
}

/** 사건 페이지의 단계 진행 막대에 보여 줄 순서 */
export function progressStages(round: number): CaseStatus[] {
  const trial: CaseStatus[] = ["EVIDENCE", "ADVOCATE_SELECTION", "FINAL_ARGUMENT", "DELIBERATION", "SENTENCING", "REVIEW", "FINALIZED"];
  return round === 1 ? ["INDICTMENT_VOTE", "PRETRIAL", ...trial] : ["APPEAL_RECRUITMENT", ...trial];
}

export function progressIndex(status: CaseStatus, round: number): number {
  const stages = progressStages(round);
  if (status === "INDICTMENT_PENDING" || status === "DISMISSED") return stages.indexOf("INDICTMENT_VOTE");
  if (status === "APPEAL_DECISION") return stages.indexOf("REVIEW");
  return stages.indexOf(status);
}

/** 심급 이름 */
export function roundLabel(round: number): string {
  return `${round}심`;
}

// 01: 사건의 최소 참여 인원은 50명. 시연 모드에서만 더 적게 설정할 수 있음 (06 시연 모드)
export const MIN_PARTICIPANTS = 50;

export type DurationInput = Record<ScheduledStage, number>;

/** 기본 기간(분). 시연 모드에서는 흐름을 빠르게 확인할 수 있도록 몇 분 단위 */
export function defaultDurations(demoMode = false): DurationInput {
  return Object.fromEntries(CASE_STAGES.map((s) => [s.stage, demoMode ? s.demoMinutes : s.defaultMinutes])) as DurationInput;
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
  for (const { stage } of CASE_STAGES) {
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

export type AppealTodo = "choose" | "joined" | "declined" | "can_apply" | "applied" | "needs_signature" | "signed" | "rejected";

/** 03 C-01 사건 페이지 맨 위의 "지금 할 일" */
export function todoFor(input: {
  status: CaseStatus;
  loggedIn: boolean;
  isOperator: boolean;
  hasVoted: boolean;
  participationStatus?: ParticipationStatus | null;
  trial?: {
    nominationOpen: boolean;
    hasNominated: boolean;
    isAdvocate: boolean;
    hasArgued: boolean;
    hasVerdict: boolean;
    advocatesSelected: boolean;
  };
  round?: number;
  /** 리뷰 기간: 리뷰를 쓸 수 있는지, 이미 썼는지 */
  review?: "can_write" | "written" | null;
  /** 2심 배심원 모집: 이 사용자가 할 수 있는 일 */
  appeal?: AppealTodo | null;
}): string {
  const active = input.participationStatus === "signed" || input.participationStatus === "advocate";
  const trial = input.trial;
  const excluded = input.participationStatus === "excluded";
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
    case "PRETRIAL":
      if (input.isOperator) return "배심원들이 공판준비절차 서명을 하고 있습니다.";
      if (input.participationStatus === "voted") return "공판준비절차 서명을 해 주세요. 서명하지 않으면 재판 단계부터 제외됩니다.";
      if (input.participationStatus === "signed") return "서명을 마쳤습니다. 증거 제출이 시작되면 진영 게시판에 글을 쓸 수 있습니다.";
      return "공소 투표에 참여한 배심원들이 서명하고 있습니다.";
    case "EVIDENCE":
      if (input.isOperator) return "증거 제출 기간입니다. 신고가 들어오면 확인해 주세요.";
      if (excluded) return "재판 단계에서 제외되어 게시판에 참여할 수 없습니다.";
      if (input.participationStatus === "signed") return "내 진영 게시판에 생각과 증거자료를 담은 스레드를 써 주세요.";
      return "배심원들이 진영 게시판에 증거를 제출하고 있습니다.";
    case "ADVOCATE_SELECTION":
      if (trial?.nominationOpen) {
        if (active && !trial.hasNominated) return "같은 진영에서 최종 변론인으로 적합한 배심원을 이유와 함께 추천해 주세요.";
        return "양측 게시판이 공개되었습니다. 상대 측의 주장과 증거를 확인해 보세요.";
      }
      if (input.isOperator && !trial?.advocatesSelected) return "AI 추천과 배심원의 추천 이유를 참고해 진영별 최종 변론인을 선정해 주세요. 선정은 단 한 번만 할 수 있습니다.";
      return "운영자가 최종 변론인을 선정하고 있습니다.";
    case "FINAL_ARGUMENT":
      if (trial?.isAdvocate) return trial.hasArgued ? "최종 변론을 제출했습니다. 마감 전까지는 고칠 수 있습니다." : "최종 변론인으로서 마감 전에 최종 변론을 써 주세요.";
      return "양측 최종 변론인의 변론을 읽어 보세요. 공소 제기 측이 먼저, 불기소 측이 나중에 변론합니다.";
    case "DELIBERATION":
      if (active && !trial?.hasVerdict) return "모든 주장과 증거, 최종 변론을 보고 유죄 또는 무죄로 평결해 주세요.";
      if (trial?.hasVerdict) return "평결을 마쳤습니다. 판결을 기다려 주세요.";
      return "배심원들이 비공개로 평결하고 있습니다.";
    case "SENTENCING":
      return input.isOperator ? "평결을 참고해 판결을 작성하고 선고해 주세요." : "운영자가 판결을 작성하고 있습니다.";
    case "REVIEW": {
      const round = input.round ?? 1;
      if (input.isOperator) return round === 1 ? "배심원들이 리뷰를 쓰고 있습니다. 리뷰 기간이 끝나면 이의 신청이 있는지에 따라 확정 또는 2심 결정으로 넘어갑니다." : "배심원들이 2심 리뷰를 쓰고 있습니다. 리뷰 기간이 끝나면 판결이 확정됩니다.";
      if (input.review === "written") return "리뷰를 남겼습니다. 리뷰 기간이 끝나기 전까지는 고칠 수 있습니다.";
      if (input.review === "can_write") {
        return round === 1
          ? "판결이 선고되었습니다. 리뷰를 쓰고, 판결에 이의가 있으면 이의 신청을 함께 표시해 주세요."
          : "2심 판결이 선고되었습니다. 리뷰를 남겨 주세요. 2심 판결에는 항소할 수 없습니다.";
      }
      if (!input.loggedIn) return "판결이 선고되었습니다. 로그인하면 배심원들의 리뷰를 읽을 수 있습니다.";
      return round === 1
        ? "판결이 선고되었습니다. 배심원들의 리뷰에 댓글을 남길 수 있습니다. 1심 리뷰에 댓글을 단 회원은 2심이 열리면 참여를 신청할 수 있습니다."
        : "2심 판결이 선고되었습니다. 배심원들의 리뷰에 댓글을 남길 수 있습니다.";
    }
    case "APPEAL_DECISION":
      return input.isOperator
        ? "이의 신청이 담긴 리뷰를 확인하고 2심 개시 또는 기각을 결정해 주세요."
        : "이의 신청이 있어 운영자가 2심 개시 여부를 결정하고 있습니다. 결정 전까지 1심 리뷰에 댓글을 남길 수 있습니다.";
    case "APPEAL_RECRUITMENT":
      if (input.isOperator) return "2심 배심원을 모집하고 있습니다. 신청 마감 후 공개한 승인 기준이 자동으로 적용되고, 모집이 끝나면 2심 증거 제출이 시작됩니다.";
      switch (input.appeal) {
        case "choose":
          return "2심에 참여할지 선택해 주세요. 참여하면 1심 진영을 그대로 유지합니다.";
        case "joined":
          return "2심에 참여하기로 했습니다. 모집이 끝나면 2심 증거 제출이 시작됩니다.";
        case "declined":
          return "2심에 참여하지 않기로 했습니다.";
        case "can_apply":
          return "2심 추가 배심원으로 참여를 신청할 수 있습니다. 신청할 때 진영을 고릅니다.";
        case "applied":
          return "2심 참여를 신청했습니다. 신청 마감 후 승인 기준이 적용되고 결과가 공개됩니다.";
        case "needs_signature":
          return "2심 추가 배심원으로 승인되었습니다. 모집 마감 전에 공판준비절차 서명을 해 주세요. 서명하지 않으면 참여할 수 없습니다.";
        case "signed":
          return "서명을 마쳤습니다. 모집이 끝나면 2심 증거 제출이 시작됩니다.";
        case "rejected":
          return "이번 2심 추가 배심원으로 승인되지 않았습니다. 승인 결과는 사건 페이지에 공개되어 있습니다.";
        default:
          return "2심 배심원을 모집하고 있습니다. 모집이 끝나면 2심 증거 제출이 시작됩니다.";
      }
    case "FINALIZED":
      return "판결이 확정되었습니다. 판결과 설득 지표를 확인해 보세요.";
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
