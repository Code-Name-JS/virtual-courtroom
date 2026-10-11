# 06. MVP 범위 · 기술 스택 > 배포: Docker Compose로 실행하는 앱 이미지

FROM node:24-alpine AS base
# Prisma 엔진이 OpenSSL을 사용
RUN apk add --no-cache openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 의존성 설치
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 빌드. 이 단계 이미지는 마이그레이션 실행(migrate 서비스)에도 씁니다
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# 실행용 최소 이미지
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV UPLOAD_DIR=/app/uploads
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# 증거 이미지 저장 폴더 (docker-compose.yml의 uploads 볼륨)
RUN mkdir -p /app/uploads && chown app:app /app/uploads
USER app
EXPOSE 3000
CMD ["node", "server.js"]
