import Link from "next/link";
import { Logo } from "@/components/logo";
import { BRAND_NAME } from "@/features/marketing";

const links = [
  {
    group: "Product",
    items: [
      { title: "Features", href: "#features" },
      { title: "How it works", href: "#how-it-works" },
      { title: "Pricing", href: "#" },
    ],
  },
  {
    group: "Resources",
    items: [
      { title: "GitHub", href: "https://github.com/hasnaintypes/upkeep-app" },
      { title: "Docs", href: "#" },
      { title: "Support", href: "#" },
    ],
  },
  {
    group: "Legal",
    items: [
      { title: "Privacy", href: "#" },
      { title: "Terms", href: "#" },
    ],
  },
];

async function getCurrentYear() {
  "use cache";
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const year = await getCurrentYear();

  return (
    <footer className="bg-background border-b pt-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-12 md:grid-cols-5">
          <div className="md:col-span-2">
            <Link href="/" aria-label="go home" className="block size-fit">
              <Logo />
            </Link>
          </div>

          <div className="col-span-3 grid grid-cols-3 gap-6">
            {links.map((link) => (
              <div key={link.group} className="space-y-4">
                <span className="block font-medium">{link.group}</span>
                {link.items.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="text-muted-foreground hover:text-primary block duration-150"
                  >
                    <span>{item.title}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-wrap items-end justify-between gap-6 border-t py-6">
          <span className="text-muted-foreground order-last block text-center text-sm md:order-first">
            © {year} {BRAND_NAME}, all rights reserved
          </span>
        </div>
      </div>
    </footer>
  );
}
