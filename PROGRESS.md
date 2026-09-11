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

### 2026-09-11：Opus 規則三第一輪挖出 9 個資料正確性問題，全部修好並驗證（`9758888`）
派出的 Opus agent 用 Playwright + 直接打上游 API（TWSE MIS、Yahoo）比對，抓到的問題比規則二自測
更深：不只是頁面會不會壞，而是**顯示的數字本身是錯的**。全部自己修好，且每一項都用真實上游資料
（不是假資料/mock）在本機 `npm run start` 打 http://localhost:3100 驗證過一次，再部署到正式站
複驗一次：

1. **美股漲跌幅算錯、方向可能相反**（`src/lib/data/us.ts` `fetchUsQuote`）：K 線用的是「1個月」
   區間，Yahoo 在這個區間下不會回傳 `meta.previousClose`，程式退回 `chartPreviousClose`（一個月前
   的收盤價）當「昨收」去算漲跌——TSLA 那天其實下跌，網站卻顯示大漲近 10%；AAPL 同理，開盤價也因為
   同一顆 `meta.regularMarketOpen` 缺欄位而直接顯示成目前價。改成從同一次抓到的每日 K 棒陣列裡讀
   「今天」跟「昨天」兩根真正的棒子，不再依賴會隨 range 消失的 meta 欄位。驗證：AAPL 改前 +5.94%→
   改後 +3.56%，TSLA 改前 +9.88%（方向錯）→ 改後 -1.16%（正確）。
2. **台股約 92% 個股整天卡在平盤 0.00%、股價可能超出當日高低區間**（`src/lib/data/twse.ts`
   `rowToQuote`）：TWSE MIS 的成交價欄位 `z` 沒成交時是 `"-"`，原本直接退回昨收，導致沒有最新
   成交的股票全部顯示平盤；改成 `z` 無效時退回當下最佳買/賣價（`b`/`a` 欄位）的中價，這兩個欄位
   TWSE 有即時在更新。驗證：`/api/search?market=TW` 100 檔中卡在 0.00% 的數量從 92 檔降到 3 檔。
3. **美股批次報價／基本面整個抓不到**（`src/lib/data/us.ts`）：Yahoo `v7/finance/quote` 現在要求
   cookie + crumb 驗證，沒帶就回 401——這個端點被搜尋頁美股分頁、焦點榜單美股、首頁美股排行、
   個股頁基本面卡片共用，全部因此掛空。新增 `getYahooAuth()`：先跟 `fc.yahoo.com` 換 cookie、
   再跟 `v1/test/getcrumb` 換 crumb（快取 50 分鐘），帶著這兩樣重打原本的端點。驗證：
   `/api/search?market=US` 從 0 筆變 106 筆，AAPL 基本面本益比/殖利率/市值也都拿得到了。
   **教訓：Yahoo Finance 這類非官方端點會不預警換驗證方式，之後如果美股資料又整個消失，
   先懷疑是不是 Yahoo 又改規則，不要照原本邏輯除錯。**
4. **首頁搜尋框打中文公司名稱查不到、還會被誤判成美股**（`src/lib/data/index.ts`
   `normalizeSymbol`）：AI 問答之前已經有 `findSymbolByName`（見上一輪修正），但搜尋框走的是
   `normalizeSymbol` 這條不同路徑，沒接上同一個名稱比對。現在補上。
5. **不存在的台股代號（如 9999）顯示一整頁「非數值」而非資料暫缺**（`twse.ts` `rowToQuote`）：
   MIS 對查無此股的代號回傳的列缺乏有效昨收數字，原本沒判斷直接建構出全 NaN 的 Quote 物件，
   違反「抓不到就回 null」的原則。現在昨收不是有效數字就視為查無此股。
6. **台股清單仍偏傳產小型股，缺聯電/玉山金/台灣大/統一超/元大金/第一金/和碩/緯創/台塑化/中租
   等知名股**（`universe.ts`）：`3202cc7` 那次只優先放了 24 檔，其餘 76 個名額仍照代號順序排，
   還是排擠掉很多常見股。這次擴充到約 44 檔優先名單，補齊電機機械/化學工業/觀光事業/生技醫療/
   貿易百貨等原本 17 個產業分類裡沒有代表股的類別。**這是跟 `3202cc7` 同一類問題的延續，如果
   之後又有人反應「搜不到某檔知名股」，先查是不是又被 76 個代號序名額排擠掉，不是新 bug。**
