import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 이미지에서 node server.js 하나로 실행하기 위해 standalone 출력 사용 (06 배포)
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // 증거 이미지 4장(1장당 5MB)과 글을 함께 올릴 수 있도록 (05 증거자료 형식)
      bodySizeLimit: "22mb",
    },
  },
};

export default nextConfig;
