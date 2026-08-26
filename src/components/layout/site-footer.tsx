import Link from "next/link";
import { Github } from "lucide-react";
import { BRAND_NAME, GITHUB_URL } from "@/features/marketing";
import { isExternalUrl } from "@/lib/utils";

const LEGAL_LINKS = [
  { title: "Privacy Policy", href: "/privacy" },
  { title: "Terms", href: "/terms" },
];

async function getCurrentYear() {
  "use cache";
  return new Date().getFullYear();
}

/**
 * A minimal, single-row footer (copyright + legal/GitHub links) rather
 * than a multi-column link grid -- matches this project's own scale (a
 * personal, self-hosted tool, not an org with Company/Careers/Changelog
 * pages to list). The GitHub icon is the only social link here -- no
 * Instagram/X/LinkedIn placeholders for accounts that don't exist.
 */
export async function SiteFooter() {
  const year = await getCurrentYear();

  return (
    <footer className="bg-muted/50">
      <div className="mx-auto max-w-5xl px-6 py-8 text-center">
        <div className="flex w-full flex-col-reverse items-center justify-between gap-4 text-sm sm:flex-row">
          <p className="text-muted-foreground">
            © {year} {BRAND_NAME} — self-hosted uptime for side projects.
          </p>

          <div className="flex items-center gap-6">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.title}
              </Link>
            ))}
            <Link
              href={GITHUB_URL}
              target={isExternalUrl(GITHUB_URL) ? "_blank" : undefined}
              rel={isExternalUrl(GITHUB_URL) ? "noreferrer" : undefined}
              aria-label="GitHub"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="size-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
