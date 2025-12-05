import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AiProvider } from "@/components/ai/AiContext";
import AiOverlay from "@/components/ai/AiOverlay";

export const metadata: Metadata = {
  title: "Your personal finance companion",
  description: "See exactly where your money went. Auto-track expenses across banks & cards with India-native SMS/Gmail parsing.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          <ThemeProvider>
            <AiProvider>
              {children}
              <AiOverlay />
            </AiProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
