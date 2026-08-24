import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { CTA_CONTENT } from "../constants/cta";
import { GITHUB_URL } from "../constants/navigation";
import { Reveal } from "./reveal";

/**
 * Landing-page closing CTA: the real sign-up/GitHub actions, and Upkeep's
 * own tagline ("add a project, set a check, relax forever") -- not a
 * fabricated "trusted by X businesses" claim, which would be false for a
 * self-hosted personal tool at this stage.
 */
export function CTASection() {
  return (
    <section className="bg-muted/50 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl xl:text-6xl">
            {CTA_CONTENT.heading}
          </h2>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href={AUTH_ROUTES.signUp}>{CTA_CONTENT.primaryCta}</Link>
            </Button>

            <Button size="lg" variant="outline" asChild>
              <Link href={GITHUB_URL} target="_blank" rel="noreferrer">
                {CTA_CONTENT.secondaryCta}
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
