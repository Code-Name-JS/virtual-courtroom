"use client";

import { useFormStatus } from "react-dom";

export type FormState = { error?: string; message?: string };

export function SubmitButton({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  const style =
    variant === "primary"
      ? "bg-navy-900 text-white hover:bg-navy-800"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100";
  return (
    <button type="submit" disabled={pending} className={`w-full rounded px-4 py-2.5 font-semibold disabled:opacity-60 ${style}`}>
      {pending ? "처리 중…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>;
  }
  return null;
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...input}
        className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-navy-800 focus:ring-2 focus:ring-gold-400/40"
      />
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
