"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SiteHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/stock/${encodeURIComponent(trimmed)}`);
  }

  return (
    <header className="border-b border-(--gridline) bg-(--surface-1)">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-(--accent) text-white font-bold text-sm">
            SR
          </span>
          <span className="font-semibold text-lg tracking-tight">股情雷達</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-2 rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--page-plane)">
            首頁
          </Link>
          <Link href="/highlights" className="px-3 py-2 rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--page-plane)">
            每日焦點
          </Link>
          <Link href="/search" className="px-3 py-2 rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--page-plane)">
            搜尋 / 篩選
          </Link>
        </nav>

        <form onSubmit={handleSubmit} className="ml-auto flex-1 max-w-sm">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="輸入股票代碼，例如 2330 或 AAPL"
            className="w-full rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-2 text-sm placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--accent)"
          />
        </form>
      </div>
      <nav className="flex sm:hidden items-center gap-1 px-4 pb-2 text-sm">
        <Link href="/" className="px-3 py-1.5 rounded-md text-(--text-secondary) hover:bg-(--page-plane)">
          首頁
        </Link>
        <Link href="/highlights" className="px-3 py-1.5 rounded-md text-(--text-secondary) hover:bg-(--page-plane)">
          每日焦點
        </Link>
        <Link href="/search" className="px-3 py-1.5 rounded-md text-(--text-secondary) hover:bg-(--page-plane)">
          搜尋 / 篩選
        </Link>
      </nav>
    </header>
  );
}
