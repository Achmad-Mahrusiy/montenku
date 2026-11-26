"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { currentSubscription } from "@/lib/push-client";
import { signOutAction } from "@/server/actions/auth";

// "Keluar". Sends this device's push endpoint along, so a shared browser stops getting this user's reminders (D-037).
// Without JavaScript, or without push, the field is empty and signing out works as before.
// "text": the navbar's plain "Keluar →" (template's "Get started →"); "button": the full-width charcoal button in the phone menu.
export function SignOutButton({ variant }: { variant: "text" | "button" }) {
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    currentSubscription()
      .then((subscription) => setEndpoint(subscription?.endpoint ?? ""))
      .catch(() => {});
  }, []);

  return (
    <form action={signOutAction}>
      <input type="hidden" name="pushEndpoint" value={endpoint} />
      {variant === "text" ? (
        <Button type="submit" variant="ghost" className="px-2">
          Keluar <span aria-hidden="true">→</span>
        </Button>
      ) : (
        <Button type="submit" className="h-13 w-full">
          Keluar
        </Button>
      )}
    </form>
  );
}
