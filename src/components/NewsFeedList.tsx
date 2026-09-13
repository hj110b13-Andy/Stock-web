"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NewsFeedItem } from "@/lib/ai/newsfeed";
import { formatTaipeiDateTime } from "@/lib/format";

const PAGE_LIMIT = 20;

interface FeedResponse {
  pinned: NewsFeedItem[];
  items: NewsFeedItem[];
  hasMore: boolean;
  generatedAt: string;
}

export default function NewsFeedList() {
  const [pinned, setPinned] = useState<NewsFeedItem[] | null>(null);
  const [items, setItems] = useState<NewsFeedItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guards against the IntersectionObserver firing again while a fetch it
  // triggered is still in flight — `loadingMore` state alone can lag a
  // render behind a rapid second intersection event.
  const loadingRef = useRef(false);

  // Initial load — a plain fetch chain kicked off by the effect, same shape
  // as MomentumSection's: nothing in the effect body itself calls setState
  // synchronously (only the async .then() continuation does), which is what
  // React's set-state-in-effect rule wants to see.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/news-feed?offset=0&limit=${PAGE_LIMIT}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: FeedResponse) => {
        if (cancelled) return;
        setPinned(data.pinned ?? []);
        setItems(data.items);
        setHasMore(data.hasMore);
      })
      .catch(() => {
        if (!cancelled) setInitialError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recreated whenever `items`/`hasMore` change so the offset and cutoff it
  // captures are always current — this only re-runs on state changes that
  // happen a handful of times per session (each successful page load), not
  // per scroll event, so there's no meaningful cost to not memoizing harder.
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    fetch(`/api/news-feed?offset=${items.length}&limit=${PAGE_LIMIT}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: FeedResponse) => {
        setItems((prev) => [...prev, ...data.items]);
        setHasMore(data.hasMore);
      })
      .catch(() => setHasMore(false))
      .finally(() => {
        loadingRef.current = false;
        setLoadingMore(false);
      });
  }, [items.length, hasMore]);

  // Infinite scroll: observe a sentinel div below the list and load the next
  // page once it scrolls into view. Re-subscribes whenever `loadMore`
  // changes (i.e. after each page load) — cheap, since re-registering an
  // IntersectionObserver on the same element is not a meaningful cost.
  useEffect(() => {
    const el = sentinelRef.current;
    // Also gated on the initial load having finished (`pinned !== null`):
    // on first mount the page is short enough that the sentinel can already
    // sit inside the 400px rootMargin, so without this the observer fired
    // loadMore() immediately — racing the initial-load effect's own fetch
    // of the same offset 0 and appending a duplicate first page once both
    // resolved (observed locally: 40 rendered items instead of 20).
    if (!el || !hasMore || pinned === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore, pinned]);

  if (initialError) {
    return (
      <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-10 text-center">
        <p className="text-(--text-secondary)">新聞資訊目前無法取得，請稍後再試。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pinned && pinned.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-(--text-primary)">🔥 重大焦點</h2>
          <ul className="space-y-2">
            {pinned.map((item) => (
              <NewsFeedRow key={`pinned-${item.id}`} item={item} pinned />
            ))}
          </ul>
        </section>
      )}

      <section>
        {pinned && pinned.length > 0 && <h2 className="mb-3 text-sm font-semibold text-(--text-primary)">最新資訊</h2>}
        {pinned === null ? (
          <FeedSkeleton />
        ) : items.length === 0 && !hasMore ? (
          <p className="py-8 text-center text-sm text-(--text-muted)">目前查不到相關新聞。</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <NewsFeedRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <div ref={sentinelRef} className="py-4 text-center text-xs text-(--text-muted)">
        {loadingMore ? "載入中…" : !hasMore && items.length > 0 ? "已經到底囉" : ""}
      </div>
    </div>
  );
}

function NewsFeedRow({ item, pinned }: { item: NewsFeedItem; pinned?: boolean }) {
  const content = (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        pinned
          ? "border-(--accent) bg-(--accent-soft) hover:opacity-90"
          : "border-(--gridline) bg-(--surface-1) hover:bg-(--page-plane)"
      }`}
    >
      <p className="text-sm font-medium text-(--text-primary)">{item.title}</p>
      <p className="mt-1 text-xs text-(--text-muted)">
        {item.source ?? "來源不明"}
        {item.pubDate && ` · ${formatTaipeiDateTime(item.pubDate).slice(0, -3)}`}
      </p>
    </div>
  );

  if (!item.link) return content;
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="block">
      {content}
    </a>
  );
}

function FeedSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="h-16 animate-pulse rounded-lg border border-(--gridline) bg-(--surface-1)" />
      ))}
    </ul>
  );
}
