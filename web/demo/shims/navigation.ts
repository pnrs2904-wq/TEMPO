import { useSyncExternalStore } from "react";
import { hashFor, pathFor } from "./routes";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const snapshot = () => pathFor(window.location.hash);

export function usePathname(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function useRouter() {
  return { push: (href: string) => { window.location.hash = hashFor(href); } };
}
