import {
  findSymbolByName,
  getChart,
  getChips,
  getEarnings,
  getFundamentals,
  getIndices,
  getMaterialAnnouncements,
  getMultiSignalStocks,
  getQuote,
  searchStocks,
} from "@/lib/data";
import type { Market } from "@/lib/data";
import { fetchNews, fetchNewsMulti, fetchUsMarketNews } from "@/lib/data/news";
import { formatMarketCap, formatSharesWithLots } from "@/lib/format";
import { callAiProviders } from "@/lib/ai/provider";
import type { ChatTurn } from "@/lib/ai/types";

export interface AskResult {
  answer: string;
  groundedSymbol?: string;
  usedAi: boolean;
}

export interface HoldingInput {
  symbol: string;
  market: Market;
  name: string;
  costBasis?: number;
  shares?: number;
}

// The negative lookahead keeps a plain year mention ("2025年台股展望") from
// being read as TW stock code 2025 (千興) — TWSE codes are 4-6 digits with
// no reserved range, so any bare number in that span is otherwise ambiguous
// with a year, and "20XX年" is by far the most common way one shows up in a
// question that isn't about a specific stock at all.
const SYMBOL_PATTERN = /\b\d{4,6}\b(?!\s*年)|\b[A-Z]{1,5}\b/g;
const STOPWORDS = new Set([
  "THE", "AND", "FOR", "ARE", "WHY", "HOW", "WHAT", "WILL", "WITH", "THIS",
  "THAT", "CAN", "YOU", "PLEASE", "STOCK", "TODAY", "NOW", "AI", "US", "TW",
]);

