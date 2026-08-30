"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-lime-300 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      onClick={handleBack}
      type="button"
    >
      <span aria-hidden="true">←</span> Back to cards
    </button>
  );
}
