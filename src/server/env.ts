import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경 변수 ${name}이(가) 설정되지 않았습니다. .env.example을 참고하세요.`);
  }
  return value;
}

function secret(name: string): string {
  const value = required(name);
  if (value.length < 32) {
    throw new Error(`환경 변수 ${name}은(는) 32자 이상이어야 합니다.`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  get siteUrl() {
    return process.env.SITE_URL ?? "http://localhost:3000";
  },
  get sessionSecret() {
    return secret("SESSION_SECRET");
  },
  get ipHashSecret() {
    return secret("IP_HASH_SECRET");
  },
  get clientIpHeader() {
    return (process.env.CLIENT_IP_HEADER ?? "x-real-ip").toLowerCase();
  },
  get operatorEmail() {
    return process.env.OPERATOR_EMAIL?.trim().toLowerCase() || null;
  },
  get smtp() {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    return {
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.MAIL_FROM ?? "Virtual Courtroom <no-reply@example.com>",
    };
  },
  isProduction,
  // 시연 모드와 IP 규칙 끄기는 실제 배포(production)에서는 절대 켜지지 않음 (06 시연 모드)
  get demoMode() {
    return !isProduction && process.env.DEMO_MODE === "true";
  },
  get ipRuleEnabled() {
    return !(this.demoMode && process.env.DISABLE_IP_RULE === "true");
  },
};
