"use client";

import { useEffect, useState } from "react";
import { currentSubscription, keyBytes, madeWithKey, needsHomeScreen, pushSupported, registerWorker } from "@/lib/push-client";
import { pushStatusAction, subscribePushAction, unsubscribePushAction } from "@/server/actions/push";
import { switchClass } from "./settings-form";

// "Notifikasi push" in Pengaturan (D-037): one switch for this device only. Saved right away, no "Simpan" needed.
// "On" means this browser holds a subscription AND the server has it for this user.

type State = "checking" | "unsupported" | "homescreen" | "no-key" | "denied" | "off" | "on";

const notes: Partial<Record<State, string>> = {
  unsupported: "Browser ini belum mendukung notifikasi push. Coba Chrome, Edge, Firefox, atau Safari terbaru.",
  homescreen: "Di iPhone dan iPad, tambahkan Montenku ke Layar Utama dulu (Bagikan, lalu Tambah ke Layar Utama), lalu buka dari sana.",
  "no-key": "Notifikasi push belum disiapkan di server ini.",
  denied: "Izin notifikasi untuk Montenku diblokir di browser ini. Izinkan lewat pengaturan situs di browser, lalu muat ulang halaman.",
};

export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function check(): Promise<State> {
      if (!pushSupported()) return needsHomeScreen() ? "homescreen" : "unsupported";
      if (!publicKey) return "no-key";
      if (Notification.permission === "denied") return "denied";
      const subscription = await currentSubscription();
      if (!subscription || !madeWithKey(subscription, publicKey)) return "off";
      return (await pushStatusAction(subscription.endpoint)) ? "on" : "off";
    }
    check()
      .then((next) => active && setState(next))
      .catch(() => active && setState("off"));
    return () => {
      active = false;
    };
  }, [publicKey]);

  async function turnOn() {
    if (!publicKey) return;
    // Asked only now, on the user's own click, as browsers expect.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "denied" : "off");
      return;
    }
    const registration = await registerWorker();
    let subscription = await registration.pushManager.getSubscription();
    // Made with an old server key (keys were replaced): it can never receive our pushes, so start over.
    if (subscription && !madeWithKey(subscription, publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const result = await subscribePushAction(subscription.toJSON());
    if (!result.ok) {
      await subscription.unsubscribe();
      setMessage(result.error);
      return;
    }
    setState("on");
    setMessage("Notifikasi push menyala di perangkat ini.");
  }

  async function turnOff() {
    const subscription = await currentSubscription();
    if (subscription) {
      // Server first: if this fails, the device keeps working instead of silently missing reminders.
      const result = await unsubscribePushAction(subscription.endpoint);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      await subscription.unsubscribe();
    }
    setState("off");
    setMessage("Notifikasi push dimatikan di perangkat ini.");
  }

  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      await (state === "on" ? turnOff() : turnOn());
    } catch {
      setMessage("Gagal mengubah notifikasi push. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const note = notes[state];
  const canToggle = state === "on" || state === "off";

  return (
    <section data-reveal aria-labelledby="push-title" className="grid gap-3 rounded-xl bg-card p-5 sm:p-6">
      <label htmlFor="pushEnabled" className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="min-w-0">
          <span id="push-title" className="block font-heading text-xl font-bold">
            Notifikasi push
          </span>
          <span className="block text-sm text-muted-foreground">Pengingat juga muncul sebagai notifikasi di perangkat ini. Atur di tiap perangkat.</span>
        </span>
        <input
          id="pushEnabled"
          type="checkbox"
          role="switch"
          checked={state === "on"}
          disabled={!canToggle || busy}
          onChange={toggle}
          aria-describedby="push-status"
          className={`${switchClass} disabled:cursor-not-allowed disabled:opacity-50`}
        />
      </label>
      <p id="push-status" role="status" className="text-sm">
        {state === "checking" ? "Memeriksa perangkat ini..." : busy ? "Menyimpan..." : (note ?? message)}
      </p>
    </section>
  );
}
