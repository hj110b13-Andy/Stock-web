import type { Signal } from "@/lib/signals";

const TONE_CLASS: Record<Signal["tone"], string> = {
  up: "bg-(--price-up)/10 text-(--price-up)",
  down: "bg-(--price-down)/10 text-(--price-down)",
  neutral: "bg-(--page-plane) text-(--text-secondary)",
};

export default function SignalTags({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map((s) => (
        <span key={s.label} className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[s.tone]}`}>
          {s.label}
        </span>
      ))}
    </div>
  );
}
