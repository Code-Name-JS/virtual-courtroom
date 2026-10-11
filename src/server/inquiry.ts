// 03 L-03 문의하기 (M8). 회원이 남긴 문의에 운영자가 답하면 알림과 이메일(워커가 발송)로 전달합니다.
// 문의는 회원과 함께 지워지므로 사이트 폐쇄 때 파기됩니다.
import type { InquiryCategory, PrismaClient } from "@prisma/client";
import { hoursAgo } from "@/domain/account";
import { ANSWER_MAX_LENGTH, INQUIRIES_PER_DAY, INQUIRY_CATEGORY_LABELS, INQUIRY_MAX_LENGTH } from "@/domain/inquiry";

export type Result = { ok: true } | { ok: false; error: string };

export async function submitInquiry(
  db: PrismaClient,
  user: { id: string; role: string },
  input: { category: InquiryCategory; body: string },
  now = new Date(),
): Promise<Result> {
  if (user.role === "operator") return { ok: false, error: "운영자는 문의를 남길 수 없습니다." };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "문의 내용을 적어 주세요." };
  if (body.length > INQUIRY_MAX_LENGTH) return { ok: false, error: `문의는 ${INQUIRY_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  const today = await db.inquiry.count({ where: { userId: user.id, createdAt: { gte: hoursAgo(24, now) } } });
  if (today >= INQUIRIES_PER_DAY) return { ok: false, error: `문의는 하루 ${INQUIRIES_PER_DAY}번까지 남길 수 있습니다. 답변을 기다려 주세요.` };
  await db.inquiry.create({ data: { userId: user.id, category: input.category, body, createdAt: now } });
  return { ok: true };
}

export async function listMyInquiries(db: PrismaClient, userId: string) {
  return db.inquiry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
}

/** 관리자 화면: 답하지 않은 문의는 오래된 순, 답한 문의는 최근 순 */
export async function listInquiriesForOperator(db: PrismaClient) {
  const include = { user: { select: { id: true, nickname: true, email: true } }, answerer: { select: { nickname: true } } } as const;
  const [open, answered] = await Promise.all([
    db.inquiry.findMany({ where: { status: "open" }, include, orderBy: { createdAt: "asc" } }),
    db.inquiry.findMany({ where: { status: "answered" }, include, orderBy: { answeredAt: "desc" }, take: 20 }),
  ]);
  return { open, answered };
}

export async function countOpenInquiries(db: PrismaClient): Promise<number> {
  return db.inquiry.count({ where: { status: "open" } });
}

/** 운영자의 답변. 한 번 답한 문의에는 다시 답하지 않습니다 (추가 질문은 새 문의로). */
export async function answerInquiry(db: PrismaClient, operatorId: string, inquiryId: string, answer: string, now = new Date()): Promise<Result> {
  const text = answer.trim();
  if (!text) return { ok: false, error: "답변을 적어 주세요." };
  if (text.length > ANSWER_MAX_LENGTH) return { ok: false, error: `답변은 ${ANSWER_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  const inquiry = await db.inquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry || inquiry.status !== "open") return { ok: false, error: "답할 수 있는 문의가 아닙니다." };

  await db.$transaction(async (tx) => {
    // 동시에 두 번 답하지 않도록 상태를 조건으로 갱신
    const updated = await tx.inquiry.updateMany({
      where: { id: inquiryId, status: "open" },
      data: { status: "answered", answer: text, answeredBy: operatorId, answeredAt: now },
    });
    if (updated.count === 0) return;
    await tx.notification.create({
      data: {
        userId: inquiry.userId,
        type: "inquiry_answered",
        payload: { message: `「${INQUIRY_CATEGORY_LABELS[inquiry.category]}」 문의에 운영자가 답했습니다.\n\n${text}` },
        link: "/contact",
        sendEmail: true,
        createdAt: now,
      },
    });
  });
  return { ok: true };
}
