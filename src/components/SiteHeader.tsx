import Link from "next/link";
import { logoutAction } from "@/app/logout/actions";
import { getCurrentUser } from "@/server/auth";

// 03 상단 메뉴: 홈 · 서비스 소개 · 사건 · 공지사항 (서비스 소개는 M4에서 추가)
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="bg-navy-950 text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-wide">VIRTUAL COURTROOM</span>
          <span className="text-xs text-gold-400">시민 배심 시뮬레이터</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <Link href="/case" className="rounded px-3 py-2 hover:bg-navy-800">
            사건
          </Link>
          <Link href="/notices" className="rounded px-3 py-2 hover:bg-navy-800">
            공지사항
          </Link>
          {user ? (
            <>
              {user.role === "operator" && (
                <Link href="/admin" className="rounded px-3 py-2 text-gold-400 hover:bg-navy-800">
                  관리자
                </Link>
              )}
              <Link href="/me" className="rounded px-3 py-2 hover:bg-navy-800">
                {user.nickname}
              </Link>
              <form action={logoutAction}>
                <button className="rounded border border-white/30 px-3 py-2 hover:bg-navy-800">로그아웃</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded border border-white/30 px-3 py-2 hover:bg-navy-800">
                로그인
              </Link>
              <Link href="/signup" className="rounded bg-gold-500 px-3 py-2 font-semibold text-navy-950 hover:bg-gold-400">
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
