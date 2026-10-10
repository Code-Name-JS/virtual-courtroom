"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { requireUser } from "@/server/auth";
import { castIndictmentVote, signPretrial } from "@/server/case-service";
import { castVerdict, nominate, submitFinalArgument } from "@/server/trial-service";
import { applyForRound2, chooseRound2, commentOnReview, writeReview } from "@/server/appeal";
import { db } from "@/server/db";

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

// 03 C-11 리뷰
export async function reviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const ratingRaw = String(formData.get("rating") ?? "");
  const result = await writeReview(db, user, {
    body: String(formData.get("body") ?? ""),
    rating: ratingRaw ? Number(ratingRaw) : null,
    isAppeal: formData.get("isAppeal") === "on",
  });
  if (!result.ok) {
    revalidatePath("/case/reviews");
    return { error: result.error };
  }
  revalidatePath("/case", "layout");
  return { message: "리뷰를 저장했습니다. 리뷰 기간이 끝나기 전까지는 고칠 수 있습니다." };
}

export async function commentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const result = await commentOnReview(db, user, String(formData.get("reviewId") ?? ""), String(formData.get("body") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/case/reviews");
  return { message: "댓글을 남겼습니다." };
}

// 03 C-12 2심 참여
export async function chooseRound2Action(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const choice = formData.get("choice");
  if (choice !== "join" && choice !== "decline") return { error: "참여 또는 불참을 골라 주세요." };
  const result = await chooseRound2(db, user.id, choice === "join");
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: choice === "join" ? "2심에 참여합니다. 1심 진영을 그대로 유지합니다." : "2심에 참여하지 않기로 했습니다." };
}

export async function applyRound2Action(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const side = formData.get("side");
  if (side !== "indict" && side !== "dismiss") return { error: "진영을 골라 주세요." };
  const result = await applyForRound2(db, user, side);
  if (!result.ok) return { error: result.error };
  revalidatePath("/case");
  return { message: "2심 참여를 신청했습니다. 신청 마감 후 승인 기준이 적용됩니다." };
}
