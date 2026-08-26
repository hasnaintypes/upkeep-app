import {
  HOW_IT_WORKS_CAPABILITIES,
  HOW_IT_WORKS_CONTENT,
  HOW_IT_WORKS_STEPS,
} from "../constants/how-it-works";
import type { ContentRow } from "../types";
import { Reveal } from "./reveal";

const [capabilityA, capabilityB, capabilityC, capabilityD] = HOW_IT_WORKS_CAPABILITIES;

/**
 * Combined "how it works" section: an intro block (eyebrow, highlighted
 * lead sentence, sign-up/GitHub CTAs, a 2x2 capability grid with a divider
 * between rows) plus the 4-step numbered walkthrough below it. Visually
 * inspired by a reference design's two stacked blocks, re-themed to this
 * project's achromatic palette (a muted background instead of a colored
 * one, a subtle foreground-tinted highlight instead of a yellow marker,
 * solid foreground number chips instead of colored ones) and merged into
 * one `bg-muted/50` section, same background treatment as the CTA section.
 */
export function HowItWorksSection() {
  return (
    <section className="bg-muted/50 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <span className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
              {HOW_IT_WORKS_CONTENT.eyebrow}
            </span>

            <h2 className="text-foreground mt-6 text-3xl leading-snug font-medium text-balance md:text-4xl">
              {HOW_IT_WORKS_CONTENT.headingLead}{" "}
              <span className="bg-foreground/10 rounded px-1.5 py-0.5">
                {HOW_IT_WORKS_CONTENT.headingHighlight}
              </span>
              {HOW_IT_WORKS_CONTENT.headingRest}
            </h2>
          </Reveal>

          <Reveal delay={100} className="grid grid-cols-2 gap-x-10 gap-y-6">
            <CapabilityItem row={capabilityA} />
            <CapabilityItem row={capabilityB} />
            <div className="col-span-2 border-t" />
            <CapabilityItem row={capabilityC} />
            <CapabilityItem row={capabilityD} />
          </Reveal>
        </div>

        <div className="mt-20">
          <Reveal>
            <span className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
              {HOW_IT_WORKS_CONTENT.stepsEyebrow}
            </span>
          </Reveal>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 100}>
                <div className="bg-background flex h-full flex-col gap-6 rounded-2xl p-8 shadow-sm">
                  <div className="bg-foreground text-background flex size-12 items-center justify-center rounded-lg text-lg font-bold">
                    {index + 1}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-foreground text-xl font-semibold">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">{step.description}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CapabilityItem({ row }: { row: ContentRow }) {
  return (
    <div className="space-y-2">
      <h3 className="text-foreground text-lg font-semibold">{row.title}</h3>
      <p className="text-muted-foreground text-base">{row.description}</p>
    </div>
  );
}
