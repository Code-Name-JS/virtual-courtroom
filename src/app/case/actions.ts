"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { requireUser } from "@/server/auth";
import { castIndictmentVote, signPretrial } from "@/server/case-service";
import { castVerdict, nominate, submitFinalArgument } from "@/server/trial-service";

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

export async function nominateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const result = await nominate(user.id, String(formData.get("candidateId") ?? ""), String(formData.get("reason") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: "추천했습니다. 결과는 추천 투표가 끝난 뒤 공개됩니다." };
}

export async function finalArgumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const result = await submitFinalArgument(user.id, String(formData.get("body") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: "최종 변론을 제출했습니다. 마감 전까지는 고칠 수 있습니다." };
}

export async function verdictAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const choice = formData.get("choice");
  if (choice !== "guilty" && choice !== "not_guilty") return { error: "유죄 또는 무죄를 골라 주세요." };
  const result = await castVerdict(user.id, choice);
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: "평결했습니다." };
}
