# 股情雷達 StockRadar

公開、免費的股票研究網站 Demo：即時查詢台股與美股報價、互動走勢圖表、篩選排行，並提供 AI 問答快速掌握個股情報。

用 Next.js (App Router) + TypeScript + Tailwind CSS 打造，圖表使用 [lightweight-charts](https://github.com/tradingview/lightweight-charts)。

## 功能

- **首頁**：AI 每日市場快報、我的關注清單、大盤指數（台股／美股分頁）、焦點排行（台股／美股分頁）。
- **個股頁** `/stock/[symbol]`：即時（或近即時）報價、基本面（本益比/殖利率/市值）、K 線圖 + 成交量（1個月/3個月/6個月/1年，滑鼠 hover 顯示當日開高低收與成交量）、客觀技術訊號標籤（爆量、創新高/新低、均線、連漲跌天數）、關注清單星號。
- **搜尋 / 篩選** `/search`：台股、美股用分頁切換（不並排），各自可依產業（多選）、股價區間、漲跌幅篩選與排序。
- **每日焦點榜單** `/highlights`：漲幅榜／跌幅榜／成交量榜／技術訊號共振股，台股、美股分開排名，用分頁切換。
- **我的關注**：用瀏覽器 localStorage 儲存自選股清單，不需登入，首頁與個股頁可加入/移除、排序、匯出 CSV。
- **AI 問答**：右下角浮動聊天視窗，支援多輪對話記憶，可針對目前瀏覽的個股或任何代碼提問，回答會同時參考個股資料與台股＋美股大盤概況。
- **深色模式**：右上角手動切換開關，選擇會記住在瀏覽器；未手動選擇時跟隨系統設定。

> 網站定位是「幫助使用者快速看懂資訊」，刻意不提供「建議買進/賣出」「即將上漲」等操作建議或預測——公開網站對外提供具體投資建議或研判進出時機，在台灣屬於受《證券投資顧問事業管理規則》規範的業務，未取得執照對外提供有法律風險。技術訊號、AI 快報皆為客觀數據描述，並非投資建議或預測。

## 資料來源與限制（重要）

這是一個 **Demo / 雛形**，資料串接方式如下：

| 市場 | 即時報價 | 基本面 | 歷史 K 線 |
|---|---|---|---|
| 台股 | TWSE `mis.twse.com.tw`（單檔 + 批次查詢，非官方但廣泛使用，延遲數分鐘） | TWSE OpenAPI `BWIBBU_ALL`（官方，本益比/殖利率，每日更新） | TWSE `STOCK_DAY`（官方公開日 K 資料） |
| 美股 | Yahoo Finance `chart` + `v7/finance/quote`（批次查詢，非官方） | Yahoo `v7/finance/quote`（本益比/殖利率/市值） | Yahoo `chart`（同左） |

以上皆為**無需 API 金鑰的公開端點**，但：

- 屬於非官方端點，可能隨時變動、被限流或封鎖，正式產品建議改用有授權的資料商（例如 TWSE OpenAPI 正式合作方案、IEX Cloud、Polygon.io、Alpha Vantage 等）。
- 當即時資料抓取失敗（網路限制、被限流、端點變動等），系統會**自動 fallback 為離線示範資料**（以股票代碼做種子的確定性亂數產生，同一天內數值穩定），確保網站在任何環境下都能展示完整功能。畫面上會以「即時資料」／「示範資料」徽章與行末灰點明確標示資料來源，不會混淆使用者。基本面資料抓不到時顯示「資料暫缺」，不會用示範數字頂替（避免跟真實股價放在一起時造成誤導）。
- 列表頁（搜尋/焦點榜單/首頁排行/快報）改用**批次查詢**（TWSE 多代碼一次查、Yahoo `v7/finance/quote` 多代碼一次查），而不是每檔股票各打一次 API——後者在單一伺服器函式內對 TWSE/Yahoo 單股查詢端點發出 20+ 個並發請求，容易被限流或逾時，導致整頁看起來都是示範資料。批次查詢大幅提高即時資料的成功率。
- 目前開發沙盒環境本身的對外網路被組織政策限制（僅允許 npm registry / GitHub），因此本機測試時看到的都是示範資料；部署到具備一般對外網路的環境（如 Vercel）後，即時資料串接會自動生效，無需改動程式碼。
- 搜尋 / 篩選頁與首頁排行榜目前使用一份精選的台股／美股清單（`src/lib/data/universe.ts`，約 44 檔），尚未串接完整上市櫃清單，正式產品應改接 TWSE 完整股票代碼清單與美股資料庫。
- 台股成交量單位：TWSE 即時報價的原始單位是「張」（1張=1000股），程式已換算成股數以跟歷史 K 線的成交量單位一致。

## AI 問答設定

AI 問答與每日快報會以即時/近即時報價與近期走勢作為依據（RAG 概念，非憑空生成數字），支援兩種模型供應商：

| 供應商 | 環境變數 | 費用 | 申請 |
|---|---|---|---|
| Google Gemini（優先使用） | `GEMINI_API_KEY` | 有免費額度，不需信用卡 | https://aistudio.google.com/apikey |
| Anthropic Claude | `ANTHROPIC_API_KEY` | 按量計費 | https://console.anthropic.com |

兩個都設定時會優先呼叫 Gemini，失敗才 fallback 到 Claude。兩個都沒設定時，`/api/ask` 與每日快報會回傳「原始資料整理」的罐頭內容（仍會附上即時/近即時報價），並提示使用者尚未啟用 AI，網站其餘功能不受影響。

本機開發建立 `.env.local`：
```bash
GEMINI_API_KEY=xxxx
```
部署在 Vercel 則在 Project → Settings → Environment Variables 新增同名變數。

### 每日快報排程（Vercel Cron）

`vercel.json` 設定了一個每天 UTC 00:50（台北時間 08:50）觸發 `/api/cron/daily-brief` 的排程，會在當天第一位訪客之前預先生成好快報。快報本身以「台北時間的日期」當快取 key，同一天內所有訪客看到同一份內容。

- 可選環境變數 `CRON_SECRET`：設定後，cron 路由只接受帶正確 `Authorization: Bearer <secret>` 的請求（Vercel 觸發排程時會自動附上，符合 [Vercel 官方作法](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)）；不設定則路由不做驗證，任何人手動打這支 API 只會是提早重新生成快報，沒有安全疑慮。
- **已知限制**：快取是 `lib/data/cache.ts` 裡的記憶體內 Map，屬於單一 Serverless 執行個體，不是跨個體共享的儲存。Cron 只能預熱「處理到這次排程的那個執行個體」，不保證每個訪客連到的執行個體都已經有快取——效果是大幅降低 AI 呼叫次數，但不是嚴格保證「一天只生成一次」。正式產品應改用 Redis / Vercel KV 等共享儲存。

## 開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000

```bash
npm run lint    # ESLint
npm run build   # 正式版建置
```

## 專案結構

```
src/
  app/
    page.tsx              首頁
    stock/[symbol]/       個股頁
    search/                搜尋／篩選頁
    highlights/            每日焦點榜單頁
    api/
      quote/[symbol]/      即時報價 API
      chart/[symbol]/      歷史 K 線 API
      search/               篩選 API
      indices/              大盤指數 API
      ask/                  AI 問答 API（支援多輪對話）
      cron/daily-brief/     每日快報排程觸發端點
  components/               UI 元件（StockChart、ChatWidget、MarketTabs 等）
  lib/
    data/                   資料層：TWSE / Yahoo 抓取器（含批次查詢）、示範資料產生器、快取、統一介面
    ai/                     AI 問答邏輯 + 每日快報生成（provider.ts 共用 Gemini/Claude fallback）
    signals.ts               客觀技術訊號計算（爆量、均線、連漲跌等）
    watchlist.ts              自選股清單（localStorage）
    format.ts                數字／價格格式化，含台股慣例（紅漲綠跌）
```

## 設計慣例

- 依台灣／中文市場慣例：**紅色＝上漲、綠色＝下跌**（與美股常見的紅跌綠漲相反）。
- 淺色／深色模式皆已設計對應色票，並通過色盲友善（CVD）對比驗證；漲跌同時搭配 ▲／▼ 圖示與正負號，不僅依賴顏色辨識。
- 任何同時涉及台股與美股的畫面，一律用分頁（MarketTabs）切換顯示單一市場，不並排顯示兩個市場，避免混淆。

## 免責聲明

本站所有資訊（含公開資料整理與 AI 生成內容）僅供研究參考，不構成任何投資建議。技術訊號與「技術訊號共振股」僅描述當下數據狀態，不是對未來走勢的預測。
