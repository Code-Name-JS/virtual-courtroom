"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, type FormState, SubmitButton } from "@/components/form";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {} as FormState);

  return (
    <form action={action} className="space-y-4">
      <Field label="이메일" name="email" type="email" autoComplete="email" required />
      <Field label="비밀번호" name="password" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton>로그인</SubmitButton>
      <p className="text-center text-sm text-slate-600">
        처음이신가요?{" "}
        <Link href="/signup" className="font-semibold text-navy-800 underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
