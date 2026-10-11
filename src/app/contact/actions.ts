"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { isInquiryCategory } from "@/domain/inquiry";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { submitInquiry } from "@/server/inquiry";

export async function inquiryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const category = formData.get("category");
  if (!isInquiryCategory(category)) return { error: "문의 종류를 골라 주세요." };
  const result = await submitInquiry(db, user, { category, body: String(formData.get("body") ?? "") });
  if (!result.ok) return { error: result.error };
  revalidatePath("/contact");
  return { message: "문의를 남겼습니다. 운영자가 답하면 알림과 이메일로 알려 드립니다." };
}
