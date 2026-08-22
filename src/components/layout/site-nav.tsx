"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CirclePower, Menu, X } from "lucide-react";
import { BRAND_NAME, NAV_LINKS } from "@/features/marketing";
import { cn, isExternalUrl } from "@/lib/utils";

export function SiteNav({ authSlot }: { authSlot: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="w-full border-b border-zinc-800 bg-[#09090B]/80 backdrop-blur-md">
      <div className="w-full flex justify-center px-6 py-4">
        <div className="relative w-full max-w-5xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex w-full items-center justify-between gap-4 lg:w-auto">
            <Link href="/" className="flex items-center gap-2">
              <CirclePower className="w-5 h-5 text-white" />
              <span className="text-white font-semibold">{BRAND_NAME}</span>
            </Link>

            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close Menu" : "Open Menu"}
              aria-expanded={menuOpen}
              className="relative z-20 -m-2.5 block cursor-pointer p-2.5 lg:hidden"
            >
              <Menu
                className={cn(
                  "m-auto size-6 text-white duration-200",
                  menuOpen && "rotate-180 scale-0 opacity-0",
                )}
              />
              <X
                className={cn(
                  "absolute inset-0 m-auto size-6 -rotate-180 scale-0 text-white opacity-0 duration-200",
                  menuOpen && "rotate-0 scale-100 opacity-100",
                )}
              />
            </button>

            <div className="hidden lg:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={isExternalUrl(link.href) ? "_blank" : undefined}
                  rel={isExternalUrl(link.href) ? "noreferrer" : undefined}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "grid w-full transition-all duration-300 ease-in-out motion-reduce:transition-none lg:flex lg:w-fit lg:items-center",
              menuOpen
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 lg:opacity-100",
            )}
          >
            <div className="overflow-hidden lg:overflow-visible">
              <div className="flex flex-col items-start gap-6 border-t border-zinc-800 pt-6 lg:flex-row lg:items-center lg:border-0 lg:pt-0">
                <div className="flex flex-col gap-4 lg:hidden">
                  {NAV_LINKS.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target={isExternalUrl(link.href) ? "_blank" : undefined}
                      rel={isExternalUrl(link.href) ? "noreferrer" : undefined}
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                {authSlot}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
