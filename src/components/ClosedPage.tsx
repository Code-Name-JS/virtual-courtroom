import { SIDE_LABELS } from "@/domain/case";
import { OUTCOME_LABELS, SENTENCE_LABELS, persuasion } from "@/domain/trial";
import { db } from "@/server/db";
import { CASE_ID } from "@/server/lifecycle";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" });

// 03 X-01 종료 안내 페이지: 사이트 폐쇄 후 남는 유일한 화면
export async function ClosedPage() {
  const current = await db.case.findUnique({ where: { id: CASE_ID } });
  const judgment = await db.judgment.findFirst({ orderBy: { round: "desc" } });
  const p = judgment ? persuasion(judgment.baselineIndictRatio, judgment.verdictGuilty, judgment.verdictNotGuilty) : null;

  return (
    <div className="flex min-h-screen flex-col bg-navy-950 text-white">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center space-y-8 px-4 py-16">
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-wide text-gold-400">VIRTUAL COURTROOM</p>
          <h1 className="text-3xl font-bold">이 사건은 종료되었습니다.</h1>
          {current?.closedAt && <p className="text-sm text-slate-400">{dateFormat.format(current.closedAt)} 사이트 폐쇄</p>}
        </div>

        {current && (
          <section className="space-y-3 rounded-lg bg-navy-900 p-6">
            <h2 className="text-lg font-bold">{current.title}</h2>
            <p className="text-sm leading-relaxed text-slate-300">{current.summary}</p>
            {current.closureSummary && <p className="whitespace-pre-wrap leading-relaxed">{current.closureSummary}</p>}
          </section>
        )}

        {judgment && p && (
          <section className="space-y-2 rounded-lg bg-navy-900 p-6 text-sm">
            <p>
              판결: <strong className="text-lg">{OUTCOME_LABELS[judgment.outcome]}</strong>
              {judgment.sentenceType && ` · ${SENTENCE_LABELS[judgment.sentenceType]} ${judgment.sentenceDetail ?? ""}`}
            </p>
            <p className="whitespace-pre-wrap text-slate-300">{judgment.reasoning}</p>
            <p>
              설득 지표: 공소 제기 {p.baselineIndictRatio}% → 유죄 평결 {p.guiltyRatio}%
              {p.persuadedSide && ` · ${SIDE_LABELS[p.persuadedSide]} 측이 ${Math.abs(p.deltaPoints)}%p 설득`}
            </p>
          </section>
        )}

        <div className="space-y-2 text-xs text-slate-400">
          <p>회원 정보와 작성한 글은 사이트 폐쇄와 함께 모두 파기되었습니다.</p>
          <p>이 사건은 AI가 만든 허구의 사건이며, 실존 인물이나 사건과 관계가 없습니다.</p>
          <p>
            Virtual Courtroom은 사이트 하나가 사건 하나만 다루고 끝나는 단기 프로젝트입니다. ·{" "}
            <a href="https://github.com/Code-Name-JS/virtual-courtroom" className="underline hover:text-white">
              GitHub
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
