import type { CaseStatus, Side } from "@prisma/client";
import { SIDE_LABELS } from "@/domain/case";
import { OUTCOME_LABELS, SENTENCE_LABELS } from "@/domain/trial";
import type { getTrialView } from "@/server/trial-service";
import { FinalArgumentForm, NominationForm, VerdictForm } from "./TrialForms";

type TrialView = NonNullable<Awaited<ReturnType<typeof getTrialView>>>;

const SIDES: Side[] = ["indict", "dismiss"];
const AFTER_SELECTION: CaseStatus[] = ["FINAL_ARGUMENT", "DELIBERATION", "SENTENCING", "REVIEW", "APPEAL_DECISION", "APPEAL_RECRUITMENT", "FINALIZED"];
const SELECTED_BY = { operator: "운영자 선정", ai_default: "운영자가 기한 안에 선정하지 않아 AI 추천으로 확정", vote_default: "추천 표가 가장 많은 후보로 확정" } as const;
const timeFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function sideColor(side: Side) {
  return side === "indict" ? "text-indict" : "text-dismiss";
}

// 03 C-07 ~ C-10
export function TrialSections({ status, trial, isOperator }: { status: CaseStatus; trial: TrialView; isOperator: boolean }) {
  const showSelection = status === "ADVOCATE_SELECTION" || AFTER_SELECTION.includes(status);
  return (
    <>
      {status === "FINALIZED" && trial.judgment && <JudgmentSection trial={trial} />}

      {status === "DELIBERATION" && (
        <Section title="배심원 평결">
          <p className="text-sm text-slate-600">
            양측의 주장과 증거, 최종 변론을 보고 유죄 또는 무죄로 평결해 주세요. 개인 표는 공개되지 않고, 평결 결과는 판결과 함께 합계만 공개됩니다. 지금까지 {trial.verdictCount}명이 평결했습니다.
          </p>
          {trial.isActive && !trial.hasVerdict && <VerdictForm />}
          {trial.hasVerdict && <p className="rounded bg-slate-50 px-4 py-3 text-sm">평결을 마쳤습니다.</p>}
        </Section>
      )}

      {status === "SENTENCING" && (
        <Section title="판결 작성 중">
          <p className="text-sm text-slate-600">평결이 마감되었습니다. 운영자가 평결을 참고해 판결을 작성하고 있습니다.</p>
        </Section>
      )}

      {AFTER_SELECTION.includes(status) && (
        <Section title="최종 변론">
          <p className="text-xs text-slate-500">실제 재판의 순서처럼 공소 제기 측이 먼저, 불기소 측이 나중에 변론합니다.</p>
          {status === "FINAL_ARGUMENT" && trial.myAdvocate && (
            <div className="space-y-2 rounded border border-gold-500 bg-gold-500/5 p-4">
              <p className="text-sm font-semibold">당신은 {SIDE_LABELS[trial.myAdvocate.side]} 측 최종 변론인입니다.</p>
              <FinalArgumentForm initial={trial.myArgument?.body ?? ""} />
            </div>
          )}
          {SIDES.map((side) => {
            const advocate = trial.advocates.find((a) => a.side === side);
            const argument = advocate ? trial.finalArguments.find((f) => f.advocateId === advocate.id) : null;
            return (
              <article key={side} className="space-y-2 border-l-4 pl-4" style={{ borderColor: side === "indict" ? "var(--color-indict)" : "var(--color-dismiss)" }}>
                <p className={`text-sm font-bold ${sideColor(side)}`}>
                  {SIDE_LABELS[side]} 측 {advocate ? `· ${advocate.participation.user.nickname}` : "· 최종 변론인 없음"}
                </p>
                {argument ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{argument.body}</p>
                ) : (
                  <p className="text-sm text-slate-500">{status === "FINAL_ARGUMENT" ? "아직 최종 변론이 올라오지 않았습니다." : "변론 없음"}</p>
                )}
              </article>
            );
          })}
        </Section>
      )}

      {showSelection && (
        <Section title="최종 변론인 선정">
          {status === "ADVOCATE_SELECTION" && trial.nominationOpen && (
            <>
              <p className="text-sm text-slate-600">
                같은 진영 배심원 중 최종 변론인으로 적합한 사람을 이유와 함께 추천해 주세요. 추천 결과는 추천 투표가 끝난 뒤 공개됩니다
                {trial.nominationDeadline && ` (마감 ${timeFormat.format(trial.nominationDeadline)})`}.
              </p>
              {trial.isActive && !trial.myNomination && <NominationForm nominees={trial.nominees} />}
              {trial.myNomination && <p className="rounded bg-slate-50 px-4 py-3 text-sm">추천을 마쳤습니다.</p>}
            </>
          )}

          {!trial.nominationOpen && (
            <div className="grid gap-4 sm:grid-cols-2">
              {SIDES.map((side) => {
                const rec = trial.recommendations.find((r) => r.side === side);
                const advocate = trial.advocates.find((a) => a.side === side);
                const tally = trial.tallies?.[side] ?? [];
                return (
                  <div key={side} className="space-y-3 rounded border border-slate-200 p-4 text-sm">
                    <p className={`font-bold ${sideColor(side)}`}>{SIDE_LABELS[side]} 측</p>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">배심원 추천 결과</p>
                      {tally.length === 0 ? <p className="text-slate-500">추천 없음</p> : tally.map((t) => <p key={t.nickname}>{t.nickname} · {t.count}표</p>)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">AI 추천</p>
                      {rec ? (
                        <>
                          <p className="font-medium">{rec.participation?.user.nickname ?? "없음"}</p>
                          <p className="text-slate-600">{rec.rationale}</p>
                        </>
                      ) : trial.activeCounts[side] === 0 ? (
                        <p className="text-slate-500">참여 중인 배심원이 없습니다.</p>
                      ) : (
                        <p className="text-slate-500">AI 추천을 기다리고 있습니다.</p>
                      )}
                    </div>
                    {advocate && (
                      <div className="rounded bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-500">최종 변론인</p>
                        <p className="font-bold">{advocate.participation.user.nickname}</p>
                        <p className="text-xs text-slate-500">{SELECTED_BY[advocate.selectedBy]}</p>
                        {advocate.operatorReason && <p className="mt-1 text-slate-600">운영자 선정 이유: {advocate.operatorReason}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {status === "ADVOCATE_SELECTION" && !trial.nominationOpen && trial.advocates.length === 0 && (
            <p className="text-sm text-slate-600">
              {isOperator ? "관리자 화면에서 진영별 최종 변론인을 선정해 주세요." : "운영자가 AI의 추천과 배심원의 추천 이유를 참고해 최종 변론인을 선정합니다."}
            </p>
          )}
        </Section>
      )}
    </>
  );
}

// 03 C-10 판결 결과와 설득 지표
function JudgmentSection({ trial }: { trial: TrialView }) {
  const judgment = trial.judgment!;
  const p = trial.persuasion!;
  return (
    <section className="space-y-5 rounded-lg border-2 border-navy-900 bg-white p-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-500">판결</p>
        <p className="text-3xl font-bold">
          {OUTCOME_LABELS[judgment.outcome]}
          {judgment.sentenceType && <span className="ml-2 text-xl">· {SENTENCE_LABELS[judgment.sentenceType]} {judgment.sentenceDetail}</span>}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-500">선고 이유</p>
        <p className="whitespace-pre-wrap leading-relaxed">{judgment.reasoning}</p>
      </div>
      <div className="space-y-3 rounded bg-slate-50 p-4">
        <p className="text-sm font-semibold">설득 지표</p>
        <p className="text-lg">
          공소 제기 <strong>{p.baselineIndictRatio}%</strong> → 유죄 평결 <strong>{p.guiltyRatio}%</strong>
        </p>
        <p className="text-sm text-slate-700">
          {p.persuadedSide
            ? `${SIDE_LABELS[p.persuadedSide]} 측의 주장과 증거가 배심원 ${Math.abs(p.deltaPoints)}%p를 설득했습니다.`
            : "처음 공소 투표와 평결의 비율이 같습니다."}
        </p>
        <p className="text-xs text-slate-500">
          평결 유죄 {judgment.verdictGuilty}표 · 무죄 {judgment.verdictNotGuilty}표. 처음 공소 투표의 공소 제기 비율과 비공개 평결의 유죄 비율을 비교한 값입니다.
        </p>
      </div>
      <p className="text-sm text-slate-600">판결이 확정되었습니다. 사건이 끝나 사이트는 운영자가 공지한 일시에 폐쇄됩니다.</p>
    </section>
  );
}
