import { redirect } from "next/navigation";
import { AuthCard } from "@/components/Card";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "로그인 · Virtual Courtroom" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/me");

  return (
    <AuthCard title="로그인">
      <LoginForm />
    </AuthCard>
  );
}
