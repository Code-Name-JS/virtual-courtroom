import Link from "next/link";
import { isActiveMember } from "@/domain/account";
import { INQUIRIES_PER_DAY, INQUIRY_CATEGORY_LABELS } from "@/domain/inquiry";
import { operatorLabel } from "@/components/LegalPage";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { listMyInquiries } from "@/server/inquiry";
import { InquiryForm } from "./InquiryForm";

export const metadata = { title: "문의하기 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

// 03 L-03 문의하기 (M8). 회원은 사이트 안에서 문의하고 답변을 받고, 로그인할 수 없는 사람은 운영자 이메일로 연락합니다.
export default async function ContactPage() {
  const user = await getCurrentUser();
  const member = user && isActiveMember(user) && user.role !== "operator" ? user : null;
  const inquiries = member ? await listMyInquiries(db, member.id) : [];
  const email = env.operatorContactEmail;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">문의하기</h1>
      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-6 text-sm leading-relaxed">
        <p>
          이 사이트는 <strong>{operatorLabel()}</strong>가 운영합니다. 서비스 이용, 개인정보, 저작권에 관한 문의는 운영자에게 해 주세요. 이 사이트를 만든 저장소의 제작자(Code-Name-JS)는 사이트를
          운영하지 않으므로 답할 수 없습니다.
        </p>
        <p>
          운영자 이메일:{" "}
          {email ? (
            <a href={`mailto:${email}`} className="font-semibold text-navy-800 underline">
              {email}
            </a>
          ) : (
            <span className="text-slate-500">운영자가 아직 연락처를 등록하지 않았습니다.</span>
          )}
        </p>
        <p className="text-slate-600">로그인할 수 없거나(접속 IP가 막힘 등) 회원이 아니라면 위 이메일로 연락해 주세요. 법정대리인(부모님)의 동의 철회나 자녀 정보 삭제 요청도 이메일로 받습니다.</p>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-6 text-sm">
        <h2 className="font-semibold">문의하기 전에</h2>
        <ul className="ml-5 list-disc space-y-1 text-slate-700">
          <li>
            자주 묻는 질문은 <Link href="/about/faq" className="underline">FAQ</Link>에 정리되어 있습니다.
          </li>
          <li>
            제재에 이의가 있으면 <Link href="/me/sanctions" className="underline">제재 내역 · 이의 신청</Link>에서 3일 안에 신청해 주세요.
          </li>
          <li>유출이 의심되거나 문제가 있는 글은 게시판 글의 "신고" 버튼으로 알려 주세요.</li>
        </ul>
      </section>

      {member ? (
        <>
          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">운영자에게 문의 남기기</h2>
            <p className="text-xs text-slate-500">하루 {INQUIRIES_PER_DAY}번까지 남길 수 있습니다. 답변은 이 화면과 알림, 이메일로 알려 드립니다. 문의 내용은 사이트를 폐쇄할 때 함께 파기됩니다.</p>
            <InquiryForm />
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">내 문의 ({inquiries.length}건)</h2>
            {inquiries.length === 0 && <p className="text-sm text-slate-600">남긴 문의가 없습니다.</p>}
            {inquiries.map((inquiry) => (
              <article key={inquiry.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{INQUIRY_CATEGORY_LABELS[inquiry.category]}</span>
                  <span className="text-xs text-slate-500">{dateFormat.format(inquiry.createdAt)}</span>
                  <span className={`text-xs font-semibold ${inquiry.status === "answered" ? "text-emerald-700" : "text-amber-700"}`}>
                    {inquiry.status === "answered" ? "답변 완료" : "답변 대기"}
                  </span>
                </p>
                <p className="whitespace-pre-wrap">{inquiry.body}</p>
                {inquiry.answer && (
                  <div className="rounded border-l-2 border-gold-500 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">운영자 답변 · {inquiry.answeredAt && dateFormat.format(inquiry.answeredAt)}</p>
                    <p className="whitespace-pre-wrap">{inquiry.answer}</p>
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      ) : user?.role === "operator" ? (
        <Link href="/admin/inquiries" className="inline-block rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white">
          받은 문의 보기
        </Link>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <Link href="/login" className="font-semibold underline">로그인</Link>하면 사이트 안에서 문의를 남기고 답변을 받을 수 있습니다.
        </p>
      )}
    </div>
  );
}
