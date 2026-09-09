import { Suspense } from "react";
import type { Metadata } from "next";
import SearchClient from "@/components/SearchClient";

export const metadata: Metadata = {
  title: "搜尋 / 篩選股票",
  description: "依產業、股價區間、漲跌幅篩選並排序台股與美股，快速找到符合條件的股票。",
  alternates: { canonical: "/search" },
};

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-(--surface-1)" />}>
      <SearchClient />
    </Suspense>
  );
}
