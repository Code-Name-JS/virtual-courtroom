import { describe, expect, it } from "vitest";
import { type Viewer, canAppeal, canReadBoard, canWriteBoard, checkEvidence, suggestSanction } from "@/domain/board";

const juror = (side: "indict" | "dismiss", status: "voted" | "signed" | "excluded" | "advocate" = "signed"): Viewer => ({
  loggedIn: true,
  isOperator: false,
  participation: { side, status },
  writeBanned: false,
});
const outsider: Viewer = { loggedIn: true, isOperator: false, participation: null, writeBanned: false };
const guest: Viewer = { loggedIn: false, isOperator: false, participation: null, writeBanned: false };
const operator: Viewer = { loggedIn: true, isOperator: true, participation: null, writeBanned: false };

describe("진영 게시판 열람", () => {
  it("증거 제출 기간에는 자기 측 게시판만 읽을 수 있다", () => {
    expect(canReadBoard("EVIDENCE", juror("indict"), "indict")).toBe(true);
    expect(canReadBoard("EVIDENCE", juror("indict"), "dismiss")).toBe(false);
  });

  it("증거 제출 기간이 끝나면 양측 게시판이 모두 공개된다", () => {
    expect(canReadBoard("ADVOCATE_SELECTION", juror("indict"), "dismiss")).toBe(true);
    expect(canReadBoard("DELIBERATION", juror("dismiss"), "indict")).toBe(true);
  });

  it("서명하지 않았거나 제재로 제외된 배심원은 증거 제출 기간에 자기 측 게시판도 볼 수 없다", () => {
    expect(canReadBoard("EVIDENCE", juror("indict", "voted"), "indict")).toBe(false);
    expect(canReadBoard("EVIDENCE", juror("indict", "excluded"), "indict")).toBe(false);
  });

  it("사건에 참여하지 않은 사용자는 판결 선고 후에만, 비로그인은 언제나 읽을 수 없다", () => {
    expect(canReadBoard("DELIBERATION", outsider, "indict")).toBe(false);
    expect(canReadBoard("FINALIZED", outsider, "indict")).toBe(true);
    expect(canReadBoard("FINALIZED", guest, "indict")).toBe(false);
  });

  it("2심 모집 중에는 2심 게시판이 닫혀 있고, 보관된 1심 게시판은 로그인한 회원 누구나 읽는다", () => {
    expect(canReadBoard("APPEAL_RECRUITMENT", juror("indict"), "indict")).toBe(false);
    expect(canReadBoard("EVIDENCE", outsider, "dismiss", true)).toBe(true);
    expect(canReadBoard("EVIDENCE", juror("indict"), "dismiss", true)).toBe(true);
    expect(canReadBoard("EVIDENCE", guest, "indict", true)).toBe(false);
  });

  it("운영자는 증거 제출 기간에도 양측을 볼 수 있고, 게시판이 생기기 전에는 아무도 볼 수 없다", () => {
    expect(canReadBoard("EVIDENCE", operator, "dismiss")).toBe(true);
    expect(canReadBoard("PRETRIAL", operator, "indict")).toBe(false);
  });
});

describe("진영 게시판 쓰기", () => {
  it("증거 제출 기간에 서명한 배심원만 자기 측에 쓸 수 있다", () => {
    expect(canWriteBoard("EVIDENCE", juror("indict"), "indict").ok).toBe(true);
    expect(canWriteBoard("EVIDENCE", juror("indict"), "dismiss").ok).toBe(false);
    expect(canWriteBoard("EVIDENCE", juror("indict", "voted"), "indict").ok).toBe(false);
    expect(canWriteBoard("EVIDENCE", operator, "indict").ok).toBe(false);
  });

  it("증거 제출 기간이 끝나면 아무도 쓸 수 없다", () => {
    expect(canWriteBoard("ADVOCATE_SELECTION", juror("indict"), "indict").ok).toBe(false);
  });

  it("쓰기 제한 제재를 받으면 쓸 수 없다", () => {
    expect(canWriteBoard("EVIDENCE", { ...juror("indict"), writeBanned: true }, "indict").ok).toBe(false);
  });
});

describe("증거자료", () => {
  it("링크는 https만, 인용문은 출처가 있어야 한다", () => {
    expect(checkEvidence([{ type: "link", value: "https://www.law.go.kr", source: "" }]).ok).toBe(true);
    expect(checkEvidence([{ type: "link", value: "http://example.com", source: "" }]).ok).toBe(false);
    expect(checkEvidence([{ type: "link", value: "javascript:alert(1)", source: "" }]).ok).toBe(false);
    expect(checkEvidence([{ type: "text", value: "인용", source: "" }]).ok).toBe(false);
  });

  it("글 하나에 4개까지만 붙일 수 있다", () => {
    const five = Array.from({ length: 5 }, () => ({ type: "text" as const, value: "인용", source: "출처" }));
    expect(checkEvidence(five).ok).toBe(false);
  });
});

describe("제재 단계 추천 (05 제재 정책)", () => {
  it("대량 유출과 다중 계정은 첫 적발에 바로 제외", () => {
    expect(suggestSanction("mass_leak", 0, false)).toBe("excluded");
    expect(suggestSanction("multi_account", 0, false)).toBe("excluded");
  });

  it("유출은 증거가 명백하면 쓰기 제한, 정황뿐이면 경고, 다시 적발되면 제외", () => {
    expect(suggestSanction("leak", 0, true)).toBe("write_ban");
    expect(suggestSanction("leak", 0, false)).toBe("warning");
    expect(suggestSanction("leak", 1, false)).toBe("excluded");
  });

  it("유출 정보 게시와 비방은 경고 → 쓰기 제한 → 제외, 유형이 달라도 누적", () => {
    expect(suggestSanction("leak_post", 0, false)).toBe("warning");
    expect(suggestSanction("abuse", 1, false)).toBe("write_ban");
    expect(suggestSanction("leak_post", 2, false)).toBe("excluded");
  });

  it("이의 신청은 제재 후 3일 안에만", () => {
    const issued = new Date("2026-10-01T00:00:00Z");
    expect(canAppeal(issued, new Date("2026-10-03T23:00:00Z"))).toBe(true);
    expect(canAppeal(issued, new Date("2026-10-04T01:00:00Z"))).toBe(false);
  });
});
