import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { STATUS_LABELS } from "@/domain/case";
import { getCaseView } from "@/server/case-service";

// 01 핵심 흐름을 홈 화면용으로 줄인 단계
const STEPS = [
  { title: "사건 공개", text: "운영자가 AI로 만든 가상 사건을 정리해 공개합니다" },
  { title: "공소 투표", text: "공소 제기와 불기소 중 하나에 투표해 진영을 정합니다" },
  { title: "증거 제출", text: "진영 게시판에 생각과 증거를 담은 스레드를 씁니다" },
  { title: "최종 변론", text: "진영별 대표 배심원이 최종 변론을 합니다" },
  { title: "평결", text: "모든 증거를 본 뒤 비공개로 유죄·무죄를 평결합니다" },
  { title: "판결", text: "운영자가 평결을 참고해 판결을 선고합니다" },
];

// 03 H-01 홈
export default async function HomePage() {
  const view = await getCaseView(null);

  return (
    <>
      <section className="bg-navy-950 text-white">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-16">
          <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
            당신의 판단이
            <br />
            하나의 <span className="text-gold-400">판결</span>이 됩니다.
          </h1>
          <p className="max-w-xl text-slate-300">
            AI가 만든 가상 사건의 배심원이 되어, 증거와 논리로 사건의 결말을 증명하는 법정 시뮬레이션입니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={view ? "/case" : "/signup"} className="rounded bg-gold-500 px-5 py-2.5 font-semibold text-navy-950 hover:bg-gold-400">
              사건 참여하기
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 bg-navy-900">
          <p className="mx-auto max-w-5xl px-4 py-3 text-xs text-slate-300">
            <span className="font-semibold text-gold-400">NOTICE</span> 본 플랫폼은 실제 법률 시스템이 아닌 AI 기반 가상 사건 시뮬레이션입니다. 사건은 하나뿐이며, 사건이 끝나면 사이트는 폐쇄됩니다.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-4 px-4 py-12">
        <h2 className="text-xl font-bold">진행 중인 사건</h2>
        {view ? (
          <Link href="/case" className="block space-y-3 rounded-lg border border-slate-200 bg-white p-6 hover:border-gold-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gold-500/15 px-2 py-0.5 text-xs font-semibold text-gold-600">AI가 만든 사건</span>
              <span className="rounded bg-navy-900 px-2 py-0.5 text-xs font-semibold text-white">{STATUS_LABELS[view.case.status]}</span>
            </div>
            <h3 className="text-lg font-bold">{view.case.title}</h3>
            <p className="line-clamp-2 text-sm text-slate-600">{view.case.summary}</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span>공소 투표 참여 {view.voteCount}명</span>
              {view.deadline && view.stageKind === "timed" && (
                <span>
                  마감까지 <Countdown deadline={view.deadline.toISOString()} />
                </span>
              )}
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">곧 사건이 공개됩니다.</div>
        )}
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
          <h2 className="text-xl font-bold">재판 진행 과정</h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-gold-600">
                  {String(index + 1).padStart(2, "0")} {step.title}
                </p>
                <p className="mt-1 text-sm text-slate-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
