import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./_components/WalletProvider";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Envoy — every agent gets an account",
  description: "ERC-8004 identity, cUSD settlement, on-chain receipts. On Celo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans text-ink antialiased">
        <div className="grain" aria-hidden />
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
