"use client";

import type { Side } from "@prisma/client";
import { startTransition, useActionState, useState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { SIDE_LABELS } from "@/domain/case";
import { OUTCOME_LABELS, SENTENCE_LABELS } from "@/domain/trial";
import { pronounceAction, selectAdvocatesAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm";

type SideOption = {
  side: Side;
  candidates: { participationId: string; nickname: string; nominationCount: number; nominationReasons: string[] }[];
  aiPick: string | null;
  aiRationale: string | null;
};

// 03 O-03 최종 변론인 선정: 진영별 1명, 단 한 번 (01)
export function AdvocateSelectForm({ sides }: { sides: SideOption[] }) {
  const [state, action] = useActionState(selectAdvocatesAction, {} as FormState);
  const [picks, setPicks] = useState<Record<string, string>>(() => Object.fromEntries(sides.map((s) => [s.side, s.aiPick ?? ""])));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("이대로 최종 변론인을 선정할까요?\n\n선정은 단 한 번만 할 수 있고, 결과와 이유는 모두 공개됩니다.")) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-6"
    >
      {sides.map((s) => {
        const differs = s.aiPick !== null && picks[s.side] !== "" && picks[s.side] !== s.aiPick;
        return (
          <fieldset key={s.side} className="space-y-3 rounded border border-slate-200 p-4">
            <legend className="px-1 font-semibold">{SIDE_LABELS[s.side]} 측</legend>
            <p className="rounded bg-slate-50 p-3 text-sm">
              <span className="font-semibold">AI 추천:</span> {s.candidates.find((c) => c.participationId === s.aiPick)?.nickname ?? "없음"}
              {s.aiRationale && <span className="mt-1 block text-slate-600">{s.aiRationale}</span>}
            </p>
            {s.candidates.map((c) => (
              <label key={c.participationId} className="flex items-start gap-2 rounded border border-slate-100 p-3 text-sm">
                <input
                  type="radio"
                  name={`pick_${s.side}`}
                  value={c.participationId}
                  checked={picks[s.side] === c.participationId}
                  onChange={() => setPicks((p) => ({ ...p, [s.side]: c.participationId }))}
                  className="mt-1"
                  required
                />
                <span className="space-y-1">
                  <span className="block font-medium">
                    {c.nickname} · 추천 {c.nominationCount}표 {c.participationId === s.aiPick && <span className="text-gold-600">(AI 추천)</span>}
                  </span>
                  {c.nominationReasons.map((r, i) => (
                    <span key={i} className="block text-slate-600">
                      - {r}
                    </span>
                  ))}
                </span>
              </label>
            ))}
            <label className="block space-y-1">
              <span className="text-sm font-medium">선정 이유 {differs ? "(AI 추천과 다르므로 필수, 공개됩니다)" : "(선택, 공개됩니다)"}</span>
              <textarea name={`reason_${s.side}`} rows={2} required={differs} className={inputClass} />
            </label>
          </fieldset>
        );
      })}
      <FormMessage state={state} />
      <SubmitButton>최종 변론인 선정 (단 한 번)</SubmitButton>
    </form>
  );
}

// 03 O-03 판결 작성 · 선고
export function JudgmentForm() {
  const [state, action] = useActionState(pronounceAction, {} as FormState);
  const [outcome, setOutcome] = useState<"guilty" | "not_guilty">("guilty");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("판결을 선고할까요?\n\n선고하면 판결이 확정되고 되돌릴 수 없습니다.")) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-4"
    >
      <div className="flex gap-4">
        {(["guilty", "not_guilty"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 font-semibold">
            <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            {OUTCOME_LABELS[value]}
          </label>
        ))}
      </div>
      {outcome === "guilty" && (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <select name="sentenceType" required className={inputClass} defaultValue="">
            <option value="" disabled>
              형의 종류
            </option>
            {Object.entries(SENTENCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input name="sentenceDetail" required placeholder="형량 (예: 징역 1년, 벌금 300만 원)" className={inputClass} />
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">선고 이유 (공개됩니다)</span>
        <textarea name="reasoning" rows={6} required className={inputClass} />
      </label>
      <FormMessage state={state} />
      <SubmitButton>판결 선고</SubmitButton>
    </form>
  );
}
