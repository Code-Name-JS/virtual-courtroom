"use client";

import { useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { signAction } from "./actions";

const TERMS = [
  "이 사건은 AI가 만든 허구의 사건이며, 실존 인물이나 사건과 관계가 없음을 확인합니다.",
  "이 서비스는 교육과 토론을 위한 시뮬레이션이며, 법률 자문이 아니고 실제 법적 효력이 없음을 확인합니다.",
  "진영 게시판에 글을 쓰면 나의 입장이 드러나며, 증거 제출이 끝나면 양측 게시판이 모두 공개된다는 것을 이해합니다.",
  "배심원 사이의 정보 유출은 기술적으로 막지 않지만, 적발되면 유출한 사람과 유출 정보를 게시한 사람 모두 제재받을 수 있음을 이해합니다.",
];

// 03 C-04 공판준비절차 서명
export function SignPanel() {
  const [state, action] = useActionState(signAction, {} as FormState);
  return (
    <form action={action} className="space-y-4">
      <ul className="space-y-2 rounded bg-slate-50 p-4 text-sm">
        {TERMS.map((term) => (
          <li key={term}>· {term}</li>
        ))}
      </ul>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1" />
        <span>위 내용을 모두 확인했으며, 공판준비절차 서면에 서명합니다.</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton>서명하기</SubmitButton>
    </form>
  );
}