7. **AI 問答把「2025年」誤判成台股代號 2025（千興）**（`lib/ai/ask.ts`）：`SYMBOL_PATTERN` 對
   4-6 碼數字沒有排除「後面接年」的情況。加上這個排除條件。
8. **大盤指數偶爾整組消失 20 秒，即使上游馬上恢復**（`index.ts` `getIndices`）：原本 4 個指數
   共用一個快取 key，剛好同時全部抓取失敗時會把「空陣列」快取整整一個 TTL。改成每個指數自己的
   快取 key，一個失敗不會拖累其他已經成功的。

以下這幾項一開始看起來像 bug，追查後發現不是（附上如何驗證排除，避免以後重複查一樣的東西）：
- Google 登入按鈕不顯示：正式站沒設定 `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`AUTH_SECRET`，
  `layout.tsx` 的 `authEnabled` 判斷讓整個登入功能優雅隱藏，這是刻意設計（登入本來就選用），
  不是 bug。
- 一開始用 Playwright 測試「找不到登入按鈕/聊天輸入框/產業篩選 checkbox」：後來證實是測試腳本
  選錯選擇器（見上一輪工作日誌），不是網站壞掉。

### 2026-09-11：規則二自測（第一次用真的 Playwright 打開正式站）發現並修正 2 個真實 bug
本機第一次可以連到正式站+裝 Playwright，改用真瀏覽器地毯式檢查每個頁面/功能（見上方「這次的環境
變化」）。過程中一些「找不到按鈕」的假警報後來證實是測試腳本選錯選擇器（登入按鈕文字其實是「使用
Google 登入」、聊天輸入框是 `<input>` 不是 `<textarea>`、產業篩選是兩個各自獨立的 `<details>`
面板要先展開對應面板才看得到 checkbox），不是網站真的壞掉，用修正後的選擇器重測都正常。也確認了
登入按鈕在正式站不顯示是因為 Vercel 沒設定 `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`AUTH_SECRET`，
這是刻意的優雅降級（Google 登入本來就是選用功能），不是 bug。

真的抓到並修好的問題（commit `e95e963`）：
1. **每個個股頁都會觸發 React hydration error #418（100% 重現，TW/US 皆然）**：
   `LiveQuoteHeader.tsx` 用 `new Date(quote.updatedAt).toLocaleString("zh-TW", {timeZone:
   "Asia/Taipei"})` 直接在渲染時格式化「更新時間」文字，但 Vercel 的 Node.js 執行環境跟瀏覽器對
   `zh-TW` 語系的 ICU 資料不一致，同一個時間點兩邊格式化出來的字串不同，導致 SSR 輸出跟 CSR
   首次渲染的文字對不上、每次都觸發 hydration 錯誤（雖然畫面上使用者看不太出來，但主控台一直報錯，
   且屬於不穩定行為，理論上可能導致該文字閃爍或用到過期內容）。修法：在 `format.ts` 新增
   `formatTaipeiDateTime()`，改用固定 UTC+8 位移的手動運算（不呼叫 `Intl`/`toLocaleString`），
   在任何 JS 引擎、有沒有完整 ICU 資料都會得到一模一樣的字串。**教訓：SSR 頁面裡任何用
   `toLocaleString`/`toLocaleDateString` 直接格式化「日期時間」（不是純數字）的地方都要小心，
   Node 環境的語系資料不一定跟瀏覽器一致，數字格式化通常沒事，日期時間格式化風險高很多。**
