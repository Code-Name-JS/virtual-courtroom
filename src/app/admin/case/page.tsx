import Link from "next/link";
import { MIN_PARTICIPANTS, MVP_STAGES, STATUS_LABELS, defaultDurations } from "@/domain/case";
import { requireOperator } from "@/server/auth";
import { getCase } from "@/server/case-service";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { CaseForm, type CaseFormValues } from "./CaseForm";

export const metadata = { title: "사건 관리 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

function toKstInput(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

// 03 O-02 사건 생성 · 검수 / O-03 사건 관리
export default async function AdminCasePage() {
  await requireOperator();
  const current = await getCase();
  const schedules = await db.stageSchedule.findMany({ where: { round: 1 } });
  const unit = env.demoMode ? 1 : 24 * 60;

  if (!current || current.status === "DRAFT") {
    const durations = defaultDurations();
    const saved = Object.fromEntries(schedules.map((s) => [s.stage, s.durationMinutes]));
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
        MVP_STAGES.map(({ stage }) => [stage, Math.max(1, Math.round((saved[stage] ?? durations[stage]) / unit))]),
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
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            공소 제기를 기다리고 있습니다. 공소 제기 기능은 다음 단계(M2)에서 추가됩니다.
          </p>
        )}
        <Link href="/case" className="inline-block text-sm font-semibold text-navy-800 underline">
          사건 페이지 보기
        </Link>
      </section>
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">단계 일정</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">단계</th>
              <th>시작</th>
              <th>마감</th>
            </tr>
          </thead>
          <tbody>
            {MVP_STAGES.map(({ stage }) => {
              const schedule = schedules.find((s) => s.stage === stage);
              return (
                <tr key={stage} className="border-t border-slate-100">
                  <td className="py-1.5">{STATUS_LABELS[stage]}</td>
                  <td>{schedule?.startsAt ? dateFormat.format(schedule.startsAt) : "—"}</td>
                  <td>{schedule?.endsAt ? dateFormat.format(schedule.endsAt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
