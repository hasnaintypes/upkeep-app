import { ChevronRight } from "lucide-react";
import {
  DOC_MOCKUP_CONTENT,
  FEATURE_GRID,
  IDEATE_CONTENT,
  PRODUCT_DIRECTION_CONTENT,
  PROJECT_MILESTONES,
  PROJECT_OVERVIEW_CONTENT,
  PROJECT_UPDATE_CARDS,
  PROJECT_UPDATES_CONTENT,
  TIMELINE_BARS,
  TIMELINE_DATE_LABELS,
} from "../constants/product-direction";
import type { FeatureGridIconKey } from "../types";

function FeatureIcon({ icon }: { icon: FeatureGridIconKey }) {
  switch (icon) {
    case "target":
      return (
        <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <circle cx="10" cy="10" r="4" />
          <circle cx="10" cy="10" r="1" fill="currentColor" />
        </svg>
      );
    case "network":
      return (
        <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path d="M2 10h16M10 2a15 15 0 010 16M10 2a15 15 0 000 16" />
        </svg>
      );
    case "diamond":
      return <div className="w-4 h-4 rotate-45 bg-zinc-400" />;
    case "bars":
      return (
        <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
          <rect x="2" y="10" width="3" height="8" rx="1" />
          <rect x="7" y="6" width="3" height="12" rx="1" />
          <rect x="12" y="8" width="3" height="10" rx="1" />
          <rect x="17" y="4" width="3" height="14" rx="1" />
        </svg>
      );
    default:
      return null;
  }
}

