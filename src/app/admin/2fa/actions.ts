"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { confirmTotpSetup, startTotpSetup, verifyTotpForSession } from "@/server/admin-2fa";
import { requireOperator } from "@/server/auth";

export async function startTotpSetupAction(): Promise<void> {
  const { user } = await requireOperator({ allowTotpSetup: true });
  if (user.totpEnabledAt) redirect("/admin");
  await startTotpSetup(user.id);
  redirect("/admin/2fa/setup");
}

export async function confirmTotpSetupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, session } = await requireOperator({ allowTotpSetup: true });
  if (user.totpEnabledAt) redirect("/admin");
  const result = await confirmTotpSetup(user, session.id, String(formData.get("code") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect("/admin");
}

export async function verifyTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, session } = await requireOperator({ allowTotpPending: true });
  const result = await verifyTotpForSession(user, session.id, String(formData.get("code") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect("/admin");
}
