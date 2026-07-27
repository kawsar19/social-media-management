import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

import { THEME_COOKIE, normalizeTheme } from "./(poc)/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Manager",
  description: "Post, manage, and analyze across LinkedIn, Facebook, and YouTube.",
};

// First-visit-only fallback: when no theme cookie exists yet, adopt the OS
// preference before first paint so there's no flash. Once the cookie is set
// (via the server action), the server renders data-theme directly and this
// script is not emitted.
const osPreferenceScript = `
(function () {
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get(THEME_COOKIE)?.value;
  const hasCookie = savedTheme === "light" || savedTheme === "dark";
  // Cookie is authoritative when present; otherwise render the default and let
  // the OS-preference script refine it before first paint.
  const theme = normalizeTheme(savedTheme);

  return (
    <html
      lang="en"
      data-theme={theme}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {!hasCookie && (
          <script dangerouslySetInnerHTML={{ __html: osPreferenceScript }} />
        )}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
