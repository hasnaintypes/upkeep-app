import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "@/features/marketing";

export const metadata: Metadata = {
  title: "Docs",
};

/**
 * Placeholder for the docs site -- intentionally not built out yet (tracked
 * for later). Points to the GitHub README in the meantime rather than
 * shipping a fake/empty "documentation" page.
 */
export default function DocsPage() {
  return (
    <section className="py-28 lg:py-32 lg:pt-44">
      <div className="mx-auto max-w-xl px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
          Docs are coming soon
        </h1>
        <p className="text-muted-foreground mt-4 text-lg text-balance">
          In the meantime, the README on GitHub covers setup and self-hosting.
        </p>
        <Link
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="text-primary mt-6 inline-block font-medium hover:underline"
        >
          View the README on GitHub
        </Link>
      </div>
    </section>
  );
}
