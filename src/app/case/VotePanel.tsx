"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form";
import { voteAction } from "./actions";

const CHOICES = [
  {
    value: "indict",
    label: "공소 제기",
    description: "재판을 열어 증거로 다퉈야 한다",
    className: "border-indict text-indict hover:bg-indict hover:text-white",
  },
  {
    value: "dismiss",
    label: "불기소",
    description: "재판에 넘기지 않아야 한다",
    className: "border-dismiss text-dismiss hover:bg-dismiss hover:text-white",
  },
] as const;

// 03 C-02 공소 투표 패널
export function VotePanel() {
  const [state, action, pending] = useActionState(voteAction, {} as FormState);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const label = submitter?.dataset.label ?? "";
        const ok = window.confirm(
          `「${label}」에 투표할까요?\n\n· 투표는 한 번만 할 수 있고 바꿀 수 없습니다.\n· 투표한 쪽이 당신의 진영이 됩니다.`,
        );
        if (!ok) event.preventDefault();
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="submit"
            name="choice"
            value={choice.value}
            data-label={choice.label}
            disabled={pending}
            className={`rounded-lg border-2 bg-white px-4 py-4 text-left transition disabled:opacity-60 ${choice.className}`}
          >
            <span className="block text-lg font-bold">{choice.label}</span>
            <span className="block text-sm opacity-80">{choice.description}</span>
          </button>
        ))}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
