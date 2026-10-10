// 05 열람자별 워터마크: 게시판 화면 위에 열람자의 닉네임과 이번 열람 코드를 옅게 반복해서 겹쳐 표시합니다.
// 화면 위에 겹친 표시는 개발자 도구로 지울 수 있으므로, 유출을 완전히 막기보다 억지하는 장치입니다 (06).

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}

export function Watermark({ nickname, code }: { nickname: string; code: string }) {
  const label = escapeXml(`${nickname} · ${code}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="140"><text x="10" y="90" transform="rotate(-20 130 70)" font-family="sans-serif" font-size="14" fill="rgba(17,28,48,0.07)">${label}</text></svg>`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 select-none"
      style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }}
    />
  );
}

export function WatermarkNotice({ code }: { code: string }) {
  return (
    <p className="text-xs text-slate-500">
      이 화면에는 열람자 표시(코드 <span className="font-mono">{code}</span>)가 겹쳐 있습니다. 캡처나 외부 공유로 정보를 유출하면 이 표시로 확인해 제재할 수 있습니다.
    </p>
  );
}
