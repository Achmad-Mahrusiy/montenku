"use client";

import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";

// App-wide motion (D-041): Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger sees every smoothed frame,
// and Motion's reducedMotion="user" so cards only fade (no movement) for people who ask their device for less motion.
export function MotionRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    // anchors: in-page links (#hari-...) glide too. allowNestedScroll: the phone menu and wide tables keep their own scroll.
    const lenis = new Lenis({ autoRaf: false, anchors: true, allowNestedScroll: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (seconds: number) => lenis.raf(seconds * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
