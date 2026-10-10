import Link from "next/link";
import { notFound } from "next/navigation";
import { Watermark, WatermarkNotice } from "@/components/Watermark";
import { canReadBoard, canWriteBoard } from "@/domain/board";
import { SIDE_LABELS } from "@/domain/case";
import { getCurrentUser } from "@/server/auth";
import { getThread, getViewer, recordViews } from "@/server/board-service";
import { deletePostAction } from "../../board/actions";
import { EditPostForm, ReplyForm, ReportForm } from "../../board/forms";
import { PostView } from "../../board/PostView";

export const metadata = { title: "스레드 · Virtual Courtroom" };

// 03 C-06 스레드 상세
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const { viewer, status, round } = await getViewer(user);
  const thread = await getThread(id, viewer.isOperator);
  // 지난 심급의 스레드는 읽기 전용으로 보관 (02 2심 진행 방식)
  const archived = thread !== null && thread.root.round < round;
  if (!thread || !user || !canReadBoard(status, viewer, thread.root.side, archived)) notFound();

  const side = thread.root.side;
  const posts = [thread.root, ...thread.replies];
  const code = await recordViews(user.id, posts.map((p) => p.id));
  const write = archived ? ({ ok: false } as const) : canWriteBoard(status, viewer, side);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href={`/case/board/${side}${archived ? `?round=${thread.root.round}` : ""}`} className="text-sm text-slate-600 underline">
        {archived && `${thread.root.round}심 `}
        {SIDE_LABELS[side]} 측 게시판으로
      </Link>
      <WatermarkNotice code={code} />
      <div className="relative space-y-4">
        <Watermark nickname={user.nickname} code={code} />
        {posts.map((post) => {
          const mine = post.author.user.nickname === user.nickname;
          return (
            <PostView key={post.id} post={post}>
              {mine && write.ok && !post.isHidden && (
                <>
                  <EditPostForm postId={post.id} body={post.body} />
                  <form action={deletePostAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button className="text-sm text-slate-500 hover:text-red-700">삭제</button>
                  </form>
                </>
              )}
              {!mine && !viewer.isOperator && <ReportForm postId={post.id} />}
            </PostView>
          );
        })}
      </div>
      {write.ok && <ReplyForm side={side} parentPostId={posts[posts.length - 1].id} />}
    </div>
  );
}
