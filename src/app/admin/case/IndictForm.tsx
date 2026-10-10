"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { indictAction } from "./actions";

// 03 O-03 공소 제기
export function IndictForm() {
  const [state, action] = useActionState(indictAction, {} as FormState);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm("공소를 제기할까요?\n\n재판이 열리고 공판준비절차 서명이 시작됩니다. 되돌릴 수 없습니다.")) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-3"
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">운영자 메모 (선택, 진행 기록에 공개됩니다)</span>
        <textarea name="note" rows={2} maxLength={500} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <FormMessage state={state} />
      <SubmitButton>공소 제기하기</SubmitButton>
    </form>
  );
}
