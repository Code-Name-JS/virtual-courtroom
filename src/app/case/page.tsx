import Link from "next/link";
import { CaseHeader } from "@/components/CaseHeader";
import { isActiveMember } from "@/domain/account";
import { canReadBoard } from "@/domain/board";
import { SIDE_LABELS, todoFor } from "@/domain/case";
import { getViewer } from "@/server/board-service";
import { getTrialView } from "@/server/trial-service";
import { getCurrentUser } from "@/server/auth";
import { getCaseView } from "@/server/case-service";
import { getAppealView, myReviewState, reviewCounts } from "@/server/appeal";
import { db } from "@/server/db";
import { AppealPanel, ReviewSummary } from "./AppealSections";
import { SignPanel } from "./SignPanel";
import { JudgmentSection, TrialSections } from "./TrialSections";
import { VotePanel } from "./VotePanel";

export const metadata = { title: "사건 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

// 03 C-01 사건 페이지. 상태에 따라 패널이 바뀝니다
export default async function CasePage() {
  const user = await getCurrentUser();
  const view = await getCaseView(user?.id ?? null);

  if (!view) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-600">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">사건</h1>
        <p>곧 사건이 공개됩니다.</p>
      </div>
    );
  }

  // 이메일 인증을 마치고, 만 14세 미만이면 법정대리인이 동의한 회원 (05)
  const loggedIn = user ? isActiveMember(user) : false;
  const isOperator = user?.role === "operator";
  const { viewer } = await getViewer(user);
  const trial = await getTrialView(loggedIn ? user!.id : null);
  const member = loggedIn ? user! : null;
  const [appeal, review, counts] = await Promise.all([getAppealView(db, member), myReviewState(db, member), reviewCounts(db)]);
  const round = view.case.round;
  const todo = todoFor({
    round,
    review,
    appeal: appeal?.todo ?? null,
    status: view.case.status,
    loggedIn,
    isOperator,
    hasVoted: Boolean(view.participation),
    participationStatus: view.participation?.status ?? null,
    trial: trial
      ? {
          nominationOpen: trial.nominationOpen,
          hasNominated: Boolean(trial.myNomination),
          isAdvocate: Boolean(trial.myAdvocate),
          hasArgued: Boolean(trial.myArgument),
          hasVerdict: trial.hasVerdict,
          advocatesSelected: trial.advocates.length > 0,
        }
      : undefined,
  });
  const status = view.case.status;
  const showBoards = status === "EVIDENCE" || canReadBoard(status, viewer, "indict") || canReadBoard(status, viewer, "dismiss");
  const showArchive = round > 1 && canReadBoard(status, viewer, "indict", true);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <CaseHeader view={view} todo={todo} />

      {view.case.status === "INDICTMENT_VOTE" && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">공소 투표</h2>
            <p className="text-sm text-slate-600">
              투표 진행 중 · 참여 <strong>{view.voteCount}</strong>명 (최소 {view.case.minParticipants}명)
            </p>
          </div>
          <p className="text-sm text-slate-600">득표율은 투표가 마감된 뒤에 공개됩니다. 마감 시 참여자가 최소 인원에 못 미치면 사건은 바로 폐기됩니다.</p>
          {isOperator ? null : !loggedIn ? (
            <Link href="/login" className="inline-block rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white">
              로그인하고 투표하기
            </Link>
          ) : view.participation ? (
            <p className="rounded bg-slate-50 px-4 py-3 text-sm">
              <strong>{SIDE_LABELS[view.participation.side]}</strong>에 투표했습니다. 이 진영이 당신의 진영이 됩니다.
            </p>
          ) : (
            <VotePanel />
          )}
        </section>
      )}

      {trial && <TrialSections status={status} trial={trial} isOperator={isOperator} />}

      {appeal && <AppealPanel appeal={appeal} loggedIn={loggedIn} />}

      <ReviewSummary status={status} round={round} counts={counts} loggedIn={loggedIn} />

      {status === "PRETRIAL" && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">공판준비절차 서명</h2>
          {view.participation?.status === "voted" ? (
            <SignPanel />
          ) : view.participation?.status === "signed" ? (
            <p className="rounded bg-slate-50 px-4 py-3 text-sm">서명을 마쳤습니다. 증거 제출이 시작되면 {view.mySide} 측 게시판이 열립니다.</p>
          ) : (
            <p className="text-sm text-slate-600">공소 투표에 참여한 배심원이 서명하는 단계입니다. 서명하지 않은 배심원은 마감 후 재판 단계부터 제외됩니다.</p>
          )}
        </section>
      )}

      {(showBoards || showArchive) && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">진영 게시판</h2>
          {showBoards && (
            <>
              <p className="text-sm text-slate-600">
                {round > 1 && "2심 게시판입니다. "}
                {status === "EVIDENCE"
                  ? "증거 제출 기간에는 자기 측 게시판만 볼 수 있습니다. 기간이 끝나면 양측 게시판이 모두 공개됩니다."
                  : "증거 제출이 끝나 양측 게시판이 공개되었습니다."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["indict", "dismiss"] as const).map((side) => {
                  const open = canReadBoard(status, viewer, side);
                  return open ? (
                    <Link
                      key={side}
                      href={`/case/board/${side}`}
                      className={`rounded-lg border-2 px-4 py-4 font-bold ${side === "indict" ? "border-indict text-indict" : "border-dismiss text-dismiss"}`}
                    >
                      {SIDE_LABELS[side]} 측 게시판 →
                    </Link>
                  ) : (
                    <div key={side} className="rounded-lg border-2 border-dashed border-slate-200 px-4 py-4 font-bold text-slate-400">
                      {SIDE_LABELS[side]} 측 게시판 🔒
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {showArchive && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">1심 게시판은 읽기 전용으로 보관되어 있습니다.</p>
              <div className="flex flex-wrap gap-2">
                {(["indict", "dismiss"] as const).map((side) => (
                  <Link key={side} href={`/case/board/${side}?round=1`} className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
                    1심 {SIDE_LABELS[side]} 측 게시판 →
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {trial && trial.pastJudgments.length > 0 && (
        <div className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-500">1심 기록</h2>
          {trial.pastJudgments.map((past) => (
            <JudgmentSection key={past.judgment.id} judgment={past.judgment} persuasion={past.persuasion} round={past.judgment.round} compact />
          ))}
        </div>
      )}

      {view.indictmentResult && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">공소 투표 결과</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-indict">
                공소 제기 {view.indictmentResult.indictRatio}% ({view.indictmentResult.indict}표)
              </span>
              <span className="text-dismiss">
                불기소 {view.indictmentResult.dismissRatio}% ({view.indictmentResult.dismiss}표)
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded bg-slate-200">
              <div className="bg-indict" style={{ width: `${view.indictmentResult.indictRatio}%` }} />
              <div className="bg-dismiss" style={{ width: `${view.indictmentResult.dismissRatio}%` }} />
            </div>
          </div>
          {view.case.status === "DISMISSED" && (
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">사건이 폐기되었습니다. 사건이 끝나 사이트는 운영자가 공지한 일시에 폐쇄됩니다.</p>
          )}
        </section>
      )}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">사건 개요</h2>
        <p className="whitespace-pre-wrap leading-relaxed">{view.case.summary}</p>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">사건 내용</h2>
        {loggedIn ? (
          <>
            <p className="text-xs text-slate-500">운영자가 AI 원본을 정리한 내용입니다. 이 내용을 기준으로 판단해 주세요.</p>
            <p className="whitespace-pre-wrap leading-relaxed">{view.case.body}</p>
            <details className="rounded border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold">AI 원본 보기</summary>
              <p className="mt-2 text-xs text-slate-500">
                {view.case.aiModel}
                {view.case.aiGeneratedAt && ` · ${dateFormat.format(view.case.aiGeneratedAt)} 생성`}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{view.case.aiOriginalBody}</p>
            </details>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            사건 전문과 AI 원본은{" "}
            <Link href="/login" className="font-semibold underline">
              로그인
            </Link>
            한 뒤 볼 수 있습니다.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">진행 기록</h2>
        <p className="text-xs text-slate-500">사건의 상태 변화와 운영자의 결정은 모두 이유와 함께 공개됩니다.</p>
        <ol className="space-y-2 text-sm">
          {view.events.map((event) => (
            <li key={event.id} className="border-l-2 border-gold-500 pl-3">
              <p className="text-xs text-slate-500">{dateFormat.format(event.createdAt)}</p>
              <p>{event.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
