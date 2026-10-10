import Link from "next/link";
import { MIN_PARTICIPANTS, CASE_STAGES, ROUND2_STAGES, STATUS_LABELS, defaultDurations } from "@/domain/case";
import { requireOperator } from "@/server/auth";
import { getCase } from "@/server/case-service";
import { db } from "@/server/db";
import { advanceDueStages } from "@/server/lifecycle";
import { env } from "@/server/env";
import { CaseForm, type CaseFormValues } from "./CaseForm";
import { IndictForm } from "./IndictForm";
import { AnnounceClosureForm, ExecuteClosureForm } from "./ClosureForms";
import { caseHasEnded, draftClosureSummary, minimumClosureLeadMinutes } from "@/domain/closure";
import { AdvocateSelectForm, JudgmentForm } from "./TrialAdminForms";
import { requestAiAction } from "./actions";
import { getAppealReviews, getApplications, getSelectionView, getSentencingView, getTrialView } from "@/server/trial-service";
import { SIDE_LABELS } from "@/domain/case";
import { DEFAULT_APPEAL_CRITERIA } from "@/domain/appeal";
import { getAppealView } from "@/server/appeal";
import { AppealDecisionForm } from "./AppealAdminForms";

export const metadata = { title: "사건 관리 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

function toKstInput(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

// 03 O-02 사건 생성 · 검수 / O-03 사건 관리
export default async function AdminCasePage() {
  await requireOperator();
  // 워커가 없어도 마감이 지난 단계가 넘어가도록 (사건 페이지와 같은 방식)
  await advanceDueStages(db);
  const current = await getCase();
  const schedules = await db.stageSchedule.findMany({ orderBy: { round: "asc" } });
  const unit = env.demoMode ? 1 : 24 * 60;

  if (!current || current.status === "DRAFT") {
    const durations = defaultDurations(env.demoMode);
    const saved = Object.fromEntries(schedules.filter((s) => s.round === 1).map((s) => [s.stage, s.durationMinutes]));
    const values: CaseFormValues = {
      title: current?.title ?? "",
      summary: current?.summary ?? "",
      body: current?.body ?? "",
      aiOriginalBody: current?.aiOriginalBody ?? "",
      aiModel: current?.aiModel ?? "",
      aiGeneratedAt: toKstInput(current?.aiGeneratedAt ?? null),
      minParticipants: current?.minParticipants ?? MIN_PARTICIPANTS,
      maxParticipants: current?.maxParticipants ?? null,
      durations: Object.fromEntries(
        CASE_STAGES.map(({ stage }) => [stage, Math.max(1, Math.round((saved[stage] ?? durations[stage]) / unit))]),
      ),
      checklist: (current?.reviewChecklist as string[] | null) ?? [],
      reviewNote: current?.reviewNote ?? "",
    };

    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">사건 만들기</h1>
          <p className="text-sm text-slate-600">사이트에는 사건을 1건만 올릴 수 있고, 게시한 뒤에는 고칠 수 없습니다. 게시하면 공소 투표가 바로 시작됩니다.</p>
        </div>
        <CaseForm values={values} demoMode={env.demoMode} minAllowed={env.demoMode ? 1 : MIN_PARTICIPANTS} />
      </div>
    );
  }

  const voteCount = await db.indictmentVote.count();
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">사건 관리</h1>
      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">현재 상태</p>
        <p className="text-xl font-bold">{STATUS_LABELS[current.status]}</p>
        <p className="text-sm">
          {current.title} · 공소 투표 참여 {voteCount}명 (최소 {current.minParticipants}명)
        </p>
        {current.status === "INDICTMENT_PENDING" && (
          <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">공소 투표 결과 공소 제기가 결정되었습니다. 공소를 제기하면 재판이 열리고 공판준비절차 서명이 시작됩니다. (AI는 공소를 제기할 수 없습니다)</p>
            <IndictForm />
          </div>
        )}
        <Link href="/case" className="inline-block text-sm font-semibold text-navy-800 underline">
          사건 페이지 보기
        </Link>
      </section>
      {current.status === "ADVOCATE_SELECTION" && <AdvocateAdmin />}
      {current.status === "SENTENCING" && <SentencingAdmin />}
      {current.status === "APPEAL_DECISION" && <AppealDecisionAdmin />}
      {current.status === "APPEAL_RECRUITMENT" && <RecruitmentAdmin />}
      {caseHasEnded(current.status) && <ClosureAdmin />}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">단계 일정</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">심급</th>
              <th>단계</th>
              <th>시작</th>
              <th>마감</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2].flatMap((round) =>
              (round === 1 ? CASE_STAGES.map((s) => s.stage) : ROUND2_STAGES)
                .map((stage) => schedules.find((s) => s.round === round && s.stage === stage))
                .filter((schedule) => schedule !== undefined)
                // 1심의 '2심 배심원 모집' 행은 2심 기간을 정해 두는 용도라 표에서 뺌
                .filter((schedule) => (round === 1 ? schedule.stage !== "APPEAL_RECRUITMENT" : current.round === 2))
                .map((schedule) => (
                  <tr key={schedule.id} className="border-t border-slate-100">
                    <td className="py-1.5">{round}심</td>
                    <td>{STATUS_LABELS[schedule.stage]}</td>
                    <td>{schedule.startsAt ? dateFormat.format(schedule.startsAt) : "—"}</td>
                    <td>{schedule.endsAt ? dateFormat.format(schedule.endsAt) : "—"}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function AdvocateAdmin() {
  const [trial, selection] = await Promise.all([getTrialView(null), getSelectionView()]);
  if (!trial || !selection) return null;
  if (trial.nominationOpen) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        배심원들이 최종 변론인 후보를 추천하고 있습니다. 추천 투표가 끝나면 AI 추천이 나오고, 그 뒤에 선정할 수 있습니다.
      </section>
    );
  }
  if (selection.alreadySelected) {
    return <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm">최종 변론인 선정을 마쳤습니다. 단계 마감 후 최종 변론이 시작됩니다.</section>;
  }
  const sides = selection.sides.filter((s) => s.candidates.length > 0);
  const missingAi = sides.some((s) => !s.recommendation);
  return (
    <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h2 className="font-semibold">최종 변론인 선정</h2>
      <p className="text-sm text-amber-900">
        AI의 추천과 배심원의 추천 이유를 참고해 진영별 1명을 <strong>단 한 번</strong> 선정합니다. 판결이 뒤집힐 수 있는 핵심 구간이므로, AI 추천과 다르게 고르면 이유를 공개해야 합니다.
        단계 마감까지 선정하지 않으면 AI 추천으로, AI 추천이 없으면 추천 표가 가장 많은 후보로 확정됩니다.
      </p>
      {missingAi && (
        <form action={requestAiAction} className="flex items-center gap-3 text-sm">
          <span>아직 AI 추천이 없는 진영이 있습니다 ({sides.filter((s) => !s.recommendation).map((s) => SIDE_LABELS[s.side]).join(", ")}).</span>
          <button className="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold">AI 추천 받기</button>
        </form>
      )}
      {sides.length === 0 ? (
        <p className="text-sm">참여 중인 배심원이 없어 선정할 후보가 없습니다.</p>
      ) : (
        <AdvocateSelectForm
          sides={sides.map((s) => ({
            side: s.side,
            candidates: s.candidates,
            aiPick: s.recommendation?.participationId ?? null,
            aiRationale: s.recommendation?.rationale ?? null,
          }))}
        />
      )}
    </section>
  );
}

async function SentencingAdmin() {
  const [view, current] = await Promise.all([getSentencingView(), getCase()]);
  if (!view || !current) return null;
  return (
    <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h2 className="font-semibold">판결 작성</h2>
      <p className="text-sm">
        배심원 평결: 유죄 <strong>{view.guilty}</strong>표 · 무죄 <strong>{view.notGuilty}</strong>표 · 설득 지표: 공소 제기 {view.persuasion.baselineIndictRatio}% → 유죄 {view.persuasion.guiltyRatio}%
      </p>
      <p className="text-sm text-amber-900">평결을 참고해 무죄 또는 유죄(징역·집행유예·벌금)로 선고하고, 선고 이유를 함께 적어 주세요. 선고하면 리뷰 기간이 시작됩니다{current.round === 1 ? " (1심 리뷰에서는 배심원이 이의를 신청할 수 있습니다)" : " (2심 판결에는 항소할 수 없습니다)"}.</p>
      <JudgmentForm />
    </section>
  );
}

// 03 O-03 2심 결정
async function AppealDecisionAdmin() {
  const reviews = await getAppealReviews();
  return (
    <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h2 className="font-semibold">2심 결정</h2>
      <p className="text-sm text-amber-900">
        1심 리뷰에 이의 신청이 {reviews.length}건 있습니다. 내용을 확인하고 2심을 개시하거나 기각해 주세요. 결정과 이유는 공개되고, 개시하면 승인 기준과 진영별 추가 인원 상한도 공개됩니다.
        추가 배심원은 신청 마감 후 공개한 기준대로 시스템이 승인하며, 운영자가 신청자를 개별로 고르지 않습니다 (05).
      </p>
      <ul className="space-y-2">
        {reviews.map((review) => (
          <li key={review.id} className="rounded bg-white p-3 text-sm">
            <p className="text-xs text-slate-500">
              {review.author.user.nickname} · {SIDE_LABELS[review.author.side]} 측 · 댓글 {review._count.comments}개
            </p>
            <p className="whitespace-pre-wrap">{review.body}</p>
          </li>
        ))}
      </ul>
      <div className="rounded bg-white p-4">
        <AppealDecisionForm defaultCriteria={DEFAULT_APPEAL_CRITERIA} />
      </div>
    </section>
  );
}

// 03 O-04 2심 신청 현황 (승인은 신청 마감 후 시스템이 기준대로 적용)
async function RecruitmentAdmin() {
  const [appeal, applications] = await Promise.all([getAppealView(db, null), getApplications()]);
  if (!appeal) return null;
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="font-semibold">2심 배심원 모집</h2>
      <p className="text-sm text-slate-600">
        {appeal.approvedAt
          ? `승인 기준을 적용했습니다 (${dateFormat.format(appeal.approvedAt)}). 승인된 신청자가 모집 마감 전에 서명하면 2심 증거 제출이 시작됩니다.`
          : `신청 마감${appeal.deadline ? `(${dateFormat.format(appeal.deadline)})` : ""}이 지나면 공개한 승인 기준이 자동으로 적용됩니다.`}
      </p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {(["indict", "dismiss"] as const).map((side) => (
          <p key={side} className="rounded bg-slate-50 p-3">
            <strong>{SIDE_LABELS[side]} 측</strong> · 1심에서 이어서 {appeal.counts[side].continued}명 · 신청 {appeal.counts[side].applied}명 · 승인 {appeal.counts[side].approved}명
          </p>
        ))}
      </div>
      {applications.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">신청자</th>
              <th>진영</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-1.5">{a.user.nickname}</td>
                <td>{SIDE_LABELS[a.requestedSide]}</td>
                <td>{a.status === "pending" ? "대기" : a.status === "approved" ? "승인" : `미승인 · ${a.note ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// 03 O-08 사이트 폐쇄
async function ClosureAdmin() {
  const current = await getCase();
  if (!current) return null;
  const judgment = await db.judgment.findFirst({ orderBy: { round: "desc" } });
  const lead = minimumClosureLeadMinutes(env.demoMode);
  const defaultAt = toKstInput(current.closureScheduledAt ?? new Date(Date.now() + (lead + (env.demoMode ? 1 : 24 * 60 * 2)) * 60 * 1000));
  const summary = current.closureSummary ?? draftClosureSummary({ title: current.title, status: current.status, judgment });
  const due = current.closureScheduledAt !== null && current.closureScheduledAt <= new Date();

  return (
    <section className="space-y-5 rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="font-semibold">사이트 폐쇄</h2>
      <p className="text-sm text-red-900">
        사건이 끝났습니다. 폐쇄 일시를 공지한 뒤, 그 일시가 지나면 폐쇄를 실행합니다. 폐쇄하면 회원 정보와 작성한 글이 모두 파기되고 종료 안내 페이지만 남습니다 (01, 05).
      </p>
      {current.closureScheduledAt && (
        <p className="rounded bg-white px-3 py-2 text-sm">
          공지한 폐쇄 일시: <strong>{dateFormat.format(current.closureScheduledAt)}</strong> {due ? "(지금 폐쇄할 수 있습니다)" : "(일시가 지나면 폐쇄할 수 있습니다)"}
        </p>
      )}
      <div className="space-y-2 rounded bg-white p-4">
        <p className="text-sm font-semibold">① 폐쇄 일시 {current.closureScheduledAt ? "다시 공지" : "공지"}</p>
        <AnnounceClosureForm defaultSummary={summary} defaultAt={defaultAt} minLabel={env.demoMode ? "1분" : "하루"} />
      </div>
      {due && (
        <div className="space-y-2 rounded bg-white p-4">
          <p className="text-sm font-semibold">② 폐쇄 실행</p>
          <p className="text-xs text-slate-600">실행 후 서버의 .env에서 IP_HASH_SECRET을 지우고, DB 백업본이 있다면 함께 파기하세요 (운영 안내서 참고).</p>
          <ExecuteClosureForm />
        </div>
      )}
    </section>
  );
}
