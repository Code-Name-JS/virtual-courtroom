"use client";

import { startTransition, useActionState, useState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { decideAppealAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm";

// 03 O-03 2심 결정: 개시하면 승인 기준과 진영별 추가 인원 상한을 공개 (05)
export function AppealDecisionForm({ defaultCriteria }: { defaultCriteria: string }) {
  const [state, action] = useActionState(decideAppealAction, {} as FormState);
  const [decision, setDecision] = useState<"open" | "reject">("open");
  return (
    <form
      // JS가 없을 때도 제출되도록 action을 두고, JS가 있으면 직접 제출해 긴 입력이 초기화되지 않게 함
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const message =
          decision === "open"
            ? "2심을 개시할까요?\n\n2심 배심원 모집이 시작되고, 승인 기준과 이유가 공개됩니다. 되돌릴 수 없습니다."
            : "2심을 기각할까요?\n\n1심 판결이 확정되고, 이유가 공개됩니다. 되돌릴 수 없습니다.";
        if (!window.confirm(message)) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-4"
    >
      <div className="flex gap-4 text-sm">
        {(
          [
            ["open", "2심 개시"],
            ["reject", "2심 기각 (1심 판결 확정)"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
            {label}
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">결정 이유 (진행 기록에 공개됩니다)</span>
        <textarea name="reason" rows={3} required maxLength={1000} className={inputClass} />
      </label>
      {decision === "open" && (
        <>
          <label className="block space-y-1">
            <span className="text-sm font-medium">추가 배심원 승인 기준 (사건 페이지와 공지에 공개됩니다)</span>
            <textarea name="criteria" rows={7} required defaultValue={defaultCriteria} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">진영별 추가 인원 상한 (비우면 상한 없음)</span>
            <input name="perSideCap" type="number" min={0} className={inputClass} />
          </label>
        </>
      )}
      <FormMessage state={state} />
      <SubmitButton>{decision === "open" ? "2심 개시하기" : "2심 기각하기"}</SubmitButton>
    </form>
  );
}
