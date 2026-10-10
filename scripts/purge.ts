// 사이트 폐쇄 후 개인정보 파기를 다시 실행하는 스크립트 (05 파기).
// 사용법: npm run purge -- --confirm
// 폐쇄를 실행하면 파기도 함께 되므로, 보통은 파기가 제대로 됐는지 확인하거나 다시 실행할 때 씁니다.
import { PrismaClient } from "@prisma/client";
import { isSiteClosed, purgePersonalData } from "../src/server/closure";

async function main() {
  const db = new PrismaClient();
  try {
    if (!(await isSiteClosed(db))) {
      console.error("사이트가 아직 폐쇄되지 않았습니다. 관리자 화면에서 폐쇄를 실행한 뒤에 파기할 수 있습니다.");
      process.exitCode = 1;
      return;
    }
    if (!process.argv.includes("--confirm")) {
      console.error("회원 정보와 작성한 글이 모두 지워지며 되돌릴 수 없습니다. 실행하려면 --confirm을 붙여 주세요.");
      process.exitCode = 1;
      return;
    }
    const before = await purgePersonalData(db);
    console.info("파기 전:", before);
    console.info("파기 후 남은 회원:", await db.user.count(), "명");
    console.info(
      [
        "",
        "남은 할 일 (05 개인정보 정책):",
        "1. 서버의 .env에서 IP_HASH_SECRET과 SESSION_SECRET을 지우세요.",
        "2. DB 백업본이 있다면 함께 파기하세요.",
        "3. 폐쇄 실행 후 5일 이내에 파기를 마쳐야 합니다.",
      ].join("\n"),
    );
  } finally {
    await db.$disconnect();
  }
}

void main();
