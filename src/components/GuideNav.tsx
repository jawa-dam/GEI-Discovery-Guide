"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/guide", label: "Entry" },
  { href: "/guide/dashboard", label: "Command" },
  { href: "/guide/roadmap", label: "Roadmap" },
  { href: "/guide/gates", label: "Gates" }
];

export function GuideNav() {
  const pathname = usePathname();
  return (
    <nav className="guide-nav" aria-label="Guide">
      <div className="wrap">
        <ul>
          {LINKS.map(link => (
            <li key={link.href}>
              <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
