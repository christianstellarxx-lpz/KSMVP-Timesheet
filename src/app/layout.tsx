import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (src/app/fonts, latin subset, from Google Fonts, SIL Open Font
// License) rather than next/font/google: that downloads the fonts during every
// build, and a bad Google Fonts response on Vercel's build servers failed the
// whole deploy (November 2026). Local files can't.
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

// Open Sans is a variable font: one file covers every weight we use.
const openSans = localFont({
  src: "./fonts/open-sans.woff2",
  weight: "400 700",
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KSMVP VA Tasks — We Make AI Easy",
  description:
    "Virtual Assistant time and task reporting for the Kevin Spann Mentorship Value Program.",
};

export const viewport: Viewport = {
  themeColor: "#303E7A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${openSans.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
