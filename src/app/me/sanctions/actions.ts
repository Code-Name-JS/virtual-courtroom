"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { requireUser } from "@/server/auth";
import { fileAppeal } from "@/server/sanction-service";

export async function appealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const result = await fileAppeal(user.id, String(formData.get("sanctionId") ?? ""), String(formData.get("body") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/me/sanctions");
  return { message: "이의를 신청했습니다. 운영자가 3일 안에 답변합니다." };
}
