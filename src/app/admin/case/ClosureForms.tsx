"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { announceClosureAction, executeClosureAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm";

// 03 O-08 사이트 폐쇄 ① 폐쇄 일시 공지
export function AnnounceClosureForm({ defaultSummary, defaultAt, minLabel }: { defaultSummary: string; defaultAt: string; minLabel: string }) {
  const [state, action] = useActionState(announceClosureAction, {} as FormState);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("폐쇄 일시를 공지할까요?\n\n공지가 올라가고 모든 회원에게 알림과 이메일이 발송됩니다.")) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-3"
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">폐쇄 일시 (한국 시간, {minLabel} 이후)</span>
        <input type="datetime-local" name="scheduledAt" required defaultValue={defaultAt} className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">종료 안내 페이지에 남길 결과 요약 (닉네임이나 글 내용은 넣지 마세요)</span>
        <textarea name="summary" rows={4} required defaultValue={defaultSummary} className={inputClass} />
      </label>
      <FormMessage state={state} />
      <SubmitButton>폐쇄 일시 공지</SubmitButton>
    </form>
  );
}

// 03 O-08 사이트 폐쇄 ② 폐쇄 실행
export function ExecuteClosureForm() {
  const [state, action] = useActionState(executeClosureAction, {} as FormState);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const typed = window.prompt("사이트를 폐쇄하면 회원 정보와 작성한 글이 모두 파기되고 되돌릴 수 없습니다.\n운영자 계정도 함께 사라집니다.\n\n계속하려면 '폐쇄'라고 입력하세요.");
        if (typed !== "폐쇄") return;
        startTransition(() => action());
      }}
      className="space-y-3"
    >
      <FormMessage state={state} />
      <button type="submit" className="w-full rounded bg-red-700 px-4 py-2.5 font-semibold text-white hover:bg-red-800">
        사이트 폐쇄 실행 (개인정보 파기)
      </button>
    </form>
  );
}
