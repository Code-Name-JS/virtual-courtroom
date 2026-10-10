import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeGuardianAndResend, expireGuardianConsents, findPendingConsent, respondToConsent, sendGuardianRequest } from "@/server/guardian";
import type { Mail } from "@/server/mailer";

// 보낸 메일을 모아 동의 링크의 토큰을 꺼냄
const { sent } = vi.hoisted(() => ({ sent: [] as Mail[] }));
vi.mock("@/server/mailer", () => ({
  sendMail: async (mail: Mail) => {
    sent.push(mail);
  },
}));

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다. 이 DB의 데이터를 모두 지웁니다.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("법정대리인 동의 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const days = (d: number) => new Date(Date.now() + d * 24 * 60 * 60_000);
  const tokenFrom = (mail: Mail) => mail.text.match(/\/guardian\/([\w-]+)/)![1];

  async function child(emailVerified = true) {
    return db.user.create({
      data: {
        email: "kid@t.local",
        passwordHash: "x",
        nickname: "어린배심원",
        isUnder14: true,
        emailVerifiedAt: emailVerified ? new Date() : null,
        guardianConsent: { create: { guardianName: "김보호", guardianEmail: "parent@t.local", tokenHash: "placeholder", expiresAt: days(7) } },
      },
    });
  }

  beforeEach(async () => {
    sent.length = 0;
    await db.$transaction([db.rateLimitEvent.deleteMany(), db.user.deleteMany()]);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("이메일 인증 전에는 보내지 않고, 인증 후 법정대리인에게 범죄를 다루는 가상 사건이라는 안내와 동의 링크를 보낸다", async () => {
    const unverified = await child(false);
    expect((await sendGuardianRequest(db, unverified.id)).ok).toBe(false);
    await db.user.update({ where: { id: unverified.id }, data: { emailVerifiedAt: new Date() } });

    expect((await sendGuardianRequest(db, unverified.id)).ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("parent@t.local");
    expect(sent[0].text).toContain("범죄를 다루는 가상 사건");
    expect(await findPendingConsent(db, tokenFrom(sent[0]))).toMatchObject({ nickname: "어린배심원", guardianName: "김보호" });
    expect(await findPendingConsent(db, "wrong-token")).toBeNull();
  });

  it("동의하면 계정이 활성화되고, 같은 링크로 다시 응답할 수 없다", async () => {
    const kid = await child();
    await sendGuardianRequest(db, kid.id);
    const token = tokenFrom(sent[0]);
    expect(await respondToConsent(db, token, true)).toMatchObject({ ok: true, agreed: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: kid.id } })).guardianConsentedAt).not.toBeNull();
    expect((await db.guardianConsent.findUniqueOrThrow({ where: { userId: kid.id } })).status).toBe("consented");
    expect((await respondToConsent(db, token, false)).ok).toBe(false);
    // 동의한 회원은 기한이 지나도 지워지지 않음
    expect(await expireGuardianConsents(db, days(30))).toBe(0);
  });

  it("거부하면 가입 신청 정보와 법정대리인 정보를 바로 삭제한다", async () => {
    const kid = await child();
    await sendGuardianRequest(db, kid.id);
    expect(await respondToConsent(db, tokenFrom(sent[0]), false)).toMatchObject({ ok: true, agreed: false });
    expect(await db.user.count()).toBe(0);
    expect(await db.guardianConsent.count()).toBe(0);
  });

  it("7일 안에 응답하지 않으면 삭제되고, 링크도 쓸 수 없다", async () => {
    const kid = await child();
    await sendGuardianRequest(db, kid.id);
    const token = tokenFrom(sent[0]);
    expect(await expireGuardianConsents(db, days(6))).toBe(0);
    expect(await findPendingConsent(db, token, days(8))).toBeNull();
    expect(await db.user.count()).toBe(0);
  });

  it("정보를 고쳐 다시 보내면 이전 링크는 쓸 수 없고, 하루 3번까지만 보낼 수 있다", async () => {
    const kid = await child();
    await sendGuardianRequest(db, kid.id);
    const oldToken = tokenFrom(sent[0]);
    expect((await changeGuardianAndResend(db, kid.id, { name: "이보호", email: "kid@t.local" })).ok).toBe(false);
    expect((await changeGuardianAndResend(db, kid.id, { name: "이보호", email: "parent2@t.local" })).ok).toBe(true);
    expect(sent[1].to).toBe("parent2@t.local");
    expect(await findPendingConsent(db, oldToken)).toBeNull();
    expect((await sendGuardianRequest(db, kid.id)).ok).toBe(true);
    expect((await sendGuardianRequest(db, kid.id)).ok).toBe(false);
  });
});
