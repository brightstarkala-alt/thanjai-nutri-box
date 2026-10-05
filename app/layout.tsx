import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MenuProvider } from "@/components/providers/MenuProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Thanjai Healthy Plate",
  description:
    "Fresh, healthy meal boxes delivered daily in Thanjavur. Order Box 1 or Box 2 for tomorrow's delivery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <MenuProvider>{children}</MenuProvider>
      </body>
    </html>
  );
}
