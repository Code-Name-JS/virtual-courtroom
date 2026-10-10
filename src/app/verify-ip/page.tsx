import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { IP_CHANGES_PER_DAY } from "@/domain/account";
import { requireUser } from "@/server/auth";
import { ConfirmIpCodeForm, RequestIpCodeForm } from "./forms";

export const metadata = { title: "접속 위치 변경 인증 · Virtual Courtroom" };

// 03 U-07 IP 변경 인증
export default async function VerifyIpPage() {
  const { ipMatches } = await requireUser({ allowIpMismatch: true });
  if (ipMatches) redirect("/me");

  return (
    <AuthCard
      title="접속 위치가 바뀌었습니다"
      description={
        <div className="space-y-2">
          <p>등록된 네트워크(IP)와 다른 곳에서 접속했습니다. 이메일 인증을 마치면 지금 네트워크를 새 등록 IP로 바꿉니다.</p>
          <p className="text-xs text-slate-500">
            · 하루에 {IP_CHANGES_PER_DAY}번까지 바꿀 수 있습니다.
            <br />· 이 네트워크를 이미 다른 계정이 쓰고 있으면 이용할 수 없습니다 (IP 하나에 계정 하나).
          </p>
        </div>
      }
    >
      <RequestIpCodeForm />
      <ConfirmIpCodeForm />
    </AuthCard>
  );
}
