import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
// Import the route constant directly (not the "@/features/auth" barrel):
// the barrel also re-exports the server-only AuthButton, which would leak
// into the client bundle here since this feature's barrel is imported by
// client components (e.g. the auth forms) elsewhere.
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { HERO_CONTENT } from "../constants/hero";
import { GITHUB_URL } from "../constants/navigation";

export function HeroSection() {
  return (
    <section className="overflow-hidden">
      <div className="relative pt-24 lg:pt-40">
        <div className="space-y-12 md:space-y-16">
          <div className="relative mx-auto max-w-7xl px-6">
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-2 font-medium"
            >
              <span>{HERO_CONTENT.announcementPrefix}</span>
              <span className="text-muted-foreground">
                {HERO_CONTENT.announcementText}
              </span>
              <ArrowRight className="size-3.5" />
            </Link>

            <div className="mt-8 grid items-end gap-4 md:grid-cols-2 md:gap-6">
              <h1 className="text-balance text-5xl font-medium tracking-tight md:text-6xl xl:text-7xl">
                {HERO_CONTENT.heading}
              </h1>
              <div className="mx-auto flex max-w-md flex-col gap-6">
                <p className="text-muted-foreground text-balance text-lg">
                  {HERO_CONTENT.description}
                </p>

                <Button asChild className="w-fit">
                  <Link href={AUTH_ROUTES.signUp}>{HERO_CONTENT.primaryCta}</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-7xl max-xl:px-2">
            <div className="bg-muted md:aspect-5/3 relative aspect-square overflow-hidden rounded-3xl lg:aspect-video">
              <div className="bg-background min-w-4xl lg:min-w-5xl xl:min-w-7xl ring-foreground/6.5 before:mask-radial-at-top-left before:mask-radial-from-65% before:mask-radial-[100%_60%] before:ring-foreground before:border-foreground/10 absolute left-4 top-4 z-10 rounded-2xl p-2 shadow-lg ring before:absolute before:-inset-px before:z-10 before:size-56 before:rounded-tl-2xl before:border-l before:border-t lg:left-16 lg:top-16">
                <div
                  aria-hidden
                  className="bg-foreground/2 z-1 absolute inset-0 rounded-2xl"
                />
                <Image
                  className="bg-background aspect-15/8 relative rounded-2xl"
                  src="/images/dashboard.webp"
                  alt="Upkeep dashboard"
                  width={2700}
                  height={1440}
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
