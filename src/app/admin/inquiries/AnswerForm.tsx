"use client";

import { useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { ANSWER_MAX_LENGTH } from "@/domain/inquiry";
import { answerInquiryAction } from "./actions";

export function AnswerForm({ inquiryId }: { inquiryId: string }) {
  const [state, action] = useActionState(answerInquiryAction, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <textarea
        name="answer"
        rows={4}
        required
        maxLength={ANSWER_MAX_LENGTH}
        placeholder="답변 (알림과 이메일로 문의한 회원에게 그대로 전달됩니다)"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <FormMessage state={state} />
      <SubmitButton>답변 보내기</SubmitButton>
    </form>
  );
}
