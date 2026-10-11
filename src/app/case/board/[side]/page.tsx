import Link from "next/link";
import { notFound } from "next/navigation";
import { Watermark, WatermarkNotice } from "@/components/Watermark";
import { canReadBoard, canWriteBoard } from "@/domain/board";
import { SIDE_LABELS } from "@/domain/case";
import { getCurrentUser } from "@/server/auth";
import { getViewer, listThreads, recordViews } from "@/server/board-service";
import { advanceDueStages } from "@/server/lifecycle";
import { db } from "@/server/db";
import { NewThreadForm } from "../forms";
import { PostView } from "../PostView";

export const metadata = { title: "진영 게시판 · Virtual Courtroom" };

const SIDES = ["indict", "dismiss"] as const;

// 03 C-05 진영 게시판 · 피드
export default async function BoardPage({ params, searchParams }: { params: Promise<{ side: string }>; searchParams: Promise<{ round?: string }> }) {
  const { side } = await params;
  if (side !== "indict" && side !== "dismiss") notFound();

  await advanceDueStages(db);
  const user = await getCurrentUser();
  const { viewer, round: currentRound, status } = await getViewer(user);
  // ?round=1: 2심이 열린 뒤 읽기 전용으로 보관된 1심 게시판 (02 2심 진행 방식)
  const requested = Number((await searchParams).round);
  const round = Number.isInteger(requested) && requested >= 1 && requested < currentRound ? requested : currentRound;
  const archived = round < currentRound;
  const query = archived ? `?round=${round}` : "";
  const readable = canReadBoard(status, viewer, side, archived);

  const tabs = (
    <nav className="flex gap-2">
      {SIDES.map((s) => {
        const open = canReadBoard(status, viewer, s, archived);
        return (
          <Link
            key={s}
            href={`/case/board/${s}${query}`}
            className={`rounded px-4 py-2 text-sm font-semibold ${s === side ? (s === "indict" ? "bg-indict text-white" : "bg-dismiss text-white") : "bg-white text-slate-700"} ${open ? "" : "opacity-50"}`}
          >
            {SIDE_LABELS[s]} 측 {open ? "" : "🔒"}
          </Link>
        );
      })}
    </nav>
  );

  if (!readable || !user) {
    const reason =
      status === "EVIDENCE" &&
      (viewer.participation?.status === "signed" || viewer.participation?.status === "advocate") &&
      viewer.participation.side !== side
        ? "증거 제출 기간에는 상대 측 게시판을 볼 수 없습니다. 기간이 끝나면 양측 게시판이 모두 공개됩니다."
        : "지금은 이 게시판을 볼 수 없습니다. 게시판은 증거 제출 기간에 서명한 배심원에게 열리고, 판결 선고 후에는 로그인한 모든 회원에게 공개됩니다.";
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <Link href="/case" className="text-sm text-slate-600 underline">
          사건 페이지로
        </Link>
        {tabs}
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-slate-700">{reason}</p>
      </div>
    );
  }

  const threads = await listThreads(round, side, viewer.isOperator);
  const code = await recordViews(user.id, threads.map((t) => t.id));
  const write = archived ? ({ ok: false } as const) : canWriteBoard(status, viewer, side);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/case" className="text-sm text-slate-600 underline">
        사건 페이지로
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {currentRound > 1 && `${round}심 `}
          {SIDE_LABELS[side]} 측 게시판
        </h1>
        <p className="text-sm text-slate-600">
          {archived
            ? "읽기 전용으로 보관된 지난 심급의 게시판입니다."
            : status === "EVIDENCE"
              ? "증거 제출 기간입니다. 이 게시판은 같은 진영 배심원만 볼 수 있습니다."
              : "증거 제출이 끝나 양측 게시판이 공개되었습니다. 이제는 읽기만 할 수 있습니다."}
        </p>
      </div>
      {tabs}
      <WatermarkNotice code={code} />

      {write.ok && <NewThreadForm side={side} />}

      <div className="relative space-y-4">
        <Watermark nickname={user.nickname} code={code} />
        {threads.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">아직 올라온 스레드가 없습니다.</p>
        ) : (
          threads.map((thread) => (
            <PostView key={thread.id} post={thread} watermarkCode={code}>
              <Link href={`/case/threads/${thread.id}`} className="text-sm font-semibold text-navy-800 underline">
                스레드 보기 · 이어진 글 {thread._count.threadAll}개
              </Link>
            </PostView>
          ))
        )}
      </div>
    </div>
  );
}
