import type { DetectionType, Violation } from "@prisma/client";

// 05 자동 탐지 기준 (M7). 탐지는 운영자에게 근거를 보여 주는 데까지만 쓰고, 제재는 운영자가 확인한 뒤에만 합니다.

export const DETECTION_LABELS: Record<DetectionType, string> = {
  copy_similarity: "복사 글",
  abnormal_view: "비정상 열람",
  watermark_match: "워터마크 일치",
};

/** 탐지 종류별로 제재 화면에서 먼저 골라 둘 위반 유형 (05 위반 유형별 제재의 판단 근거) */
export const DETECTION_VIOLATION: Record<DetectionType, Violation> = {
  copy_similarity: "leak_post",
  abnormal_view: "mass_leak",
  watermark_match: "leak",
};

// ─── 복사 글 탐지 ────────────────────────────────────────

/** 글자 6개씩 묶어 비교 (띄어쓰기·문장 부호는 빼고). 한국어는 글자 하나에 담긴 정보가 많아 6글자면 두어 낱말 */
export const SHINGLE_SIZE = 6;
/** 이만큼 넘게 겹쳐야 탐지 (6글자 묶음 기준, 대략 30글자 넘게 같은 문장) */
export const COPY_MIN_SHARED = 25;
/** 짧은 쪽 글의 이 비율(%) 이상이 상대 글과 같으면 복사 글로 봄 */
export const COPY_THRESHOLD = 40;
/** 비율이 낮아도 이만큼 겹치면 탐지 (긴 글 속에 한 문단을 그대로 옮긴 경우, 대략 80글자) */
export const COPY_LONG_SHARED = 75;

/** index·end: 남긴 글자가 원래 글의 어디부터 어디까지(끝은 포함하지 않음)였는지 */
type Normalized = { chars: string[]; index: number[]; end: number[] };

/** 글자와 숫자만 남기고 소문자로 바꿉니다. 원래 글에서의 위치를 함께 기록해 겹친 부분을 표시할 때 씁니다. */
function normalize(text: string): Normalized {
  const chars: string[] = [];
  const index: number[] = [];
  const end: number[] = [];
  let i = 0;
  for (const ch of text) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      chars.push(ch.toLowerCase());
      index.push(i);
      end.push(i + ch.length);
    }
    i += ch.length;
  }
  return { chars, index, end };
}

function shingleList(norm: Normalized): string[] {
  const { chars } = norm;
  const list: string[] = [];
  for (let i = 0; i + SHINGLE_SIZE <= chars.length; i++) list.push(chars.slice(i, i + SHINGLE_SIZE).join(""));
  return list;
}

export function shingles(text: string): Set<string> {
  return new Set(shingleList(normalize(text)));
}

export type CopyResult = { score: number; shared: number; flagged: boolean };

/**
 * 두 글이 얼마나 겹치는지 비교합니다.
 * @param exclude 사건 본문처럼 양측이 함께 인용할 수 있는 문장의 묶음. 이 부분이 겹치는 것은 유출이 아님
 */
export function compareCopy(target: string, source: string, exclude: Set<string> = new Set()): CopyResult {
  const a = [...shingles(target)].filter((s) => !exclude.has(s));
  const b = new Set([...shingles(source)].filter((s) => !exclude.has(s)));
  const shared = a.filter((s) => b.has(s)).length;
  const smaller = Math.min(a.length, b.size);
  const score = smaller === 0 ? 0 : Math.round((shared / smaller) * 100);
  const flagged = shared >= COPY_MIN_SHARED && (score >= COPY_THRESHOLD || shared >= COPY_LONG_SHARED);
  return { score, shared, flagged };
}

export type Segment = { text: string; copied: boolean };

/** 운영자 화면용: 글을 상대 글과 겹치는 부분과 아닌 부분으로 나눕니다. */
export function markCopied(text: string, other: string, exclude: Set<string> = new Set()): Segment[] {
  const otherSet = shingles(other);
  const norm = normalize(text);
  const list = shingleList(norm);
  const copied = new Array<boolean>(text.length).fill(false);
  list.forEach((s, i) => {
    if (!otherSet.has(s) || exclude.has(s)) return;
    for (let k = norm.index[i]; k < norm.end[i + SHINGLE_SIZE - 1]; k++) copied[k] = true;
  });
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.copied === copied[i]) last.text += text[i];
    else segments.push({ text: text[i], copied: copied[i] });
  }
  return segments;
}

// ─── 비정상 열람 탐지 ────────────────────────────────────

/** 이 시간 안의 열람을 묶어서 판단 */
export const VIEW_WINDOW_MINUTES = 10;
/** 짧은 시간의 대량 열람: 10분에 게시판·스레드 화면을 60번 이상 (쉬지 않고 10초에 한 번) */
export const BURST_PAGE_VIEWS = 60;
/** 자동화 도구: 화면을 20번 넘게 열면서 열람 간격의 중간값이 2초보다 짧음 */
export const BOT_MIN_PAGE_VIEWS = 20;
export const BOT_MEDIAN_INTERVAL_MS = 2000;

export type ViewRecord = { watermarkCode: string; postId: string; viewedAt: Date };
export type ViewReason = "burst" | "automation";

