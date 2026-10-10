import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

type Mail = { to: string; subject: string; text: string };

/** SMTP가 설정되지 않았으면 개발용으로 서버 로그에 출력합니다. */
export async function sendMail(mail: Mail): Promise<void> {
  const smtp = env.smtp;
  if (!smtp) {
    if (env.isProduction) throw new Error("SMTP가 설정되지 않아 이메일을 보낼 수 없습니다.");
    console.info(`\n[메일 미발송 · 개발용 출력]\n받는 사람: ${mail.to}\n제목: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  await transporter.sendMail({ from: smtp.from, ...mail });
}
