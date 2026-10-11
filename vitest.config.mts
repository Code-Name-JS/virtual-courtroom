import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // 파기 테스트가 개발용 이미지 폴더(uploads)를 지우지 않도록 임시 폴더를 씀
    env: { UPLOAD_DIR: join(tmpdir(), "virtual-courtroom-test-uploads") },
    // DB 통합 테스트는 같은 테스트 DB를 비우고 쓰므로, 테스트 DB를 지정했을 때는 파일을 하나씩 실행
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
