import type { Market } from "@/lib/data";

export const ASK_ABOUT_EVENT = "stockradar:ask-about";

export interface AskAboutDetail {
  symbol: string;
  market: Market;
  name: string;
}
