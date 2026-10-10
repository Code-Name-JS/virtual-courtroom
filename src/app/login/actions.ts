"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { firstError, loginSchema } from "@/domain/account";
import { logIn } from "@/server/accounts";
import { MissingClientIpError, requireClientIpHash } from "@/server/ip";
import { createSession } from "@/server/session";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };

  let userId: string;
  try {
    const result = await logIn(parsed.data.email, parsed.data.password, await requireClientIpHash());
    if (!result.ok) return { error: result.error };
    userId = result.value.userId;
  } catch (error) {
    if (error instanceof MissingClientIpError) return { error: error.message };
    throw error;
  }

  await createSession(userId);
  // 이메일 인증이나 IP 변경 인증이 필요하면 /me에서 알맞은 화면으로 보냄
  redirect("/me");
}
