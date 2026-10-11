import { describe, expect, it } from "vitest";
import {
  BURST_PAGE_VIEWS,
  type IpUse,
  type ViewRecord,
  analyzeViews,
  compareCopy,
  findSharedIps,
  markCopied,
  shingles,
} from "@/domain/leak";

const source =
  "피고인은 사건 당일 밤 열한 시경 편의점 앞 CCTV에 찍혔다고 합니다. 그런데 그 영상의 시각 표시가 실제보다 이십 분 빠르게 맞춰져 있었다는 점을 생각하면, " +
  "피고인이 현장에 있었다는 주장은 성립하기 어렵습니다. 알리바이 증인의 진술과도 정확히 맞아떨어집니다.";

describe("복사 글 탐지", () => {
  it("상대 측 글의 문장을 옮겨 적은 글을 찾는다 (띄어쓰기·문장 부호를 바꿔도)", () => {
    const copied =
      "상대 측에서 이런 주장을 준비한다고 합니다. 그 영상의 시각표시가 실제보다 이십분 빠르게 맞춰져 있었다는 점을 생각하면 피고인이 현장에 있었다는 주장은 성립하기 어렵다고요!! 반박을 준비해야 합니다.";
    const result = compareCopy(copied, source);
    expect(result.flagged).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("같은 사실을 두고 각자 쓴 글은 복사 글로 보지 않는다", () => {
    const independent =
      "CCTV 영상은 피고인이 편의점 앞에 있었다는 결정적인 증거입니다. 시각이 조금 다르더라도 인상착의가 일치하고, 피고인 스스로도 그 시간에 근처에 있었다고 인정했습니다.";
    expect(compareCopy(independent, source).flagged).toBe(false);
  });

  it("양측이 함께 볼 수 있는 사건 본문을 똑같이 인용한 것은 유출이 아니다", () => {
    const caseBody = "피고인은 사건 당일 밤 열한 시경 편의점 앞 CCTV에 찍혔다. 편의점 직원은 피고인이 담배를 샀다고 진술했다.";
    const a = "사건 본문에 따르면 피고인은 사건 당일 밤 열한 시경 편의점 앞 CCTV에 찍혔다. 편의점 직원은 피고인이 담배를 샀다고 진술했다. 그러니 현장 근처에 있었습니다.";
    const b = "피고인은 사건 당일 밤 열한 시경 편의점 앞 CCTV에 찍혔다. 편의점 직원은 피고인이 담배를 샀다고 진술했다. 하지만 담배를 산 것은 범행과 무관합니다.";
    expect(compareCopy(a, b).flagged).toBe(true);
    expect(compareCopy(a, b, shingles(caseBody)).flagged).toBe(false);
  });

  it("너무 짧게 겹치는 것은 탐지하지 않는다", () => {
    expect(compareCopy("알리바이 증인의 진술과도 정확히", source).flagged).toBe(false);
  });

  it("긴 글 속에 상대 측 문단을 통째로 옮긴 경우도 찾는다", () => {
    const mine =
      "저는 처음부터 이 사건의 쟁점이 피고인의 동선에 있다고 보았습니다. 목격자 두 명의 진술이 서로 엇갈리고, 경찰이 확보한 통화 기록에도 빈 시간이 있습니다. " +
      "특히 피해자의 집 근처 골목은 가로등이 고장 나 있어서 얼굴을 알아보기 어려웠을 것입니다. 이런 사정을 모두 모아 보면 공소 사실을 그대로 믿기는 어렵다고 " +
      "생각합니다. 게다가 수사 초기에 압수한 휴대전화의 위치 기록은 법정에 제출되지 않았고, 담당 형사는 그 이유를 설명하지 못했습니다. 아래는 다른 분께 들은 이야기입니다. ";
    const theirs =
      "우리 측 논리를 정리하면 다음과 같습니다. 첫째, 범행 도구에서 피고인의 지문이 나오지 않았습니다. 둘째, 피고인은 그날 저녁 회사 동료와 식사를 했다는 영수증이 " +
      "있습니다. 셋째, 피해자와 돈 문제로 다퉜다는 주장은 소문에 기댄 것입니다. 넷째, 검찰이 내세운 동기는 추측일 뿐이고 직접 증거가 하나도 없습니다. " +
      "다섯째, 피고인의 가족과 이웃은 그가 평소 온순한 사람이었다고 입을 모읍니다. 마지막으로 재판부가 의심스러울 때는 피고인의 이익으로 판단해야 한다는 원칙을 기억해 주세요.";
    const result = compareCopy(`${mine}${source}`, `${source}${theirs}`);
    expect(result.score).toBeLessThan(40);
    expect(result.flagged).toBe(true);
  });

  it("운영자 화면에 겹친 부분만 표시하고, 나머지 글은 그대로 둔다", () => {
    const text = "제 생각은 다릅니다 😀 그 영상의 시각 표시가 실제보다 이십 분 빠르게 맞춰져 있었다는 점! 끝.";
    const segments = markCopied(text, source);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    const copied = segments.filter((s) => s.copied).map((s) => s.text).join("");
    expect(copied).toContain("영상의 시각 표시가 실제보다 이십 분 빠르게 맞춰져 있었다는 점");
    expect(copied).not.toContain("제 생각은");
  });
});

describe("비정상 열람 탐지", () => {
  const start = new Date("2026-10-01T12:00:00Z").getTime();
  const pages = (count: number, gapMs: number, postsPerPage = 1): ViewRecord[] =>
    Array.from({ length: count }, (_, i) =>
      Array.from({ length: postsPerPage }, (_, p) => ({ watermarkCode: `C${i}`, postId: `post-${i}-${p}`, viewedAt: new Date(start + i * gapMs) })),
    ).flat();

  it("보통 속도로 읽는 사람은 탐지하지 않는다", () => {
    expect(analyzeViews(pages(15, 30_000)).reasons).toEqual([]);
  });

  it("게시판 화면은 스레드 첫 글을 한꺼번에 기록하지만, 화면 한 번으로 센다", () => {
    const result = analyzeViews(pages(3, 20_000, 80));
    expect(result.pageViews).toBe(3);
    expect(result.distinctPosts).toBe(240);
    expect(result.reasons).toEqual([]);
  });

  it("10분 안에 화면을 60번 넘게 열면 대량 열람으로 본다", () => {
    const result = analyzeViews(pages(BURST_PAGE_VIEWS, 9_000));
    expect(result.reasons).toEqual(["burst"]);
  });

  it("1초 간격으로 기계처럼 화면을 열면 자동화 도구로 본다", () => {
    const result = analyzeViews(pages(25, 1_000));
    expect(result.reasons).toEqual(["automation"]);
    expect(result.medianIntervalMs).toBe(1_000);
  });
});

describe("다중 계정 의심", () => {
  const t = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes));
  const use = (userId: string, ipHash: string, minutes: number, kind: IpUse["kind"] = "registered"): IpUse => ({ userId, ipHash, at: t(minutes), kind });

  it("한 IP를 한 계정만 쓰면 표시하지 않는다", () => {
    expect(findSharedIps([use("a", "ip1", 0), use("a", "ip2", 10), use("b", "ip3", 5)])).toEqual([]);
  });

  it("두 계정이 한 IP를 번갈아 쓰면 '번갈아 사용'으로 먼저 보여 준다", () => {
    const groups = findSharedIps([
      use("c", "ip9", 0),
      use("d", "ip9", 50),
      use("a", "ip1", 0),
      use("a", "ip1", 10, "left"),
      use("b", "ip1", 20),
      use("b", "ip1", 30, "left"),
      use("a", "ip1", 40),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ ipHash: "ip1", alternating: true, switches: 2, userIds: ["a", "b"] });
    expect(groups[1]).toMatchObject({ ipHash: "ip9", alternating: false, switches: 1 });
  });

  it("다른 계정이 쓰는 IP로 바꾸려다 차단된 기록을 센다", () => {
    const [group] = findSharedIps([use("a", "ip1", 0), use("b", "ip1", 5, "blocked"), use("b", "ip1", 6, "blocked")]);
    expect(group.blocked).toBe(2);
  });
});
