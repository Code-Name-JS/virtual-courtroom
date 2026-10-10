"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { codeSchema, firstError } from "@/domain/account";
import { confirmSignupEmail } from "@/server/accounts";
import { requireUser } from "@/server/auth";
import { issueCode } from "@/server/verification";

export async function confirmEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser({ allowUnverifiedEmail: true });
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: firstError(code.error) };

  const result = await confirmSignupEmail(user.id, code.data);
  if (!result.ok) return { error: result.error };
  redirect("/me");
}

export async function resendEmailCodeAction(_prev: FormState): Promise<FormState> {
  const { user } = await requireUser({ allowUnverifiedEmail: true });
  if (user.emailVerifiedAt) redirect("/me");
  const result = await issueCode(user, "signup");
  return result.ok ? { message: "인증 코드를 다시 보냈습니다." } : { error: result.error };
}
