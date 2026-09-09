import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "股情雷達 StockRadar｜台股美股即時查詢與 AI 問答",
  description: "免費公開的股票研究網站：即時查詢台股與美股報價、互動走勢圖表、篩選排行，並可用 AI 問答快速掌握個股情報。",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('stockradar:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-(--page-plane) text-(--text-primary)">
        <SiteHeader />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        <footer className="border-t border-(--gridline) py-6 text-center text-xs text-(--text-muted)">
          <p>本站資訊為公開資料整理與 AI 生成內容，僅供研究參考，不構成投資建議。</p>
          <p className="mt-1">股情雷達 StockRadar · Demo</p>
        </footer>
        <ChatWidget />
      </body>
    </html>
  );
}
