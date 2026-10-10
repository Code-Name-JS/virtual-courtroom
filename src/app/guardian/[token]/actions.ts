"use server";

import type { FormState } from "@/components/form";
import { db } from "@/server/db";
import { respondToConsent } from "@/server/guardian";

// 03 U-08 법정대리인 동의. 로그인 없이 이메일 링크의 토큰으로만 확인합니다
export async function respondConsentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const choice = formData.get("choice");
  if (choice !== "agree" && choice !== "refuse") return { error: "동의 또는 거부를 골라 주세요." };
  const result = await respondToConsent(db, token, choice === "agree");
  if (!result.ok) return { error: result.error };
  return result.agreed
    ? { message: "동의해 주셔서 감사합니다. 자녀의 가입이 완료되었습니다. 동의를 철회하려면 개인정보처리방침의 운영자 연락처로 알려 주세요." }
    : { message: "동의하지 않으셨습니다. 가입 신청은 취소되었고, 자녀와 법정대리인의 정보는 모두 삭제되었습니다." };
}
