import type { MotionProps } from "motion/react";

// Shared Motion settings for cards (D-041). Plain objects, so Server Components can spread them on motion/react-client.
const ease = [0.16, 1, 0.3, 1] as const;

/** Card entrance: fades in while rising 16px. `order` staggers the cards of one page by 60 ms each. */
export const cardIn = (order = 0): MotionProps => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease, delay: Math.min(order, 8) * 0.06 } },
});

/** Hover and press for cards you can click: lifts 3px, settles a little when pressed. */
export const cardHover: MotionProps = {
  whileHover: { y: -3, transition: { duration: 0.2, ease } },
  whileTap: { scale: 0.99 },
};
