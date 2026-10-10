"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { requireUser } from "@/server/auth";
import { castIndictmentVote, signPretrial } from "@/server/case-service";

export async function voteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const choice = formData.get("choice");
  if (choice !== "indict" && choice !== "dismiss") return { error: "공소 제기 또는 불기소 중 하나를 골라 주세요." };

  const result = await castIndictmentVote(user, choice);
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: "투표했습니다. 마감 후 결과가 공개됩니다." };
}

export async function signAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  if (formData.get("agree") !== "on") return { error: "내용을 확인하고 동의해 주세요." };
  const result = await signPretrial(user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: "서명했습니다." };
}
