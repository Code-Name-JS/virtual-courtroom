import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, hotp, totp, verifyTotp } from "@/server/totp";

// RFC 6238 부록 B의 SHA-1 테스트 값 (비밀 값 "12345678901234567890", 8자리)
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("RFC 6238 테스트 값과 일치한다", () => {
    expect(totp(RFC_SECRET, 59_000, 8)).toBe("94287082");
    expect(totp(RFC_SECRET, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totp(RFC_SECRET, 1_234_567_890_000, 8)).toBe("89005924");
    expect(totp(RFC_SECRET, 20_000_000_000_000, 8)).toBe("65353130");
  });

  it("RFC 4226 HOTP 테스트 값과 일치한다", () => {
    const secret = Buffer.from("12345678901234567890");
    expect(hotp(secret, 0)).toBe("755224");
    expect(hotp(secret, 9)).toBe("520489");
  });

  it("Base32 인코딩과 디코딩이 서로 되돌려진다", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("앞뒤 30초까지는 허용하고 그보다 어긋나면 거부한다", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, "abc123", now)).toBe(false);
  });
});
