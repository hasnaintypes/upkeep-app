import Link from "next/link";
import { CTA_CONTENT } from "../constants/cta";
import { GITHUB_URL } from "../constants/navigation";
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { Reveal } from "./reveal";

export function CTASection() {
  return (
    <section className="py-24 px-6" style={{ backgroundColor: "#09090B" }}>
      <Reveal className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <h2 className="text-3xl md:text-4xl lg:text-[42px] font-medium text-white tracking-tight">
            {CTA_CONTENT.heading}
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 border border-zinc-700 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors text-sm"
            >
              {CTA_CONTENT.secondaryCta}
            </Link>
            <Link
              href={AUTH_ROUTES.signUp}
              className="px-5 py-2.5 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 transition-colors text-sm"
            >
              {CTA_CONTENT.primaryCta}
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
