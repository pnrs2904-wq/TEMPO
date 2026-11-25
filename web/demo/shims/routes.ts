export const ROUTES: Record<string, string> = {
  "/app": "focus", "/app/patterns": "patterns", "/app/exam": "exam", "/app/history": "history",
  "/app/settings": "you", "/app/institute": "groups",
};
export const hashFor = (href: string) => ROUTES[href] ?? "plans";
export function pathFor(hash: string): string {
  const name = hash.replace(/^#/, "");
  return Object.entries(ROUTES).find(([, h]) => h === name)?.[0] ?? (name === "plans" ? "/pricing" : "/app");
}
