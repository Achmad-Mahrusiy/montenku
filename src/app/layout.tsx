import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
    title: "Montenku",
    description: "Monitor kontenku: jadwal dan pengingat untuk banyak akun konten.",
    // Installed to an iPhone home screen, Montenku opens like an app; iOS only allows push there (D-037).
    appleWebApp: { capable: true, title: "Montenku", statusBarStyle: "default" },
    icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#f5f1ea" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="id" className={`${jakarta.variable} ${bricolage.variable}`}>
            <body className="antialiased">{children}</body>
        </html>
    );
}