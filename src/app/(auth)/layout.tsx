import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
      <div className="w-full max-w-sm">
        {/* Placeholder text wordmark until there is a real logo (docs/desain-ui.md). */}
        <p className="mb-8 font-heading text-3xl font-bold tracking-tight">Montenku</p>
        {children}
      </div>
    </main>
  );
}
