import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// The v3 template button (D-043): charcoal, 5px corners, mono label after a small square bullet. The bullet is a
// pseudo-element, so it never becomes part of the button's accessible name. Ghost is the plain-text style ("Keluar →").
const bullet = "before:size-1.5 before:shrink-0 before:bg-current before:content-['']";

// Hand-written in the shadcn/ui shape (the registry was unreachable); same API, Montenku tokens.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] font-mono text-[13px] font-medium whitespace-nowrap transition-[color,background-color,border-color,scale] duration-150 outline-none motion-safe:active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
  {
    variants: {
      variant: {
        default: `${bullet} bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75`,
        outline: `${bullet} border border-foreground bg-card hover:bg-muted active:bg-accent`,
        ghost: "font-sans text-[15px] hover:underline hover:underline-offset-4",
      },
      size: {
        // 44px tall: minimum comfortable tap target on phones.
        default: "h-11 px-4",
        sm: "h-9 px-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
