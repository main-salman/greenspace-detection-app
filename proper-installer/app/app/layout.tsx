import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Greenspace Detection",
  description: "Analyze satellite imagery to detect and visualize vegetation in cities worldwide using NDVI analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="w-full bg-white border-b mb-4">
          <div className="container mx-auto px-4 py-2 text-sm flex gap-4">
            <a href="/" className="text-blue-600 hover:underline">Home</a>
            <a href="/add" className="text-blue-600 hover:underline">Add / Edit City</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
