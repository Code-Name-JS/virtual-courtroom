import Link from "next/link";
import { INQUIRY_CATEGORY_LABELS } from "@/domain/inquiry";
import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";
import { listInquiriesForOperator } from "@/server/inquiry";
import { AnswerForm } from "./AnswerForm";

export const metadata = { title: "문의 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

// 03 L-03 문의하기의 운영자 화면 (M8)
export default async function AdminInquiriesPage() {
  await requireOperator();
  const { open, answered } = await listInquiriesForOperator(db);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <Link href="/admin" className="text-sm text-slate-600 underline">
        관리자 대시보드로
      </Link>
      <h1 className="text-2xl font-bold">문의</h1>
      <p className="text-sm text-slate-600">
        회원이 사이트 안에서 남긴 문의입니다. 답변은 알림과 이메일로 전달되며, 한 문의에는 한 번만 답할 수 있습니다. 개인정보 열람·삭제 요청은 처리한 뒤 결과를 답해 주세요.
        회원이 아닌 사람의 문의는 운영자 이메일(OPERATOR_CONTACT_EMAIL)로 옵니다.
      </p>

      <section className="space-y-3">
        <h2 className="font-semibold">답할 문의 ({open.length}건)</h2>
        {open.length === 0 && <p className="text-sm text-slate-600">답할 문의가 없습니다.</p>}
        {open.map((inquiry) => (
          <article key={inquiry.id} className="space-y-3 rounded-lg border border-amber-200 bg-white p-5 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{INQUIRY_CATEGORY_LABELS[inquiry.category]}</span>
              <strong>{inquiry.user.nickname}</strong>
              <span className="text-slate-500">{inquiry.user.email}</span>
              <span className="text-xs text-slate-500">{dateFormat.format(inquiry.createdAt)}</span>
            </p>
            <p className="whitespace-pre-wrap rounded bg-slate-50 p-3">{inquiry.body}</p>
            <AnswerForm inquiryId={inquiry.id} />
          </article>
        ))}
      </section>

      {answered.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-medium">답한 문의 (최근 {answered.length}건)</summary>
          <div className="mt-3 space-y-3">
            {answered.map((inquiry) => (
              <article key={inquiry.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{INQUIRY_CATEGORY_LABELS[inquiry.category]}</span>
                  <strong>{inquiry.user.nickname}</strong>
                  <span className="text-xs text-slate-500">{dateFormat.format(inquiry.createdAt)}</span>
                </p>
                <p className="whitespace-pre-wrap">{inquiry.body}</p>
                <div className="rounded border-l-2 border-gold-500 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">
                    {inquiry.answerer?.nickname ?? "운영자"} · {inquiry.answeredAt && dateFormat.format(inquiry.answeredAt)}
                  </p>
                  <p className="whitespace-pre-wrap">{inquiry.answer}</p>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
