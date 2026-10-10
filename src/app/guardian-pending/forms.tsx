"use client";

import { useActionState } from "react";
import { Field, FormMessage, type FormState, SubmitButton } from "@/components/form";
import { changeGuardianAction, resendGuardianAction } from "./actions";

export function ResendGuardianForm() {
  const [state, action] = useActionState(resendGuardianAction, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton variant="secondary">동의 요청 이메일 다시 보내기</SubmitButton>
    </form>
  );
}

export function ChangeGuardianForm({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState(changeGuardianAction, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <Field label="법정대리인 이름" name="guardianName" defaultValue={name} maxLength={50} required />
      <Field label="법정대리인 이메일" name="guardianEmail" type="email" defaultValue={email} required />
      <FormMessage state={state} />
      <SubmitButton variant="secondary">고친 정보로 다시 보내기</SubmitButton>
    </form>
  );
}
