"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { currentSubscription } from "@/lib/push-client";
import { signOutAction } from "@/server/actions/auth";

// "Keluar". Sends this device's push endpoint along, so a shared browser stops getting this user's reminders (D-037).
// Without JavaScript, or without push, the field is empty and signing out works as before.
export function SignOutButton() {
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    currentSubscription()
      .then((subscription) => setEndpoint(subscription?.endpoint ?? ""))
      .catch(() => {});
  }, []);

  return (
    <form action={signOutAction}>
      <input type="hidden" name="pushEndpoint" value={endpoint} />
      <Button type="submit" variant="outline">
        Keluar
      </Button>
    </form>
  );
}
