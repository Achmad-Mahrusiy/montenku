"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

// Blocks marked data-reveal that start below the screen rise in as they scroll into view (GSAP ScrollTrigger, D-041).
// Blocks already on screen are left alone, so nothing visible blinks out after the page loads. Opacity only, never
// visibility: a keyboard user can still Tab into a hidden block, and the browser scrolls it in, which reveals it.
// A MutationObserver also catches blocks that arrive later: a page streamed in after loading.tsx, or a panel that opens.
export function ScrollReveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const seen = new WeakSet<Element>();
    const triggers: ScrollTrigger[] = [];

    const scan = () => {
      const fresh = gsap.utils.toArray<HTMLElement>("main [data-reveal]").filter((el) => !seen.has(el));
      fresh.forEach((el) => seen.add(el));
      const below = fresh.filter((el) => el.getBoundingClientRect().top > window.innerHeight);
      if (below.length === 0) return;
      gsap.set(below, { opacity: 0, y: 32 });
      triggers.push(
        ...ScrollTrigger.batch(below, {
          start: "top 92%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, clearProps: "transform" }),
        }),
      );
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      triggers.forEach((t) => t.kill());
    };
  }, []);

  return null;
}
