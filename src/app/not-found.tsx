import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-(--gridline) bg-(--surface-1) p-10 text-center">
      <h1 className="text-lg font-semibold">找不到這個頁面</h1>
      <p className="mt-2 text-sm text-(--text-secondary)">網址可能打錯了，或該頁面已經不存在。</p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        回首頁
      </Link>
    </div>
  );
}
