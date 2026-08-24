import { Suspense } from "react";
import { AuthButton } from "@/features/auth";
import { SiteNav } from "@/components/layout/site-nav";

export function SiteHeader() {
  return (
    <SiteNav
      authSlot={
        <Suspense>
          <AuthButton />
        </Suspense>
      }
    />
  );
}
