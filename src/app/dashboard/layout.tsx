import Link from "next/link";

/** Minimal nav between the two dashboard routes -- without this, neither
 * page links to the other and one is only reachable by typing its URL
 * directly (#29 added the overview page at /dashboard; /dashboard/projects
 * already existed with no way back to it). No active-route highlighting:
 * that needs a client-side `usePathname()` and this layout has no other
 * reason to be a Client Component, so it's kept out for now. */
function DashboardNav() {
  return (
    <nav className="flex gap-4 border-b pb-4 text-sm">
      <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
        Overview
      </Link>
      <Link
        href="/dashboard/projects"
        className="text-muted-foreground hover:text-foreground"
      >
        Projects
      </Link>
    </nav>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <div className="flex-1 flex flex-col gap-6 max-w-5xl p-5 w-full">
          <DashboardNav />
          {children}
        </div>
      </div>
    </main>
  );
}
