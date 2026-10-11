import type { ParticipationStatus } from "@prisma/client";
import Link from "next/link";
import { SIDE_LABELS } from "@/domain/case";
import { IP_USE_LABELS, ipLabel } from "@/domain/leak";
import { requireOperator } from "@/server/auth";
import { getCase } from "@/server/case-service";
import { findMultiAccountSuspicions, searchMembers } from "@/server/members";

export const metadata = { title: "회원 관리 · Virtual Courtroom" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

const PARTICIPATION_LABELS: Record<ParticipationStatus, string> = {
  voted: "투표함",
  signed: "서명함",
  excluded: "제외됨",
  advocate: "최종 변론인",
  done: "마침",
};

// 03 O-07 회원 관리: 회원 검색, IP 변경 기록, 다중 계정 의심 표시 (M7)
export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOperator();
  const { q = "" } = await searchParams;
  const current = await getCase();
  const round = current?.round ?? 1;
  const [{ groups, nicknames }, members] = await Promise.all([findMultiAccountSuspicions(), searchMembers(q, round)]);
  const suspected = new Set(groups.flatMap((g) => g.userIds));
  const nick = (id: string) => nicknames.get(id) ?? "(알 수 없음)";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <Link href="/admin" className="text-sm text-slate-600 underline">
        관리자 대시보드로
      </Link>
      <h1 className="text-2xl font-bold">회원 관리</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">다중 계정 의심 ({groups.length}건)</h2>
        <p className="text-sm text-slate-600">
          같은 IP를 두 계정 이상이 쓴 기록입니다. IP 하나에 계정 하나 규칙에서 같은 네트워크는 한 사람만 쓰므로, 여러 계정이 한 IP를 번갈아 쓰면 한 사람이 여러
          계정을 쓰는 것일 수 있습니다. 다만 휴대폰 데이터처럼 통신사가 IP를 여러 사람에게 돌려 쓰는 경우도 있으니, 의심 표시만으로 제재하지 말고 글과 투표 활동 등
          다른 근거와 함께 판단해 주세요 (05). 다중 계정이 확인되면 관련된 <strong>모든 계정</strong>을 사건에서 제외합니다.
        </p>
        {groups.length === 0 && <p className="text-sm text-slate-600">의심 기록이 없습니다.</p>}
        {groups.map((group) => (
          <article key={group.ipHash} className="space-y-3 rounded-lg border border-amber-200 bg-white p-5">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-slate-500">{ipLabel(group.ipHash)}</span>
              {group.alternating && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">번갈아 사용</span>}
              {group.blocked > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">차단 {group.blocked}번</span>}
              <span>
                계정 {group.userIds.length}개가 사용 · 사용 계정이 바뀐 횟수 {group.switches}번
              </span>
            </p>
            <ol className="space-y-1 text-sm">
              {group.uses.map((use, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <span className="text-slate-500">{dateFormat.format(use.at)}</span>
                  <strong>{nick(use.userId)}</strong>
                  <span>{IP_USE_LABELS[use.kind]}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3 text-sm">
              {group.userIds.map((id) => (
                <Link key={id} href={`/admin/reports/sanction?user=${id}&violation=multi_account`} className="text-red-700 underline">
                  {nick(id)} 제재
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">회원 검색</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="닉네임 또는 이메일" className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded bg-navy-900 px-4 py-2 text-sm font-semibold text-white">찾기</button>
        </form>
        <p className="text-xs text-slate-500">최근 가입한 순서로 100명까지 보여 줍니다.</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">닉네임</th>
                <th className="px-3 py-2">이메일</th>
                <th className="px-3 py-2">가입</th>
                <th className="px-3 py-2">{round}심 참여</th>
                <th className="px-3 py-2">IP 변경 기록</th>
                <th className="px-3 py-2">제재</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const p = m.participations[0];
                return (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {m.nickname}
                      {m.role === "operator" && <span className="ml-1 text-xs text-slate-500">(운영자)</span>}
                      {suspected.has(m.id) && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">다중 계정 의심</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{m.email}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {dateFormat.format(m.createdAt)}
                      {!m.emailVerifiedAt && " · 인증 전"}
                      {m.isUnder14 && (m.guardianConsentedAt ? " · 만 14세 미만(동의)" : " · 법정대리인 동의 대기")}
                    </td>
                    <td className="px-3 py-2">{p ? `${SIDE_LABELS[p.side]} · ${PARTICIPATION_LABELS[p.status]}` : "-"}</td>
                    <td className="px-3 py-2">{m._count.ipChangeLogs}건</td>
                    <td className="px-3 py-2">{m._count.sanctions}건</td>
                    <td className="px-3 py-2">
                      {m.role !== "operator" && (
                        <Link href={`/admin/reports/sanction?user=${m.id}`} className="text-red-700 underline">
                          제재
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {members.length === 0 && <p className="p-4 text-sm text-slate-600">찾는 회원이 없습니다.</p>}
        </div>
      </section>
    </div>
  );
}
