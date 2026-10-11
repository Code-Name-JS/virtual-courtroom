import type { CaseStatus } from "@prisma/client";
import Link from "next/link";
import { STATUS_LABELS } from "@/domain/case";
import { requireOperator } from "@/server/auth";
import { getCase } from "@/server/case-service";
import { listPendingAppeals, listReports } from "@/server/sanction-service";
import { db } from "@/server/db";
import { countOpenInquiries } from "@/server/inquiry";
import { countOpenDetections } from "@/server/leak-detection";
import { advanceDueStages } from "@/server/lifecycle";

export const metadata = { title: "관리자 · Virtual Courtroom" };

/** 운영자가 처리해야 넘어가는 단계와 할 일 (03 O-01) */
const OPERATOR_TODO: Partial<Record<CaseStatus, string>> = {
  INDICTMENT_PENDING: "공소를 제기해 재판을 시작해 주세요.",
  ADVOCATE_SELECTION: "추천 투표가 끝나면 진영별 최종 변론인을 단 한 번 선정해 주세요.",
  SENTENCING: "평결을 참고해 판결을 작성하고 선고해 주세요.",
  APPEAL_DECISION: "이의 신청이 담긴 리뷰를 확인하고 2심 개시 또는 기각을 결정해 주세요.",
};

// 03 O-01 대시보드
export default async function AdminPage() {
  await requireOperator();
  // 워커가 없어도 마감이 지난 단계가 넘어가도록 (사건 페이지와 같은 방식)
  await advanceDueStages(db);
  const [members, verified, current, reports, appeals, detections, inquiries] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { emailVerifiedAt: { not: null } } }),
    getCase(),
    listReports(),
    listPendingAppeals(),
    countOpenDetections(db),
    countOpenInquiries(db),
  ]);
  const ended = current?.status === "DISMISSED" || current?.status === "FINALIZED";
  const todo =
    !current || current.status === "DRAFT"
      ? "사건을 만들어 검수한 뒤 게시해 주세요."
      : ended
        ? current.closureScheduledAt
          ? "공지한 폐쇄 일시가 지나면 사건 관리 화면에서 사이트 폐쇄를 실행해 주세요."
          : "사건이 끝났습니다. 사건 관리 화면에서 사이트 폐쇄 일시를 공지해 주세요."
        : (OPERATOR_TODO[current.status] ?? null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">관리자 대시보드</h1>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">가입한 회원</p>
          <p className="text-2xl font-bold">{members}명</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">이메일 인증을 마친 회원</p>
          <p className="text-2xl font-bold">{verified}명</p>
        </div>
      </section>
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">운영자의 조치가 필요한 일</h2>
        <p className="text-sm">
          사건 상태: <strong>{current ? STATUS_LABELS[current.status] : "사건 없음"}</strong>
        </p>
        {todo ? <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{todo}</p> : <p className="text-sm text-slate-600">지금은 조치할 일이 없습니다.</p>}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/case" className="inline-block rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800">
            {!current || current.status === "DRAFT" ? "사건 만들기" : "사건 관리"}
          </Link>
          <Link href="/admin/reports" className="inline-block rounded border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
            신고 · 제재 (처리할 신고 {reports.length}건, 자동 탐지 {detections}건, 이의 신청 {appeals.length}건)
          </Link>
          <Link href="/admin/members" className="inline-block rounded border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
            회원 관리
          </Link>
          <Link href="/admin/inquiries" className="inline-block rounded border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
            문의 (답할 문의 {inquiries}건)
          </Link>
        </div>
      </section>
    </div>
  );
}
