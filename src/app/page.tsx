import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MarketingPage } from "@/features/marketing";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <SiteHeader />
      <MarketingPage />
      <SiteFooter />
    </main>
  );
}
