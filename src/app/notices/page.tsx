import Link from "next/link";
import { db } from "@/server/db";

export const metadata = { title: "공지사항 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

// 03 N-01 공지사항
export default async function NoticesPage() {
  const notices = await db.notice.findMany({ orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }] });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">공지사항</h1>
      {notices.length === 0 ? (
        <p className="text-slate-600">아직 공지가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link href={`/notices/${notice.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                <span className="font-medium">
                  {notice.isPinned && <span className="mr-2 rounded bg-gold-500/15 px-1.5 py-0.5 text-xs text-gold-600">고정</span>}
                  {notice.title}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{dateFormat.format(notice.publishedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
