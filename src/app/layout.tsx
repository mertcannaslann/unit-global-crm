import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";

const inter = Inter({
  subsets: ["latin-ext"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Estafy CRM",
  description: "Emlak ofisleri için premium operasyon ve portföy yönetimi",
  icons: {
    icon: "/brand/estafy-crm-icon.svg",
    shortcut: "/brand/estafy-crm-icon.svg",
    apple: "/brand/estafy-apple-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
