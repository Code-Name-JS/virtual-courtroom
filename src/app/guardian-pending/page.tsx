import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { GUARDIAN_REQUESTS_PER_DAY, isActiveMember } from "@/domain/account";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { expireGuardianConsents } from "@/server/guardian";
import { ChangeGuardianForm, ResendGuardianForm } from "./forms";

export const metadata = { title: "법정대리인 동의 대기 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });

// 05 만 14세 미만: 법정대리인이 동의하기 전까지 계정이 활성화되지 않음
export default async function GuardianPendingPage() {
  // 기한이 지났으면 가입 신청이 지워지고 세션도 사라져 로그인 화면으로 감
  await expireGuardianConsents(db);
  const { user } = await requireUser({ allowPendingGuardian: true });
  if (isActiveMember(user)) redirect("/me");
  const consent = await db.guardianConsent.findUnique({ where: { userId: user.id } });
  if (!consent) redirect("/me");

  return (
    <AuthCard
      title="법정대리인의 동의를 기다리고 있습니다"
      description={
        <>
          <strong>{consent.guardianName}</strong>님({consent.guardianEmail})에게 동의 요청 이메일을 보냈습니다. 법정대리인이 이메일의 링크에서 동의하면 가입이 완료되고 사건에 참여할 수
          있습니다.
        </>
      }
    >
      <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {dateFormat.format(consent.expiresAt)}까지 동의하지 않으면 가입 신청은 취소되고, 입력한 정보는 모두 삭제됩니다.
      </p>
      <ResendGuardianForm />
      <details className="rounded border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">법정대리인 정보를 잘못 적었나요?</summary>
        <div className="pt-3">
          <ChangeGuardianForm name={consent.guardianName} email={consent.guardianEmail} />
        </div>
      </details>
      <p className="text-xs text-slate-500">동의 요청 이메일은 하루 {GUARDIAN_REQUESTS_PER_DAY}번까지 보낼 수 있습니다.</p>
    </AuthCard>
  );
}
