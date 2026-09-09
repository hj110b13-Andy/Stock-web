"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButton() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  if (status === "loading") {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-(--page-plane)" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className="rounded-md border border-(--gridline) bg-(--surface-2) px-3 py-1.5 text-sm font-medium hover:bg-(--page-plane) whitespace-nowrap"
      >
        使用 Google 登入
      </button>
    );
  }

  const label = session.user.name ?? session.user.email ?? "已登入";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-(--gridline) bg-(--surface-2) py-1 pl-1 pr-2 text-sm hover:bg-(--page-plane)"
        title={label}
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not worth Next/Image config for a small header avatar
          <img src={session.user.image} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--accent) text-xs text-white">
            {label.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-24 truncate sm:inline">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-(--gridline) bg-(--surface-1) p-1 text-sm shadow-lg">
            <p className="truncate px-2 py-1.5 text-xs text-(--text-muted)">{session.user.email}</p>
            <button
              type="button"
              onClick={() => signOut()}
              className="w-full rounded px-2 py-1.5 text-left hover:bg-(--page-plane)"
            >
              登出
            </button>
          </div>
        </>
      )}
    </div>
  );
}
