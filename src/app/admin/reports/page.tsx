import Link from "next/link";
import { SANCTION_LABELS, VIOLATION_LABELS } from "@/domain/board";
import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";
import { detectAbnormalViews } from "@/server/leak-detection";
import { appealDeadline, listPendingAppeals, listReports, lookupWatermark } from "@/server/sanction-service";
import { rejectReportAction, watermarkSanctionAction } from "./actions";
import { DetectionList } from "./DetectionList";
import { AppealDecisionForm } from "./forms";

export const metadata = { title: "신고 · 제재 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
const REASONS = { leak: "유출 의심", abuse: "비방·혐오·개인정보", other: "기타" } as const;

// 03 O-05 신고 · 유출 관리
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireOperator();
  const { code } = await searchParams;
  // 워커가 없어도 최근 열람을 확인하도록 (단계 자동 전환과 같은 방식)
  await detectAbnormalViews(db);
  const [reports, appeals, watermark] = await Promise.all([listReports(), listPendingAppeals(), code ? lookupWatermark(code) : null]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <h1 className="text-2xl font-bold">신고 · 제재</h1>
      <p className="text-sm text-slate-600">자동 탐지 결과만으로는 제재하지 않습니다. 근거를 확인한 뒤 제재하고, 이유는 제재 받은 사람에게 그대로 전달됩니다 (05).</p>

      <DetectionList />

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">워터마크로 열람자 찾기</h2>
        <form className="flex gap-2">
          <input name="code" defaultValue={code} placeholder="캡처나 이미지에 보이는 코드 (8자리)" className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm font-mono" />
          <button className="rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white">찾기</button>
        </form>
        {code && (
          watermark ? (
            <div className="rounded bg-slate-50 p-3 text-sm">
              코드 <span className="font-mono">{code.toUpperCase()}</span> 열람자: <strong>{watermark.user.nickname}</strong> · {dateFormat.format(watermark.viewedAt)}에 글 {watermark.postCount}개 열람
              <form action={watermarkSanctionAction} className="mt-2">
                <input type="hidden" name="code" value={code} />
                <button className="font-semibold text-red-700 underline">워터마크 일치를 근거로 이 회원 제재하기</button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-600">이 코드의 열람 기록이 없습니다.</p>
          )
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">처리할 신고 ({reports.length}건)</h2>
        {reports.length === 0 && <p className="text-sm text-slate-600">처리할 신고가 없습니다.</p>}
        {reports.map((report) => (
          <article key={report.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm">
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{REASONS[report.reason]}</span>{" "}
              {report.reporter.nickname}님의 신고 · {dateFormat.format(report.createdAt)}
            </p>
            <p className="text-sm">신고 내용: {report.detail}</p>
            <blockquote className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">
              <span className="text-xs text-slate-500">
                {report.targetPost.author.user.nickname}님의 글 ({report.targetPost.side === "indict" ? "공소 제기" : "불기소"} 측){report.targetPost.isHidden && " · 숨김"}
              </span>
              <br />
              {report.targetPost.body}
            </blockquote>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/admin/reports/sanction?report=${report.id}`} className="rounded bg-red-700 px-3 py-1.5 text-sm font-semibold text-white">
                제재하기
              </Link>
              <form action={rejectReportAction} className="flex gap-2">
                <input type="hidden" name="reportId" value={report.id} />
                <input name="note" placeholder="제재하지 않는 이유" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm">제재하지 않음</button>
              </form>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">이의 신청 ({appeals.length}건)</h2>
        {appeals.length === 0 && <p className="text-sm text-slate-600">처리할 이의 신청이 없습니다.</p>}
        {appeals.map((appeal) => (
          <article key={appeal.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm">
              {appeal.sanction.user.nickname}님 · {SANCTION_LABELS[appeal.sanction.level]} ({VIOLATION_LABELS[appeal.sanction.violation]}) · 답변 기한{" "}
              {dateFormat.format(appealDeadline(appeal.createdAt))}
            </p>
            <p className="text-sm text-slate-600">제재 이유: {appeal.sanction.reason}</p>
            <p className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{appeal.body}</p>
            <AppealDecisionForm appealId={appeal.id} />
          </article>
        ))}
      </section>
    </div>
  );
}