async function buildStockGrounding(
  target: { symbol: string; market: Market | undefined }
): Promise<{ symbol: string; text: string } | undefined> {
  const [quote, chart] = await Promise.all([
    getQuote(target.symbol, target.market),
    getChart(target.symbol, "3m", target.market),
  ]);
  if (!quote) return undefined;

  // Fired only once the quote resolves the actual market (target.market may
  // be undefined when guessed from text) and gives us the real company name
  // to search news for — a bare ticker like "2330" is a much weaker news
  // query than "台積電". For US stocks, quote.name is already the English
  // company name (from Yahoo), so the same query works for both the zh-TW
  // and en-US Google News editions — the en-US edition is what actually
  // surfaces English-language wire coverage (Reuters/Bloomberg/MarketWatch)
  // that the zh-TW edition mostly doesn't carry.
  const newsQuery = `${quote.name} ${quote.symbol}`;
  const [earnings, news, fundamentals, chips, announcements] = await Promise.all([
    getEarnings(quote.symbol, quote.market).catch(() => null),
    (quote.market === "US" ? fetchNewsMulti(newsQuery, 4, ["zh-TW", "en-US"]) : fetchNews(newsQuery, 8)).catch(
      () => []
    ),
    getFundamentals(quote.symbol, quote.market).catch(() => null),
    getChips(quote.symbol, quote.market).catch(() => null),
    getMaterialAnnouncements(quote.symbol, quote.market).catch(() => []),
  ]);

  const changeLabel = quote.change >= 0 ? "上漲" : "下跌";
  const lines = [
    `股票：${quote.name}（${quote.symbol}，${quote.market === "TW" ? "台股" : "美股"}）`,
    `目前價格：${quote.price} ${quote.currency}，${changeLabel} ${Math.abs(quote.change)}（${quote.changePercent}%）`,
    `今日：開 ${quote.open} / 高 ${quote.high} / 低 ${quote.low} / 昨收 ${quote.prevClose}，成交量 ${quote.volume.toLocaleString()}`,
  ];
  if (chart) {
    const recent = chart.candles.slice(-10);
    lines.push(`近 10 個交易日收盤價：${recent.map((c) => `${c.time}=${c.close}`).join(", ")}`);
  } else {
    lines.push("（歷史走勢資料目前無法取得）");
  }
  lines.push("（來源：即時/近即時公開資料）");

  if (fundamentals) {
    const parts: string[] = [];
    if (fundamentals.peRatio != null) parts.push(`本益比 ${fundamentals.peRatio}`);
    if (fundamentals.pbRatio != null) parts.push(`股價淨值比 ${fundamentals.pbRatio}`);
    if (fundamentals.dividendYield != null) parts.push(`殖利率 ${fundamentals.dividendYield}%`);
    if (fundamentals.marketCap != null) parts.push(`市值 ${formatMarketCap(fundamentals.marketCap, quote.currency)}`);
    if (parts.length > 0) lines.push(`基本面：${parts.join("；")}`);
  }

  if (earnings) {
    const parts: string[] = [];
    if (earnings.monthlyRevenueYoyPercent != null) {
      parts.push(`${earnings.monthlyRevenuePeriod ?? "最新月"}營收年增率 ${earnings.monthlyRevenueYoyPercent >= 0 ? "+" : ""}${earnings.monthlyRevenueYoyPercent}%`);
    }
    if (earnings.quarterlyEps != null) {
      parts.push(`${earnings.quarterlyEpsPeriod ?? "最新一季"} EPS ${earnings.quarterlyEps}${quote.currency === "TWD" ? "元" : ""}`);
    }
    if (earnings.epsSurprisePercent != null) {
      parts.push(`優於市場預期 ${earnings.epsSurprisePercent}%`);
    }
    if (earnings.nextEarningsDate) {
      parts.push(`下次公布財報日期約 ${earnings.nextEarningsDate}`);
    }
    if (parts.length > 0) lines.push(`財報：${parts.join("；")}`);
  }

  // TW only — chips/announcements are null/empty for US, see getChips/getMaterialAnnouncements.
  if (chips) {
    const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString()}`;
    const parts: string[] = [];
    if (chips.institutionalNetShares != null) {
      const detail = [
        chips.foreignNetShares != null ? `外資${formatSharesWithLots(chips.foreignNetShares)}` : "",
        chips.trustNetShares != null ? `投信${formatSharesWithLots(chips.trustNetShares)}` : "",
        chips.dealerNetShares != null ? `自營商${formatSharesWithLots(chips.dealerNetShares)}` : "",
      ]
        .filter(Boolean)
        .join("、");
      parts.push(`三大法人合計${formatSharesWithLots(chips.institutionalNetShares)}（${detail}）`);
    }
    if (chips.marginBalance != null) {
      const change = chips.marginBalanceChange != null ? `，較前日${signed(chips.marginBalanceChange)}張` : "";
      parts.push(`融資餘額 ${chips.marginBalance.toLocaleString()} 張${change}`);
    }
    if (chips.shortBalance != null) {
      const change = chips.shortBalanceChange != null ? `，較前日${signed(chips.shortBalanceChange)}張` : "";
      parts.push(`融券餘額 ${chips.shortBalance.toLocaleString()} 張${change}`);
    }
    if (parts.length > 0) lines.push(`籌碼面（${chips.date ?? "最近交易日"}）：${parts.join("；")}`);
  }

  if (announcements.length > 0) {
    const shown = announcements.slice(0, 3).map((a) => `- ${a.date}：${a.subject.length > 80 ? `${a.subject.slice(0, 80)}…` : a.subject}`);
    lines.push(`近期重大訊息公告：\n${shown.join("\n")}`);
  }

  if (news.length > 0) {
    lines.push(`近期相關新聞：\n${news.map((n) => `- ${n.title}${n.source ? `（${n.source}）` : ""}`).join("\n")}`);
  }

  return { symbol: quote.symbol, text: lines.join("\n") };
}

// Matches "有哪些股票不錯"/"什麼股票要漲了"/"推薦一下"/"今天有什麼強勢股" style
// questions that aren't about any one stock — asking for a list, not a lookup.
// Without this, guessSymbolFromText finds nothing, no grounding is attached,
// and the model (correctly, per its instructions not to invent numbers) just
// says it has no data — even though the site already computes exactly this
// kind of thing (焦點排行/技術訊號共振) for the /highlights page.
//
// A real conversation caught this pattern missing common multi-turn follow-
// up phrasings — "還有別的比較有機率漲幅較大的嗎？" matched none of the
// original phrases (no "有哪些"/"推薦"/"強勢股" etc.), so buildMoversGrounding
// never ran and the model, with no fresh screened candidates to work from,
// fell back to generic textbook answers ("留意 AI 伺服器供應鏈如鴻海、廣達")
// instead of naming anything from the site's own data. Broadened to also
// catch "還有別的/其他"-style follow-ups and generic buy-idea phrasing —
// safe to widen, since this only fires when guessSymbolFromText found no
// specific stock in the question at all (see wantsMovers below).
const MOVERS_INTENT_PATTERN =
  /有哪些|哪幾檔|哪支|哪些股票|推薦|不錯的股票|強勢股|熱門股|飆股|焦點股|上漲的股票|要漲|要噴|準備上漲|還有.{0,3}(別的|其他)|有沒有.{0,3}(別的|其他)|有機會|機率.{0,6}(大|高)|買(什麼|甚麼)|選股|有推薦/;

// Momentum stocks get more slots than plain gainers: a gainer is just one
// number (today's %), but each momentum entry carries several independent,
// quantified technical readings (volume ratio, MA position, streak length,
// new high/low) that are worth surfacing in bulk so the model has enough
// material to explain *why* each one screens as technically strong, not
// just name it.
const GAINERS_N = 8;
const MOMENTUM_N = 12;

async function buildMoversGrounding(): Promise<string> {
  try {
    const [twGainers, usGainers, twMomentum, usMomentum] = await Promise.all([
      searchStocks({ market: "TW", sortBy: "changePercent", sortDir: "desc" }),
      searchStocks({ market: "US", sortBy: "changePercent", sortDir: "desc" }),
      getMultiSignalStocks("TW"),
      getMultiSignalStocks("US"),
    ]);
    // TW momentum candidates also get their institutional flow attached —
    // without this, a "what else looks good" question could only be
    // answered with price/technical data, which reads as generic. Chip
    // data gives the model something concrete and stock-specific to cite
    // (e.g. "外資今天同步買超") beyond textbook sector commentary. US has
    // no equivalent public data source, so US entries are technical-only.
    const twMomentumSlice = twMomentum.slice(0, MOMENTUM_N);
    const twChips = await Promise.all(
      twMomentumSlice.map((s) => getChips(s.symbol, "TW").catch(() => null))
    );
    const fmtGainer = (items: typeof twGainers) =>
      items.slice(0, GAINERS_N).map((s) => `${s.name}(${s.symbol}) ${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%`).join("、") || "（無資料）";
    const fmtMomentum = (items: typeof twMomentum, chips?: (typeof twChips)[number][]) =>
      items
        .map((s, i) => {
          const chip = chips?.[i];
          const chipText = chip?.institutionalNetShares != null ? `；三大法人${formatSharesWithLots(chip.institutionalNetShares)}` : "";
          return `${s.name}(${s.symbol})，現價${s.price}(${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%)：${s.signals.map((sig) => sig.label).join("、")}${chipText}`;
        })
        .join("\n") || "（無資料）";
    return [
      `台股今日漲幅榜前${GAINERS_N}：${fmtGainer(twGainers)}`,
      `美股今日漲幅榜前${GAINERS_N}：${fmtGainer(usGainers)}`,
      `台股技術訊號共振股（同時符合≥2個客觀技術訊號，依訊號數量排序，共${twMomentum.length}檔，列出前${MOMENTUM_N}，含三大法人買賣超；股數已換算好對應張數，直接引用不要自己重算）：\n${fmtMomentum(twMomentumSlice, twChips)}`,
      `美股技術訊號共振股（共${usMomentum.length}檔，列出前${MOMENTUM_N}）：\n${fmtMomentum(usMomentum.slice(0, MOMENTUM_N))}`,
    ].join("\n\n");
  } catch {
    return "";
  }
}

/**
 * The client's watchlist lives in localStorage, not anywhere this server
 * code can reach on its own — so "analyze my watchlist" only works because
 * the widget reads it and sends it along with the request. Each entry gets
 * a live requote (the client's copy is whatever the page last fetched,
 * which can be stale) and, when cost/shares were entered, its unrealized
 * P&L computed from that live price.
 */
async function buildHoldingsGrounding(holdings: HoldingInput[]): Promise<string> {
  if (holdings.length === 0) return "";
  const lines = await Promise.all(
    holdings.map(async (h) => {
      const quote = await getQuote(h.symbol, h.market);
      if (!quote) return `${h.name}(${h.symbol})：目前查不到報價`;
      const base = `${quote.name}(${quote.symbol}，${quote.market === "TW" ? "台股" : "美股"})：現價 ${quote.price} ${quote.currency}，今日${quote.change >= 0 ? "漲" : "跌"} ${Math.abs(quote.changePercent)}%`;
      if (h.costBasis != null && h.shares != null && h.shares > 0) {
        const pnl = (quote.price - h.costBasis) * h.shares;
        const pnlPercent = h.costBasis > 0 ? ((quote.price - h.costBasis) / h.costBasis) * 100 : 0;
        return `${base}；持有 ${h.shares} 股，平均成本 ${h.costBasis}，損益 ${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}（${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%）`;
      }
      return `${base}（尚未設定持股成本/股數）`;
    })
  );
  return lines.join("\n");
}

function guessSymbolFromText(text: string): { symbol: string; market: Market } | undefined {
  const byName = findSymbolByName(text);
  if (byName) return { symbol: byName.symbol, market: byName.market };

  const matches = text.toUpperCase().match(SYMBOL_PATTERN);
  if (!matches) return undefined;
  for (const m of matches) {
    if (/^\d{4,6}$/.test(m)) return { symbol: m, market: "TW" };
  }
  for (const m of matches) {
    if (!STOPWORDS.has(m) && /^[A-Z]{1,5}$/.test(m)) return { symbol: m, market: "US" };
  }
  return undefined;
}

export async function answerQuestion(
  question: string,
  contextSymbol?: string,
  history: ChatTurn[] = [],
  holdings: HoldingInput[] = []
): Promise<AskResult> {
  const target = contextSymbol
    ? { symbol: contextSymbol, market: undefined as Market | undefined }
    : guessSymbolFromText(question);
  const wantsMovers = !target && MOVERS_INTENT_PATTERN.test(question);

  let groundedSymbol: string | undefined;

  // Always ground with both markets' index levels (not just whichever
  // market the question is about), plus the specific stock's data when one
  // is targeted, so the model can reason about TW/US cross-market influence
  // (e.g. Nasdaq overnight moves affecting semiconductor names) instead of
  // only seeing the one stock in isolation. General market news is likewise
  // always fetched (not just when a stock is targeted) — it's what used to
  // be missing entirely whenever someone asked about "資訊面"/總經 without
  // naming a specific stock, which had no grounding path to attach it to.
  const [stockGrounding, indexGrounding, moversGrounding, holdingsGrounding, marketNews] = await Promise.all([
    target ? buildStockGrounding(target) : Promise.resolve(undefined),
    getIndices()
      .then((indices) => {
        if (indices.length === 0) return "（大盤指數目前無法取得）";
        return indices.map((i) => `${i.name}：${i.price}（${i.change >= 0 ? "+" : ""}${i.changePercent}%）`).join("\n");
      })
      .catch(() => ""),
    wantsMovers ? buildMoversGrounding() : Promise.resolve(""),
    buildHoldingsGrounding(holdings).catch(() => ""),
    Promise.all([fetchNews("台股", 6), fetchUsMarketNews(5)]).catch(() => [[], []] as const),
  ]);

  if (stockGrounding) groundedSymbol = stockGrounding.symbol;

  const [twNews, usNews] = marketNews;
  const marketNewsText = [
    twNews.length > 0 ? `台股：\n${twNews.map((n) => `- ${n.title}${n.source ? `（${n.source}）` : ""}`).join("\n")}` : "",
    usNews.length > 0 ? `美股：\n${usNews.map((n) => `- ${n.title}${n.source ? `（${n.source}）` : ""}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const grounding = [
    stockGrounding ? `【個股資料】\n${stockGrounding.text}` : "",
    indexGrounding ? `【大盤概況（台股＋美股）】\n${indexGrounding}` : "",
    marketNewsText ? `【近期市場新聞】\n${marketNewsText}` : "",
    moversGrounding ? `【今日焦點數據（漲幅榜、技術訊號共振股）】\n${moversGrounding}` : "",
    holdingsGrounding ? `【我的關注清單/持股】\n${holdingsGrounding}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "你是一個股票研究網站上的助理，回答繁體中文問題。",
    "風格要求（很重要）：直接講重點、先講結論，語氣像在跟人對話而不是寫報告。不要模稜兩可、不要鋪陳、不要重複同樣的免責聲明兩次以上。能一兩句話講完的就不要條列；只有在真的有好幾個平行項目時才用條列，且每項一行、不要展開解釋。",
    "你會拿到「個股資料」（使用者問特定股票時，內含報價/K線，資料充足時還會有：「基本面」本益比/股價淨值比/殖利率/市值、「財報」月營收年增率與季度EPS、「籌碼面」三大法人買賣超與融資融券餘額增減（僅台股，美股沒有這塊資料）、「近期重大訊息公告」（僅台股）、「近期相關新聞」）、「大盤概況」（台股加權指數、道瓊、S&P 500、那斯達克）、「近期市場新聞」（台股/美股各幾則近期真實新聞標題，美股這塊同時混合中英文來源），有時候還有「今日焦點數據」（今日漲幅榜、技術訊號共振股）、「我的關注清單/持股」（使用者關注清單裡每一檔的即時報價，有設定成本/股數的還會有損益）。",
    "使用者問『資訊面/消息面/新聞/為什麼漲跌/財報/籌碼/法人在買還是在賣/融資融券』這類問題時：直接引用「近期市場新聞」或個股資料裡對應的區塊講重點（標題、大概方向、來源、實際數字即可，不用逐字複述），這些都是真實抓到的資料，不要再回答『沒有新聞管道』『系統僅提供報價數據』這種話——現在有了。某個區塊資料不夠或抓不到時才老實說目前查不到，不要就此完全略過不提；台股籌碼面/重大訊息若某檔當天剛好沒有法人動作或沒有公告，這是正常現象，直接說『今天沒有明顯的法人動向/沒有重大訊息』即可，不是資料抓取失敗。",
    "籌碼面的三大法人數字資料裡已經同時附上「股」跟換算好的「約XX張」兩種寫法，直接照抄其中一種講就好，絕對不要自己把股數重新換算成張（1張=1000股這個換算你自己心算很容易出錯，之前就出現過1000倍、10倍算錯、甚至同一句話裡數字前後矛盾的情況），也不要把股數誤講成張數的量級。",
    "給看法或建議時，要綜合基本面（估值高不高）、財報（營收獲利趨勢）、籌碼面（法人是在買超還是賣超、融資是不是異常暴增暴減）、消息面（近期新聞/重大訊息有沒有利多利空）、技術面（均線/RSI/MACD/量價）這幾個面向一起判斷，不要只看單一面向就下結論；面向之間互相矛盾時（例如技術面強但法人在賣、或基本面便宜但籌碼面偏空）要老實點出這個矛盾，不要選擇性忽略對你的結論不利的那一面。",
    "拿到「我的關注清單/持股」時（通常是使用者按了『分析我的關注清單』或問『幫我看看我關注的股票』），逐檔講重點：現價/今日漲跌、有損益資料的講清楚賺賠多少錢跟百分比、你對這檔現況的看法；沒設定成本的那幾檔就只講現況看法，不用特別提醒『你沒填成本』這種瑣事。多檔的話用條列，每檔一行講完，不要每檔都展開成一大段。",
    "台股與美股常互相影響（例如美股科技股/半導體夜間走勢，隔天常牽動台股電子權值股），有明顯關聯時才連結兩邊資料分析，沒有的話不用勉強牽拖。",
    "這個網站現在只有你（開發者）跟家人知道密碼才能進來，不是對外公開的服務，使用者問『有哪些股票不錯/推薦一下/幫我選股/這支該不該買』這類問題時，直接根據拿到的資料給明確的個人看法即可，包括『我覺得這幾檔現在值得留意』『這支技術面偏弱，我會先觀望』這種直接的話，不用迴避、不用只丟數據不表態、也不用每次都加但書。看法要根據資料裡實際的數字說理由（例如均量倍數、連漲天數、均線位置、本益比、股價淨值比、法人買賣超、融資變化、漲跌幅），不要憑空瞎猜；資料不夠支撐判斷時就老實說資料不足，不要硬掰。",
    "請根據資料回答，不要編造資料中沒有的數字；若資料標示為無法取得，直接說目前查不到，不要繞圈子解釋為什麼查不到。",
    "使用者之前的提問與你的回覆會一併附上作為對話紀錄，回答新問題時請自然承接對話脈絡（例如使用者接著問「那美股呢」時，要記得他上一句在問什麼）。",
    "使用者問『還有其他/還有別的/有沒有機會』這類接續問題時，優先從「今日焦點數據」的技術訊號共振股/漲幅榜裡挑對話中還沒提過的標的，並具體引用該檔的數據（訊號、法人買賣超、漲跌幅），不要因為想不到新標的就退回『AI伺服器供應鏈』『半導體設備股』『防禦性類股』這種沒有點名具體股票、任何人不用看盤都講得出來的空泛說法；如果資料裡真的已經沒有還沒提過的標的，就老實說『目前資料裡比較突出的大概就這幾檔』，不要硬掰新的類股概念湊答案。",
  ].join("\n");

  const userContent = grounding
    ? `參考資料：\n${grounding}\n\n使用者問題：${question}`
    : `使用者問題：${question}\n（目前沒有可用的參考資料，請根據一般金融知識簡短回答，並說明無法取得即時資料。）`;

  const messages: ChatTurn[] = [...history, { role: "user", content: userContent }];
  const result = await callAiProviders(system, messages);
  if (result.usedAi) return { answer: result.answer, groundedSymbol, usedAi: true };

  return {
    answer: buildCannedAnswer(grounding, groundedSymbol, result.failureReason ?? "未知原因"),
    groundedSymbol,
    usedAi: false,
  };
}

function buildCannedAnswer(grounding: string, groundedSymbol: string | undefined, reason: string): string {
  const lines = [
    groundedSymbol ? `以下是關於 ${groundedSymbol} 的目前資料：` : "以下是目前的市場資料：",
    grounding || "（目前無法取得資料，可能是網路或資料源暫時無法連線。）",
    "",
    `提醒：AI 問答目前無法產生完整回覆（原因：${reason.replace(/。$/, "")}），以上僅為原始資料整理，並非 AI 生成的分析。`,
  ];
  return lines.join("\n");
}
