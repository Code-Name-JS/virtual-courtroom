import { LegalPage, operatorLabel } from "@/components/LegalPage";
import { env } from "@/server/env";

export const metadata = { title: "개인정보처리방침 · Virtual Courtroom" };

const ITEMS = [
  ["이메일", "로그인, 인증 코드 발송, 알림", "사이트 폐쇄까지"],
  ["비밀번호 (해시)", "로그인", "사이트 폐쇄까지"],
  ["닉네임", "게시판 표시", "사이트 폐쇄까지"],
  ["만 14세 미만 여부", "법정대리인 동의 필요 여부 확인", "사이트 폐쇄까지"],
  ["법정대리인 이름·이메일 (만 14세 미만만)", "법정대리인 동의 요청과 확인", "사이트 폐쇄까지. 동의하지 않거나 기한이 지나면 바로 삭제"],
  ["IP (비밀 키 해시)", "IP 하나에 계정 하나 규칙, 가입 시도 제한", "사이트 폐쇄까지"],
  ["IP 변경 기록", "다중 계정 확인 (같은 IP를 여러 계정이 쓴 기록을 운영자에게 표시)", "사이트 폐쇄까지"],
  ["이메일 인증 코드 (해시)", "가입·IP 변경 인증", "사용하거나 만료되면 1일 안에 삭제"],
  ["열람 기록 · 워터마크 코드", "정보 유출 확인 (워터마크 확인, 짧은 시간의 대량 열람 탐지)", "사이트 폐쇄까지"],
  ["작성한 글, 투표·참여 기록, 신고·제재 기록, 자동 탐지 결과", "서비스 제공, 제재 (상대 측 글과 많이 겹치는 글 탐지 포함)", "사이트 폐쇄까지"],
  ["증거자료로 올린 이미지", "게시판 증거자료. 올릴 때 촬영 위치 등 사진 속 정보(EXIF)를 지움", "사이트 폐쇄까지"],
] as const;

// 03 L-02 개인정보처리방침 (05 개인정보처리방침에 반드시 적을 내용을 바탕으로 한 기본 템플릿)
export default function PrivacyPage() {
  const operator = operatorLabel();
  return (
    <LegalPage title="개인정보처리방침">
      <section>
        <p>
          {operator}는 서비스 제공에 꼭 필요한 최소한의 개인정보만 처리합니다. 가입할 때 별도의 동의 절차를 두지 않는 대신, 이 방침으로 처리하는 내용을 알려 드립니다. 평결 내용은 회원과 연결되지 않게 저장하므로
          개인정보가 아닙니다.
        </p>
      </section>
      <section>
        <h2>1. 처리하는 항목, 목적, 보관 기간</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">항목</th>
              <th>목적</th>
              <th>보관 기간</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map(([item, purpose, period]) => (
              <tr key={item} className="border-t border-slate-200 align-top">
                <td className="py-2 pr-2">{item}</td>
                <td className="pr-2">{purpose}</td>
                <td>{period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>2. 파기</h2>
        <p>사이트를 폐쇄하면 위 항목을 모두 파기합니다. 폐쇄 실행 후 5일 이내에 복구할 수 없는 방법으로 삭제하며, 백업본도 같은 기한 안에 파기합니다.</p>
      </section>
      <section>
        <h2>3. 처리를 맡기는 곳</h2>
        <p>{env.privacyProcessors ?? "운영자가 아직 적지 않았습니다. (예: 이메일 발송 업체, 서버 업체)"}</p>
      </section>
      <section>
        <h2>4. 회원의 권리</h2>
        <p>회원은 자신의 개인정보를 열람, 정정, 삭제하거나 처리를 멈춰 달라고 요청할 수 있습니다. 아래 연락처로 요청해 주세요.</p>
      </section>
      <section>
        <h2>5. 만 14세 미만</h2>
        <p>개인정보 보호법에 따라 만 14세 미만은 법정대리인의 동의를 받아야 가입할 수 있습니다.</p>
        <ol>
          <li>회원가입 화면에서 만 14세 미만을 고르고, 법정대리인의 이름과 이메일을 입력합니다. 동의를 받는 데 필요한 최소한의 정보입니다.</li>
          <li>가입자가 자기 이메일 인증을 마치면, 법정대리인에게 서비스 소개, 범죄를 다루는 가상 사건에 참여한다는 안내, 수집 항목을 담은 동의 요청 이메일을 보냅니다.</li>
          <li>법정대리인이 이메일의 링크에서 동의하면 가입이 완료됩니다. 그 전에는 계정이 활성화되지 않습니다.</li>
          <li>동의하지 않거나 7일 안에 응답하지 않으면 가입 신청을 취소하고, 가입자와 법정대리인의 정보를 바로 삭제합니다.</li>
        </ol>
        <p>법정대리인은 언제든지 아래 운영자 연락처로 자녀의 개인정보 열람, 정정, 삭제, 동의 철회를 요청할 수 있습니다.</p>
      </section>
      <section>
        <h2>6. 개인정보 보호 책임자</h2>
        <p>
          {operator} · {env.operatorContactEmail ?? "연락처를 운영자가 아직 적지 않았습니다"}
        </p>
      </section>
    </LegalPage>
  );
}
