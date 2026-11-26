// The app's pages, shared by the navbar, the phone menu and the footer. A plain module, so the server-rendered footer
// can read it (exports of a "use client" file reach the server only as references).
// `also`: other paths that belong to this section (an item page is reached from the calendar, as in Figma).
export const appNavItems = [
  { href: "/", label: "Dashboard", also: [] },
  { href: "/kalender", label: "Kalender", also: ["/konten"] },
  { href: "/jadwal", label: "Jadwal berulang", also: [] },
  { href: "/akun-konten", label: "Akun konten", also: [] },
  { href: "/pengaturan", label: "Pengaturan", also: [] },
] as const;
