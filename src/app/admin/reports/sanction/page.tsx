import type { Violation } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VIOLATION_LABELS } from "@/domain/board";
import { DETECTION_LABELS, DETECTION_VIOLATION } from "@/domain/leak";
import { requireOperator } from "@/server/auth";
import { db } from "@/server/db";
import { countActiveSanctions } from "@/server/sanction-service";
import { SanctionForm } from "../forms";

export const metadata = { title: "제재 부과 · Virtual Courtroom" };

const VIOLATIONS = Object.keys(VIOLATION_LABELS) as Violation[];

/**
 * ?report=: 신고를 근거로 글쓴이를 제재
 * ?detection=: 자동 탐지 결과를 근거로 제재 (M7). &user=를 붙이면 탐지된 사람 대신 그 회원을 제재 (복사 글의 원본을 전달한 사람 등)
 * ?user=: 근거 없이 회원을 제재 (다중 계정 의심 등). &violation=으로 위반 유형을 먼저 골라 둘 수 있음
 */
export default async function SanctionPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; detection?: string; user?: string; violation?: string }>;
}) {
  await requireOperator();
  const params = await searchParams;

  const report = params.report
    ? await db.report.findUnique({ where: { id: params.report }, include: { targetPost: { include: { author: true } } } })
    : null;
  const detection = params.detection
    ? await db.leakDetection.findUnique({ where: { id: params.detection }, include: { targetPost: { include: { author: true } } } })
    : null;
  if (params.detection && !detection) notFound();

  const userId = report?.targetPost.author.userId ?? params.user ?? detection?.suspectUserId;
  if (!userId) notFound();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) notFound();
  const prior = await countActiveSanctions(target.id);

  // 탐지된 글을 올린 사람을 제재할 때만 그 글을 숨길 수 있게 함
  const detectionPost = detection?.targetPost && detection.targetPost.author.userId === target.id ? detection.targetPost : null;
  const post = report?.targetPost ?? detectionPost;
  // 복사 글 탐지에서 올린 사람이 아닌 회원(원본을 전달한 사람)을 제재하면 '유출'
  const detectionViolation = detection ? (detection.type === "copy_similarity" && !detectionPost ? "leak" : DETECTION_VIOLATION[detection.type]) : undefined;
  const requested = VIOLATIONS.find((v) => v === params.violation);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/admin/reports" className="text-sm text-slate-600 underline">
        신고 · 제재로
      </Link>
      <h1 className="text-2xl font-bold">제재 부과 · {target.nickname}</h1>
      {detection && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          근거: 자동 탐지 「{DETECTION_LABELS[detection.type]}」 (탐지 번호 <span className="font-mono">{detection.id.slice(0, 8)}</span>). 탐지 결과만으로 제재하지 않습니다. 근거를 확인한 뒤 부과해 주세요 (05).
        </p>
      )}
      {post && (
        <blockquote className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-4 text-sm">
          <span className="text-xs text-slate-500">{report ? "신고된 글" : "탐지된 글"}</span>
          <br />
          {post.body}
        </blockquote>
      )}
      <p className="text-sm text-slate-600">
        다중 계정은 관련된 모든 계정을 제외해야 합니다 (05). 이 화면에서 계정마다 따로 제재해 주세요.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <SanctionForm
          userId={target.id}
          reportId={report?.id}
          detectionId={detection?.id}
          postId={post?.id}
          priorSanctions={prior}
          defaultViolation={requested ?? detectionViolation}
          defaultClearEvidence={detection?.type === "watermark_match"}
        />
      </div>
    </div>
  );
}
