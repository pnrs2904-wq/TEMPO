import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL || "https://tempo.harinag9590.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/login"] }], sitemap: `${site}/sitemap.xml` };
}
