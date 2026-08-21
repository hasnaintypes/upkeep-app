"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { signOut } from "../lib/actions";
import { AUTH_ROUTES } from "../constants/routes";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await signOut();
    router.push(AUTH_ROUTES.login);
  };

  return <Button onClick={logout}>Logout</Button>;
}
