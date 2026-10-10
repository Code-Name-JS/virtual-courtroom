"use client";

import { useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { appealAction } from "./actions";

export function AppealForm({ sanctionId }: { sanctionId: string }) {
  const [state, action] = useActionState(appealAction, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="sanctionId" value={sanctionId} />
      <textarea name="body" rows={3} required placeholder="제재가 잘못되었다고 생각하는 이유를 적어 주세요" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      <FormMessage state={state} />
      <SubmitButton variant="secondary">이의 신청</SubmitButton>
    </form>
  );
}
