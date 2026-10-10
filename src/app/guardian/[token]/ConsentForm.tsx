"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form";
import { respondConsentAction } from "./actions";

export function ConsentForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(respondConsentAction, {} as FormState);
  if (state.message) return <FormMessage state={state} />;
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "refuse" && !window.confirm("동의하지 않을까요?\n\n가입 신청이 취소되고 입력된 정보가 모두 바로 삭제됩니다.")) event.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          name="choice"
          value="agree"
          disabled={pending}
          className="rounded bg-navy-900 px-4 py-2.5 font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          동의합니다
        </button>
        <button
          type="submit"
          name="choice"
          value="refuse"
          disabled={pending}
          className="rounded border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          동의하지 않습니다
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
