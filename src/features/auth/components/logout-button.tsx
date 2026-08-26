"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/toast";
import { signOut } from "../lib/actions";
import { AUTH_ROUTES } from "../constants/routes";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const { error } = await signOut();
    if (error) {
      notify.error("Couldn't log out", error.message);
      return;
    }
    router.push(AUTH_ROUTES.login);
  };

  return <Button onClick={logout}>Logout</Button>;
}
