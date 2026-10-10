import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { getCurrentUser } from "@/server/auth";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "회원가입 · Virtual Courtroom" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/me");

  return (
    <AuthCard title="회원가입" description="가입 후 이메일로 받은 인증 코드를 입력하면 배심원으로 참여할 수 있습니다.">
      <SignupForm />
    </AuthCard>
  );
}
