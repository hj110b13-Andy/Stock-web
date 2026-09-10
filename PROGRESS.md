# PROGRESS.md — 專案現況與工作日誌

> **給接手這個專案的 Claude Code：** 這份文件是為了讓你在完全沒有先前對話紀錄的情況下，
> 也能看懂這個 repo 每個資料夾/檔案在幹嘛、目前做到哪、之前修過什麼問題。
> 每次修改完程式碼準備回覆使用者之前，**先讀這份文件掌握現況，回覆前再照 CLAUDE.md
> 的規定更新這份文件並 push**（見下方「跨裝置接續規則」）。

## 這是什麼專案

**股情雷達 StockRadar**——公開、免費的台股／美股股票研究網站。即時查詢報價、互動 K 線圖、
篩選排行、AI 問答。Next.js (App Router) + TypeScript + Tailwind CSS，圖表用
[lightweight-charts](https://github.com/tradingview/lightweight-charts)。

- **正式站**：https://stock-web-blond.vercel.app
- **GitHub**：hj110b13-Andy/Stock-web
- **開發分支**：`claude/relaxed-curie-c69kp0`（所有工作都在這個分支上，push 上去 Vercel 會自動部署）
- **功能完整說明、環境變數設定、資料來源限制**：見 `README.md`，這份文件不重複列，只補「檔案功能地圖」跟「工作日誌」。

## 資料夾與檔案功能地圖

```
src/
├─ app/                              Next.js App Router 頁面與 API
│  ├─ page.tsx                       首頁：大盤指數、AI 每日快報、焦點排行、我的關注清單
│  ├─ layout.tsx                     全站 layout；deferred 深色模式偵測 inline script（避免 FOUC）
│  ├─ not-found.tsx                  404 頁
│  ├─ robots.ts / sitemap.ts         SEO：/robots.txt、/sitemap.xml
│  ├─ globals.css                    全站設計 token（CSS 變數）：淺色/深色配色、紅漲綠跌色票
│  ├─ stock/[symbol]/page.tsx        個股頁：報價 + K線 + 技術訊號 + 基本面 + AI問答 + 關注按鈕
│  ├─ search/page.tsx                搜尋/篩選頁（外殼，實際邏輯在 components/SearchClient.tsx）
│  ├─ highlights/page.tsx            每日焦點榜單：漲幅/跌幅/成交量榜 + 技術訊號共振股
│  └─ api/
│     ├─ quote/[symbol]/route.ts     GET 單檔即時報價
│     ├─ chart/[symbol]/route.ts     GET 歷史 K 線（range: 1m/3m/6m/1y）
│     ├─ search/route.ts             GET 篩選/排序股票清單（市場、產業、價格區間、漲跌幅）
│     ├─ sectors/route.ts            GET 指定市場的產業分類選單
│     ├─ indices/route.ts            GET 大盤指數
│     ├─ ask/route.ts                POST AI 問答（支援多輪對話歷史）
│     ├─ watchlist/route.ts          GET/PUT 登入後自選股跨裝置同步
│     ├─ auth/[...nextauth]/route.ts NextAuth（Google 登入）
│     └─ cron/daily-brief/route.ts   Vercel Cron 排程觸發：預先生成當天 AI 快報
│
├─ components/                       UI 元件（React, 'use client' 除非明確是 server component）
│  ├─ StockChart.tsx                 K 線圖 + 成交量（lightweight-charts），會讀 CSS 變數換色
│  ├─ ChatWidget.tsx                 右下角 AI 問答浮動視窗，多輪對話
│  ├─ AskAboutButton.tsx             個股頁「問AI關於這檔股票」按鈕，會設定聊天視窗的 grounded symbol
│  ├─ MarketTabs.tsx                 台股/美股分頁切換共用元件（全站涉及雙市場的地方都用它，不並排）
│  ├─ StockTable.tsx                 股票清單表格（排行/搜尋結果共用）
│  ├─ MomentumTable.tsx              技術訊號共振股清單
│  ├─ SearchClient.tsx               搜尋頁的篩選邏輯（產業多選、價格區間、debounce）
│  ├─ SignalTags.tsx                 個股頁技術訊號標籤（爆量/創新高低/均線/連漲跌）
│  ├─ FundamentalsCard.tsx           基本面卡片（本益比/殖利率/市值）
│  ├─ LiveQuoteHeader.tsx            個股頁報價 header，盤中每 20 秒自動刷新
│  ├─ LiveIndices.tsx / IndexCard.tsx 首頁大盤指數卡片，同樣有自動刷新
│  ├─ MarketStatusBadge.tsx          「盤中／已收盤」狀態徽章
│  ├─ DailyBriefCard.tsx             首頁 AI 每日快報卡片
│  ├─ WatchlistButton.tsx            加入/移除關注清單的星號按鈕
│  ├─ WatchlistSection.tsx           首頁「我的關注」清單區塊（排序、匯出 CSV）
│  ├─ WatchlistSync.tsx              登入後把本機 localStorage 清單與雲端清單合併同步
│  ├─ ThemeToggle.tsx                深色模式手動切換開關，寫 data-theme + localStorage
│  ├─ SiteHeader.tsx                 全站頂部導覽列（含 ThemeToggle、AuthButton）
│  ├─ AuthButton.tsx                 Google 登入/登出按鈕
│  └─ AuthProvider.tsx               NextAuth SessionProvider 包裝
│
└─ lib/
   ├─ data/                          資料層——所有股票資料的唯一進出口
   │  ├─ index.ts                    對外統一介面：getQuote/getChart/getIndices/searchStocks/
   │  │                              getFundamentals/getMultiSignalStocks/detectMarket/normalizeSymbol
   │  │                              等，全部「抓不到資料就回 null，絕不產生假資料」
   │  ├─ twse.ts                     台股資料抓取：TWSE 即時報價/K線/OpenAPI 基本面（非官方即時端點）
   │  ├─ us.ts                       美股資料抓取：Yahoo Finance 報價/K線/基本面
   │  ├─ universe.ts                 股票清單：台股動態抓 TWSE 官方上市清單（取權值股優先的 100 檔子集，
   │  │                              見下方工作日誌 3202cc7），美股約 100 檔精選跨產業大型股種子清單
   │  ├─ cache.ts                    共用 TTL 快取：cached()/cachedMap()，Redis 優先、記憶體備援、
   │  │                              single-flight 去重複、null 值也會被正確快取（見工作日誌，這層踩過最多坑）
   │  ├─ kv.ts                       Redis 連線設定（Vercel KV / Upstash，選用，沒設定就退回記憶體快取）
   │  └─ types.ts                    Market / Quote / Chart 等共用型別
   │
   ├─ ai/                            AI 問答與每日快報
   │  ├─ provider.ts                 共用的 Gemini→Claude fallback 呼叫邏輯（callAiProviders），
   │  │                              處理對話歷史裁切、開頭必須是 user、合併連續同角色 turn
   │  ├─ ask.ts                      /api/ask 的問答邏輯：組 system prompt、抓相關股票資料當 RAG context
   │  ├─ brief.ts                    每日 AI 快報生成邏輯，以台北時間日期當快取 key
   │  ├─ gemini.ts                   Gemini API 呼叫封裝（含自動探測可用模型名稱）
   │  └─ types.ts                    ChatTurn 等共用型別
   │
   ├─ auth.ts                        NextAuth 設定（Google Provider）
   ├─ watchlist.ts                   自選股清單邏輯，未登入/未設 Redis 時的預設行為（localStorage）
   ├─ watchlistStore.ts              登入後自選股的伺服器端 Redis 儲存
   ├─ signals.ts                     客觀技術訊號計算（不是預測，只描述當下數據狀態）
   ├─ marketStatus.ts                判斷台股/美股目前是否為交易時段
   ├─ format.ts                      數字/價格格式化（含台股紅漲綠跌慣例）
   ├─ theme.ts                       深色模式相關輔助（讀 CSS 變數、fallback 色票）
   ├─ chatEvents.ts                  跨元件溝通用的事件（例如 AskAboutButton 通知 ChatWidget 换聚焦股票）
   └─ site.ts                        網站名稱/網址常數（SEO metadata 用）

根目錄:
├─ README.md          完整功能說明、環境變數設定、資料來源與限制、專案結構、設計慣例
├─ CLAUDE.md           使用者要求的品保流程規則（每次對話都要照做，見下方摘要）
├─ AGENTS.md            Next.js 版本提醒（這個版本跟訓練資料的 Next.js 可能有差異，寫程式前看 node_modules/next/dist/docs/）
├─ vercel.json          Vercel Cron 排程設定（每天觸發每日快報預生成）
└─ .env.example         需要的環境變數範例（AI API key、Redis、Google OAuth，全部選用）
```

## 目前所有功能（快速索引，細節見 README.md）

首頁大盤指數/AI快報/關注清單、個股頁報價+K線+技術訊號+基本面+AI問答、搜尋/篩選頁（產業多選+價格區間）、
每日焦點榜單（漲跌幅/成交量/技術訊號共振）、AI 多輪問答、每日 AI 快報（Vercel Cron 排程）、
關注清單（localStorage，登入後跨裝置同步）、深色模式、共用 Redis 快取（選用）、Google 登入（選用）、
全站 SEO metadata。**全站不使用任何示範/假資料**——抓不到就誠實顯示「資料暫缺」。

## 重要慣例與限制

- **紅漲綠跌**：台灣/中國市場慣例，跟美股常見的反過來，全站配色與 `format.ts` 都照這個做。
- **不提供投資建議**：技術訊號、AI 快報都是客觀數據描述，不是「建議買賣」或「預測上漲」——這是法律考量（台灣證券投顧法規），不是隨便加的免責聲明，改動 AI prompt 或訊號文案時要注意別越界。
- **雙市場一律用分頁，不並排**：`MarketTabs` 元件，全站慣例。
- **這個 sandbox 開發環境對外網路被組織政策限制**：連不到 TWSE/Yahoo 上游、連不到正式站
  `stock-web-blond.vercel.app`、也沒有安裝 Playwright/Puppeteer。本機測試時這是正常現象，
  不代表程式碼壞掉；用 `npm run build && npm run start` + curl 掃路由、加上寫 node 腳本直接
  載入真正的模組執行，是這個環境目前能做到的最接近瀏覽器實測的驗證方式。部署到 Vercel 後
  這些資料源會自動打通，不用改程式碼。

## 品保流程（詳細規則見 CLAUDE.md，這裡只摘要）

使用者要求每次對話回報「更新完成」前要走完：
1. **規則一**：同一類問題卡關連續失敗 2 次，第 3 次要同步派 2 個不同模型 agent 上網查解法，交疊進行不間斷。
2. **規則二**：自己先做一次完整的實測（build+start+curl，模擬瀏覽器操作）地毯式檢查，抓到的問題全部修好；之後只要針對這次修的問題複查即可，不必每次重新全站掃。
3. **規則三**：規則二做完後，派 1 個 Opus agent（額度不夠才臨時換模型頂替，之後仍改回 Opus）做一次完整地毯式檢查；抓到的問題自己修，修不好就讓 Opus 直接動手；之後只需針對這次修的問題再複查，直到 Opus 確認「沒有發現問題」才能回報「更新完成」。
4. **規則四**：每次回覆使用者都要附上網站網址 https://stock-web-blond.vercel.app 。
5. **規則五（跨裝置接續）**：每次回覆使用者之前，都要更新這份 PROGRESS.md 並 push，讓其他裝置的 Claude Code 接得上。

## 工作日誌（新到舊，只列有意義的變更；commit hash 對應 `git log`）

### 2026-09-10：跨裝置文件化
- 建立這份 `PROGRESS.md`，CLAUDE.md 新增規則五（跨裝置接續：每次回覆前更新這份文件並 push）。

### 2026-09-10：規則二/三流程改為「只做一次全面檢查＋之後只複查問題點」
- `bceacb3` 使用者要求把原本「重複全站地毯式檢查直到某輪完全沒問題」的高成本循環，改成規則二、三各自只需一次完整全面檢查，之後只需針對「這次發現並修正的問題」逐一複查，不必每次重新掃整站。

### 2026-09-10：第三輪 Opus 驗證挖出的次要問題 + 深色模式漏改
- `d31ddd0` 修好 4 個次要問題：
  1. `/api/quote`、`/api/chart`、`/api/search`、`/api/indices` 出錯時把內部 `err.message` 原封不動回給前端（可能洩漏內部細節）→ 改成統一中文提示，內部細節用 `console.error` 記錄。
  2. `/api/quote`、`/api/chart`、`/api/sectors` 的 `market` 參數沒驗證，壞值（如 `?market=BOGUS`）會被當合法市場直接用 → 改成壞值視同未提供，落回自動判斷/預設值。
  3. `callAiProviders()` 只處理了「開頭是 assistant」的裁切情況，沒處理呼叫端傳入連續同角色 turn 的情況（兩家 AI API 都會因此 400）→ 加上合併連續同角色 turn 的邏輯。
  4. 深色模式 `--price-down` 對比不足（約 3.9:1，低於 WCAG 4.5:1）→ 調亮成 `#00b300`（約 6-7:1）。
- `737f335` 上面第 4 項只改了「跟隨系統深色」的 CSS 區塊，漏改「手動點擊深色模式切換鈕」實際用到的
  `:root[data-theme="dark"]` 獨立區塊 → 補齊，兩區塊值一致。**教訓：這個網站深色模式有兩套獨立的
  CSS 變數定義區塊（`@media (prefers-color-scheme: dark)` 跟 `:root[data-theme="dark"]`），改深色配色
  一定要兩處都改，globals.css 裡已經有多次因為只改一處而漏掉的前科。**

### 2026-09-10：Opus 全站地毯式驗證挖出的主要功能性 bug（規則三第一輪）
- `3202cc7` 修好 8 個問題，其中最嚴重的兩個：
  1. **台股榜單看不到台積電等權值股**：`universe.ts` 對 TWSE 官方清單用 `slice(0,100)` 截斷，該清單按代號排序，結果只留下 1101-1799 這段冷門的水泥/食品/紡織股，2330/2317/2454/2412 與整個 28xx 金融股全部被濾掉——首頁排行、焦點榜單、每日快報的台股內容因此長期都是冷門小型股，不是真正熱門股。改成優先納入權值股。
  2. **AI 問答聊到第 5 輪就壞掉**：對話歷史裁切邏輯只砍長度，沒處理裁切後開頭變成 assistant 的情況，兩家 AI API 都要求對話必須從 user 開始，結果變成每次 400、靜默退化成罐頭回覆（使用者感覺像 AI 壞了）。
  其他修正：K 線「1個月」實際是「本月至今」（月初技術訊號會因資料點不足而消失）、深色模式切換後 K 線圖 canvas 顏色不會跟著變、技術訊號共振股一次對 TWSE 開約 100 個併發連線（降到峰值 16 個）、搜尋 API 數字參數格式錯誤會讓結果變成「共 0 筆」（`NaN` 比較永遠 false）、AI 問答「聚焦股票」離開個股頁後無法取消、關注清單 PUT 無長度上限、部分 API 未攔例外、搜尋頁無 debounce。

### 2026-09-10：快取層重大修正（規則二 + 規則三初次驗證）
- `fa5d2f6` **最根本的效能問題**：`cached()` 沒有合併同時進行中的重複請求（single-flight），首頁一次載入會對同一個 key（例如台股報價）同時發出 4-6 次完整批次抓取，大幅放大延遲與被上游限流的機率。這是拖垮網站的主因。
- `91f9c2a` Opus 驗證輪又挖出 4 個快取層真實 bug：
  1. **Map 被 Redis 摧毀（最嚴重）**：`market-quotes:TW/US`、`fundamentals:TW:all` 這類值是 `Map`，但 `JSON.stringify(Map)` 是 `"{}"`——Redis 開啟時第一次請求後續全部讀回空物件，`.get()`/`.has()` 都不存在，直接讓首頁、搜尋頁 500。加了 `cachedMap()` 分開處理，並在 `cached()` 裡加防呆（存到 Map/Set 會 `console.error` 而不是靜默寫壞）。
  2. 記憶體快取 TTL 起算點抓錯（`load()` 開始前算，而非結束後才算），慢查詢會讓快取寫入時就已過期，形成「越慢越沒快取、越查越慢」的惡性循環。
  3. single-flight 註冊時機在工作開始之後（因為 `async` 函式同步跑到第一個 `await` 才觸發排程），有短暫的重複請求空窗，改用 microtask 延後排程確保先註冊再開始。
  4. Redis 設定了但暫時連不上時完全沒有備援（原本只在「未設定 Redis」才退回記憶體），改成記憶體當 L1 一律寫入。
  5. 記憶體快取無上限，`/stock/<任意值>` 會產生新 key，加上 null 值也快取，爬蟲可把常駐 instance 撐到 OOM，加了 500 筆上限 + 過期優先淘汰。
  6. Redis 端 `null` 值原本跟「沒這個 key」無法區分（會被誤判成 cache miss），改用 `{v, e}` envelope 包裝。
- `6efdc3b` 共用快取值原本讀回本機記憶體時會重新起算一次完整 TTL（同一份資料最久可能被多服務近兩倍 TTL），改成把到期時間 `e` 一起存，本機只沿用「剩餘」的時間。

### 2026-09-10 之前：功能開發（詳見 git log，重點如下）
- `c2f6116` 降低股票清單規模與批次併發量，修正正式站緩慢/逾時、個股頁抓不到資料的問題。
- `b00425f` 關注清單比對 symbol 忽略大小寫。
- `be034ba` 新增 SEO、擴充股票清單（台股完整上市清單 + 美股 S&P500）、共用快取（Redis 整合先備妥）、Google 登入跨裝置同步。
- `b61b9ba` 移除所有示範/假資料，抓取失敗一律誠實顯示「資料暫缺」（這是網站的核心誠信原則，之後任何修改都不能違反）。
- `477ffaa` 修正清單頁大量資料可靠性問題，新增基本面卡片、技術訊號共振股、深色模式、AI 多輪對話。
- `89cf22d` 新增關注清單、技術訊號標籤、每日焦點榜單、AI 每日快報。
- 再更早：`eb7b09a` 專案從零搭建（StockRadar 骨架：報價、圖表、搜尋、AI 問答）。

## 目前已知問題

無。最近一輪 Opus 複查（針對上面「深色模式漏改」的補丁）回報「沒有發現問題」。

如果你接手後又發現了新問題，**除了修正之外，記得也在這份文件的「工作日誌」補一筆，並更新這個章節。**
