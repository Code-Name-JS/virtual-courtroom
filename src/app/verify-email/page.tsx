import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { CODE_TTL_MINUTES } from "@/domain/account";
import { requireUser } from "@/server/auth";
import { ConfirmEmailForm, ResendEmailCodeForm } from "./forms";

export const metadata = { title: "이메일 인증 · Virtual Courtroom" };

export default async function VerifyEmailPage() {
  const { user } = await requireUser({ allowUnverifiedEmail: true });
  if (user.emailVerifiedAt) redirect("/me");

  return (
    <AuthCard
      title="이메일 인증"
      description={
        <>
          <strong>{user.email}</strong>로 보낸 6자리 인증 코드를 입력해 주세요. 코드는 {CODE_TTL_MINUTES}분 동안 유효합니다.
        </>
      }
    >
      <ConfirmEmailForm />
      <ResendEmailCodeForm />
    </AuthCard>
  );
}
