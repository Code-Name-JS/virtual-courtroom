"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormMessage, type FormState, SubmitButton } from "@/components/form";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, action] = useActionState(signupAction, {} as FormState);
  const [ageGroup, setAgeGroup] = useState<"over14" | "under14">("over14");

  return (
    <form action={action} className="space-y-4">
      <Field label="이메일" name="email" type="email" autoComplete="email" required />
      <Field label="비밀번호" name="password" type="password" autoComplete="new-password" minLength={8} required hint="8자 이상" />
      <Field
        label="닉네임"
        name="nickname"
        autoComplete="nickname"
        minLength={2}
        maxLength={16}
        required
        hint="게시판에 실명 대신 보이는 이름입니다. 한글, 영문, 숫자, 밑줄(_) 2~16자"
      />

      <div className="space-y-2 rounded bg-slate-50 p-3 text-sm text-slate-700">
        <p>
          · 한 사람은 <strong>계정 하나</strong>로만 참여할 수 있습니다.
        </p>
        <p>
          · <strong>IP 하나에는 계정 하나</strong>만 쓸 수 있어, 학교·회사·카페처럼 같은 네트워크에서는 한 사람만 참여할 수 있습니다.
        </p>
        <p>· 접속 IP가 바뀌면 이메일 인증을 다시 거쳐야 합니다.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">나이</legend>
        <div className="flex gap-4 text-sm">
          {(
            [
              ["over14", "만 14세 이상"],
              ["under14", "만 14세 미만"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="ageGroup" value={value} checked={ageGroup === value} onChange={() => setAgeGroup(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {ageGroup === "under14" && (
        <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            만 14세 미만은 <strong>법정대리인(부모님 등)의 동의</strong>가 있어야 가입할 수 있습니다. 이메일 인증을 마치면 법정대리인에게 동의 요청 이메일을 보내고, 동의하면
            가입이 완료됩니다. 7일 안에 동의하지 않으면 가입 신청은 취소되고 입력한 정보는 모두 삭제됩니다.
          </p>
          <Field label="법정대리인 이름" name="guardianName" maxLength={50} required />
          <Field label="법정대리인 이메일" name="guardianEmail" type="email" required hint="동의 요청을 받을 이메일입니다. 가입하는 이메일과 달라야 합니다." />
        </div>
      )}

      <p className="text-xs text-slate-500">
        가입하면 서비스 제공에 꼭 필요한 정보(이메일, 닉네임, IP 해시 등, 만 14세 미만이면 법정대리인의 이름과 이메일)를 처리합니다. 자세한 내용은{" "}
        <Link href="/privacy" target="_blank" className="underline">
          개인정보처리방침
        </Link>
        과{" "}
        <Link href="/terms" target="_blank" className="underline">
          이용약관
        </Link>
        에서 확인할 수 있습니다.
      </p>

      <FormMessage state={state} />
      <SubmitButton>가입하고 인증 코드 받기</SubmitButton>

      <p className="text-center text-sm text-slate-600">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-navy-800 underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
