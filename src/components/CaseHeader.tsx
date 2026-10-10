import { STATUS_LABELS, progressIndex, progressStages, roundLabel } from "@/domain/case";
import type { CaseView } from "@/server/case-service";
import { Countdown } from "./Countdown";

// 03 C-01 사건 페이지 · 공통 머리
export function CaseHeader({ view, todo }: { view: CaseView; todo: string }) {
  const round = view.case.round;
  const stages = progressStages(round);
  const current = progressIndex(view.case.status, round);

  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-gold-500/15 px-2 py-0.5 text-xs font-semibold text-gold-600">AI가 만든 사건</span>
        {round > 1 && <span className="rounded bg-gold-500 px-2 py-0.5 text-xs font-bold text-navy-950">{roundLabel(round)}</span>}
        <span className="rounded bg-navy-900 px-2 py-0.5 text-xs font-semibold text-white">{STATUS_LABELS[view.case.status]}</span>
        {view.mySide && (
          <span className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700">내 진영: {view.mySide}</span>
        )}
      </div>

      <h1 className="text-2xl font-bold">{view.case.title}</h1>

      <ol className={`grid grid-cols-3 gap-1 text-center text-[11px] ${round === 1 ? "sm:grid-cols-9" : "sm:grid-cols-8"}`}>
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={`rounded px-1 py-1.5 ${
              index < current ? "bg-navy-800 text-white" : index === current ? "bg-gold-500 font-semibold text-navy-950" : "bg-slate-100 text-slate-500"
            }`}
          >
            {STATUS_LABELS[stage]}
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="rounded bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">지금 할 일</p>
          <p className="mt-1 font-medium">{todo}</p>
        </div>
        {view.deadline && (
          <div className="rounded bg-slate-50 px-4 py-3 sm:min-w-44">
            <p className="text-xs font-semibold text-slate-500">{view.stageKind === "operator" ? "운영자 처리 기한" : "마감까지"}</p>
            <p className="mt-1 font-medium">
              <Countdown deadline={view.deadline.toISOString()} />
            </p>
          </div>
        )}
      </div>

      {view.operatorOverdue && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          운영자 조치 지연: 운영자가 처리 기한 안에 조치하지 않았습니다.
        </p>
      )}
    </section>
  );
}
