import type { ReactNode } from "react";

// Mounts again when switching between Masuk and Daftar, so the blocks rise in again (D-041).
export default function AuthTemplate({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="motion-stagger">{children}</div>;
}
