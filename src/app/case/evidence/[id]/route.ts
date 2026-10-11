import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getEvidenceImage } from "@/server/board-service";

// 증거자료 이미지 (M7). 게시판을 읽을 수 있는 사람에게만, 열람 코드를 새긴 이미지를 보냅니다.
// ?w=: 이미지를 보여 준 게시판·스레드 화면의 워터마크 코드
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = request.nextUrl.searchParams.get("w") ?? "";
  const user = await getCurrentUser();
  const image = user && code ? await getEvidenceImage(user, id, code) : null;
  if (!image) return new Response("이미지를 볼 수 없습니다.", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      // 열람자마다 다른 이미지이므로 공용 캐시에 남기지 않음
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
