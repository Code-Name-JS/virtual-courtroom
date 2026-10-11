"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";
import { answerInquiry } from "@/server/inquiry";

export async function answerInquiryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOperator();
  const result = await answerInquiry(db, user.id, String(formData.get("inquiryId") ?? ""), String(formData.get("answer") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/inquiries");
  return { message: "답변을 보냈습니다." };
}