export function ProductDirectionSection() {
  return (
    <section className="relative py-40 px-6 md:px-12 lg:px-24">
      {/* Gradient overlay at top */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: "20%",
          background: "linear-gradient(to bottom, rgba(255,255,255,0.05), transparent 100%)",
        }}
      />

      <div className="max-w-6xl mx-auto">
        {/* Section label */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-zinc-400 text-sm">{PRODUCT_DIRECTION_CONTENT.label}</span>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </div>

        {/* Section heading */}
        <h2
          className="text-3xl sm:text-4xl md:text-5xl lg:text-[56px] font-medium text-white mb-8 max-w-3xl"
          style={{
            letterSpacing: "-0.0325em",
            fontVariationSettings: '"opsz" 28',
            fontWeight: 538,
            lineHeight: 1.1,
          }}
        >
          {PRODUCT_DIRECTION_CONTENT.heading}
        </h2>

        {/* Description */}
        <p className="text-zinc-400 text-lg max-w-md mb-16">
          <span className="text-white font-medium">{PRODUCT_DIRECTION_CONTENT.descriptionLead}</span>{" "}
          {PRODUCT_DIRECTION_CONTENT.description}
        </p>

        {/* 3D Timeline Visualization */}
        <div className="relative w-full mb-16" style={{ perspective: "1200px" }}>
          <div
            className="relative"
            style={{
              transform: "rotateX(50deg) rotateZ(-35deg)",
              transformStyle: "preserve-3d",
              transformOrigin: "center center",
            }}
          >
            {/* Timeline ruler with tick marks */}
            <div className="relative h-[400px]">
              {/* Diagonal dashed line */}
              <div
                className="absolute w-[1px] bg-zinc-600/50"
                style={{
                  height: "600px",
                  left: "55%",
                  top: "-100px",
                  transform: "rotate(0deg)",
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent, transparent 4px, rgba(113, 113, 122, 0.5) 4px, rgba(113, 113, 122, 0.5) 8px)",
                }}
              />

              {/* Timeline header with dates and tick marks */}
              <div className="absolute top-0 left-0 right-0 flex items-end">
                {/* Tick marks row */}
                <div className="flex items-end gap-[3px] absolute bottom-0 left-[5%] right-0">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-zinc-600/60"
                      style={{
                        width: "1px",
                        height: i % 7 === 0 ? "16px" : "8px",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Date labels */}
              {TIMELINE_DATE_LABELS.map((dateLabel) => (
                <div
                  key={dateLabel.label}
                  className={
                    dateLabel.emphasis
                      ? "absolute px-3 py-1 rounded-md bg-zinc-700/80 text-zinc-300 text-sm font-medium"
                      : "absolute text-zinc-500 text-sm"
                  }
                  style={{ left: dateLabel.left, top: dateLabel.top }}
                >
                  {dateLabel.label}
                </div>
              ))}

              {/* Project bars */}
              {TIMELINE_BARS.map((bar) => (
                <div
                  key={bar.label}
                  className={`absolute rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${bar.containerClass}`}
                  style={{ left: bar.left, top: bar.top, width: bar.width, height: bar.height }}
                >
                  <div className="flex items-center gap-3">
                    {bar.leadingDiamondClass && <div className={`rotate-45 ${bar.leadingDiamondClass}`} />}
                    <span className={`text-sm ${bar.textClass}`}>{bar.label}</span>
                  </div>
                  {bar.trailingDiamondCount && (
                    <div className="flex gap-0.5">
                      {Array.from({ length: bar.trailingDiamondCount }).map((_, i) => (
                        <div key={i} className="w-2.5 h-2.5 rotate-45 bg-zinc-500/60" />
                      ))}
                    </div>
                  )}
                  {bar.trailingCheckpoint && (
                    <div
                      className="absolute w-5 h-5 rotate-45 border-2 border-green-500 bg-transparent"
                      style={{ right: "15%", top: "50%", transform: "translateY(-50%) rotate(45deg)" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom two-column section */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left column - Manage projects end-to-end */}
          <div className="border-t border-r border-b border-zinc-800 pt-10 pr-10 pb-16">
            <h3 className="text-xl font-medium text-zinc-200 mb-3">{PROJECT_OVERVIEW_CONTENT.heading}</h3>
            <p className="text-zinc-500 text-base leading-relaxed mb-8">{PROJECT_OVERVIEW_CONTENT.description}</p>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h4 className="text-lg font-medium text-zinc-200 mb-5">{PROJECT_OVERVIEW_CONTENT.cardTitle}</h4>

              {/* Properties row */}
              <div className="flex items-center gap-4 mb-4">
                <span className="text-zinc-500 text-sm w-20">{PROJECT_OVERVIEW_CONTENT.propertiesLabel}</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    {PROJECT_OVERVIEW_CONTENT.status}
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs">
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="2" y="2" width="12" height="12" rx="2" />
                    </svg>
                    {PROJECT_OVERVIEW_CONTENT.team}
                  </span>
                  <div className="flex -space-x-1.5">
                    <div className="w-5 h-5 rounded-full bg-zinc-600 border border-zinc-900" />
                    <div className="w-5 h-5 rounded-full bg-zinc-500 border border-zinc-900" />
                    <div className="w-5 h-5 rounded-full bg-zinc-700 border border-zinc-900" />
                  </div>
                </div>
              </div>

              {/* Resources row */}
              <div className="flex items-center gap-4 mb-4">
                <span className="text-zinc-500 text-sm w-20">{PROJECT_OVERVIEW_CONTENT.resourcesLabel}</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs">
                    <span className="text-purple-400">🚩</span>
                    {PROJECT_OVERVIEW_CONTENT.resources[0]}
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-400 text-xs">
                    <span className="text-yellow-500">⚠</span>
                    {PROJECT_OVERVIEW_CONTENT.resources[1]}
                  </span>
                </div>
              </div>

              {/* Milestones row */}
              <div className="flex items-start gap-4">
                <span className="text-zinc-500 text-sm w-20 pt-1">{PROJECT_OVERVIEW_CONTENT.milestonesLabel}</span>
                <div className="flex flex-col gap-2">
                  {PROJECT_MILESTONES.map((milestone) => (
                    <span
                      key={milestone.label}
                      className={`flex items-center gap-2 text-sm ${
                        milestone.state === "complete" ? "text-zinc-300" : "text-zinc-400"
                      }`}
                    >
                      <span
                        className={
                          milestone.state === "complete"
                            ? "w-2.5 h-2.5 rotate-45 bg-purple-500"
                            : "w-2.5 h-2.5 rotate-45 border border-zinc-500 bg-transparent"
                        }
                      />
                      {milestone.label} <span className="text-zinc-500">{milestone.meta}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Project updates */}
          <div className="border-t border-b border-zinc-800 pt-10 pl-10 pb-16">
            <h3 className="text-xl font-medium text-zinc-200 mb-3">{PROJECT_UPDATES_CONTENT.heading}</h3>
            <p className="text-zinc-500 text-base leading-relaxed mb-8">{PROJECT_UPDATES_CONTENT.description}</p>

            <div className="relative h-48">
              {PROJECT_UPDATE_CARDS.map((card) => {
                if (card.variant === "on-track") {
                  return (
                    <div
                      key={card.label}
                      className="absolute rounded-xl bg-zinc-800/90 border border-zinc-700/50 px-5 py-4"
                      style={card.position}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                          <svg className="w-3 h-3 text-green-500" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                          </svg>
                        </span>
                        <span className="text-green-500 font-medium text-sm">{card.label}</span>
                      </div>
                      <p className="text-zinc-300 text-sm mb-3">{card.message}</p>
                      <span className="text-zinc-500 text-xs">{card.date}</span>
                    </div>
                  );
                }

                const dotClass = card.variant === "off-track" ? "bg-zinc-500" : "bg-zinc-400";
                const textClass = card.variant === "off-track" ? "text-zinc-500" : "text-zinc-400";
                const containerClass =
                  card.variant === "off-track"
                    ? "bg-zinc-800/40 border-zinc-700/30"
                    : "bg-zinc-800/60 border-zinc-700/40";

                return (
                  <div
                    key={card.label}
                    className={`absolute rounded-lg border px-4 py-2 ${containerClass}`}
                    style={card.position}
                  >
                    <span className={`flex items-center gap-2 text-sm ${textClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                      {card.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 border-b border-zinc-800">
          {/* Left column - Feature list */}
          <div className="border-r border-zinc-800 pt-16 pr-10 pb-16 flex flex-col justify-center">
            <h3 className="text-2xl font-medium text-zinc-200 mb-8 leading-tight">
              {IDEATE_CONTENT.headingLine1}
              <br />
              {IDEATE_CONTENT.headingLine2}
            </h3>
            <div className="flex flex-col gap-3">
              {IDEATE_CONTENT.features.map((feature, index) => {
                const dotClass = ["bg-green-500", "bg-green-500/50", "bg-green-500/30"][index];
                const textClass = ["text-zinc-200 font-medium", "text-zinc-400", "text-zinc-500"][index];
                return (
                  <div key={feature} className="flex items-center gap-3">
                    <div className={`w-1 h-5 rounded-full ${dotClass}`} />
                    <span className={textClass}>{feature}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column - Document mockup */}
          <div className="pt-10 pl-10 pb-16">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 text-zinc-400 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0012.5 2h-9z" />
                </svg>
                <span>{DOC_MOCKUP_CONTENT.breadcrumb[0]}</span>
                <span className="text-zinc-600">›</span>
                <span>{DOC_MOCKUP_CONTENT.breadcrumb[1]}</span>
                <span className="ml-auto text-zinc-600">•••</span>
              </div>

              {/* Content */}
              <div className="p-5">
                {/* Icon */}
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-green-500" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 8a2 2 0 100-4 2 2 0 000 4zM8 9c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>

                {/* Title with cursor */}
                <div className="mb-3 relative inline-block">
                  <span className="text-zinc-200 text-lg font-medium">{DOC_MOCKUP_CONTENT.titlePrefix}</span>
                  <span className="relative mx-1">
                    <span className="text-zinc-200 text-lg font-medium bg-green-500/20 px-0.5">
                      {DOC_MOCKUP_CONTENT.titleHighlight}
                    </span>
                    <span className="absolute -top-4 right-0 px-1.5 py-0.5 rounded text-[10px] bg-green-600 text-white">
                      {DOC_MOCKUP_CONTENT.titleTag}
                    </span>
                  </span>
                </div>

                {/* Description with cursor */}
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  {DOC_MOCKUP_CONTENT.descriptionPrefix}{" "}
                  <span className="relative inline">
                    <span className="bg-purple-500/20 px-0.5">{DOC_MOCKUP_CONTENT.descriptionHighlight}</span>
                    <span className="absolute -bottom-4 left-0 px-1.5 py-0.5 rounded text-[10px] bg-purple-600 text-white">
                      {DOC_MOCKUP_CONTENT.descriptionTag}
                    </span>
                  </span>
                  {DOC_MOCKUP_CONTENT.descriptionSuffix}
                </p>

                {/* Placeholder text lines */}
                <div className="flex flex-col gap-2 mt-8">
                  <div className="flex gap-2 flex-wrap">
                    <div className="h-2 bg-zinc-700/50 rounded w-16" />
                    <div className="h-2 bg-zinc-700/30 rounded w-24" />
                    <div className="h-2 bg-zinc-700/50 rounded w-12" />
                    <div className="h-2 bg-orange-500/40 rounded w-20" />
                    <div className="h-2 bg-zinc-700/30 rounded w-16" />
                    <div className="h-2 bg-zinc-700/50 rounded w-28" />
                    <div className="h-2 bg-orange-500/40 rounded w-8" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div className="h-2 bg-zinc-700/30 rounded w-20" />
                    <div className="h-2 bg-zinc-700/50 rounded w-8" />
                    <div className="h-2 bg-zinc-700/30 rounded w-28" />
                    <div className="h-2 bg-orange-500/40 rounded w-12" />
                    <div className="h-2 bg-zinc-700/50 rounded w-16" />
                    <div className="h-2 bg-zinc-700/30 rounded w-24" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div className="h-2 bg-zinc-700/50 rounded w-24" />
                    <div className="h-2 bg-zinc-700/30 rounded w-16" />
                    <div className="h-2 bg-orange-500/40 rounded w-20" />
                    <div className="h-2 bg-zinc-700/50 rounded w-8" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-2 bg-zinc-700/50 rounded w-12" />
                    <div className="h-2 bg-zinc-700/30 rounded w-16" />
                  </div>
                  <div className="h-6" />
                  <div className="flex gap-2 flex-wrap">
                    <div className="h-2 bg-zinc-700/30 rounded w-24" />
                    <div className="h-2 bg-zinc-700/50 rounded w-16" />
                    <div className="h-2 bg-zinc-700/30 rounded w-20" />
                    <div className="h-2 bg-orange-500/40 rounded w-8" />
                    <div className="h-2 bg-zinc-700/50 rounded w-12" />
                    <div className="h-2 bg-zinc-700/30 rounded w-28" />
                    <div className="h-2 bg-orange-500/40 rounded w-16" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-16">
          {FEATURE_GRID.map((item) => (
            <div key={item.title}>
              <div className="flex items-center gap-2 mb-3">
                <FeatureIcon icon={item.icon} />
                <span className="text-zinc-200 font-medium">{item.title}</span>
              </div>
              <p className="text-zinc-500 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
