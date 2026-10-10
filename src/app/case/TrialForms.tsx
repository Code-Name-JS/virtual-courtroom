"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { finalArgumentAction, nominateAction, verdictAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-800 focus:ring-2 focus:ring-gold-400/40";

// 03 C-07 최종 변론인 후보 추천
export function NominationForm({ nominees }: { nominees: { participationId: string; nickname: string }[] }) {
  const [state, action] = useActionState(nominateAction, {} as FormState);
  if (nominees.length === 0) return <p className="text-sm text-slate-600">추천할 수 있는 같은 진영 배심원이 없습니다.</p>;
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">추천할 배심원 (내 진영)</span>
        <select name="candidateId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            골라 주세요
          </option>
          {nominees.map((n) => (
            <option key={n.participationId} value={n.participationId}>
              {n.nickname}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">추천 이유 (운영자와 AI가 참고합니다)</span>
        <textarea name="reason" rows={3} required maxLength={1000} className={inputClass} />
      </label>
      <FormMessage state={state} />
      <SubmitButton>추천하기</SubmitButton>
    </form>
  );
}

// 03 C-08 최종 변론 작성 (긴 글이 제출 후 초기화되지 않도록 직접 제출)
export function FinalArgumentForm({ initial }: { initial: string }) {
  const [state, action] = useActionState(finalArgumentAction, {} as FormState);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-3"
    >
      <textarea name="body" rows={10} required defaultValue={initial} className={inputClass} placeholder="진영을 대표해 사건의 결말을 증명하는 최종 변론을 써 주세요." />
      <FormMessage state={state} />
      <SubmitButton>{initial ? "고친 내용 제출" : "최종 변론 제출"}</SubmitButton>
    </form>
  );
}

// 03 C-09 평결
export function VerdictForm() {
  const [state, action, pending] = useActionState(verdictAction, {} as FormState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!window.confirm(`「${submitter?.dataset.label ?? ""}」로 평결할까요?\n\n평결은 한 번만 할 수 있고 바꿀 수 없습니다. 개인 표는 공개되지 않습니다.`)) event.preventDefault();
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { value: "guilty", label: "유죄" },
          { value: "not_guilty", label: "무죄" },
        ].map((option) => (
          <button
            key={option.value}
            type="submit"
            name="choice"
            value={option.value}
            data-label={option.label}
            disabled={pending}
            className="rounded-lg border-2 border-navy-800 bg-white px-4 py-4 text-lg font-bold text-navy-900 hover:bg-navy-900 hover:text-white disabled:opacity-60"
          >
            {option.label}
          </button>
        ))}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
