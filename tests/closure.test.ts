import { describe, expect, it } from "vitest";
import { canExecuteClosure, caseHasEnded, checkClosureSchedule, draftClosureSummary } from "@/domain/closure";

const now = new Date("2026-10-10T12:00:00Z");

describe("사이트 폐쇄 규칙", () => {
  it("사건이 폐기되거나 확정된 뒤에만 폐쇄할 수 있다", () => {
    expect(caseHasEnded("DISMISSED")).toBe(true);
    expect(caseHasEnded("FINALIZED")).toBe(true);
    expect(caseHasEnded("DELIBERATION")).toBe(false);
  });

  it("폐쇄 일시는 실제 운영에서 하루 뒤, 시연 모드에서 1분 뒤부터", () => {
    expect(checkClosureSchedule(new Date("2026-10-11T11:00:00Z"), now, false).ok).toBe(false);
    expect(checkClosureSchedule(new Date("2026-10-11T12:30:00Z"), now, false).ok).toBe(true);
    expect(checkClosureSchedule(new Date("2026-10-10T12:02:00Z"), now, true).ok).toBe(true);
    expect(checkClosureSchedule(new Date("invalid"), now, true).ok).toBe(false);
  });

  it("공지한 일시가 지나야 실행할 수 있다", () => {
    expect(canExecuteClosure("FINALIZED", null, now).ok).toBe(false);
    expect(canExecuteClosure("FINALIZED", new Date("2026-10-10T13:00:00Z"), now).ok).toBe(false);
    expect(canExecuteClosure("FINALIZED", new Date("2026-10-10T11:00:00Z"), now).ok).toBe(true);
    expect(canExecuteClosure("EVIDENCE", new Date("2026-10-10T11:00:00Z"), now).ok).toBe(false);
  });

  it("결과 요약 초안에는 판결과 숫자만 들어간다", () => {
    const text = draftClosureSummary({
      title: "표절 사건",
      status: "FINALIZED",
      judgment: { outcome: "guilty", sentenceType: "fine", sentenceDetail: "300만 원", baselineIndictRatio: 62, verdictGuilty: 48, verdictNotGuilty: 52 },
    });
    expect(text).toContain("유죄 (벌금 300만 원) 판결로 확정");
    expect(text).toContain("공소 제기는 62%");
    expect(text).toContain("유죄는 48%");
    expect(draftClosureSummary({ title: "표절 사건", status: "DISMISSED", judgment: null })).toContain("폐기");
  });
});
