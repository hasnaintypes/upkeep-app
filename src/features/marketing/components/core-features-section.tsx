import Link from "next/link";
import {
  Activity,
  Bell,
  Globe,
  ListChecks,
  PiggyBank,
  Send,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { CORE_FEATURES, CORE_FEATURES_CONTENT } from "../constants/core-features";
import { GITHUB_URL } from "../constants/navigation";
import type { CoreFeature, CoreFeatureIcon } from "../types";
import { Reveal } from "./reveal";

const ICONS: Record<CoreFeatureIcon, LucideIcon> = {
  checks: SlidersHorizontal,
  status: Activity,
  "keep-alive": Zap,
  incidents: ListChecks,
  alerts: Bell,
  notifications: Send,
  hosts: Globe,
  "self-hosted": PiggyBank,
};

export function CoreFeaturesSection() {
  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[280px_1fr] lg:items-start lg:gap-16">
          <Reveal>
            <h2 className="text-4xl leading-[1.05] font-semibold tracking-tight lg:text-5xl">
              {CORE_FEATURES_CONTENT.headingLead}
              <br />
              {CORE_FEATURES_CONTENT.headingRest}
            </h2>

            <div className="mt-6 flex flex-col items-start gap-3">
              <Button asChild>
                <Link href={AUTH_ROUTES.signUp}>{CORE_FEATURES_CONTENT.primaryCta}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={GITHUB_URL} target="_blank" rel="noreferrer">
                  {CORE_FEATURES_CONTENT.secondaryCta}
                </Link>
              </Button>
            </div>
          </Reveal>

          <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2">
            {CORE_FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 60}>
                <CoreFeatureItem feature={feature} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CoreFeatureItem({ feature }: { feature: CoreFeature }) {
  const Icon = ICONS[feature.icon];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-foreground size-5" />
        </div>
        <h3 className="text-foreground text-lg font-semibold">{feature.title}</h3>
      </div>
      <div className="border-t" />
      <p className="text-muted-foreground text-sm">{feature.description}</p>
    </div>
  );
}
