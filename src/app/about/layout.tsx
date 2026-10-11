import Link from "next/link";

const TABS = [
  { href: "/about", label: "프로젝트 소개" },
  { href: "/about/process", label: "재판 진행 과정" },
  { href: "/about/guide", label: "참여 가이드" },
  { href: "/about/faq", label: "자주 묻는 질문" },
];

// 03 서비스 소개 (A-01 ~ A-04)
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">서비스 소개</h1>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className="rounded px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
            {tab.label}
          </Link>
        ))}
      </nav>
      <article className="space-y-6 leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_section]:space-y-2">{children}</article>
    </div>
  );
}
