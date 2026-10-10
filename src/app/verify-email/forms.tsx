"use client";

import { useActionState } from "react";
import { Field, FormMessage, type FormState, SubmitButton } from "@/components/form";
import { confirmEmailAction, resendEmailCodeAction } from "./actions";

export function ConfirmEmailForm() {
  const [state, action] = useActionState(confirmEmailAction, {} as FormState);
  return (
    <form action={action} className="space-y-4">
      <Field label="인증 코드" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      <FormMessage state={state} />
      <SubmitButton>인증하기</SubmitButton>
    </form>
  );
}

export function ResendEmailCodeForm() {
  const [state, action] = useActionState(resendEmailCodeAction, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton variant="secondary">인증 코드 다시 받기</SubmitButton>
    </form>
  );
}
