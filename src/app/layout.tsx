import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Apuração Eleitoral Paralela — Santo André",
    template: "%s · Apuração SA",
  },
  description:
    "PWA de apuração paralela de Boletins de Urna para fiscais e telão em tempo real em Santo André.",
  applicationName: "Apuração SA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Apuração SA",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#003B7E" },
    { media: "(prefers-color-scheme: dark)", color: "#001a3a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${sourceSans.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
