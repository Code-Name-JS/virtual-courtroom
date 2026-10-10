export function SiteFooter() {
  return (
    <footer className="bg-navy-950 text-xs text-slate-400">
      <div className="mx-auto max-w-5xl space-y-2 px-4 py-6">
        <p>본 서비스의 사건은 모두 AI가 만든 허구이며, 실존 인물이나 사건과 관계가 없습니다. 법률 자문이 아니며 실제 법적 효력이 없습니다.</p>
        <p>
          Virtual Courtroom · MIT License ·{" "}
          <a href="https://github.com/Code-Name-JS/virtual-courtroom" className="underline hover:text-white">
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
