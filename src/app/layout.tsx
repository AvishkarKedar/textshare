import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { AnonshareThemeProvider } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "anonshare — Live coding with anyone, in six characters",
  description:
    "A live, end-to-end-encrypted collaborative scratchpad for text and code. Your room is six characters. Everything is encrypted in your browser before it leaves. When the last person goes, it is erased.",
  keywords: [
    "collaborative editor",
    "code editor",
    "end-to-end encrypted",
    "real-time",
    "pair programming",
    "anonymous",
    "anonshare",
  ],
  authors: [{ name: "anonshare" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "anonshare — Live coding with anyone, in six characters",
    description:
      "Encrypted in your browser. Erased when you leave. No account, ever.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} antialiased bg-anon-bg text-anon-fg`}
      >
        <AnonshareThemeProvider>
          {children}
        </AnonshareThemeProvider>
        <Toaster />
        <SonnerToaster position="bottom-center" />
      </body>
    </html>
  );
}
