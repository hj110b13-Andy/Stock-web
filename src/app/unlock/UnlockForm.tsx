"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "密碼錯誤");
        return;
      }
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs space-y-4 rounded-lg border border-(--gridline) bg-(--surface-1) p-6"
      >
        <div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-(--accent) text-white font-bold text-sm">
            SR
          </span>
          <h1 className="mt-3 text-lg font-semibold">請輸入密碼</h1>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--accent)"
        />
        {error && <p className="text-sm text-(--price-down)">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-md bg-(--accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "驗證中…" : "進入"}
        </button>
      </form>
    </div>
  );
}
