"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { firstError, guardianSchema, isActiveMember } from "@/domain/account";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { changeGuardianAndResend, sendGuardianRequest } from "@/server/guardian";

export async function resendGuardianAction(_prev: FormState): Promise<FormState> {
  const { user } = await requireUser({ allowPendingGuardian: true });
  if (isActiveMember(user)) redirect("/me");
  const result = await sendGuardianRequest(db, user.id);
  return result.ok ? { message: "법정대리인에게 동의 요청 이메일을 다시 보냈습니다." } : { error: result.error };
}

export async function changeGuardianAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser({ allowPendingGuardian: true });
  if (isActiveMember(user)) redirect("/me");
  const parsed = guardianSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const result = await changeGuardianAndResend(db, user.id, { name: parsed.data.guardianName, email: parsed.data.guardianEmail });
  return result.ok ? { message: "법정대리인 정보를 고치고 동의 요청 이메일을 보냈습니다." } : { error: result.error };
}
