import { describe, expect, it } from "vitest";
import {
  IP_CHANGES_PER_DAY,
  checkIpAccess,
  codeSchema,
  decideIpChange,
  isActiveMember,
  isStaleUnverified,
  signupSchema,
} from "@/domain/account";

const validSignup = { email: " Juror@Example.com ", password: "password123", nickname: "배심원_01", ageGroup: "over14" };

describe("회원가입 입력 규칙", () => {
  it("올바른 입력은 이메일을 소문자로 정리해 통과한다", () => {
    const result = signupSchema.safeParse(validSignup);
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("juror@example.com");
  });

  it("만 14세 이상인지 미만인지 골라야 한다", () => {
    const { ageGroup: _, ...withoutAge } = validSignup;
    expect(signupSchema.safeParse(withoutAge).success).toBe(false);
    expect(signupSchema.safeParse(validSignup).data?.guardian).toBeNull();
  });

  it("만 14세 미만은 법정대리인의 이름과 (가입 이메일과 다른) 이메일이 필요하다", () => {
    const under14 = { ...validSignup, ageGroup: "under14" };
    expect(signupSchema.safeParse(under14).success).toBe(false);
    expect(signupSchema.safeParse({ ...under14, guardianName: "김보호", guardianEmail: "juror@example.com" }).success).toBe(false);
    const ok = signupSchema.safeParse({ ...under14, guardianName: " 김보호 ", guardianEmail: "Parent@Example.com" });
    expect(ok.data?.guardian).toEqual({ name: "김보호", email: "parent@example.com" });
  });

  it("만 14세 미만은 법정대리인이 동의해야 계정이 활성화된다", () => {
    const verified = new Date();
    expect(isActiveMember({ emailVerifiedAt: verified, isUnder14: false, guardianConsentedAt: null })).toBe(true);
    expect(isActiveMember({ emailVerifiedAt: verified, isUnder14: true, guardianConsentedAt: null })).toBe(false);
    expect(isActiveMember({ emailVerifiedAt: verified, isUnder14: true, guardianConsentedAt: verified })).toBe(true);
    expect(isActiveMember({ emailVerifiedAt: null, isUnder14: false, guardianConsentedAt: null })).toBe(false);
  });

  it("닉네임은 한글·영문·숫자·밑줄 2~16자만 허용한다", () => {
    expect(signupSchema.safeParse({ ...validSignup, nickname: "a" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, nickname: "공백 닉네임" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...validSignup, nickname: "x".repeat(17) }).success).toBe(false);
  });

  it("비밀번호는 8자 이상이어야 한다", () => {
    expect(signupSchema.safeParse({ ...validSignup, password: "short" }).success).toBe(false);
  });

  it("인증 코드는 6자리 숫자만 허용한다", () => {
    expect(codeSchema.safeParse("012345").success).toBe(true);
    expect(codeSchema.safeParse("12345").success).toBe(false);
    expect(codeSchema.safeParse("12345a").success).toBe(false);
  });
});

describe("IP 하나에 계정 하나", () => {
  it("등록 IP와 접속 IP가 같을 때만 통과한다", () => {
    expect(checkIpAccess("hash-a", "hash-a")).toBe("ok");
    expect(checkIpAccess("hash-a", "hash-b")).toBe("needs_verification");
    expect(checkIpAccess(null, "hash-a")).toBe("needs_verification");
  });

  it("다른 계정이 쓰는 IP로는 바꿀 수 없다", () => {
    expect(decideIpChange({ approvedChangesLast24h: 0, newIpBoundToOtherUser: true })).toBe("in_use");
  });

  it(`IP 변경은 하루 ${IP_CHANGES_PER_DAY}회까지만 허용한다`, () => {
    expect(decideIpChange({ approvedChangesLast24h: IP_CHANGES_PER_DAY - 1, newIpBoundToOtherUser: false })).toBe("allowed");
    expect(decideIpChange({ approvedChangesLast24h: IP_CHANGES_PER_DAY, newIpBoundToOtherUser: false })).toBe("limit_exceeded");
  });
});

describe("이메일 인증을 마치지 않은 계정 정리", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("24시간이 지난 미인증 계정만 정리 대상이다", () => {
    expect(isStaleUnverified({ emailVerifiedAt: null, createdAt: new Date("2026-10-09T11:00:00Z") }, now)).toBe(true);
    expect(isStaleUnverified({ emailVerifiedAt: null, createdAt: new Date("2026-10-10T00:00:00Z") }, now)).toBe(false);
    expect(isStaleUnverified({ emailVerifiedAt: new Date(), createdAt: new Date("2026-01-01T00:00:00Z") }, now)).toBe(false);
  });
});
