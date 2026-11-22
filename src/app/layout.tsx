import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
    title: "Montenku",
    description: "Monitor kontenku: jadwal dan pengingat untuk banyak akun konten.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="id" className={`${jakarta.variable} ${bricolage.variable}`}>
            <body className="antialiased">{children}</body>
        </html>
    );
}