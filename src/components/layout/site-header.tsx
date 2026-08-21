import Link from "next/link";
import { Suspense } from "react";
import { CirclePower } from "lucide-react";
import { AuthButton } from "@/features/auth";
import { BRAND_NAME, NAV_LINKS } from "@/features/marketing";

export function SiteHeader() {
  return (
    <nav className="w-full border-b border-zinc-800 bg-[#09090B]/80 backdrop-blur-md">
      <div className="w-full flex justify-center px-6 py-4">
        <div className="w-full max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <CirclePower className="w-5 h-5 text-white" />
              <span className="text-white font-semibold">{BRAND_NAME}</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}
