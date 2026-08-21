import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
// Import the route constant directly (not the "@/features/auth" barrel):
// the barrel also re-exports the server-only AuthButton, which would leak
// into the client bundle here since this feature's barrel is imported by
// client components (e.g. the auth forms) elsewhere.
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { HERO_CONTENT } from "../constants/hero";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: "#09090B" }}>
      <div className="relative py-24 md:py-36">
        <div className="relative z-10 mx-auto w-full max-w-5xl px-6">
          <div className="md:w-1/2">
            <h1 className="max-w-md text-balance text-4xl font-medium text-white md:text-6xl">
              {HERO_CONTENT.heading}
            </h1>
            <p className="my-6 max-w-2xl text-balance text-lg text-zinc-400 md:my-8 md:text-xl">
              {HERO_CONTENT.description}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="bg-white text-zinc-900 hover:bg-zinc-100">
                <Link href={AUTH_ROUTES.signUp}>
                  <span className="text-nowrap">{HERO_CONTENT.primaryCta}</span>
                  <ChevronRight className="opacity-50" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800 hover:text-white"
              >
                <Link href="#">
                  <Github className="opacity-70" />
                  <span className="text-nowrap">{HERO_CONTENT.secondaryCta}</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="perspective-near mt-16 translate-x-12 md:absolute md:-right-6 md:bottom-16 md:left-1/2 md:top-32 md:mt-0 md:translate-x-0">
          <div className="relative h-full before:absolute before:-inset-x-4 before:bottom-7 before:top-0 before:skew-x-6 before:rounded-[calc(var(--radius)+1rem)] before:border before:border-white/5 before:bg-white/5">
            <div className="relative h-full -translate-y-12 skew-x-6 overflow-hidden rounded-(--radius) border border-white/10 shadow-md shadow-black/40 ring-1 ring-white/5">
              <Image
                src="/images/dashboard.webp"
                alt="Upkeep dashboard"
                fill
                priority
                className="size-full object-cover object-left-top"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
