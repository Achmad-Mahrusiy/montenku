import type { ReactNode } from "react";
import { ScrollReveal } from "./scroll-reveal";

// A template (unlike the layout) mounts again on every navigation, so the page fade and the scroll reveals start over (D-041).
export default function AppTemplate({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="motion-page">
      {children}
      <ScrollReveal />
    </div>
  );
}
