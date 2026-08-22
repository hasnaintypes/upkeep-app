"use client";

import { cn } from "@/lib/utils";
import { Calendar1 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "./reveal";
import {
  CODE_ILLUSTRATION_CONTENT,
  FEATURE_CARDS,
  FEATURES_CONTENT,
  SCHEDULE_ILLUSTRATION_CONTENT,
} from "../constants/features";

export function FeaturesSection() {
  return (
    <section id="features">
      <div className="py-24">
        <div className="mx-auto w-full max-w-5xl px-6">
          <Reveal>
            <h2 className="text-foreground mt-4 text-4xl font-semibold">
              {FEATURES_CONTENT.heading}
            </h2>
            <p className="text-muted-foreground mb-12 mt-4 text-balance text-lg">
              {FEATURES_CONTENT.description}
            </p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURE_CARDS.map((card, index) => (
              <Reveal key={card.title} delay={index * 100}>
                <Card
                  variant="soft"
                  className="h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex aspect-video items-center justify-center">
                    {card.illustration === "code" ? (
                      <CodeIllustration className="w-full" />
                    ) : (
                      <ScheduleIllustration className="border" />
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-foreground text-xl font-semibold">
                      {card.title}
                    </h3>
                    <p className="text-muted-foreground mt-4 text-balance text-lg">
                      {card.description}
                    </p>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type IllustrationProps = {
  className?: string;
  variant?: "elevated" | "outlined" | "mixed";
};

export const ScheduleIllustration = ({
  className,
  variant = "elevated",
}: IllustrationProps) => {
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "bg-background -translate-x-1/8 absolute flex translate-y-[-110%] items-center gap-2 rounded-lg p-1",
          {
            "shadow-black-950/10 shadow-lg": variant === "elevated",
            "border-foreground/10 border": variant === "outlined",
            "border-foreground/10 border shadow-md shadow-black/5":
              variant === "mixed",
          },
        )}
      >
        <Button size="sm" className="rounded-sm">
          <Calendar1 className="size-3" />
          <span className="text-sm font-medium">
            {SCHEDULE_ILLUSTRATION_CONTENT.toolbarLabel}
          </span>
        </Button>
      </div>
      <span>
        <span className="bg-secondary text-secondary-foreground py-1">
          {SCHEDULE_ILLUSTRATION_CONTENT.highlight}
        </span>{" "}
        {SCHEDULE_ILLUSTRATION_CONTENT.suffix}
      </span>
    </div>
  );
};

export const CodeIllustration = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "mask-[radial-gradient(ellipse_50%_50%_at_50%_50%,#000_50%,transparent_100%)]",
        className,
      )}
    >
      <ul className="text-muted-foreground mx-auto w-fit font-mono text-2xl font-medium">
        {CODE_ILLUSTRATION_CONTENT.items.map((item, index) => (
          <li
            key={item}
            className={cn(
              "relative",
              index === CODE_ILLUSTRATION_CONTENT.highlightedIndex &&
                "text-foreground",
            )}
          >
            {index === CODE_ILLUSTRATION_CONTENT.highlightedIndex && (
              <span className="absolute -translate-x-[110%] text-orange-500">
                {CODE_ILLUSTRATION_CONTENT.highlightedTag}
              </span>
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};
