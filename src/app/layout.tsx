import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Radio_Canada_Big, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { MotionRoot } from "./motion-root";

// The v3 type from the "Modern, Clean SaaS Company" template (D-043): sans for UI and headings, serif for body copy,
// mono for buttons and small labels.
const sans = Radio_Canada_Big({ subsets: ["latin"], variable: "--font-radio" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif-4" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
    title: "Montenku",
    description: "Monitor kontenku: jadwal dan pengingat untuk banyak akun konten.",
    // Installed to an iPhone home screen, Montenku opens like an app; iOS only allows push there (D-037).
    appleWebApp: { capable: true, title: "Montenku", statusBarStyle: "default" },
    icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#f4f4f4" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="id" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
            <body className="antialiased">
                <MotionRoot>{children}</MotionRoot>
            </body>
        </html>
    );
}