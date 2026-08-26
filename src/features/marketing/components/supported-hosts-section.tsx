import {
  Boxes,
  Cloud,
  Globe,
  Plane,
  Server,
  TrainFront,
  Triangle,
  Waves,
  Zap,
} from "lucide-react";
import { SUPPORTED_HOSTS, SUPPORTED_HOSTS_CONTENT } from "../constants/supported-hosts";
import type { SupportedHost, SupportedHostIcon } from "../types";

const ICONS: Record<SupportedHostIcon, typeof Server> = {
  server: Server,
  "train-front": TrainFront,
  plane: Plane,
  triangle: Triangle,
  globe: Globe,
  waves: Waves,
  boxes: Boxes,
  cloud: Cloud,
  zap: Zap,
};

/** One host's icon + name, linking out to the real provider. Shared by
 * both the large-screen static grid and the small-screen infinite slider
 * below so the two layouts can never drift out of sync with each other. */
function HostBadge({ host, tabbable = true }: { host: SupportedHost; tabbable?: boolean }) {
  const Icon = ICONS[host.icon];

  return (
    <a
      href={host.href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={tabbable ? undefined : -1}
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-2.5 whitespace-nowrap transition-colors"
    >
      <Icon className="size-5" />
      <span className="text-lg font-semibold tracking-tight">{host.name}</span>
    </a>
  );
}

/** One scrolling copy of every host, back-to-back with a second identical
 * copy (see `HostSlider`) for the seamless CSS marquee loop -- the second
 * copy is `aria-hidden`/untabbable so screen readers and keyboard nav only
 * ever encounter the list once, not doubled. */
function HostGroup({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className="animate-marquee motion-reduce:animate-none flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {SUPPORTED_HOSTS.map((host) => (
        <HostBadge key={host.name} host={host} tabbable={!hidden} />
      ))}
    </div>
  );
}

/**
 * Landing-page "supported hosts" logo cloud, placed between the hero and
 * the stats section. Deliberately framed as provider *compatibility*
 * ("works with"), not a customer/"used by" logo cloud -- Upkeep is a
 * self-hosted personal tool with no real customer base to showcase, so
 * claiming one would be a false statement on a live marketing page.
 * Generic lucide icons stand in for each host's real logo (no trademarked
 * brand SVGs bundled into this repo) -- picked for a loose conceptual nod
 * where a real one exists (Vercel's mark is a triangle, Supabase's a
 * bolt), not a literal reproduction.
 *
 * Large screens have enough width to lay every host out flat (no motion
 * needed); narrower screens fall back to a CSS-only infinite marquee
 * (`animate-marquee`, see globals.css) so the full list stays reachable
 * without needing a framer-motion/drag-based slider dependency this
 * project doesn't otherwise use.
 */
export function SupportedHostsSection() {
  return (
    <section className="bg-background overflow-hidden py-20 lg:py-24">
      <div className="mx-auto max-w-5xl space-y-10 px-6 text-center lg:space-y-14">
        <h2 className="text-xl text-balance md:text-2xl lg:text-3xl">
          {SUPPORTED_HOSTS_CONTENT.heading}{" "}
          <span className="text-muted-foreground">
            {SUPPORTED_HOSTS_CONTENT.headingHighlight}
          </span>
        </h2>

        <div className="hidden w-full flex-wrap items-center justify-center gap-x-12 gap-y-6 lg:flex">
          {SUPPORTED_HOSTS.map((host) => (
            <HostBadge key={host.name} host={host} />
          ))}
        </div>

        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] lg:hidden">
          <div className="flex w-full">
            <HostGroup />
            <HostGroup hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
