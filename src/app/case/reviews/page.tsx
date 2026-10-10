import Link from "next/link";
import { redirect } from "next/navigation";
import { SIDE_LABELS } from "@/domain/case";
import { getReviewsView } from "@/server/appeal";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { CommentForm, ReviewForm } from "../AppealForms";

export const metadata = { title: "리뷰 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

// 03 C-11 리뷰. 로그인한 회원만 볼 수 있습니다 (03 접근 권한)
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) redirect("/login");
  const current = await db.case.findUnique({ where: { id: 1 }, select: { round: true } });
  const requested = Number((await searchParams).round);
  const round = requested === 1 || requested === 2 ? Math.min(requested, current?.round ?? 1) : (current?.round ?? 1);
  const view = await getReviewsView(db, user, round);
  if (!view) redirect("/case");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/case" className="text-sm text-slate-600 underline">
        사건 페이지로
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{round}심 리뷰</h1>
        <p className="text-sm text-slate-600">
          리뷰 {view.reviews.length}건{view.averageRating !== null && ` · 평균 별점 ${view.averageRating}`}
          {round === 1 && ` · 이의 신청 ${view.appealCount}건`}
        </p>
        <p className="text-sm text-slate-600">
          {round === 1
            ? "재판에 참여한 배심원이 쓴 리뷰입니다. 이의 신청이 담긴 리뷰가 있으면 리뷰 기간이 끝난 뒤 운영자가 2심 개시 여부를 결정합니다. 1심 리뷰에 댓글을 단 회원은 2심이 열리면 참여를 신청할 수 있습니다."
            : "2심 리뷰는 피드백으로만 받습니다. 2심 판결에는 항소할 수 없습니다."}
        </p>
      </div>
      {view.case.round > 1 && (
        <nav className="flex gap-2">
          {[1, 2].map((r) => (
            <Link key={r} href={`/case/reviews?round=${r}`} className={`rounded px-4 py-2 text-sm font-semibold ${r === round ? "bg-navy-900 text-white" : "bg-white text-slate-700"}`}>
              {r}심
            </Link>
          ))}
        </nav>
      )}

      {view.canWrite && (
        <section className="space-y-3 rounded-lg border border-gold-500 bg-white p-6">
          <h2 className="font-bold">{view.mine ? "내 리뷰 고치기" : "리뷰 쓰기"}</h2>
          <ReviewForm round={round} initial={view.mine ? { body: view.mine.body, rating: view.mine.rating, isAppeal: view.mine.isAppeal } : null} />
        </section>
      )}

      {view.reviews.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">아직 리뷰가 없습니다.</p>
      ) : (
        view.reviews.map((review) => (
          <article key={review.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <header className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{review.author.user.nickname}</span>
              <span className={`text-xs font-semibold ${review.author.side === "indict" ? "text-indict" : "text-dismiss"}`}>{SIDE_LABELS[review.author.side]} 측</span>
              {review.rating !== null && <span className="text-xs text-gold-600">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>}
              {review.isAppeal && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">이의 신청</span>}
              <span className="text-xs text-slate-500">{dateFormat.format(review.createdAt)}</span>
            </header>
            <p className="whitespace-pre-wrap leading-relaxed">{review.body}</p>
            {review.comments.length > 0 && (
              <ul className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
                {review.comments.map((comment) => (
                  <li key={comment.id}>
                    <span className="font-semibold">{comment.author.nickname}</span> <span className="text-xs text-slate-500">{dateFormat.format(comment.createdAt)}</span>
                    <p className="whitespace-pre-wrap">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {view.canComment && <CommentForm reviewId={review.id} />}
          </article>
        ))
      )}
    </div>
  );
}
