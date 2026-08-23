import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { AUTH_ROUTES, DEFAULT_AUTHENTICATED_REDIRECT } from "../constants/routes";

export async function AuthButton() {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-4">
      <Button asChild size="sm" variant="outline">
        <Link href={DEFAULT_AUTHENTICATED_REDIRECT}>Dashboard</Link>
      </Button>
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href={AUTH_ROUTES.login}>Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href={AUTH_ROUTES.signUp}>Sign up</Link>
      </Button>
    </div>
  );
}
