import Link from "next/link";
import { AuthCard } from "@/components/Card";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { findPendingConsent } from "@/server/guardian";
import { ConsentForm } from "./ConsentForm";

export const metadata = { title: "법정대리인 동의 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });

// 03 U-08 법정대리인 동의 화면 (05 만 14세 미만: 법정대리인 동의 후 가입)
export default async function GuardianConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const consent = await findPendingConsent(db, token);

  if (!consent) {
    return (
      <AuthCard title="법정대리인 동의">
        <p className="text-sm text-slate-600">
          이미 처리되었거나 기한이 지난 요청입니다. 기한 안에 응답하지 않으면 가입 신청은 취소되고 정보는 삭제됩니다. 자녀가 다시 가입하면 새 동의 요청 이메일을 받게 됩니다.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="자녀의 회원가입에 동의해 주세요"
      description={
        <>
          {consent.guardianName}님, 만 14세 미만 회원 <strong>{consent.nickname}</strong>({consent.email})이 법정대리인으로 {consent.guardianName}님을 적었습니다. 개인정보 보호법에 따라 만
          14세 미만은 법정대리인의 동의를 받아야 가입할 수 있습니다.
        </>
      }
    >
      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">어떤 서비스인가요?</h2>
        <p className="text-slate-700">
          Virtual Courtroom은 AI가 만든 가상의 형사 사건에서 배심원이 되어 재판 과정을 경험하는 교육용 시뮬레이션입니다. 사건은 모두 허구이며 법률 자문이 아닙니다.
        </p>
        <p className="rounded bg-amber-50 px-3 py-2 text-amber-900">
          자녀는 <strong>절도·사기 같은 범죄를 다루는 가상 사건</strong>을 읽고, 투표하고, 다른 회원들과 진영 게시판에서 토론하게 됩니다. 게시판에는 실명 대신 닉네임이 보입니다.
        </p>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">수집하는 정보</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>자녀: 이메일, 비밀번호(복원할 수 없는 해시), 닉네임, 접속 IP(해시), 작성한 글과 투표·참여 기록, 열람 기록</li>
          <li>법정대리인: 동의 확인을 위한 이름과 이메일</li>
          <li>보관 기간: 사건이 끝나 사이트를 폐쇄할 때까지. 폐쇄 후 5일 이내에 모두 파기합니다</li>
        </ul>
        <p className="text-slate-600">
          운영자 연락처: {env.operatorContactEmail ?? "개인정보처리방침 참고"} · 자세한 내용은{" "}
          <Link href="/privacy" target="_blank" className="underline">
            개인정보처리방침
          </Link>
          과{" "}
          <Link href="/terms" target="_blank" className="underline">
            이용약관
          </Link>
          을 확인해 주세요.
        </p>
      </section>
      <p className="text-xs text-slate-500">
        {dateFormat.format(consent.expiresAt)}까지 응답하지 않거나 동의하지 않으면 가입 신청은 취소되고 입력된 정보는 모두 바로 삭제됩니다.
      </p>
      <ConsentForm token={token} />
    </AuthCard>
  );
}
