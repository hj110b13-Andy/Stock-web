import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import ChatWidget from "@/components/ChatWidget";
import AuthProvider from "@/components/AuthProvider";
import WatchlistSync from "@/components/WatchlistSync";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = `${SITE_NAME}｜台股美股即時查詢與 AI 問答`;
const DESCRIPTION = "免費公開的股票研究網站：即時查詢台股與美股報價、互動走勢圖表、篩選排行，並可用 AI 問答快速掌握個股情報。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s｜${SITE_NAME}` },
  description: DESCRIPTION,
  keywords: ["股票", "台股", "美股", "股價查詢", "K線圖", "技術分析", "AI問答", "StockRadar", "股情雷達"],
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('stockradar:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Google sign-in needs all three; if any is missing, auth is fully
  // disabled — SessionProvider isn't even mounted, so no component ever
  // calls useSession() without a provider, and no request ever reaches
  // NextAuth's session handler without a secret configured for it.
  const authEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);

  const body = (
    <>
      <SiteHeader authEnabled={authEnabled} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      <footer className="border-t border-(--gridline) py-6 text-center text-xs text-(--text-muted)">
        <p>本站資訊為公開資料整理與 AI 生成內容，僅供研究參考，不構成投資建議。</p>
        <p className="mt-1">股情雷達 StockRadar · Demo</p>
      </footer>
      <ChatWidget />
      {authEnabled && <WatchlistSync />}
    </>
  );

  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-(--page-plane) text-(--text-primary)">
        {authEnabled ? <AuthProvider>{body}</AuthProvider> : body}
      </body>
    </html>
  );
}
