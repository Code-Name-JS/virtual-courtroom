// 이메일로도 보내야 하는 알림(06 MVP 알림)을 워커가 모아서 보냅니다.
import type { PrismaClient } from "@prisma/client";
import { sendMail } from "./mailer";

const SUBJECTS: Record<string, string> = {
  pretrial_started: "[Virtual Courtroom] 공판준비절차 서명을 해 주세요",
  advocate_selected: "[Virtual Courtroom] 최종 변론인으로 선정되었습니다",
  deliberation_started: "[Virtual Courtroom] 배심원 평결을 해 주세요",
  closure_announced: "[Virtual Courtroom] 사이트 폐쇄 안내",
};

const BATCH_SIZE = 50;

export async function dispatchEmails(db: PrismaClient): Promise<number> {
  const pending = await db.notification.findMany({
    where: { sendEmail: true, emailedAt: null },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
  let sent = 0;
  for (const notification of pending) {
    const message = (notification.payload as { message?: string } | null)?.message ?? "";
    try {
      await sendMail({
        to: notification.user.email,
        subject: SUBJECTS[notification.type] ?? "[Virtual Courtroom] 알림",
        text: `${message}\n\n${siteUrl}${notification.link ?? "/case"}`,
      });
      await db.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
      sent += 1;
    } catch (error) {
      // 한 통이 실패해도 나머지는 계속 보내고, 실패한 것은 다음 실행 때 다시 시도
      console.error(`[outbox] ${notification.id} 이메일 발송 실패`, error);
    }
  }
  return sent;
}
