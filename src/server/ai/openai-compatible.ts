// OpenAI 호환 채팅 API로 최종 변론인을 추천합니다. 같은 형식을 지원하는 AI 서비스라면 주소·키·모델만 바꿔 쓸 수 있습니다.
import type { AdvocateRecommender, RawRecommendation, RecommendationPrompt } from "./recommender";

export function createOpenAiCompatibleRecommender(options: { url: string; apiKey?: string; model: string }): AdvocateRecommender {
  return {
    provider: "openai-compatible",
    model: options.model,
    async complete(prompt: RecommendationPrompt): Promise<RawRecommendation> {
      const response = await fetch(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`AI 요청 실패 (HTTP ${response.status})`);
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return { text: data.choices?.[0]?.message?.content ?? "" };
    },
  };
}