2. **一般聊天視窗（沒有從個股頁「問AI關於」進入、沒鎖定特定股票時）打中文公司名稱完全查不到資料**：
   實測連續問「鴻海股價多少？」「聯發科呢？」「台達電呢？」，AI 每次都老實回答「並沒有包含該股資料」。
   追到 `lib/ai/ask.ts` 的 `guessSymbolFromText()`：只用 regex 抓數字代號（如 2330）或大寫英文代碼
   （如 AAPL），完全沒有比對中文公司名稱，使用者不打代號、直接打公司名稱這種最自然的問法就會失敗。
   修法：在 `lib/data/universe.ts` 新增 `findSymbolByName()`，用公司名稱做子字串比對（比對股票清單
   裡的中英文名稱，較長的名稱優先比對避免誤判），`guessSymbolFromText()` 改成先用名稱比對、比對不到
   才退回原本的代號 regex。已確認：只有在沒有明確鎖定股票（`contextSymbol` 為 null）時才會呼叫
   `guessSymbolFromText`，鎖定股票時走的是另一條路徑，這次修改不影響「問AI關於」的既有行為。

**目前卡在 push 這一步**（見上方「目前已知問題」），push 成功、部署後還要重新用 Playwright 驗證
這兩個問題真的修好、再走規則三 Opus 獨立驗證，才能回報「更新完成」。

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

- 這次對話的規則二、三都已跑完：規則二自測修好 2 個 bug（`e95e963`），Opus 規則三第一輪又抓到
  9 個資料正確性問題，全部自己修好（`9758888`），Opus 規則三第二輪複查 8 項（`P2-9` 時機性問題
  盡力驗證）**全部確認修好，沒有新問題**。可以跟使用者說「更新完成」。
- **唯一沒驗證到、留給下次的殘留提醒（不是確認的 bug，是 Opus 主動提出的合理懷疑）**：
  台股 `rowToQuote`（`twse.ts`）現在成交價 `z` 為 `"-"` 時退回買賣最佳價中價（`b`/`a` 欄位）。
  Opus 複查當時是盤中（約 10:30），沒辦法驗證**收盤後（13:30 後）**的行為——如果 TWSE 收盤時
  買賣盤 `b`/`a` 也一起清空、但 `z` 沒有被寫入正確收盤價，就會退回昨收顯示 0.00%，等於是同一個
  bug 在收盤後的另一種型態復發。**下次接手時，如果現在是台股收盤後，建議先 curl
  `/api/search?market=TW` 看卡在 0.00% 的數量是不是又衝高，是的話要再查 `z`/`b`/`a` 收盤後實際
  的值長怎樣，不能直接假設現在的修法在收盤後也一定正確。**

## 這次的環境變化（給下一個接手的裝置參考）

這是第一次在**這台本機 Windows PC**上執行這個專案的品保流程，跟先前 PROGRESS.md 記錄的「sandbox
連不到正式站、沒有 Playwright」不同——**這台機器對外網路正常、能連到正式站**，且已經：
- 用 `winget install OpenJS.NodeJS.LTS` 裝好 Node.js（LTS，含 npm）。
- 在系統暫存資料夾（非專案內）裝了 `playwright` npm 套件 + Chromium，可以真的用瀏覽器打開正式站
  點擊操作，不用再退而求其次只用 curl。
- 專案本身 `npm install && npm run build` 在本機也能正常跑，可以先在本機建置驗證再 push。
- **git push 第一次卡在 Git Credential Manager「Select an account」視窗**：這台機器的 Windows
  認證管理員裡存了兩個 GitHub 帳號（`andyzheng-art` 跟這個 repo 真正的擁有者 `hj110b13-Andy`），
  GCM 沒辦法自動判斷要用哪個，所以每次都跳出來問。已經把 `origin` remote URL 改成
  `https://hj110b13-Andy@github.com/hj110b13-Andy/Stock-web.git`（明確指定帳號），之後在這台機器
  上 push/fetch 都不會再跳出選擇視窗。**如果又跳出來（例如帳號密碼過期），跟使用者說一聲請他選一次
  就好，不是程式碼問題。**
如果下一個接手的裝置也是這台本機，以上工具跟 remote 設定應該都還在，不用重新安裝/設定；如果是
別的環境，仍比照舊有說明評估該環境的網路/工具限制。

如果你接手後又發現了新問題，**除了修正之外，記得也在這份文件的「工作日誌」補一筆，並更新這個章節。**
