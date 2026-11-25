import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Tempo: Adaptive Focus Timer",
    short_name: "Tempo",
    description: "A focus timer that adapts to your energy, subject and actual study performance.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F2",
    theme_color: "#FAF7F2",
    categories: ["education", "productivity"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Start a focus session", short_name: "Focus", url: "/app" },
      { name: "Exam plan", short_name: "Exam", url: "/app/exam" },
    ],
  };
}
