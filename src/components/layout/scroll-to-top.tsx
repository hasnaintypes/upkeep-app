"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pixels scrolled before the button appears -- roughly one viewport, so it
 * doesn't show up immediately on short pages or right after landing. */
const SCROLL_THRESHOLD = 400;

/**
 * Fixed bottom-right "back to top" button for the long, single-page
 * marketing site. Hidden until the visitor has scrolled past
 * `SCROLL_THRESHOLD`, then fades/slides in; clicking smooth-scrolls back
 * to the top instead of jumping instantly.
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SCROLL_THRESHOLD);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      tabIndex={visible ? 0 : -1}
      className={cn(
        "bg-primary text-primary-foreground fixed right-6 bottom-6 z-50 flex size-11 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:opacity-90 motion-reduce:transition-none",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
