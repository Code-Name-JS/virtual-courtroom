import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";

export const metadata = { title: "관리자 · Virtual Courtroom" };

// 03 O-01 대시보드. 사건 관리 기능은 M1부터 추가
export default async function AdminPage() {
  await requireOperator();
  const [members, verified] = await Promise.all([db.user.count(), db.user.count({ where: { emailVerifiedAt: { not: null } } })]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">관리자 대시보드</h1>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">가입한 회원</p>
          <p className="text-2xl font-bold">{members}명</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">이메일 인증을 마친 회원</p>
          <p className="text-2xl font-bold">{verified}명</p>
        </div>
      </section>
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        사건 생성·검수와 사건 관리 기능은 다음 단계(M1)에서 추가됩니다.
      </section>
    </div>
  );
}
