import { env } from "@/server/env";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      {!env.legalDocsReviewed && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          이 문서는 Virtual Courtroom 저장소가 제공하는 <strong>기본 템플릿</strong>이며, 이 사이트의 운영자가 아직 법률 검토를 마치지 않았습니다. 운영자는 출시 전에 법률 전문가의 검토를 받아 내용을 고쳐야 합니다.
        </p>
      )}
      <article className="space-y-6 leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_section]:space-y-2">{children}</article>
    </div>
  );
}

export function operatorLabel(): string {
  return env.operatorName ?? "이 사이트의 운영자";
}
