import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 이미지에서 node server.js 하나로 실행하기 위해 standalone 출력 사용 (06 배포)
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
};

export default nextConfig;
