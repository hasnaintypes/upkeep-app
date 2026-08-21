import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <SiteHeader />
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5 w-full">
          {/* TODO: replace with your landing page content */}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
