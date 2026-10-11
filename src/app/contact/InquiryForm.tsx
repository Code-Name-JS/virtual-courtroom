"use client";

import { useActionState, useRef, useState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { INQUIRY_CATEGORIES, INQUIRY_MAX_LENGTH } from "@/domain/inquiry";
import { inquiryAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-800 focus:ring-2 focus:ring-gold-400/40";

export function InquiryForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState(INQUIRY_CATEGORIES[0].id);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await inquiryAction(prev, formData);
    if (result.message) formRef.current?.reset();
    return result;
  }, {} as FormState);
  const hint = INQUIRY_CATEGORIES.find((c) => c.id === category)?.hint;

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">문의 종류</span>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputClass}>
          {INQUIRY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">내용</span>
        <textarea name="body" rows={5} maxLength={INQUIRY_MAX_LENGTH} required className={inputClass} placeholder="비밀번호 같은 비밀 정보는 적지 마세요." />
      </label>
      <FormMessage state={state} />
      <SubmitButton>문의 남기기</SubmitButton>
    </form>
  );
}
