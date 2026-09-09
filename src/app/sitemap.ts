import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { US_UNIVERSE, getTwUniverse } from "@/lib/data/universe";

// Capped so the sitemap stays fast to generate even as the universe list
// grows — search engines will still discover the rest of the universe by
// crawling links from /search and /highlights.
const MAX_STOCK_ENTRIES = 2000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/highlights`, changeFrequency: "hourly", priority: 0.8 },
  ];

  const twUniverse = await getTwUniverse();
  const stockRoutes: MetadataRoute.Sitemap = [...twUniverse, ...US_UNIVERSE]
    .slice(0, MAX_STOCK_ENTRIES)
    .map((e) => ({
      url: `${SITE_URL}/stock/${e.symbol}?market=${e.market}`,
      changeFrequency: "hourly",
      priority: 0.6,
    }));

  return [...staticRoutes, ...stockRoutes];
}
