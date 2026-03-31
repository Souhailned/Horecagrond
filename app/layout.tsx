import { Toaster } from "sonner";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { constructMetadata } from "@/lib/constructMetadata";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export const metadata = constructMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        {/* Development scripts removed due to runtime errors */}
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>
            {children}
            <Toaster />
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
