"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SanctionLevel, Violation } from "@prisma/client";
import type { FormState } from "@/components/form";
import { SANCTION_LABELS, VIOLATION_LABELS } from "@/domain/board";
import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";
import { dismissDetection, recordWatermarkMatch } from "@/server/leak-detection";
import { decideAppeal, issueSanction, rejectReport } from "@/server/sanction-service";

const VIOLATIONS = Object.keys(VIOLATION_LABELS) as Violation[];
const LEVELS = Object.keys(SANCTION_LABELS) as SanctionLevel[];

export async function sanctionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOperator();
  const violation = String(formData.get("violation")) as Violation;
  const level = String(formData.get("level")) as SanctionLevel;
  if (!VIOLATIONS.includes(violation) || !LEVELS.includes(level)) return { error: "위반 유형과 제재 단계를 골라 주세요." };

  const reportId = String(formData.get("reportId") ?? "") || undefined;
  const detectionId = String(formData.get("detectionId") ?? "") || undefined;
  const result = await issueSanction(user.id, {
    userId: String(formData.get("userId") ?? ""),
    violation,
    level,
    reason: String(formData.get("reason") ?? ""),
    reportId,
    detectionId,
    hidePostId: formData.get("hidePost") === "on" ? String(formData.get("postId") ?? "") || undefined : undefined,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/reports");
  redirect("/admin/reports");
}

export async function rejectReportAction(formData: FormData): Promise<void> {
  const { user } = await requireOperator();
  await rejectReport(user.id, String(formData.get("reportId") ?? ""), String(formData.get("note") ?? ""));
  revalidatePath("/admin/reports");
}

export async function decideAppealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOperator();
  const result = await decideAppeal(user.id, String(formData.get("appealId") ?? ""), formData.get("decision") === "accept", String(formData.get("note") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/reports");
  return { message: "처리했습니다." };
}

// M7 자동 탐지 결과: 확인해 보니 문제가 없으면 기각 (이유는 기록으로 남음)
export async function dismissDetectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOperator();
  const result = await dismissDetection(db, user.id, String(formData.get("detectionId") ?? ""), String(formData.get("note") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/reports");
  return { message: "제재하지 않음으로 처리했습니다." };
}

/** 워터마크 코드로 찾은 열람자를 탐지 결과(워터마크 일치)로 남기고 제재 화면으로 갑니다. 제재 기록에 근거로 연결됩니다. */
export async function watermarkSanctionAction(formData: FormData): Promise<void> {
  await requireOperator();
  const result = await recordWatermarkMatch(db, String(formData.get("code") ?? ""));
  if (!result.ok) redirect("/admin/reports");
  redirect(`/admin/reports/sanction?detection=${result.value.detectionId}`);
}
