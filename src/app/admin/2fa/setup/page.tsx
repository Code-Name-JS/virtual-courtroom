import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { SubmitButton } from "@/components/form";
import { readTotpSecret } from "@/server/admin-2fa";
import { requireOperator } from "@/server/auth";
import { totpUri } from "@/server/totp";
import { startTotpSetupAction } from "../actions";
import { ConfirmTotpSetupForm } from "../forms";

export const metadata = { title: "관리자 2단계 인증 설정 · Virtual Courtroom" };

// 05 IP · 계정 정책: 운영자 계정이 탈취되면 판결과 제재를 조작할 수 있으므로 관리자 영역은 2단계 인증
export default async function AdminTotpSetupPage() {
  const { user } = await requireOperator({ allowTotpSetup: true });
  if (user.totpEnabledAt) redirect("/admin");

  if (!user.totpSecretEnc) {
    return (
      <AuthCard
        title="관리자 2단계 인증 설정"
        description="관리자 영역은 비밀번호와 함께 인증 앱(Google Authenticator, Microsoft Authenticator 등)의 코드로 한 번 더 확인합니다."
      >
        <form action={startTotpSetupAction}>
          <SubmitButton>설정 시작하기</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  const secret = readTotpSecret(user.totpSecretEnc);
  const qr = await QRCode.toDataURL(totpUri(secret, user.email), { margin: 1, width: 220 });

  return (
    <AuthCard title="관리자 2단계 인증 설정" description="인증 앱으로 QR 코드를 찍은 뒤, 앱에 표시된 6자리 코드를 입력해 주세요.">
      <div className="space-y-3 text-center">
        <img src={qr} alt="2단계 인증 QR 코드" className="mx-auto rounded border border-slate-200" width={220} height={220} />
        <p className="text-xs text-slate-500">QR 코드를 찍을 수 없으면 아래 키를 직접 입력하세요.</p>
        <code className="block break-all rounded bg-slate-100 px-3 py-2 text-sm">{secret}</code>
      </div>
      <ConfirmTotpSetupForm />
    </AuthCard>
  );
}
