import type { Metadata, Viewport } from "next";
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
});

/**
 * viewport-fit=cover lets the app draw under the notch/home indicator and
 * use env(safe-area-inset-*) paddings — required for the mobile bottom bar.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

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
    icon: "/favicon.png",
    apple: "/favicon.png",
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
      <head>
        {/* Apply the persisted theme before first paint to avoid a flash of
            the wrong theme. Mirrors the zustand persist key + theme ids from
            src/lib/themes.ts. Falls back to dark (the default). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem('anonshare-prefs-v5')||'{}');var t=p&&p.state&&p.state.theme;var ok=['dark','light','dracula','nord','monokai'];if(t&&ok.indexOf(t)>=0){document.documentElement.setAttribute('data-theme',t);if(t!=='light')document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
      </head>
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
