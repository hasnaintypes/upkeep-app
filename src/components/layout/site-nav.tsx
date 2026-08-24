"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { NAV_LINKS } from "@/features/marketing";
import { cn, isExternalUrl } from "@/lib/utils";

export function SiteNav({ authSlot }: { authSlot: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full px-4 pt-4 pb-2 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div
          className={cn(
            "bg-background/70 rounded-3xl border shadow-sm backdrop-blur-md transition-[border-radius] duration-300",
            menuOpen && "lg:rounded-3xl",
          )}
        >
          <nav className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <Logo />
            </Link>

            {/* Desktop links */}
            <div className="hidden items-center gap-8 lg:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  target={isExternalUrl(link.href) ? "_blank" : undefined}
                  rel={isExternalUrl(link.href) ? "noreferrer" : undefined}
                  className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="hidden lg:block">{authSlot}</div>

              <button
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                className="text-muted-foreground hover:text-foreground relative -m-2.5 flex size-9 items-center justify-center transition-colors lg:hidden"
              >
                <Menu
                  className={cn(
                    "absolute size-5 duration-200",
                    menuOpen && "rotate-90 scale-0 opacity-0",
                  )}
                />
                <X
                  className={cn(
                    "absolute size-5 -rotate-90 scale-0 opacity-0 duration-200",
                    menuOpen && "rotate-0 scale-100 opacity-100",
                  )}
                />
              </button>
            </div>
          </nav>

          {/* Mobile menu */}
          <div
            className={cn(
              "grid transition-all duration-300 ease-in-out lg:hidden",
              menuOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <div className="border-border/60 flex flex-col items-start gap-4 border-t px-6 py-5">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    target={isExternalUrl(link.href) ? "_blank" : undefined}
                    rel={isExternalUrl(link.href) ? "noreferrer" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className="text-foreground text-sm font-medium"
                  >
                    {link.label}
                  </Link>
                ))}
                {authSlot}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
