// Cloudflare Workers build (OpenNext). Tempo's pages are static and its API is dynamic, so no
// incremental cache (R2) is needed; leaving it out also avoids R2's payment-card requirement.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
