"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { EVIDENCE_PER_POST, IMAGE_ACCEPT, IMAGE_MAX_BYTES, POST_MAX_LENGTH } from "@/domain/board";
import { createThreadAction, editPostAction, replyAction, reportAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-800 focus:ring-2 focus:ring-gold-400/40";

function EvidenceRow({ index }: { index: number }) {
  const [type, setType] = useState("link");
  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_1fr_12rem]">
      <select name={`evidence_type_${index}`} className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
        <option value="link">링크</option>
        <option value="text">인용문</option>
        <option value="image">이미지</option>
      </select>
      {type === "image" ? (
        <input type="file" name={`evidence_file_${index}`} accept={IMAGE_ACCEPT} className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-2" />
      ) : (
        <input name={`evidence_value_${index}`} placeholder={type === "link" ? "https://…" : "인용할 문장"} className={inputClass} />
      )}
      <input name={`evidence_source_${index}`} placeholder={type === "text" ? "출처 (필수)" : "출처"} className={inputClass} />
    </div>
  );
}

function EvidenceFields() {
  return (
    <details className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium">증거자료 붙이기 (최대 {EVIDENCE_PER_POST}개)</summary>
      <p className="mt-2 text-xs text-slate-500">
        링크는 https 주소만, 인용문은 출처를 꼭 적어 주세요. 이미지는 jpg·png·webp, 1장당 5MB 이하이며 올릴 때 촬영 위치 등 사진 속 정보(EXIF)를 지웁니다.
        기사·논문·사진 등 다른 사람의 저작물은 출처를 밝히고 필요한 만큼만 인용합니다.
      </p>
      <div className="mt-3 space-y-3">
        {Array.from({ length: EVIDENCE_PER_POST }, (_, i) => (
          <EvidenceRow key={i} index={i} />
        ))}
      </div>
    </details>
  );
}

/** 큰 이미지를 서버로 보내기 전에 막아, 기다린 뒤에 실패하지 않게 함. 최종 확인은 서버에서 다시 함 */
function oversizedImage(formData: FormData): FormState | null {
  for (const value of formData.values()) {
    if (value instanceof File && value.size > IMAGE_MAX_BYTES) return { error: `「${value.name}」은(는) 5MB를 넘어 올릴 수 없습니다.` };
  }
  return null;
}

/** 긴 글이 제출 후 초기화되지 않도록 직접 제출하는 폼 (사건 입력 폼과 같은 방식) */
function useKeepValuesForm(serverAction: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, action, pending] = useActionState(serverAction, {} as FormState);
  const [localError, setLocalError] = useState<FormState | null>(null);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const oversized = oversizedImage(formData);
    setLocalError(oversized);
    if (oversized) return;
    startTransition(() => action(formData));
  };
  return { state: localError ?? state, onSubmit, pending };
}

// 03 C-06 스레드 작성
export function NewThreadForm({ side }: { side: "indict" | "dismiss" }) {
  const { state, onSubmit } = useKeepValuesForm(createThreadAction);
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <input type="hidden" name="side" value={side} />
      <label className="block space-y-1">
        <span className="text-sm font-semibold">새 스레드</span>
        <textarea name="body" rows={5} maxLength={POST_MAX_LENGTH} required className={inputClass} placeholder="사건에 대한 생각과 그 생각을 뒷받침하는 근거를 적어 주세요." />
      </label>
      <EvidenceFields />
      <FormMessage state={state} />
      <SubmitButton>올리기</SubmitButton>
    </form>
  );
}

export function ReplyForm({ side, parentPostId }: { side: "indict" | "dismiss"; parentPostId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, onSubmit } = useKeepValuesForm(async (prev: FormState, formData: FormData) => {
    const result = await replyAction(prev, formData);
    if (result.message) formRef.current?.reset();
    return result;
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="parentPostId" value={parentPostId} />
      <label className="block space-y-1">
        <span className="text-sm font-semibold">이어서 쓰기</span>
        <textarea name="body" rows={3} maxLength={POST_MAX_LENGTH} required className={inputClass} />
      </label>
      <EvidenceFields />
      <FormMessage state={state} />
      <SubmitButton>답글 올리기</SubmitButton>
    </form>
  );
}

export function EditPostForm({ postId, body }: { postId: string; body: string }) {
  const { state, onSubmit } = useKeepValuesForm(editPostAction);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-800">고치기</summary>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <input type="hidden" name="postId" value={postId} />
        <textarea name="body" rows={4} defaultValue={body} maxLength={POST_MAX_LENGTH} className={inputClass} />
        <FormMessage state={state} />
        <SubmitButton variant="secondary">고친 내용 저장</SubmitButton>
      </form>
    </details>
  );
}

// 05 배심원 신고
export function ReportForm({ postId }: { postId: string }) {
  const { state, onSubmit } = useKeepValuesForm(reportAction);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-500 hover:text-red-700">신고</summary>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <input type="hidden" name="postId" value={postId} />
        <select name="reason" className={inputClass} defaultValue="leak">
          <option value="leak">유출 의심 (상대 측 정보가 올라옴 등)</option>
          <option value="abuse">비방 · 혐오 · 개인정보 노출</option>
          <option value="other">기타</option>
        </select>
        <textarea name="detail" rows={2} required className={inputClass} placeholder="무엇이 문제인지 적어 주세요" />
        <FormMessage state={state} />
        <SubmitButton variant="secondary">신고하기</SubmitButton>
      </form>
    </details>
  );
}
