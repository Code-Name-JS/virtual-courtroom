import Link from "next/link";
import { requireUser } from "@/server/auth";

export const metadata = { title: "내 활동 · Virtual Courtroom" };

// 03 U-03 내 활동. 사건 참여 정보는 M1 이후에 추가
export default async function MePage() {
  const { user } = await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">내 활동</h1>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">계정</h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">닉네임</dt>
          <dd>{user.nickname}</dd>
          <dt className="text-slate-500">이메일</dt>
          <dd>{user.email}</dd>
          <dt className="text-slate-500">권한</dt>
          <dd>{user.role === "operator" ? "운영자" : "회원"}</dd>
        </dl>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">내 진영 · 지금 할 일</h2>
        <p className="text-sm text-slate-600">아직 공개된 사건이 없습니다. 사건이 공개되면 이곳에서 내 진영과 지금 해야 할 일을 확인할 수 있습니다.</p>
      </section>

      {user.role === "operator" && (
        <Link href="/admin" className="inline-block rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800">
          관리자 영역으로 가기
        </Link>
      )}
    </div>
  );
}
