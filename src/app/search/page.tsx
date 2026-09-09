import { Suspense } from "react";
import SearchClient from "@/components/SearchClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-(--surface-1)" />}>
      <SearchClient />
    </Suspense>
  );
}
