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
    // DB 통합 테스트는 같은 테스트 DB를 비우고 쓰므로, 테스트 DB를 지정했을 때는 파일을 하나씩 실행
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
