import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { I18nProvider } from "./i18n/I18nContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KrishiDukan - AI Agri-Commerce",
  description: "Connecting farmers with retailers and manufacturers",
  icons: {
    icon: "/images/krishidukan icon.webp",
    apple: "/images/krishidukan icon.webp",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <I18nProvider>
          {children}
          <Script
            id="razorpay-checkout-js"
            src="https://checkout.razorpay.com/v1/checkout.js"
          />
        </I18nProvider>
      </body>
    </html>
  );
}
