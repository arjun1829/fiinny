import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AiProvider } from "@/components/ai/AiContext";

export const metadata: Metadata = {
  title: "Fiinny - Personal Finance & Expense Tracker App",
  description: "Fiinny is your personal finance companion. See exactly where your money went, auto-track expenses, and split bills.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Script id="fiinny-schema" type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Fiinny",
              "applicationCategory": "FinanceApplication",
              "operatingSystem": "Android, iOS",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "description": "Fiinny is a personal finance companion that helps you track expenses, split bills, and master your money.",
              "author": {
                  "@type": "Organization",
                  "name": "Fiinny"
              }
            }
          `}
        </Script>
        <AuthProvider>
          <ThemeProvider>
            <AiProvider>
              {children}
            </AiProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
