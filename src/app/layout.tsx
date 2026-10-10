import type { Metadata } from "next";
import { ClosedPage } from "@/components/ClosedPage";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { isSiteClosed } from "@/server/closure";
import { db } from "@/server/db";
import "./globals.css";

// 모든 페이지가 요청할 때마다 사이트 폐쇄 여부를 확인하므로 미리 만들어 두지 않습니다.
// (빌드할 때는 DB가 없으므로, 미리 만들려고 하면 빌드가 실패합니다)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Virtual Courtroom · 시민 배심 시뮬레이터",
  description: "AI가 만든 가상 형사 사건의 배심원이 되어 재판의 전 과정을 경험하는 법정 시뮬레이션",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 사이트가 폐쇄되면 모든 주소에서 종료 안내 페이지만 보여 줍니다 (03 X-01)
  if (await isSiteClosed(db)) {
    return (
      <html lang="ko">
        <body>
          <ClosedPage />
        </body>
      </html>
    );
  }

  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
