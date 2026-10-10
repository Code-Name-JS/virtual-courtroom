"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SanctionLevel, Violation } from "@prisma/client";
import type { FormState } from "@/components/form";
import { SANCTION_LABELS, VIOLATION_LABELS } from "@/domain/board";
import { requireOperator } from "@/server/auth";
import { decideAppeal, issueSanction, rejectReport } from "@/server/sanction-service";

const VIOLATIONS = Object.keys(VIOLATION_LABELS) as Violation[];
const LEVELS = Object.keys(SANCTION_LABELS) as SanctionLevel[];

export async function sanctionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireOperator();
  const violation = String(formData.get("violation")) as Violation;
  const level = String(formData.get("level")) as SanctionLevel;
  if (!VIOLATIONS.includes(violation) || !LEVELS.includes(level)) return { error: "위반 유형과 제재 단계를 골라 주세요." };

  const reportId = String(formData.get("reportId") ?? "") || undefined;
  const result = await issueSanction(user.id, {
    userId: String(formData.get("userId") ?? ""),
    violation,
    level,
    reason: String(formData.get("reason") ?? ""),
    reportId,
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