export const VIEW_REASON_LABELS: Record<ViewReason, string> = {
  burst: `짧은 시간의 대량 열람 (${VIEW_WINDOW_MINUTES}분에 화면 ${BURST_PAGE_VIEWS}번 이상)`,
  automation: `자동화 도구 의심 (화면을 ${BOT_MIN_PAGE_VIEWS}번 넘게 열며 간격 중간값 ${BOT_MEDIAN_INTERVAL_MS / 1000}초 미만)`,
};

export type ViewAnalysis = {
  pageViews: number;
  distinctPosts: number;
  medianIntervalMs: number | null;
  firstAt: Date | null;
  lastAt: Date | null;
  reasons: ViewReason[];
};

/**
 * 한 회원의 열람 기록을 분석합니다. 화면을 열 때마다 워터마크 코드가 새로 만들어지므로(05) 코드 하나가 화면 열람 한 번입니다.
 * 게시판 화면은 스레드 첫 글을 한꺼번에 기록하므로, 글 수가 아니라 화면 열람 수와 간격으로 판단합니다 (04 view_log).
 */
export function analyzeViews(records: ViewRecord[]): ViewAnalysis {
  const pages = new Map<string, number>();
  const posts = new Set<string>();
  for (const r of records) {
    posts.add(r.postId);
    const t = r.viewedAt.getTime();
    const prev = pages.get(r.watermarkCode);
    if (prev === undefined || t < prev) pages.set(r.watermarkCode, t);
  }
  const times = [...pages.values()].sort((x, y) => x - y);
  const intervals = times.slice(1).map((t, i) => t - times[i]).sort((x, y) => x - y);
  const medianIntervalMs = intervals.length === 0 ? null : intervals[Math.floor(intervals.length / 2)];

  const reasons: ViewReason[] = [];
  if (times.length >= BURST_PAGE_VIEWS) reasons.push("burst");
  if (times.length > BOT_MIN_PAGE_VIEWS && medianIntervalMs !== null && medianIntervalMs < BOT_MEDIAN_INTERVAL_MS) reasons.push("automation");
  return {
    pageViews: times.length,
    distinctPosts: posts.size,
    medianIntervalMs,
    firstAt: times.length ? new Date(times[0]) : null,
    lastAt: times.length ? new Date(times[times.length - 1]) : null,
    reasons,
  };
}

// ─── 다중 계정 의심 (03 O-07) ────────────────────────────

/** 이 IP를 어떻게 썼는지: 가입·변경으로 등록, 바꾸기 전에 쓰던 IP, 다른 계정이 쓰는 IP라 차단, 인증 실패 */
export type IpUseKind = "registered" | "left" | "blocked" | "failed";

export const IP_USE_LABELS: Record<IpUseKind, string> = {
  registered: "이 IP를 등록",
  left: "이 IP에서 다른 IP로 바꿈",
  blocked: "다른 계정이 쓰는 IP라 차단됨",
  failed: "이 IP로 바꾸려다 인증 실패",
};

export type IpUse = { userId: string; ipHash: string; at: Date; kind: IpUseKind };

export type SharedIp = {
  ipHash: string;
  userIds: string[];
  uses: IpUse[];
  /** 이 IP를 쓴 계정이 바뀐 횟수. A → B → A처럼 번갈아 쓰면 2 이상 */
  switches: number;
  /** 한 계정이 다른 계정으로 넘어갔다가 다시 돌아온 적이 있는지 */
  alternating: boolean;
  blocked: number;
};

/**
 * 같은 IP를 두 계정 이상이 쓴 기록을 찾습니다. IP 하나에 계정 하나 규칙(01)에서 같은 네트워크는 한 사람만 쓰므로,
 * 여러 계정이 한 IP를 번갈아 쓰면 한 사람이 여러 계정을 쓰는 것일 수 있습니다.
 * 휴대폰 데이터처럼 통신사가 IP를 돌려 쓰는 경우도 있어, 판단은 운영자가 합니다 (05).
 */
export function findSharedIps(uses: IpUse[]): SharedIp[] {
  const byIp = new Map<string, IpUse[]>();
  for (const use of uses) {
    const list = byIp.get(use.ipHash) ?? [];
    list.push(use);
    byIp.set(use.ipHash, list);
  }
  const result: SharedIp[] = [];
  for (const [ipHash, list] of byIp) {
    const userIds = [...new Set(list.map((u) => u.userId))];
    if (userIds.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    let switches = 0;
    let alternating = false;
    const seen = new Set<string>([sorted[0].userId]);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].userId === sorted[i - 1].userId) continue;
      switches++;
      if (seen.has(sorted[i].userId)) alternating = true;
      seen.add(sorted[i].userId);
    }
    result.push({ ipHash, userIds, uses: sorted, switches, alternating, blocked: list.filter((u) => u.kind === "blocked").length });
  }
  // 번갈아 쓴 경우, 차단 기록이 있는 경우, 계정이 많은 경우 순으로 먼저 보여 줌
  return result.sort(
    (a, b) => Number(b.alternating) - Number(a.alternating) || b.blocked - a.blocked || b.userIds.length - a.userIds.length || b.switches - a.switches,
  );
}

/** 화면에 IP 해시 대신 보여 줄 짧은 이름. 운영자가 같은 IP끼리 맞춰 볼 수 있으면 충분함 */
export function ipLabel(ipHash: string): string {
  return `IP-${ipHash.slice(0, 6)}`;
}
