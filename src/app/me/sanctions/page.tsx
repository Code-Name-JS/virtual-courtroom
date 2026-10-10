import { SANCTION_LABELS, VIOLATION_LABELS, canAppeal } from "@/domain/board";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { AppealForm } from "./AppealForm";

export const metadata = { title: "제재 내역 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const APPEAL_STATUS = { pending: "답변 대기", accepted: "받아들여짐 (제재 취소)", rejected: "받아들여지지 않음" } as const;

// 03 U-05 제재 내역 · 이의 신청
export default async function MySanctionsPage() {
  const { user } = await requireUser();
  const sanctions = await db.sanction.findMany({ where: { userId: user.id }, include: { appeal: true }, orderBy: { issuedAt: "desc" } });
  const now = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">제재 내역</h1>
      {sanctions.length === 0 ? (
        <p className="text-slate-600">받은 제재가 없습니다.</p>
      ) : (
        sanctions.map((sanction) => (
          <article key={sanction.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <p className="font-semibold">
              {SANCTION_LABELS[sanction.level]} <span className="text-sm font-normal text-slate-500">· {dateFormat.format(sanction.issuedAt)}</span>
            </p>
            <p className="text-sm">위반: {VIOLATION_LABELS[sanction.violation]}</p>
            <p className="text-sm">이유: {sanction.reason}</p>
            {sanction.appeal ? (
              <div className="rounded bg-slate-50 p-3 text-sm">
                <p>이의 신청: {APPEAL_STATUS[sanction.appeal.status]}</p>
                {sanction.appeal.decisionNote && <p className="text-slate-600">운영자 답변: {sanction.appeal.decisionNote}</p>}
              </div>
            ) : canAppeal(sanction.issuedAt, now) ? (
              <AppealForm sanctionId={sanction.id} />
            ) : (
              <p className="text-sm text-slate-500">이의 신청 기간(제재 후 3일)이 지났습니다.</p>
            )}
          </article>
        ))
      )}
    </div>
  );
}
