"use client";

import type { SanctionLevel, Violation } from "@prisma/client";
import { startTransition, useActionState, useState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { SANCTION_LABELS, VIOLATION_LABELS, suggestSanction } from "@/domain/board";
import { decideAppealAction, sanctionAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm";

// 03 O-05 제재 부과. 05 기준의 추천 단계를 먼저 골라 두고, 운영자가 확인해 확정합니다.
export function SanctionForm({ userId, reportId, postId, priorSanctions }: { userId: string; reportId?: string; postId?: string; priorSanctions: number }) {
  const [state, action] = useActionState(sanctionAction, {} as FormState);
  const [violation, setViolation] = useState<Violation>("leak");
  const [clear, setClear] = useState(false);
  const suggested = suggestSanction(violation, priorSanctions, clear);
  const [level, setLevel] = useState<SanctionLevel | null>(null);
  const chosen = level ?? suggested;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(`「${SANCTION_LABELS[chosen]}」 제재를 부과할까요?`)) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-3"
    >
      <input type="hidden" name="userId" value={userId} />
      {reportId && <input type="hidden" name="reportId" value={reportId} />}
      {postId && <input type="hidden" name="postId" value={postId} />}
      <label className="block space-y-1">
        <span className="text-sm font-medium">위반 유형</span>
        <select name="violation" value={violation} onChange={(e) => { setViolation(e.target.value as Violation); setLevel(null); }} className={inputClass}>
          {Object.entries(VIOLATION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      {violation === "leak" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clear} onChange={(e) => { setClear(e.target.checked); setLevel(null); }} />
          증거가 명백함 (워터마크 일치 등)
        </label>
      )}
      <p className="rounded bg-slate-50 px-3 py-2 text-sm">
        05 기준 추천: <strong>{SANCTION_LABELS[suggested]}</strong> (이전 제재 {priorSanctions}건)
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">제재 단계</span>
        <select name="level" value={chosen} onChange={(e) => setLevel(e.target.value as SanctionLevel)} className={inputClass}>
          {Object.entries(SANCTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      {postId && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hidePost" defaultChecked /> 신고된 글 숨기기
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">제재 이유 (제재 받은 사람에게 그대로 전달됩니다)</span>
        <textarea name="reason" rows={3} required className={inputClass} />
      </label>
      <FormMessage state={state} />
      <SubmitButton>제재 부과</SubmitButton>
    </form>
  );
}

export function AppealDecisionForm({ appealId }: { appealId: string }) {
  const [state, action] = useActionState(decideAppealAction, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="appealId" value={appealId} />
      <textarea name="note" rows={2} required placeholder="결정 이유 (신청자에게 전달됩니다)" className={inputClass} />
      <div className="flex gap-2 text-sm">
        <label className="flex items-center gap-1"><input type="radio" name="decision" value="accept" required /> 받아들이기 (제재 취소)</label>
        <label className="flex items-center gap-1"><input type="radio" name="decision" value="reject" /> 받아들이지 않기</label>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">결정</SubmitButton>
    </form>
  );
}
