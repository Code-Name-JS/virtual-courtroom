"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { EVIDENCE_PER_POST, type EvidenceInput } from "@/domain/board";
import { requireUser } from "@/server/auth";
import { createPost, deletePost, editPost, reportPost } from "@/server/board-service";

function parseSide(value: FormDataEntryValue | null) {
  return value === "indict" || value === "dismiss" ? value : null;
}

function parseEvidence(formData: FormData): EvidenceInput[] {
  const items: EvidenceInput[] = [];
  for (let i = 0; i < EVIDENCE_PER_POST; i++) {
    const value = String(formData.get(`evidence_value_${i}`) ?? "").trim();
    if (!value) continue;
    items.push({
      type: formData.get(`evidence_type_${i}`) === "text" ? "text" : "link",
      value,
      source: String(formData.get(`evidence_source_${i}`) ?? ""),
    });
  }
  return items;
}

export async function createThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const side = parseSide(formData.get("side"));
  if (!side) return { error: "게시판을 찾을 수 없습니다." };
  const result = await createPost(user, { side, body: String(formData.get("body") ?? ""), evidence: parseEvidence(formData) });
  if (!result.ok) return { error: result.error };
  redirect(`/case/threads/${result.value.rootId}`);
}

export async function replyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const side = parseSide(formData.get("side"));
  const parentPostId = String(formData.get("parentPostId") ?? "");
  if (!side || !parentPostId) return { error: "답글을 달 글을 찾을 수 없습니다." };
  const result = await createPost(user, { side, body: String(formData.get("body") ?? ""), evidence: parseEvidence(formData), parentPostId });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/case/threads/${result.value.rootId}`);
  return { message: "답글을 올렸습니다." };
}

export async function editPostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const result = await editPost(user, String(formData.get("postId") ?? ""), String(formData.get("body") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/case/threads/${result.value.rootId}`);
  return { message: "고쳤습니다. 고치기 전 내용은 기록으로 남습니다." };
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const result = await deletePost(user, String(formData.get("postId") ?? ""));
  if (!result.ok) return;
  if (result.value.rootId) {
    revalidatePath(`/case/threads/${result.value.rootId}`);
    return;
  }
  redirect("/case");
}

export async function reportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const reason = formData.get("reason");
  if (reason !== "leak" && reason !== "abuse" && reason !== "other") return { error: "신고 이유를 골라 주세요." };
  const result = await reportPost(user, String(formData.get("postId") ?? ""), reason, String(formData.get("detail") ?? ""));
  return result.ok ? { message: "신고했습니다. 운영자가 확인합니다." } : { error: result.error };
}
