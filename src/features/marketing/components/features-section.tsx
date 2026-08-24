import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Layers,
  LayoutDashboard,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { CTA_CONTENT } from "../constants/cta";
import { FEATURE_CARDS, FEATURES_CONTENT } from "../constants/features";
import type { FeatureCard as FeatureCardData, FeatureIcon } from "../types";
import { Reveal } from "./reveal";

const ICONS: Record<FeatureIcon, LucideIcon> = {
  checks: SlidersHorizontal,
  status: Activity,
  dashboard: LayoutDashboard,
  speed: Zap,
};

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 lg:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <Reveal>
          <div className="flex w-fit flex-col gap-2 border-b pb-2">
            <span className="text-foreground flex items-center gap-2 text-sm font-medium">
              <Layers className="size-4" />
              {FEATURES_CONTENT.eyebrow}
            </span>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-16">
            <h2 className="text-foreground text-4xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl lg:text-6xl">
              {FEATURES_CONTENT.headingLead}
              <br />
              {FEATURES_CONTENT.headingRest}
            </h2>

            <div className="flex flex-col items-start gap-6 lg:pt-2">
              <p className="text-muted-foreground text-lg text-balance">
                {FEATURES_CONTENT.description}
              </p>
              <Button variant="outline" asChild>
                <Link href={AUTH_ROUTES.signUp}>{CTA_CONTENT.primaryCta}</Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <div className="relative mt-16 lg:mt-20">
          <div
            aria-hidden
            className="bg-foreground/5 pointer-events-none absolute inset-x-6 bottom-0 -z-10 h-2/3 rounded-full blur-3xl"
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_CARDS.map((card, index) => (
              <Reveal key={card.title} delay={index * 100}>
                <FeatureCardItem card={card} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCardItem({ card }: { card: FeatureCardData }) {
  const Icon = ICONS[card.icon];

  return (
    <div className="border-border bg-card relative flex h-full flex-col justify-between gap-8 rounded-2xl border p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-foreground max-w-40 text-2xl leading-tight font-semibold text-balance">
          {card.title}
        </h3>
        <Icon className="text-muted-foreground size-6 shrink-0" />
      </div>

      <div className="flex flex-1 items-end justify-between gap-4">
        <p className="text-muted-foreground text-sm text-balance">
          {card.description}
        </p>
        <ArrowRight className="text-foreground size-5 shrink-0" />
      </div>
    </div>
  );
}
