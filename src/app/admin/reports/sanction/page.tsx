import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";
import { countActiveSanctions } from "@/server/sanction-service";
import { SanctionForm } from "../forms";

export const metadata = { title: "제재 부과 · Virtual Courtroom" };

export default async function SanctionPage({ searchParams }: { searchParams: Promise<{ report?: string; user?: string }> }) {
  await requireOperator();
  const params = await searchParams;

  const report = params.report
    ? await db.report.findUnique({ where: { id: params.report }, include: { targetPost: { include: { author: true } } } })
    : null;
  const userId = report?.targetPost.author.userId ?? params.user;
  if (!userId) notFound();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) notFound();
  const prior = await countActiveSanctions(target.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/admin/reports" className="text-sm text-slate-600 underline">
        신고 · 제재로
      </Link>
      <h1 className="text-2xl font-bold">제재 부과 · {target.nickname}</h1>
      {report && (
        <blockquote className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-4 text-sm">
          <span className="text-xs text-slate-500">신고된 글</span>
          <br />
          {report.targetPost.body}
        </blockquote>
      )}
      <p className="text-sm text-slate-600">
        다중 계정은 관련된 모든 계정을 제외해야 합니다 (05). 이 화면에서 계정마다 따로 제재해 주세요.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <SanctionForm userId={target.id} reportId={report?.id} postId={report?.targetPost.id} priorSanctions={prior} />
      </div>
    </div>
  );
}
