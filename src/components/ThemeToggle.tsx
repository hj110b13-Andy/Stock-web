"use client";

import { useSyncExternalStore } from "react";
import { THEME_CHANGED_EVENT, THEME_STORAGE_KEY as STORAGE_KEY, subscribeToTheme } from "@/lib/theme";

function getSnapshot(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getServerSnapshot(): "light" | "dark" {
  return "light";
}

export default function ThemeToggle() {
  // subscribeToTheme also watches the OS preference, so the icon stays
  // correct when the visitor has never picked a theme explicitly and their
  // system flips to dark mode.
  const theme = useSyncExternalStore(subscribeToTheme, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — theme still applies for this page view
    }
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
      title={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
      className="rounded-md p-2 text-(--text-secondary) hover:bg-(--page-plane)"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
