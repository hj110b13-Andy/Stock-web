export const THEME_STORAGE_KEY = "stockradar:theme";
export const THEME_CHANGED_EVENT = "stockradar:theme-changed";

export type Theme = "light" | "dark";

/**
 * Subscribes to every way the effective theme can change: the in-app
 * toggle (which dispatches THEME_CHANGED_EVENT) and, when the visitor
 * hasn't picked one explicitly, the OS-level colour-scheme preference.
 * Returns an unsubscribe function.
 *
 * Anything that reads the CSS custom properties *imperatively* — i.e.
 * canvas-style widgets that can't just be restyled by CSS, like the
 * lightweight-charts K 線圖 — has to re-read them on this, or it keeps
 * whatever palette happened to be active when it was created.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGED_EVENT, onChange);
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, onChange);
    media?.removeEventListener("change", onChange);
  };
}

/**
 * Half-transparent version of a colour, for the volume bars that sit
 * behind the candles. `#rrggbb` becomes `#rrggbbaa` (understood by canvas
 * in every current browser); anything else is handed back untouched rather
 * than mangled, since the custom properties could hold any colour syntax.
 */
function translucent(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}80` : color;
}

/** The palette the chart needs, read from the CSS custom properties that
 *  are currently in effect (they change with the theme). */
export function readChartPalette() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const priceUp = read("--price-up", "#e34948");
  const priceDown = read("--price-down", "#008300");
  return {
    textSecondary: read("--text-secondary", "#52514e"),
    gridline: read("--gridline", "#e1e0d9"),
    priceUp,
    priceDown,
    priceUpSoft: translucent(priceUp),
    priceDownSoft: translucent(priceDown),
    textMuted: read("--text-muted", "#898781"),
  };
}
