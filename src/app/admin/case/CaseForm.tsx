"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form";
import { CASE_STAGES, REVIEW_CHECKLIST, STATUS_LABELS } from "@/domain/case";
import { saveDraftAction } from "./actions";

export type CaseFormValues = {
  title: string;
  summary: string;
  body: string;
  aiOriginalBody: string;
  aiModel: string;
  aiGeneratedAt: string;
  minParticipants: number;
  maxParticipants: number | null;
  durations: Record<string, number>;
  checklist: string[];
  reviewNote: string;
};

const inputClass =
  "w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-navy-800 focus:ring-2 focus:ring-gold-400/40";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="block space-y-0.5">
      <span className="text-sm font-medium text-slate-700">{children}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </span>
  );
}

// 03 O-02 사건 생성 · 검수
export function CaseForm({ values, demoMode, minAllowed }: { values: CaseFormValues; demoMode: boolean; minAllowed: number }) {
  const [state, action, pending] = useActionState(saveDraftAction, {} as FormState);
  const unitLabel = demoMode ? "분" : "일";

  return (
    <form
      // form action 대신 직접 제출: React가 제출 후 입력값을 초기화하면 긴 사건 내용이 사라지므로
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "publish" && !window.confirm("사건을 게시할까요?\n\n게시하면 공소 투표가 바로 시작되고, 사건 내용과 기간은 더 이상 고칠 수 없습니다.")) {
          return;
        }
        const formData = new FormData(event.currentTarget, submitter);
        startTransition(() => action(formData));
      }}
      className="space-y-8"
    >
      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <legend className="px-1 font-semibold">1. AI 원본</legend>
        <p className="text-sm text-slate-600">AI 플랫폼에 사건 생성을 부탁해 받은 내용을 그대로 붙여 넣으세요. 사건 페이지의 &lsquo;AI 원본 보기&rsquo;로 공개됩니다.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label>사용한 AI 모델</Label>
            <input name="aiModel" defaultValue={values.aiModel} className={inputClass} placeholder="예: 사용한 AI 서비스와 모델 이름" />
          </label>
          <label className="block space-y-1">
            <Label hint="한국 시간">생성 일시</Label>
            <input name="aiGeneratedAt" type="datetime-local" defaultValue={values.aiGeneratedAt} className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1">
          <Label>AI 원본</Label>
          <textarea name="aiOriginalBody" defaultValue={values.aiOriginalBody} rows={10} className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <legend className="px-1 font-semibold">2. 운영자 정리본</legend>
        <p className="text-sm text-slate-600">
          AI 원본을 검수 체크리스트에 맞게 문제없도록 정리하세요. 배심원은 이 정리본을 기준으로 판단합니다. AI가 만든 내용을 그대로 올리면 그 책임도 운영자에게 있습니다.
        </p>
        <label className="block space-y-1">
          <Label>사건명</Label>
          <input name="title" defaultValue={values.title} required maxLength={100} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <Label hint="로그인하지 않은 사람에게도 공개됩니다">사건 개요</Label>
          <textarea name="summary" defaultValue={values.summary} required rows={3} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <Label hint="로그인한 회원에게 공개됩니다">사건 내용 (정리본)</Label>
          <textarea name="body" defaultValue={values.body} rows={14} className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <legend className="px-1 font-semibold">3. 참여 인원과 기간</legend>
        {demoMode && (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            시연 모드입니다. 기간을 분 단위로, 최소 참여 인원을 {minAllowed}명부터 설정할 수 있습니다.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label hint={`${minAllowed}명 이상. 마감 시 이보다 적으면 연장 없이 폐기`}>최소 참여 인원</Label>
            <input name="minParticipants" type="number" min={minAllowed} defaultValue={values.minParticipants} required className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label hint="비워 두면 제한 없음">최대 참여 인원</Label>
            <input name="maxParticipants" type="number" min={minAllowed} defaultValue={values.maxParticipants ?? ""} className={inputClass} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CASE_STAGES.map(({ stage, kind }) => (
            <label key={stage} className="block space-y-1">
              <Label hint={kind === "operator" ? "운영자 처리 기한" : undefined}>
                {STATUS_LABELS[stage]} ({unitLabel})
              </Label>
              <input name={`duration_${stage}`} type="number" min={1} step={1} defaultValue={values.durations[stage]} required className={inputClass} />
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          01 기준: 공소 투표는 일주일 또는 한 달, 증거 제출은 한 달입니다. 2심은 2심 배심원 모집부터 리뷰까지 같은 기간으로 다시 진행합니다. 게시한 뒤에는 기간을 바꿀 수 없습니다.
        </p>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <legend className="px-1 font-semibold">4. 게시 전 검수 체크리스트</legend>
        {REVIEW_CHECKLIST.map((item) => (
          <label key={item.key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="checklist" value={item.key} defaultChecked={values.checklist.includes(item.key)} className="mt-1" />
            <span>{item.label}</span>
          </label>
        ))}
        <label className="block space-y-1 pt-2">
          <Label hint="운영자만 볼 수 있습니다">검수 메모</Label>
          <textarea name="reviewNote" defaultValue={values.reviewNote} rows={3} className={inputClass} />
        </label>
      </fieldset>

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          저장
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={pending}
          className="rounded bg-gold-500 px-5 py-2.5 font-semibold text-navy-950 hover:bg-gold-400 disabled:opacity-60"
        >
          저장하고 게시하기
        </button>
      </div>
    </form>
  );
}
