import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { requireOperator } from "@/server/auth";
import { VerifyTotpForm } from "./forms";

export const metadata = { title: "관리자 2단계 인증 · Virtual Courtroom" };

export default async function AdminTotpPage() {
  const { user, session } = await requireOperator({ allowTotpPending: true });
  if (!user.totpEnabledAt) redirect("/admin/2fa/setup");
  if (session.totpVerified) redirect("/admin");

  return (
    <AuthCard title="관리자 2단계 인증" description="관리자 영역에 들어가려면 인증 앱에 표시된 코드를 입력해 주세요.">
      <VerifyTotpForm />
    </AuthCard>
  );
}
