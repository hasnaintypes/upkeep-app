"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "../lib/use-in-view";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms, applied only once the element is in view. */
  delay?: number;
}

/**
 * Fades + slides content up when it scrolls into view. CSS-only transition
 * (no animation library) - visibility is tracked via IntersectionObserver
 * in useInView, actual motion is plain Tailwind transition utilities.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      style={inView && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
