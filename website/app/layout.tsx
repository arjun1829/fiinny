import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AiProvider } from "@/components/ai/AiContext";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Fiinny - The Secure, Privacy-First Expense Tracker",
  description: "Fiinny is an ISO-aligned, private financial operating system. Auto-track expenses via SMS, split bills, and master your money without your data ever leaving your device.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${jakarta.variable}`}>
      <body className="antialiased font-sans" suppressHydrationWarning>
        <Script id="fiinny-schema" type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Fiinny",
              "applicationCategory": "FinanceApplication",
              "operatingSystem": "Android, iOS, Web",
              "datePublished": "2024-01-01",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "description": "Fiinny is a privacy-first personal finance tracker that helps you auto-track expenses from SMS, split bills, and gain total financial control. Your data is encrypted and processed on-device.",
              "author": {
                  "@type": "Organization",
                  "name": "Fiinny",
                  "location": {
                      "@type": "Place",
                      "address": {
                        "@type": "PostalAddress",
                        "addressLocality": "Hyderabad",
                        "addressCountry": "IN"
                      }
                  }
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
