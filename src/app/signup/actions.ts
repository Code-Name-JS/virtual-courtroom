"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { firstError, signupSchema } from "@/domain/account";
import { signUp } from "@/server/accounts";
import { MissingClientIpError, requireClientIpHash } from "@/server/ip";
import { createSession } from "@/server/session";

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };

  let userId: string;
  try {
    const result = await signUp(parsed.data, await requireClientIpHash());
    if (!result.ok) return { error: result.error };
    userId = result.value.userId;
  } catch (error) {
    if (error instanceof MissingClientIpError) return { error: error.message };
    throw error;
  }

  await createSession(userId);
  redirect("/verify-email");
}
