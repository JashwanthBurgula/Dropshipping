import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { ToastProvider } from "@/components/ui/Toast";
import { CartProvider } from "@/components/cart/CartProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Kala & Kiln | Home, Kitchen & Utility Goods Delivered Across India",
    template: "%s | Kala & Kiln",
  },
  description:
    "Stoneware, woven table linen, and cast brass utility pieces dispatched from regional workshops in 2 to 4 days. Transparent GST pricing, live order tracking, and Cash on Delivery.",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Kala & Kiln",
    title: "Kala & Kiln | Home, Kitchen & Utility Goods",
    description:
      "Everyday kitchen and home goods delivered in 2 to 4 days across serviceable Indian PIN codes. Pay via UPI, card, or Cash on Delivery.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={inter.variable}
    >
      <body className="flex min-h-screen flex-col bg-[#F5F6F7] text-[#101828] antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[4px] focus:bg-[#1D4ED8] focus:px-4 focus:py-2.5 focus:text-[#FFFFFF]"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <CartProvider>
            <Header />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <Footer />
            <CookieBanner />
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
