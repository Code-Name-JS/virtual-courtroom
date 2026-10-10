"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function format(ms: number): string {
  if (ms <= 0) return "마감";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  if (minutes > 0) return `${minutes}분 남음`;
  return `${Math.ceil(ms / 1000)}초 남음`;
}

/** 마감까지 남은 시간. 마감이 지나면 화면을 새로 고쳐 다음 단계를 보여 줍니다. */
export function Countdown({ deadline }: { deadline: string }) {
  const router = useRouter();
  const target = new Date(deadline).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (now >= target) {
      const refresh = setTimeout(() => router.refresh(), 2000);
      return () => clearTimeout(refresh);
    }
  }, [now, target, router]);

  return (
    <span title={new Date(deadline).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} suppressHydrationWarning>
      {format(target - now)}
    </span>
  );
}
