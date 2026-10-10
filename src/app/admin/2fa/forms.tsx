"use client";

import { useActionState } from "react";
import { Field, FormMessage, type FormState, SubmitButton } from "@/components/form";
import { confirmTotpSetupAction, verifyTotpAction } from "./actions";

function TotpCodeForm({ action: serverAction, submitLabel }: { action: typeof verifyTotpAction; submitLabel: string }) {
  const [state, action] = useActionState(serverAction, {} as FormState);
  return (
    <form action={action} className="space-y-4">
      <Field label="인증 앱의 6자리 코드" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      <FormMessage state={state} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

export function ConfirmTotpSetupForm() {
  return <TotpCodeForm action={confirmTotpSetupAction} submitLabel="2단계 인증 켜기" />;
}

export function VerifyTotpForm() {
  return <TotpCodeForm action={verifyTotpAction} submitLabel="확인" />;
}
