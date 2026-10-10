"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { type ChecklistKey, type DurationInput, MVP_STAGES, REVIEW_CHECKLIST } from "@/domain/case";
import { requireOperator } from "@/server/auth";
import { publishCase, saveDraft } from "@/server/case-service";
import { env } from "@/server/env";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function parseDraft(formData: FormData) {
  // 시연 모드에서는 분 단위, 실제 운영에서는 일 단위로 입력받음
  const unit = env.demoMode ? 1 : 24 * 60;
  const durations = Object.fromEntries(
    MVP_STAGES.map(({ stage }) => [stage, Math.round(Number(formData.get(`duration_${stage}`)) * unit)]),
  ) as DurationInput;
  const maxRaw = text(formData, "maxParticipants");
  const generatedAt = text(formData, "aiGeneratedAt");
  const validKeys = new Set<string>(REVIEW_CHECKLIST.map((item) => item.key));

  return {
    title: text(formData, "title"),
    summary: text(formData, "summary"),
    body: text(formData, "body"),
    aiOriginalBody: text(formData, "aiOriginalBody"),
    aiModel: text(formData, "aiModel"),
    // datetime-local 값은 한국 시간으로 입력받음
    aiGeneratedAt: generatedAt ? new Date(`${generatedAt}:00+09:00`) : null,
    minParticipants: Number(formData.get("minParticipants")),
    maxParticipants: maxRaw ? Number(maxRaw) : null,
    durations,
    checklist: formData.getAll("checklist").map(String).filter((key) => validKeys.has(key)) as ChecklistKey[],
    reviewNote: text(formData, "reviewNote"),
  };
}

export async function saveDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOperator();
  const draft = parseDraft(formData);
  if (!draft.title || !draft.summary) return { error: "사건명과 사건 개요를 입력해 주세요." };

  const result = await saveDraft(draft);
  if (!result.ok) return { error: result.error };

  if (formData.get("intent") === "publish") {
    const { user } = await requireOperator();
    const published = await publishCase(user.id);
    if (!published.ok) {
      revalidatePath("/admin/case");
      return { error: `저장은 되었지만 게시하지 못했습니다. ${published.error}` };
    }
    revalidatePath("/", "layout");
    return { message: "사건을 게시했습니다. 공소 투표가 시작되었고 \"AI가 만든 사건\" 공지가 올라갔습니다." };
  }

  revalidatePath("/admin/case");
  return { message: "저장했습니다. 게시 전까지는 계속 고칠 수 있습니다." };
}
