// 최종 변론인 AI 추천 (01 최종 변론인 선정 2단계, 06 AI 연동).
// AI 제공자는 운영자가 환경 변수로 고릅니다. 웹 앱과 워커가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import { z } from "zod";
import { createAnthropicRecommender } from "./anthropic";
import { createOpenAiCompatibleRecommender } from "./openai-compatible";

export type Candidate = {
  participationId: string;
  nickname: string;
  nominationCount: number;
  nominationReasons: string[];
  posts: string[];
};

export type RecommendationInput = {
  caseTitle: string;
  caseBody: string;
  sideLabel: string;
  candidates: Candidate[];
};

export type RecommendationPrompt = { system: string; user: string; schema: Record<string, unknown> };

export type RawRecommendation = { text: string };

export interface AdvocateRecommender {
  readonly provider: string;
  readonly model: string;
  complete(prompt: RecommendationPrompt): Promise<RawRecommendation>;
}

const MAX_POSTS_PER_CANDIDATE = 20;
const MAX_POST_LENGTH = 1500;

/**
 * AI에게는 후보의 닉네임, 받은 추천과 그 이유, 게시글만 보냅니다.
 * 이메일이나 IP 같은 개인정보는 보내지 않습니다 (06 AI 연동).
 */
export function buildPrompt(input: RecommendationInput): RecommendationPrompt {
  const ids = input.candidates.map((c) => c.participationId);
  const system = [
    "당신은 시민 배심 시뮬레이션에서 최종 변론인 후보를 검토하는 도우미입니다.",
    "이 사건은 AI가 만든 허구의 사건이며, 서비스는 교육과 토론을 위한 시뮬레이션입니다.",
    `${input.sideLabel} 측 배심원 가운데, 지금까지 쓴 글을 바탕으로 이 진영의 주장을 가장 설득력 있게 대표할 최종 변론인 1명을 추천해 주세요.`,
    "판단 기준: 사건의 쟁점을 정확히 짚는지, 주장이 근거로 뒷받침되는지, 상대 측 반론을 고려하는지, 다른 배심원의 추천 이유.",
    "추천 이유는 운영자와 모든 배심원에게 공개됩니다. 한국어 2~4문장으로, 후보를 깎아내리지 말고 추천한 근거를 중심으로 쓰세요.",
    "반드시 JSON으로만 답하세요: {\"participationId\": 후보 ID, \"rationale\": 추천 이유}",
  ].join("\n");

  const candidates = input.candidates
    .map((c) => {
      const posts = c.posts
        .slice(0, MAX_POSTS_PER_CANDIDATE)
        .map((p, i) => `  [글 ${i + 1}] ${p.slice(0, MAX_POST_LENGTH)}`)
        .join("\n");
      const reasons = c.nominationReasons.map((r) => `  - ${r}`).join("\n");
      return [
        `후보 ID: ${c.participationId}`,
        `닉네임: ${c.nickname}`,
        `받은 추천: ${c.nominationCount}표`,
        reasons ? `추천 이유:\n${reasons}` : "추천 이유: 없음",
        posts ? `쓴 글:\n${posts}` : "쓴 글: 없음",
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const user = `사건: ${input.caseTitle}\n\n${input.caseBody}\n\n===== ${input.sideLabel} 측 후보 =====\n\n${candidates}`;

  const schema = {
    type: "object",
    properties: {
      participationId: { type: "string", enum: ids },
      rationale: { type: "string" },
    },
    required: ["participationId", "rationale"],
    additionalProperties: false,
  };
  return { system, user, schema };
}

const responseSchema = z.object({ participationId: z.string(), rationale: z.string().min(1) });

/** AI 응답에서 추천을 꺼냅니다. 후보가 아닌 ID나 형식이 맞지 않는 응답은 실패로 봅니다. */
export function parseRecommendation(text: string, candidateIds: string[]): { participationId: string; rationale: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: unknown;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success || !candidateIds.includes(parsed.data.participationId)) return null;
  return { participationId: parsed.data.participationId, rationale: parsed.data.rationale.trim().slice(0, 2000) };
}

/**
 * 환경 변수로 추천기를 만듭니다. 설정이 없으면 null을 돌려주고, 이때는 AI 추천 없이 운영자가 선정합니다.
 * - AI_PROVIDER=anthropic: Claude (공식 SDK). AI_API_KEY가 없으면 ANTHROPIC_API_KEY를 씀. 모델 기본값 claude-opus-5-5
 * - AI_PROVIDER=openai-compatible: OpenAI 호환 채팅 API. AI_API_URL, AI_API_KEY, AI_MODEL 필요
 */
export function createRecommenderFromEnv(env: Record<string, string | undefined> = process.env): AdvocateRecommender | null {
  const provider = env.AI_PROVIDER?.trim().toLowerCase();
  if (provider === "anthropic") {
    if (!env.AI_API_KEY && !env.ANTHROPIC_API_KEY) return null;
    return createAnthropicRecommender({ apiKey: env.AI_API_KEY || undefined, model: env.AI_MODEL || "claude-opus-5-5", baseURL: env.AI_API_URL || undefined });
  }
  if (provider === "openai-compatible") {
    if (!env.AI_API_URL || !env.AI_MODEL) return null;
    return createOpenAiCompatibleRecommender({ url: env.AI_API_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL });
  }
  return null;
}
