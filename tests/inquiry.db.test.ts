import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INQUIRIES_PER_DAY } from "@/domain/inquiry";
import { answerInquiry, countOpenInquiries, listInquiriesForOperator, listMyInquiries, submitInquiry } from "@/server/inquiry";

// 실제 DB가 필요한 통합 테스트입니다. TEST_DATABASE_URL을 지정했을 때만 실행됩니다. 이 DB의 데이터를 모두 지웁니다.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("문의하기 (DB 통합 테스트)", () => {
  const db = new PrismaClient({ datasourceUrl: url });

  beforeEach(async () => {
    await db.user.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function setup() {
    const member = await db.user.create({ data: { email: "m@t.local", passwordHash: "x", nickname: "회원", emailVerifiedAt: new Date() } });
    const operator = await db.user.create({ data: { email: "op@t.local", passwordHash: "x", nickname: "운영자", role: "operator" } });
    return { member, operator };
  }

  it("회원이 남긴 문의에 운영자가 답하면 답변이 알림과 이메일(예약)로 전달된다", async () => {
    const { member, operator } = await setup();
    expect((await submitInquiry(db, member, { category: "account", body: "  " })).ok).toBe(false);
    expect((await submitInquiry(db, member, { category: "account", body: "학교에서 접속이 막혀요" })).ok).toBe(true);
    expect(await countOpenInquiries(db)).toBe(1);

    const [inquiry] = (await listInquiriesForOperator(db)).open;
    expect((await answerInquiry(db, operator.id, inquiry.id, "")).ok).toBe(false);
    expect((await answerInquiry(db, operator.id, inquiry.id, "같은 네트워크에서는 한 사람만 참여할 수 있습니다.")).ok).toBe(true);
    // 한 문의에는 한 번만 답함
    expect((await answerInquiry(db, operator.id, inquiry.id, "다시 답변")).ok).toBe(false);

    const [mine] = await listMyInquiries(db, member.id);
    expect(mine).toMatchObject({ status: "answered", answer: "같은 네트워크에서는 한 사람만 참여할 수 있습니다.", answeredBy: operator.id });
    const notification = await db.notification.findFirstOrThrow({ where: { userId: member.id } });
    expect(notification).toMatchObject({ type: "inquiry_answered", sendEmail: true, link: "/contact" });
    expect((notification.payload as { message: string }).message).toContain("같은 네트워크에서는");
    expect(await countOpenInquiries(db)).toBe(0);
  });

  it(`문의는 하루 ${INQUIRIES_PER_DAY}번까지, 운영자는 문의를 남길 수 없다`, async () => {
    const { member, operator } = await setup();
    for (let i = 0; i < INQUIRIES_PER_DAY; i++) expect((await submitInquiry(db, member, { category: "other", body: `문의 ${i}` })).ok).toBe(true);
    expect((await submitInquiry(db, member, { category: "other", body: "하나 더" })).ok).toBe(false);
    // 하루가 지나면 다시 남길 수 있음
    expect((await submitInquiry(db, member, { category: "other", body: "다음 날" }, new Date(Date.now() + 25 * 60 * 60_000))).ok).toBe(true);
    expect((await submitInquiry(db, operator, { category: "other", body: "운영자" })).ok).toBe(false);
  });

  it("회원을 지우면(사이트 폐쇄 파기) 문의도 함께 지워진다", async () => {
    const { member } = await setup();
    await submitInquiry(db, member, { category: "privacy", body: "내 정보를 지워 주세요" });
    await db.user.delete({ where: { id: member.id } });
    expect(await db.inquiry.count()).toBe(0);
  });
});
