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
  metadataBase: new URL("https://code.avishkark.in"),
  title: {
    default: "AnonShare — Real-Time Encrypted Code & Text Sharing",
    template: "%s | AnonShare",
  },
  description:
    "AnonShare is an ultra-fast, zero-knowledge, end-to-end encrypted (E2EE) real-time collaborative code editor and scratchpad. Share 6-character room codes instantly with live cursors, code execution in 8 languages, sandboxed HTML preview, and zero registration.",
  applicationName: "AnonShare",
  authors: [{ name: "Avishkar Kedar", url: "https://avishkark.in" }],
  generator: "Next.js",
  keywords: [
    "AnonShare",
    "anonshare",
    "Anon Share",
    "anon share",
    "anonshare code",
    "anonymous code share",
    "encrypted code editor",
    "collaborative code editor",
    "real-time code sharing",
    "pair programming online",
    "ephemeral code editor",
    "zero knowledge pastebin",
    "encrypted scratchpad",
    "live code execution",
    "online IDE",
    "Avishkar Kedar",
  ],
  referrer: "origin-when-cross-origin",
  creator: "Avishkar Kedar",
  publisher: "Avishkar Kedar",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "https://code.avishkark.in/",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "AnonShare — Real-Time Encrypted Code & Text Sharing",
    description:
      "Zero-knowledge, end-to-end encrypted collaborative code editor. Create a 6-character room and pair program in real-time with live cursors and sandboxed execution.",
    url: "https://code.avishkark.in",
    siteName: "AnonShare",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "AnonShare — Real-Time Encrypted Code Sharing",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AnonShare — Real-Time Encrypted Code & Text Sharing",
    description:
      "Zero-knowledge, end-to-end encrypted collaborative code editor. 6-character rooms with live cursors, sandboxed code runner, and zero registration.",
    images: ["/og.png"],
    creator: "@avishkarkedar",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "AnonShare",
    "alternateName": ["anonshare", "Anon Share", "AnonShare IDE", "anonshare code"],
    "url": "https://code.avishkark.in",
    "description": "AnonShare is an ultra-fast, zero-knowledge, end-to-end encrypted collaborative code editor and scratchpad. Share 6-character room codes instantly with live multi-cursor CRDT sync, in-browser code execution, HTML preview, and zero registration.",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Any (Web Browser)",
    "browserRequirements": "Requires JavaScript. Requires HTML5.",
    "softwareVersion": "5.5.1",
    "inLanguage": "en",
    "isAccessibleForFree": true,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
    },
    "author": {
      "@type": "Person",
      "name": "Avishkar Kedar",
      "url": "https://avishkark.in",
    },
    "creator": {
      "@type": "Person",
      "name": "Avishkar Kedar",
      "url": "https://avishkark.in",
    },
    "publisher": {
      "@type": "Person",
      "name": "Avishkar Kedar",
      "url": "https://avishkark.in",
    },
    "image": "https://code.avishkark.in/og.png",
    "screenshot": "https://code.avishkark.in/og.png",
    "featureList": [
      "End-to-End Encryption with AES-GCM-256 and PBKDF2-SHA256 (600k rounds)",
      "Instant 6-Character Ephemeral Room Codes",
      "Real-Time Multi-Cursor CRDT Synchronization",
      "Sandboxed In-Browser Code Execution in 8 Languages (Python, JavaScript, C, C++, Java, Rust, Go, Bash)",
      "Live Interactive HTML/Web Sandboxed Preview",
      "Time Machine History Snapshot Scrubbing with Side-by-Side Diffing",
      "Zero Account Registration and Zero Tracking Cookies",
      "Automatic TTL Purge and Self-Destruction",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "AnonShare",
    "alternateName": ["anonshare", "Anon Share"],
    "url": "https://code.avishkark.in",
    "description": "Live, end-to-end encrypted text and code sharing in your browser.",
    "publisher": {
      "@type": "Person",
      "name": "Avishkar Kedar",
      "url": "https://avishkark.in",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is AnonShare?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "AnonShare is a zero-knowledge, end-to-end encrypted (E2EE) real-time collaborative code editor and scratchpad. You can create or join a collaborative workspace in seconds using a 6-character room code without creating an account.",
        },
      },
      {
        "@type": "Question",
        "name": "Is AnonShare really end-to-end encrypted?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Every document edit, chat message, and file is encrypted in your browser using AES-GCM-256 and PBKDF2-SHA256 (600,000 rounds) before leaving your device. The relay server only forwards opaque ciphertext and can never inspect your plaintext code.",
        },
      },
      {
        "@type": "Question",
        "name": "What happens when everyone leaves an AnonShare room?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Once no participants are connected for the room's TTL expiration (10 minutes, 1 hour, or 24 hours), the entire room, code, chat, and files are permanently purged from memory and storage.",
        },
      },
      {
        "@type": "Question",
        "name": "What programming languages can I execute in AnonShare?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "AnonShare supports sandboxed execution for Python, JavaScript (Node.js), C, C++, Java, Rust, Go, and Bash directly from the browser.",
        },
      },
      {
        "@type": "Question",
        "name": "Do I need to sign up or create an account to use AnonShare?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. AnonShare requires no registration, no email address, no OAuth logins, and uses no tracking cookies or telemetry.",
        },
      },
    ],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Schema.org JSON-LD Structured Data for Google Rich Snippets */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
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
