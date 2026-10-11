import type { InquiryCategory } from "@prisma/client";

// 03 L-03 문의하기 (M8)

export const INQUIRY_MAX_LENGTH = 2000;
export const ANSWER_MAX_LENGTH = 3000;
/** 같은 회원이 하루에 남길 수 있는 문의 수. 도배를 막음 */
export const INQUIRIES_PER_DAY = 3;

export const INQUIRY_CATEGORIES: { id: InquiryCategory; label: string; hint?: string }[] = [
  { id: "account", label: "계정 · 로그인 · IP", hint: "다른 네트워크에서 접속이 막히는 경우 등. 이메일 인증 코드를 받지 못했다면 스팸함도 확인해 주세요." },
  { id: "case_progress", label: "사건 · 재판 진행" },
  { id: "privacy", label: "개인정보 (열람·정정·삭제 요청)", hint: "요청을 확인한 뒤 처리 결과를 답변으로 알려 드립니다." },
  { id: "copyright", label: "저작권 침해 신고", hint: "문제가 되는 글의 주소와 권리자임을 알 수 있는 내용을 적어 주세요." },
  { id: "bug", label: "오류 신고", hint: "어느 화면에서 무엇을 했을 때 어떤 문제가 생겼는지 적어 주세요." },
  { id: "other", label: "기타" },
];

export const INQUIRY_CATEGORY_LABELS = Object.fromEntries(INQUIRY_CATEGORIES.map((c) => [c.id, c.label])) as Record<InquiryCategory, string>;

export function isInquiryCategory(value: unknown): value is InquiryCategory {
  return INQUIRY_CATEGORIES.some((c) => c.id === value);
}
