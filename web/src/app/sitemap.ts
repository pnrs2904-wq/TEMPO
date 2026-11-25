import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL || "https://tempo.harinag9590.workers.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/privacy", "/terms", "/help", "/delete-account"].map((p) => ({ url: `${site}${p}`, changeFrequency: "monthly", priority: p === "" ? 1 : 0.6 }));
}
