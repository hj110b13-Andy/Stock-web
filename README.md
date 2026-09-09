# 股情雷達 StockRadar

公開、免費的股票研究網站 Demo：即時查詢台股與美股報價、互動走勢圖表、篩選排行，並提供 AI 問答快速掌握個股情報。

用 Next.js (App Router) + TypeScript + Tailwind CSS 打造，圖表使用 [lightweight-charts](https://github.com/tradingview/lightweight-charts)。

## 功能

- **首頁**：台股加權指數 / 道瓊 / S&P 500 / 那斯達克即時概況，台股與美股焦點排行。
- **個股頁** `/stock/[symbol]`：即時（或近即時）報價、K 線圖 + 成交量，可切換 1個月/3個月/6個月/1年 區間。
- **搜尋 / 篩選** `/search`：依市場、產業、漲跌幅篩選，並可依漲跌幅／成交量／股價排序。
- **AI 問答**：右下角浮動聊天視窗，可針對目前瀏覽的個股或任何代碼提問，回答會以即時/近即時報價與近期走勢為依據。

## 資料來源與限制（重要）

這是一個 **Demo / 雛形**，資料串接方式如下：

| 市場 | 即時報價 | 歷史 K 線 |
|---|---|---|
| 台股 | TWSE `mis.twse.com.tw` 公開報價 API（非官方但廣泛使用，延遲數分鐘） | TWSE `STOCK_DAY` 公開日 K 資料 |
| 美股 | Yahoo Finance 公開 `chart` API（非官方） | 同左 |

以上皆為**無需 API 金鑰的公開端點**，但：

- 屬於非官方端點，可能隨時變動、被限流或封鎖，正式產品建議改用有授權的資料商（例如 TWSE OpenAPI 正式合作方案、IEX Cloud、Polygon.io、Alpha Vantage 等）。
- 當即時資料抓取失敗（網路限制、被限流、端點變動等），系統會**自動 fallback 為離線示範資料**（以股票代碼做種子的確定性亂數產生，同一天內數值穩定），確保網站在任何環境下都能展示完整功能。畫面上會以「即時資料」／「示範資料」徽章明確標示資料來源，不會混淆使用者。
- 目前開發沙盒環境本身的對外網路被組織政策限制（僅允許 npm registry / GitHub），因此本機測試時看到的都是示範資料；部署到具備一般對外網路的環境（如 Vercel）後，即時資料串接會自動生效，無需改動程式碼。
- 搜尋 / 篩選頁與首頁排行榜目前使用一份精選的台股／美股清單（`src/lib/data/universe.ts`，約 44 檔）搭配示範亂數報價，尚未串接完整上市櫃清單，正式產品應改接 TWSE 完整股票代碼清單與美股資料庫。

## AI 問答設定

AI 問答預設會使用 [Claude API](https://console.anthropic.com/)（`claude-sonnet-5`）產生回覆，並以即時/近即時報價與近期走勢作為依據（RAG 概念，非憑空生成數字）。

1. 建立 `.env.local`：
   ```bash
   ANTHROPIC_API_KEY=sk-ant-xxxx
   ```
2. 若未設定金鑰，`/api/ask` 會回傳「原始資料整理」的罐頭回覆（仍會附上即時/近即時報價），並提示使用者尚未啟用 AI，網站其餘功能不受影響。

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
    api/
      quote/[symbol]/      即時報價 API
      chart/[symbol]/      歷史 K 線 API
      search/               篩選 API
      indices/              大盤指數 API
      ask/                  AI 問答 API
  components/               UI 元件（含 StockChart、ChatWidget 等）
  lib/
    data/                   資料層：TWSE / Yahoo 抓取器、示範資料產生器、快取、統一介面
    ai/ask.ts               AI 問答邏輯（資料 grounding + Claude API）
    format.ts                數字／價格格式化，含台股慣例（紅漲綠跌）
```

## 設計慣例

- 依台灣／中文市場慣例：**紅色＝上漲、綠色＝下跌**（與美股常見的紅跌綠漲相反）。
- 淺色／深色模式皆已設計對應色票，並通過色盲友善（CVD）對比驗證；漲跌同時搭配 ▲／▼ 圖示與正負號，不僅依賴顏色辨識。

## 免責聲明

本站所有資訊（含公開資料整理與 AI 生成內容）僅供研究參考，不構成任何投資建議。
