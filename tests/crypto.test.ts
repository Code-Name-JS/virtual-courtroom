import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hmac, randomCode, safeEqual } from "@/server/crypto";

const SECRET = "test-secret-that-is-at-least-32-characters-long";

describe("암호화 도구", () => {
  it("IP 해시는 같은 IP면 같고, 비밀 키가 다르면 달라진다", () => {
    expect(hmac(SECRET, "203.0.113.7")).toBe(hmac(SECRET, "203.0.113.7"));
    expect(hmac(SECRET, "203.0.113.7")).not.toBe(hmac(SECRET, "203.0.113.8"));
    expect(hmac(SECRET, "203.0.113.7")).not.toBe(hmac(`${SECRET}-other`, "203.0.113.7"));
  });

  it("암호화한 값은 같은 키와 용도로만 되돌릴 수 있다", () => {
    const payload = encrypt(SECRET, "admin-totp", "JBSWY3DPEHPK3PXP");
    expect(decrypt(SECRET, "admin-totp", payload)).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decrypt(SECRET, "other-purpose", payload)).toThrow();
  });

  it("인증 코드는 항상 6자리 숫자다", () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });

  it("문자열 비교는 길이가 달라도 안전하게 false를 돌려준다", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
