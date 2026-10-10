import type { Evidence } from "@prisma/client";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

type PostLike = {
  body: string;
  createdAt: Date;
  isHidden: boolean;
  hiddenReason: string | null;
  author: { user: { nickname: string } };
  evidence: Evidence[];
  revisions?: unknown[];
};

export function PostView({ post, children }: { post: PostLike; children?: React.ReactNode }) {
  return (
    <article className={`space-y-3 rounded-lg border bg-white p-5 ${post.isHidden ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{post.author.user.nickname}</span>
        <span className="text-xs text-slate-500">{dateFormat.format(post.createdAt)}</span>
        {post.revisions && post.revisions.length > 0 && <span className="text-xs text-slate-400">(수정됨)</span>}
        {post.isHidden && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">숨김 · {post.hiddenReason}</span>}
      </header>
      <p className="whitespace-pre-wrap leading-relaxed">{post.body}</p>
      {post.evidence.length > 0 && (
        <ul className="space-y-1 rounded bg-slate-50 p-3 text-sm">
          {post.evidence.map((item) => (
            <li key={item.id}>
              {item.type === "link" ? (
                <a href={item.urlOrFileKey} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-navy-800 underline">
                  {item.urlOrFileKey}
                </a>
              ) : (
                <span>
                  &ldquo;{item.urlOrFileKey}&rdquo; <span className="text-slate-500">— {item.sourceNote}</span>
                </span>
              )}
              {item.type === "link" && item.sourceNote && <span className="text-slate-500"> — {item.sourceNote}</span>}
            </li>
          ))}
        </ul>
      )}
      {children && <footer className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">{children}</footer>}
    </article>
  );
}
