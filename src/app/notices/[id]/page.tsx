import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = await db.notice.findUnique({ where: { id } });
  if (!notice) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/notices" className="text-sm text-slate-600 underline">
        공지사항 목록
      </Link>
      <header className="space-y-1 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold">{notice.title}</h1>
        <p className="text-sm text-slate-500">{dateFormat.format(notice.publishedAt)}</p>
      </header>
      <p className="whitespace-pre-wrap leading-relaxed">{notice.body}</p>
    </article>
  );
}
