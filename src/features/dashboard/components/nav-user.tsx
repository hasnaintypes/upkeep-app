"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon, MoreVerticalIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
// Deliberately bypasses the "@/features/auth" barrel (unlike every other
// cross-feature import in this app -- see AGENTS.md) for a hard technical
// reason, not convenience: that barrel also re-exports the Server Component
// `AuthButton`, which imports `next/headers` transitively via
// `lib/supabase/server.ts`. Importing anything from the barrel here would
// pull that whole module graph into this Client Component's bundle and
// fail the build ("next/headers ... only available in Server Components").
// `signOut`/`AUTH_ROUTES` are both plain client-safe modules on their own.
import { AUTH_ROUTES } from "@/features/auth/constants/routes";
import { signOut } from "@/features/auth/lib/actions";
import { notify } from "@/lib/toast";

/** First letter of the email, uppercased -- there's no display name/avatar
 * upload feature in this app, so an initial is the only thing to show
 * (dashboard-01's own AvatarFallback is a hardcoded "CN"). */
function initialFor(email: string) {
  return email.charAt(0).toUpperCase();
}

/**
 * Sidebar footer user menu (adapted from dashboard-01's nav-user.tsx):
 * avatar-initial + email + a dropdown with a single real action, "Log
 * out" -- wired to the existing `signOut()` client action
 * (features/auth/lib/actions.ts), the same one `LogoutButton` uses. The
 * block's own version also has Account/Billing/Notifications items; those
 * aren't included here since none of those features exist in this app yet
 * (no fake menu items).
 */
export function NavUser({ email }: { email: string }) {
  const { isMobile } = useSidebar();
  const router = useRouter();

  async function handleLogout() {
    const { error } = await signOut();
    if (error) {
      notify.error("Couldn't log out", error.message);
      return;
    }
    router.push(AUTH_ROUTES.login);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initialFor(email)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
              <MoreVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initialFor(email)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
