import Link from "next/link";
import type { CaseStatus, Side } from "@prisma/client";
import { SIDE_LABELS } from "@/domain/case";
import type { AppealView } from "@/server/appeal";
import { ApplyRound2Form, ChooseRound2Form } from "./AppealForms";
import { SignPanel } from "./SignPanel";

const SIDES: Side[] = ["indict", "dismiss"];
const timeFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

/** 리뷰를 보여 주는 상태 (03 C-11: 리뷰 ~ 확정, 2심이 열린 뒤에는 1심 리뷰를 기록으로) */
const REVIEWS_VISIBLE: CaseStatus[] = ["REVIEW", "APPEAL_DECISION", "APPEAL_RECRUITMENT", "EVIDENCE", "ADVOCATE_SELECTION", "FINAL_ARGUMENT", "DELIBERATION", "SENTENCING", "FINALIZED"];

// 03 C-11 리뷰 패널 (요약). 리뷰 목록과 작성은 /case/reviews
export function ReviewSummary({
  status,
  round,
  counts,
  loggedIn,
}: {
  status: CaseStatus;
  round: number;
  counts: { round: number; reviews: number; appeals: number }[];
  loggedIn: boolean;
}) {
  const reviewOpen = status === "REVIEW" || status === "APPEAL_DECISION" || status === "FINALIZED";
  if (!REVIEWS_VISIBLE.includes(status) || (!reviewOpen && round === 1)) return null;
  const rounds = round === 1 || reviewOpen ? Array.from({ length: round }, (_, i) => i + 1) : [1];
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold">리뷰</h2>
      <p className="text-sm text-slate-600">
        {status === "REVIEW"
          ? round === 1
            ? "배심원은 리뷰를 쓰고 판결에 이의를 신청할 수 있습니다. 리뷰에는 사건에 참여하지 않은 회원도 댓글을 달 수 있고, 1심 리뷰에 댓글을 단 회원은 2심이 열리면 참여를 신청할 수 있습니다."
            : "2심 리뷰는 피드백으로만 받습니다. 2심 판결에는 항소할 수 없습니다."
          : status === "APPEAL_DECISION"
            ? "2심 개시 여부가 정해지기 전까지 1심 리뷰에 댓글을 남길 수 있습니다."
            : "배심원들이 남긴 리뷰입니다."}
      </p>
      <div className="flex flex-wrap gap-2">
        {rounds.map((r) => {
          const c = counts.find((x) => x.round === r);
          return loggedIn ? (
            <Link key={r} href={`/case/reviews?round=${r}`} className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
              {r}심 리뷰 {c?.reviews ?? 0}건{r === 1 && c?.appeals ? ` · 이의 신청 ${c.appeals}건` : ""} →
            </Link>
          ) : (
            <span key={r} className="rounded border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500">
              {r}심 리뷰 {c?.reviews ?? 0}건 (로그인 후 열람)
            </span>
          );
        })}
      </div>
    </section>
  );
}

// 03 C-12 2심 참여 패널
export function AppealPanel({ appeal, loggedIn }: { appeal: AppealView; loggedIn: boolean }) {
  const sideLabel = appeal.side ? SIDE_LABELS[appeal.side] : "";
  return (
    <section className="space-y-5 rounded-lg border-2 border-gold-500 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold">2심 배심원 모집</h2>
        <p className="text-sm text-slate-600">
          1심 배심원은 참여 여부를 고르고(1심 진영 유지), 1심 리뷰에 댓글을 단 회원은 진영을 골라 신청합니다.{" "}
          {appeal.open
            ? `선택과 신청은 ${appeal.deadline ? timeFormat.format(appeal.deadline) : "신청 마감"}에 마감되며, 마감 후 아래 승인 기준이 자동으로 적용됩니다.`
            : "선택과 신청이 마감되어 아래 승인 기준을 적용했습니다. 결과는 진행 기록에 공개되어 있습니다."}{" "}
          승인된 신청자는 모집이 끝나기 전에 서명해야 합니다.
        </p>
      </div>

      <div className="space-y-3">
        {appeal.todo === "choose" && <ChooseRound2Form sideLabel={sideLabel} />}
        {appeal.todo === "can_apply" && <ApplyRound2Form />}
        {appeal.todo === "needs_signature" && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">2심 추가 배심원({sideLabel} 측)으로 승인되었습니다. 공판준비절차 서명을 해 주세요.</p>
            <SignPanel />
          </div>
        )}
        {appeal.todo && !["choose", "can_apply", "needs_signature"].includes(appeal.todo) && (
          <p className="rounded bg-slate-50 px-4 py-3 text-sm">
            {appeal.todo === "joined" && `2심에 ${sideLabel} 측으로 참여합니다.`}
            {appeal.todo === "declined" && "2심에 참여하지 않기로 했습니다."}
            {appeal.todo === "applied" && `${sideLabel} 측으로 2심 참여를 신청했습니다. 신청 마감 후 결과가 공개됩니다.`}
            {appeal.todo === "signed" && `2심 추가 배심원(${sideLabel} 측)으로 서명을 마쳤습니다.`}
            {appeal.todo === "rejected" && `승인되지 않았습니다.${appeal.applicationNote ? ` 사유: ${appeal.applicationNote}` : ""}`}
          </p>
        )}
        {!appeal.todo && loggedIn && appeal.open && (
          <p className="text-sm text-slate-600">2심 참여 신청은 1심 리뷰에 댓글을 단 회원 중 제재 이력이 없는 회원만 할 수 있습니다.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SIDES.map((side) => {
          const c = appeal.counts[side];
          return (
            <div key={side} className="rounded border border-slate-200 p-4 text-sm">
              <p className={`font-bold ${side === "indict" ? "text-indict" : "text-dismiss"}`}>{SIDE_LABELS[side]} 측</p>
              <p>1심에서 이어서 참여 {c.continued}명</p>
              <p>추가 배심원 신청 {c.applied}명{appeal.approvedAt ? ` · 승인 ${c.approved}명` : ""}</p>
            </div>
          );
        })}
      </div>

      <details className="rounded border border-slate-200 bg-slate-50 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">운영자가 공개한 승인 기준 · 추가 배심원 {appeal.sideCap === null ? "상한 없음" : `진영별 최대 ${appeal.sideCap}명`}</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{appeal.criteria}</p>
      </details>
    </section>
  );
}
