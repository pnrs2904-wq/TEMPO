import type { AnchorHTMLAttributes, ReactNode } from "react";
import { hashFor } from "./routes";

/** Stand-in for next/link: routes become plain #names, which work inside a single HTML file. */
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return <a href={`#${hashFor(href)}`} {...rest}>{children}</a>;
}
