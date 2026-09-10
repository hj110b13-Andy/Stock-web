# 股情雷達 StockRadar

公開、免費的股票研究網站 Demo：即時查詢台股與美股報價、互動走勢圖表、篩選排行，並提供 AI 問答快速掌握個股情報。

用 Next.js (App Router) + TypeScript + Tailwind CSS 打造，圖表使用 [lightweight-charts](https://github.com/tradingview/lightweight-charts)。

## 功能

- **首頁**：AI 每日市場快報、我的關注清單、大盤指數（台股／美股分頁）、焦點排行（台股／美股分頁）。
- **個股頁** `/stock/[symbol]`：即時（或近即時）報價、基本面（本益比/殖利率/市值）、K 線圖 + 成交量（1個月/3個月/6個月/1年，滑鼠 hover 顯示當日開高低收與成交量）、客觀技術訊號標籤（爆量、創新高/新低、均線、連漲跌天數）、關注清單星號。報價旁會顯示「盤中／已收盤」狀態：非交易時段顯示最近一次收盤資訊，交易時段中每 20 秒自動刷新，不用手動重新整理（大盤指數卡片也是同樣邏輯）。
- **搜尋 / 篩選** `/search`：台股、美股用分頁切換（不並排），各自可依產業（多選）、股價區間、漲跌幅篩選與排序。
- **每日焦點榜單** `/highlights`：漲幅榜／跌幅榜／成交量榜／技術訊號共振股，台股、美股分開排名，用分頁切換。
- **我的關注**：預設用瀏覽器 localStorage 儲存自選股清單，不需登入，首頁與個股頁可加入/移除、排序、匯出 CSV；設定 Google 登入後，登入即可跨裝置同步同一份清單（見下方「帳號登入」）。
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
- **本站不使用任何示範／假資料。** 股票資訊要求準確性——當即時資料抓取失敗（網路限制、被限流、端點變動、代碼不存在等），系統一律**誠實顯示「目前無法取得資料」**，絕不會用亂數產生的數字頂替。個股頁在報價抓不到時會顯示明確的無法取得資料訊息；圖表、基本面、大盤指數、搜尋/排行清單等在抓不到資料時，一律略過該筆或顯示為空，而不是用替代數字填滿畫面。AI 問答與每日快報同樣只根據實際抓到的資料作答，資料不足時會如實告知使用者，不會編造數字。
- 列表頁（搜尋/焦點榜單/首頁排行/快報）使用**批次查詢**（TWSE 多代碼一次查、Yahoo `v7/finance/quote` 多代碼一次查），而不是每檔股票各打一次 API——後者在單一伺服器函式內對 TWSE/Yahoo 單股查詢端點發出 20+ 個並發請求，容易被限流或逾時。批次查詢大幅提高即時資料的成功率；仍抓不到的個別股票會直接從清單中略過。
- 目前開發沙盒環境本身的對外網路被組織政策限制（僅允許 npm registry / GitHub），因此本機測試時多數即時資料會顯示為無法取得；部署到具備一般對外網路的環境（如 Vercel）後，即時資料串接會自動生效，無需改動程式碼。
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
- **已知限制**：若未設定下方「共用快取」，快取預設是 `lib/data/cache.ts` 裡的記憶體內 Map，屬於單一 Serverless 執行個體，不是跨個體共享的儲存。Cron 只能預熱「處理到這次排程的那個執行個體」，不保證每個訪客連到的執行個體都已經有快取——效果是大幅降低 AI 呼叫次數，但不是嚴格保證「一天只生成一次」。設定共用快取後這個限制就解除了。

### 共用快取（Redis，選用）

預設情況下（不設定任何環境變數）快取存在每個 Serverless 執行個體自己的記憶體裡，同一份資料可能在不同執行個體被重複抓取。設定 Redis 後，`lib/data/cache.ts` 的 `cached()` 會自動改用共用的 Redis 儲存（`lib/data/kv.ts`），所有執行個體、所有訪客共用同一份快取——不用改任何程式碼，設定好環境變數即生效；沒設定的話會自動退回原本的記憶體內快取，網站行為完全不受影響。

任一種都可以（擇一設定）：

| 方式 | 環境變數 |
|---|---|
| Vercel Marketplace「Redis」整合（Project → Storage → 新增 Redis，通常會自動填好） | `KV_REST_API_URL`、`KV_REST_API_TOKEN` |
| 直接連接 Upstash Redis（[upstash.com](https://upstash.com) 免費額度即可） | `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN` |

任何一個 Redis 讀寫失敗都會自動退回即時重新抓資料，不會讓頁面壞掉。

## 帳號登入（選用，Google 一鍵登入）

預設不需要登入即可使用全部功能（自選股存在瀏覽器 localStorage）。設定好下面三個環境變數後，右上角會出現「使用 Google 登入」按鈕，登入後自選股會同步到帳號，換裝置/換瀏覽器登入同一個 Google 帳號就能看到同一份清單。三個變數只要有一個沒設定，登入按鈕就不會顯示，網站其餘功能完全不受影響。

1. 到 [Google Cloud Console → API 憑證](https://console.cloud.google.com/apis/credentials) 建立一組 **OAuth 用戶端 ID**（應用程式類型選「網頁應用程式」），「已授權的重新導向 URI」填：
   - 正式站：`https://你的網域/api/auth/callback/google`
   - 本機開發：`http://localhost:3000/api/auth/callback/google`
2. 把取得的用戶端 ID / 密碼填進環境變數：`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`
3. `AUTH_SECRET`：任意隨機字串（可用 `npx auth secret` 產生），用來加密登入 session

**跨裝置同步需要「共用快取」章節提到的 Redis** 來存放每個帳號的自選股清單；只設定登入、沒設定 Redis 的話，登入功能本身仍然正常（可以登入/登出、看到自己的 Google 頭像），但自選股不會真的跨裝置同步，會退回該裝置的 localStorage（`/api/watchlist` 會回報 `syncAvailable: false`）。首次登入時，會把「這台裝置當下的本機清單」與「帳號裡已同步的清單」取聯集合併（不會互相覆蓋刪除），之後每次加入/移除都會即時推上雲端。

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
      sectors/               搜尋頁產業選單 API
      indices/              大盤指數 API
      ask/                  AI 問答 API（支援多輪對話）
      watchlist/             登入後自選股同步 API（GET/PUT）
      auth/[...nextauth]/    NextAuth（Google 登入）路由
      cron/daily-brief/     每日快報排程觸發端點
    sitemap.ts / robots.ts   SEO：sitemap.xml / robots.txt
  components/               UI 元件（StockChart、ChatWidget、MarketTabs、AuthButton 等）
  lib/
    data/                   資料層：TWSE / Yahoo 抓取器（含批次查詢）、universe.ts（股票清單）、kv.ts（選用 Redis 共用快取）、統一介面（抓不到資料一律回傳 null，不產生假資料）
    ai/                     AI 問答邏輯 + 每日快報生成（provider.ts 共用 Gemini/Claude fallback）
    auth.ts                  NextAuth 設定（Google 登入）
    watchlist.ts              自選股清單（localStorage，未登入或未設定共用儲存時的預設行為）
    watchlistStore.ts         登入後自選股的伺服器端（Redis）儲存
    signals.ts               客觀技術訊號計算（爆量、均線、連漲跌等）
    marketStatus.ts           判斷台股／美股目前是否在交易時段（盤中／已收盤）
    format.ts                數字／價格格式化，含台股慣例（紅漲綠跌）
    site.ts                  網站名稱／網址常數（SEO metadata 用）
```

## 設計慣例

- 依台灣／中文市場慣例：**紅色＝上漲、綠色＝下跌**（與美股常見的紅跌綠漲相反）。
- 淺色／深色模式皆已設計對應色票，並通過色盲友善（CVD）對比驗證；漲跌同時搭配 ▲／▼ 圖示與正負號，不僅依賴顏色辨識。
- 任何同時涉及台股與美股的畫面，一律用分頁（MarketTabs）切換顯示單一市場，不並排顯示兩個市場，避免混淆。

## 免責聲明

本站所有資訊（含公開資料整理與 AI 生成內容）僅供研究參考，不構成任何投資建議。技術訊號與「技術訊號共振股」僅描述當下數據狀態，不是對未來走勢的預測。
