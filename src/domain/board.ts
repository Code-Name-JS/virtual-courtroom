import type { CaseStatus, ParticipationStatus, SanctionLevel, Side, Violation } from "@prisma/client";

// 02 진영 게시판 규칙, 03 접근 권한

/** 증거 제출이 끝나 양측 게시판이 공개된 뒤의 상태 */
const BOARDS_OPEN: CaseStatus[] = [
  "ADVOCATE_SELECTION",
  "FINAL_ARGUMENT",
  "DELIBERATION",
  "SENTENCING",
  "REVIEW",
  "APPEAL_DECISION",
  "APPEAL_RECRUITMENT",
  "FINALIZED",
];

/** 판결이 선고된 뒤의 상태. 사건에 참여하지 않은 로그인 사용자도 게시판을 읽을 수 있음 (03 결정 1) */
const JUDGMENT_PRONOUNCED: CaseStatus[] = ["REVIEW", "APPEAL_DECISION", "APPEAL_RECRUITMENT", "FINALIZED"];

export type Viewer = {
  loggedIn: boolean;
  isOperator: boolean;
  /** 이번 심급의 참여 정보. 참여하지 않았으면 null */
  participation: { side: Side; status: ParticipationStatus } | null;
  /** 쓰기 제한 제재를 받고 있는지 */
  writeBanned: boolean;
};

/** 서명을 마치고 재판에 참여 중인 배심원 (제외된 사람은 미참여 사용자와 같게 취급, 03) */
function isActiveJuror(viewer: Viewer): boolean {
  const status = viewer.participation?.status;
  return status === "signed" || status === "advocate";
}

export function boardsAreOpen(status: CaseStatus): boolean {
  return BOARDS_OPEN.includes(status);
}

/**
 * @param archived 지난 심급의 게시판인지. 2심이 열리면 1심 게시판은 읽기 전용으로 보관되고,
 *   1심 판결 선고 뒤이므로 로그인한 모든 회원이 읽을 수 있습니다 (02 2심 진행 방식).
 */
export function canReadBoard(status: CaseStatus, viewer: Viewer, boardSide: Side, archived = false): boolean {
  if (archived) return viewer.isOperator || viewer.loggedIn;
  // 2심 배심원 모집 중에는 2심 게시판이 아직 열리지 않음
  if (status === "APPEAL_RECRUITMENT") return false;
  if (status !== "EVIDENCE" && !boardsAreOpen(status)) return false;
  if (viewer.isOperator) return true;
  if (!viewer.loggedIn) return false;
  if (isActiveJuror(viewer)) {
    // 증거 제출 기간에는 자기 측 게시판만
    return status === "EVIDENCE" ? viewer.participation!.side === boardSide : true;
  }
  return JUDGMENT_PRONOUNCED.includes(status);
}

export type WriteCheck = { ok: true } | { ok: false; reason: string };

/** 게시판 쓰기는 증거 제출 기간에, 서명한 배심원이, 자기 측 게시판에만 (02) */
export function canWriteBoard(status: CaseStatus, viewer: Viewer, boardSide: Side): WriteCheck {
  if (status !== "EVIDENCE") return { ok: false, reason: "게시판에는 증거 제출 기간에만 글을 쓸 수 있습니다." };
  if (viewer.isOperator) return { ok: false, reason: "운영자는 진영 게시판에 글을 쓸 수 없습니다." };
  if (!isActiveJuror(viewer)) return { ok: false, reason: "공판준비 서명을 마친 배심원만 글을 쓸 수 있습니다." };
  if (viewer.participation!.side !== boardSide) return { ok: false, reason: "상대 측 게시판에는 글을 쓸 수 없습니다." };
  if (viewer.writeBanned) return { ok: false, reason: "쓰기 제한 제재를 받고 있어 글을 쓸 수 없습니다." };
  return { ok: true };
}

// 05 게시판 · 증거자료 정책
export const POST_MAX_LENGTH = 5000;
export const EVIDENCE_PER_POST = 4;

export type EvidenceInput = { type: "link" | "text"; value: string; source: string };

export type EvidenceCheck = { ok: true } | { ok: false; error: string };

export function checkEvidence(items: EvidenceInput[]): EvidenceCheck {
  if (items.length > EVIDENCE_PER_POST) return { ok: false, error: `증거자료는 글 하나에 ${EVIDENCE_PER_POST}개까지 붙일 수 있습니다.` };
  for (const item of items) {
    if (item.type === "link") {
      let url: URL;
      try {
        url = new URL(item.value);
      } catch {
        return { ok: false, error: "링크 주소가 올바르지 않습니다." };
      }
      if (url.protocol !== "https:") return { ok: false, error: "링크는 https 주소만 붙일 수 있습니다." };
    } else {
      if (!item.value.trim()) return { ok: false, error: "인용문 내용을 입력해 주세요." };
      if (!item.source.trim()) return { ok: false, error: "인용문에는 출처를 꼭 적어 주세요." };
    }
  }
  return { ok: true };
}

// 05 제재 정책 > 위반 유형별 제재
export const VIOLATION_LABELS: Record<Violation, string> = {
  leak: "유출 (자기 측 정보를 상대 측에 전달)",
  leak_post: "유출 정보 게시 (받은 정보를 상대 측 게시판에 올림)",
  mass_leak: "대량 유출",
  multi_account: "다중 계정 · IP 우회",
  abuse: "비방 · 혐오 · 개인정보 노출",
};

export const SANCTION_LABELS: Record<SanctionLevel, string> = {
  warning: "경고",
  write_ban: "게시판 쓰기 제한",
  excluded: "사건에서 제외",
};

const LEVELS: SanctionLevel[] = ["warning", "write_ban", "excluded"];

/**
 * 05 기준에 따른 제재 단계 추천. 운영자가 확인한 뒤 확정합니다.
 * - 대량 유출, 다중 계정: 첫 적발에 바로 사건에서 제외
 * - 유출: 증거가 명백하면 쓰기 제한, 정황뿐이면 경고. 다시 적발되면 제외
 * - 유출 정보 게시, 비방·혐오: 경고 → 쓰기 제한 → 제외
 * - 제재는 사람 단위로 누적되어, 유형이 달라도 두 번째부터 한 단계 무겁게
 */
export function suggestSanction(violation: Violation, priorSanctions: number, clearEvidence: boolean): SanctionLevel {
  if (violation === "mass_leak" || violation === "multi_account") return "excluded";
  if (violation === "leak") {
    if (priorSanctions > 0) return "excluded";
    return clearEvidence ? "write_ban" : "warning";
  }
  return LEVELS[Math.min(priorSanctions, LEVELS.length - 1)];
}

// 05 이의 신청
export const APPEAL_WINDOW_DAYS = 3;
export const APPEAL_RESPONSE_DAYS = 3;

export function canAppeal(issuedAt: Date, now: Date): boolean {
  return now.getTime() - issuedAt.getTime() <= APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
