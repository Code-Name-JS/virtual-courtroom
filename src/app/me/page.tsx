import Link from "next/link";
import { STATUS_LABELS, todoFor } from "@/domain/case";
import { requireUser } from "@/server/auth";
import { getCaseView } from "@/server/case-service";
import { db } from "@/server/db";

export const metadata = { title: "내 활동 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

// 03 U-03 내 활동, U-04 알림
export default async function MePage() {
  const { user } = await requireUser();
  const [view, notifications] = await Promise.all([
    getCaseView(user.id),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">내 활동</h1>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">내 진영 · 지금 할 일</h2>
        {view ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">사건</span> {view.case.title} · {STATUS_LABELS[view.case.status]}
            </p>
            <p>
              <span className="text-slate-500">내 진영</span> {view.mySide ?? "아직 참여하지 않음"}
            </p>
            <p className="rounded bg-slate-50 px-3 py-2 font-medium">
              {todoFor({
                status: view.case.status,
                loggedIn: true,
                isOperator: user.role === "operator",
                hasVoted: Boolean(view.participation),
                participationStatus: view.participation?.status ?? null,
              })}
            </p>
            <Link href="/case" className="inline-block font-semibold text-navy-800 underline">
              사건 페이지로 가기
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-600">아직 공개된 사건이 없습니다.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">알림</h2>
        {notifications.length === 0 ? (
          <p className="text-sm text-slate-600">새 알림이 없습니다.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {notifications.map((notification) => (
              <li key={notification.id} className="border-l-2 border-gold-500 pl-3">
                <p className="text-xs text-slate-500">{dateFormat.format(notification.createdAt)}</p>
                <p>{(notification.payload as { message?: string } | null)?.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">계정</h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">닉네임</dt>
          <dd>{user.nickname}</dd>
          <dt className="text-slate-500">이메일</dt>
          <dd>{user.email}</dd>
          <dt className="text-slate-500">권한</dt>
          <dd>{user.role === "operator" ? "운영자" : "회원"}</dd>
        </dl>
      </section>

      <Link href="/me/sanctions" className="inline-block text-sm text-slate-600 underline">
        제재 내역 · 이의 신청
      </Link>

      {user.role === "operator" && (
        <Link href="/admin" className="inline-block rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800">
          관리자 영역으로 가기
        </Link>
      )}
    </div>
  );
}
