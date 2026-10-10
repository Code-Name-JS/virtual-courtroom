"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { SIDE_LABELS } from "@/domain/case";
import { applyRound2Action, chooseRound2Action, commentAction, reviewAction } from "./actions";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-800 focus:ring-2 focus:ring-gold-400/40";

// 03 C-11 리뷰 작성 (긴 글이 제출 후 초기화되지 않도록 직접 제출)
export function ReviewForm({ round, initial }: { round: number; initial: { body: string; rating: number | null; isAppeal: boolean } | null }) {
  const [state, action] = useActionState(reviewAction, {} as FormState);
  return (
    <form
      // JS가 없을 때도 제출되도록 action을 두고, JS가 있으면 직접 제출해 긴 입력이 초기화되지 않게 함
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-3"
    >
      <textarea
        name="body"
        rows={6}
        required
        maxLength={3000}
        defaultValue={initial?.body ?? ""}
        className={inputClass}
        placeholder="재판에 참여하며 느낀 점, 판결에 대한 생각, 서비스에 대한 피드백을 남겨 주세요."
      />
      <label className="flex items-center gap-2 text-sm">
        <span>별점 (선택)</span>
        <select name="rating" defaultValue={initial?.rating ?? ""} className="rounded border border-slate-300 px-2 py-1">
          <option value="">선택 안 함</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)} {n}점
            </option>
          ))}
        </select>
      </label>
      {round === 1 && (
        <label className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <input type="checkbox" name="isAppeal" defaultChecked={initial?.isAppeal ?? false} className="mt-1" />
          <span>
            <strong>판결에 이의를 신청합니다.</strong> 이의 신청이 담긴 리뷰가 1건이라도 있으면, 리뷰 기간이 끝난 뒤 운영자가 2심 개시 여부를 결정합니다.
          </span>
        </label>
      )}
      <FormMessage state={state} />
      <SubmitButton>{initial ? "고친 리뷰 저장" : "리뷰 남기기"}</SubmitButton>
    </form>
  );
}

export function CommentForm({ reviewId }: { reviewId: string }) {
  const [state, action] = useActionState(commentAction, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <textarea name="body" rows={2} required maxLength={1000} className={inputClass} placeholder="이 리뷰에 댓글 남기기" />
      <FormMessage state={state} />
      <div className="sm:w-40">
        <SubmitButton variant="secondary">댓글 남기기</SubmitButton>
      </div>
    </form>
  );
}

// 03 C-12 1심 배심원의 2심 참여 여부 선택
export function ChooseRound2Form({ sideLabel }: { sideLabel: string }) {
  const [state, action, pending] = useActionState(chooseRound2Action, {} as FormState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!window.confirm(`${submitter?.dataset.label}\n\n한 번 고르면 바꿀 수 없습니다.`)) event.preventDefault();
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          name="choice"
          value="join"
          data-label={`2심에 ${sideLabel} 측으로 참여할까요?`}
          disabled={pending}
          className="rounded-lg border-2 border-navy-800 bg-navy-900 px-4 py-3 font-bold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          2심에 참여합니다 ({sideLabel} 측)
        </button>
        <button
          type="submit"
          name="choice"
          value="decline"
          data-label="2심에 참여하지 않을까요?"
          disabled={pending}
          className="rounded-lg border-2 border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          참여하지 않습니다
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

// 03 C-12 리뷰 댓글 작성자의 2심 참여 신청
export function ApplyRound2Form() {
  const [state, action] = useActionState(applyRound2Action, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">참여할 진영 (신청 후 바꿀 수 없습니다)</legend>
        {(["indict", "dismiss"] as const).map((side) => (
          <label key={side} className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm">
            <input type="radio" name="side" value={side} required />
            <span className={side === "indict" ? "font-semibold text-indict" : "font-semibold text-dismiss"}>{SIDE_LABELS[side]} 측</span>
          </label>
        ))}
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton>2심 참여 신청</SubmitButton>
    </form>
  );
}
