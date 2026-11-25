// Builds dist/tempo.html: the app's screens in one self-contained file (no server, no network).
// Usage: npm run build:html   (runs `next build` first to compile the stylesheet)
import { build } from "esbuild";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const shim = (f) => path.join(root, "demo/shims", f);
const exact = {
  "next/link": shim("link.tsx"), "next/navigation": shim("navigation.ts"),
  "@/lib/client/db": shim("db.ts"), "@/lib/client/supabase": shim("supabase.ts"), "@/lib/client/download": shim("download.ts"),
};

const result = await build({
  entryPoints: [path.join(root, "demo/entry.tsx")], bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '""' },
  plugins: [{
    name: "aliases",
    setup(b) {
      b.onResolve({ filter: /^(next\/|@\/)/ }, (args) => {
        if (exact[args.path]) return { path: exact[args.path] };
        if (args.path.startsWith("@/")) {
          const base = path.join(root, "src", args.path.slice(2));
          for (const ext of [".ts", ".tsx", "/index.ts"]) {
            try { readFileSync(base + ext); return { path: base + ext }; } catch { /* next */ }
          }
        }
        return undefined;
      });
      // The relative import of ./db and ./supabase inside store.ts must hit the shims too.
      b.onResolve({ filter: /^\.\/(db|supabase)$/ }, (args) =>
        /lib[\\/]client[\\/](store|prep)\.ts$/.test(args.importer) ? { path: shim(args.path.slice(2) + ".ts") } : undefined);
    },
  }],
});

const cssDir = path.join(root, ".next/static/chunks");
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(path.join(cssDir, f), "utf8")).join("\n");
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const html = `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tempo: adaptive focus timer</title>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="root"><p style="padding:6rem 1rem;text-align:center;font:14px system-ui;color:#8a847c">Opening Tempo…</p></div>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(path.join(root, "dist"), { recursive: true });
writeFileSync(path.join(root, "dist/tempo.html"), html);
console.log(`dist/tempo.html ${(html.length / 1024).toFixed(0)} KB`);
