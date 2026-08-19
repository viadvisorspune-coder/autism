import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ORCA",
  description: "Autism support coordination",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
