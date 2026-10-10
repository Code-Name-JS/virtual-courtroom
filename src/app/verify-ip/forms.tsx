"use client";

import { useActionState } from "react";
import { Field, FormMessage, type FormState, SubmitButton } from "@/components/form";
import { confirmIpCodeAction, requestIpCodeAction } from "./actions";

export function RequestIpCodeForm() {
  const [state, action] = useActionState(requestIpCodeAction, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton variant="secondary">이메일로 인증 코드 받기</SubmitButton>
    </form>
  );
}

export function ConfirmIpCodeForm() {
  const [state, action] = useActionState(confirmIpCodeAction, {} as FormState);
  return (
    <form action={action} className="space-y-4">
      <Field label="인증 코드" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      <FormMessage state={state} />
      <SubmitButton>이 네트워크로 바꾸기</SubmitButton>
    </form>
  );
}
