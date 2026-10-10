// 이메일 발송. 웹 앱과 워커가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

/** SMTP가 설정되지 않았으면 개발용으로 서버 로그에 출력합니다. */
export async function sendMail(mail: Mail): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP가 설정되지 않아 이메일을 보낼 수 없습니다.");
    console.info(`\n[메일 미발송 · 개발용 출력]\n받는 사람: ${mail.to}\n제목: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: process.env.MAIL_FROM ?? "Virtual Courtroom <no-reply@example.com>", ...mail });
}
