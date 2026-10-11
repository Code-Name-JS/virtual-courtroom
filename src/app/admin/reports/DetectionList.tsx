import Link from "next/link";
import { SIDE_LABELS } from "@/domain/case";
import { DETECTION_LABELS, VIEW_REASON_LABELS, type Segment, markCopied } from "@/domain/leak";
import { db } from "@/server/db";
import { type ViewDetail, listHandledDetections, listOpenDetections, listSourceViewers, publicShingles } from "@/server/leak-detection";
import { DismissDetectionForm } from "./forms";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Seoul" });

type Detection = Awaited<ReturnType<typeof listOpenDetections>>[number] & { handler?: { nickname: string } | null };
type DetectionPost = NonNullable<Detection["targetPost"]>;

function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((seg, i) => (seg.copied ? <mark key={i} className="bg-amber-200">{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
    </p>
  );
}

function PostBox({ title, post, segments }: { title: string; post: DetectionPost; segments: Segment[] }) {
  return (
    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">
        {title} · {post.round}심 {SIDE_LABELS[post.side]} 측 · {post.author.user.nickname}님 · {dateFormat.format(post.createdAt)}
        {post.isHidden && " · 숨김"}
      </p>
      <Highlighted segments={segments} />
    </div>
  );
}

async function CopyEvidence({ detection }: { detection: Detection }) {
  const { targetPost: target, sourcePost: source } = detection;
  if (!target || !source) return <p className="text-sm text-slate-600">비교한 글이 남아 있지 않습니다.</p>;
  const [exclude, viewers] = await Promise.all([publicShingles(db, target.round), listSourceViewers(db, source.id, detection.detectedAt)]);
  const shared = (detection.detail as { shared?: number } | null)?.shared;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        의심 글의 <strong>{detection.score}%</strong>가 상대 측 원본과 같습니다{shared ? ` (겹친 6글자 묶음 ${shared}개)` : ""}. 겹친 부분을 노란색으로 표시했습니다. 사건 본문처럼
        양측이 함께 볼 수 있는 문장은 비교에서 뺐습니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <PostBox title="의심 글" post={target} segments={markCopied(target.body, source.body, exclude)} />
        <PostBox title="원본" post={source} segments={markCopied(source.body, target.body, exclude)} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">의심 글이 올라오기 전에 원본을 열람한 회원 ({viewers.length}명{viewers.length === 30 ? " 이상" : ""})</summary>
        <p className="mt-2 text-xs text-slate-500">
          이 중에 정보를 전달한 사람이 있을 수 있지만, 열람했다는 것만으로는 유출의 근거가 되지 않습니다. 워터마크나 신고 등 다른 근거와 함께 판단해 주세요.
        </p>
        <ul className="mt-2 space-y-1">
          {viewers.map((v) => (
            <li key={v.userId} className="flex flex-wrap gap-2">
              <span>{v.nickname}</span>
              <span className="text-slate-500">
                {v.views}번 · 처음 {v.firstAt ? dateFormat.format(v.firstAt) : "-"}
              </span>
              <Link href={`/admin/reports/sanction?detection=${detection.id}&user=${v.userId}`} className="text-red-700 underline">
                유출로 제재
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ViewEvidence({ detection }: { detection: Detection }) {
  const detail = detection.detail as ViewDetail | null;
  if (!detail) return null;
  return (
    <div className="space-y-2 text-sm">
      <p>
        {detail.firstAt && dateFormat.format(new Date(detail.firstAt))} ~ {detail.lastAt && dateFormat.format(new Date(detail.lastAt))} 동안 게시판·스레드 화면을{" "}
        <strong>{detail.pageViews}번</strong> 열어 글 {detail.distinctPosts}개를 열람했습니다. 화면을 연 간격의 중간값은{" "}
        {detail.medianIntervalMs === null ? "-" : `${(detail.medianIntervalMs / 1000).toFixed(1)}초`}입니다.
      </p>
      <ul className="list-inside list-disc text-slate-700">
        {detail.reasons.map((r) => (
          <li key={r}>{VIEW_REASON_LABELS[r]}</li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">빠르게 넘겨 읽는 사람도 있습니다. 대량 유출로 제재하려면 퍼진 캡처의 워터마크나 신고 같은 근거도 함께 확인해 주세요.</p>
    </div>
  );
}

function WatermarkEvidence({ detection }: { detection: Detection }) {
  const detail = detection.detail as { code?: string; viewedAt?: string; side?: "indict" | "dismiss" } | null;
  return (
    <p className="text-sm">
      코드 <span className="font-mono">{detail?.code}</span>: {detection.suspect?.nickname ?? "(알 수 없음)"}님이 {detail?.viewedAt && dateFormat.format(new Date(detail.viewedAt))}에{" "}
      {detail?.side && `${SIDE_LABELS[detail.side]} 측 `}글 {detection.score}개를 열람한 화면입니다.
    </p>
  );
}

const STATUS_LABELS = { open: "처리 전", confirmed: "제재함", dismissed: "제재하지 않음" } as const;

function DetectionCard({ detection }: { detection: Detection }) {
  const open = detection.status === "open";
  return (
    <article className={`space-y-3 rounded-lg border bg-white p-5 ${open ? "border-amber-200" : "border-slate-200"}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">{DETECTION_LABELS[detection.type]}</span>
        <span>{detection.suspect ? `${detection.suspect.nickname}님` : "회원 정보 없음"}</span>
        <span className="text-xs text-slate-500">
          탐지 번호 <span className="font-mono">{detection.id.slice(0, 8)}</span> · {dateFormat.format(detection.detectedAt)}
        </span>
      </p>
      {!open && (
        <p className="rounded bg-slate-50 px-3 py-2 text-sm">
          {STATUS_LABELS[detection.status]} · {detection.handler?.nickname ?? "운영자"} · {detection.handledAt && dateFormat.format(detection.handledAt)} · {detection.resolutionNote}
        </p>
      )}
      {detection.type === "copy_similarity" && <CopyEvidence detection={detection} />}
      {detection.type === "abnormal_view" && <ViewEvidence detection={detection} />}
      {detection.type === "watermark_match" && <WatermarkEvidence detection={detection} />}
      {open && (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
          {detection.suspectUserId && (
            <Link href={`/admin/reports/sanction?detection=${detection.id}`} className="rounded bg-red-700 px-3 py-2 text-center text-sm font-semibold text-white">
              {detection.type === "copy_similarity" ? "올린 사람 제재하기" : "제재하기"}
            </Link>
          )}
          <DismissDetectionForm detectionId={detection.id} />
        </div>
      )}
    </article>
  );
}

// 03 O-05 탐지 결과 (M7). 근거를 보여 주고, 제재는 운영자가 확인한 뒤에만 합니다 (05).
export async function DetectionList() {
  const [detections, handled] = await Promise.all([listOpenDetections(db), listHandledDetections(db)]);
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">자동 탐지 결과 ({detections.length}건)</h2>
      <p className="text-sm text-slate-600">
        복사 글은 글이 올라오거나 고쳐질 때, 비정상 열람은 워커가 1분마다 찾습니다. 탐지만으로는 제재하지 않습니다. 근거를 확인해 제재하거나, 문제가 없으면 이유를 남기고 기각해 주세요.
      </p>
      {detections.length === 0 && <p className="text-sm text-slate-600">처리할 탐지 결과가 없습니다.</p>}
      {detections.map((detection) => (
        <DetectionCard key={detection.id} detection={detection} />
      ))}
      {handled.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-medium">처리한 탐지 결과 (최근 {handled.length}건)</summary>
          <div className="mt-3 space-y-3">
            {handled.map((detection) => (
              <DetectionCard key={detection.id} detection={detection} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
