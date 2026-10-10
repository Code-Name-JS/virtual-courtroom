"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { codeSchema, firstError } from "@/domain/account";
import { confirmIpChange, requestIpChange } from "@/server/accounts";
import { requireUser } from "@/server/auth";

export async function requestIpCodeAction(_prev: FormState): Promise<FormState> {
  const { user, ipHash, ipMatches } = await requireUser({ allowIpMismatch: true });
  if (ipMatches) redirect("/me");
  const result = await requestIpChange(user, ipHash);
  return result.ok ? { message: "인증 코드를 이메일로 보냈습니다." } : { error: result.error };
}

export async function confirmIpCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, ipHash, ipMatches } = await requireUser({ allowIpMismatch: true });
  if (ipMatches) redirect("/me");
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: firstError(code.error) };

  const result = await confirmIpChange(user.id, code.data, ipHash);
  if (!result.ok) return { error: result.error };
  redirect("/me");
}
