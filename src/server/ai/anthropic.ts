// Claude로 최종 변론인을 추천합니다 (Anthropic 공식 SDK).
import Anthropic from "@anthropic-ai/sdk";
import type { AdvocateRecommender, RawRecommendation, RecommendationPrompt } from "./recommender";

// 정책상 요청이 거절되면 서버에서 다른 모델로 다시 실행하는 기능(fallbacks)을 지원하는 모델
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function createAnthropicRecommender(options: { apiKey?: string; model: string; baseURL?: string }): AdvocateRecommender {
  const client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL, timeout: 120_000 });
  const model = options.model;

  return {
    provider: "anthropic",
    model,
    async complete(prompt: RecommendationPrompt): Promise<RawRecommendation> {
      const params = {
        model,
        max_tokens: 16000,
        system: prompt.system,
        messages: [{ role: "user" as const, content: prompt.user }],
        // 구조화된 출력: 후보 ID 중 하나와 추천 이유만 담은 JSON으로 받음
        output_config: { format: { type: "json_schema" as const, schema: prompt.schema } },
      };

      const response = FALLBACK_MODELS.has(model)
        ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(params);

      if (response.stop_reason === "refusal") {
        throw new Error(`AI가 요청을 거절했습니다 (${response.stop_details?.category ?? "분류 없음"}).`);
      }
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      return { text };
    },
  };
}
