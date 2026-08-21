import Link from "next/link";
import { CirclePower } from "lucide-react";
import { BRAND_NAME, NAV_LINKS } from "@/features/marketing";

async function getCurrentYear() {
  "use cache";
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const year = await getCurrentYear();

  return (
    <footer className="border-t border-zinc-800 py-12" style={{ backgroundColor: "#09090B" }}>
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <div className="order-last flex items-center gap-3 md:order-first">
            <Link href="/" aria-label="go home" className="flex items-center gap-2">
              <CirclePower className="w-5 h-5 text-white" />
              <span className="text-white font-semibold">{BRAND_NAME}</span>
            </Link>
            <span className="text-zinc-500 block text-center text-sm">
              © {year} {BRAND_NAME}, all rights reserved
            </span>
          </div>

          <div className="order-first flex flex-wrap items-center gap-x-6 gap-y-4 md:order-last">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-zinc-400 hover:text-white block text-sm duration-150"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
