"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "stockradar:theme";
const THEME_CHANGED_EVENT = "stockradar:theme-changed";

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

function subscribe(callback: () => void) {
  window.addEventListener(THEME_CHANGED_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGED_EVENT, callback);
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
