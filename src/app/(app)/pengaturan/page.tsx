import type { Metadata } from "next";
import { allTimezones, indonesianTimezones } from "@/lib/validation/content-account";
import { requireUser } from "@/server/dal/session";
import { getUserSettings } from "@/server/dal/user-settings";
import { DeleteAccountForm, SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Pengaturan | Montenku" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-12 lg:py-10">
      <h1 className="font-heading text-3xl font-bold">Pengaturan</h1>
      <div className="mt-6 grid gap-6">
        <SettingsForm
          email={user.email}
          initial={{
            emailEnabled: settings.emailEnabled,
            quietEnabled: settings.quiet !== null,
            // Pre-filled even when off, so switching on starts from a typical night.
            quietStart: settings.quiet?.start ?? "22:00",
            quietEnd: settings.quiet?.end ?? "07:00",
            timezone: settings.timezone,
          }}
          otherTimezones={allTimezones.filter((tz) => !(tz in indonesianTimezones))}
        />
        <DeleteAccountForm />
      </div>
    </main>
  );
}
