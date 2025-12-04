import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { StoreProvider } from "./context/StoreContext";
import CartSidebar from "./components/CartSidebar";

export const metadata: Metadata = {
  title: "MCE Printing | Premium Printing for Creators",
  description: "High-quality printing services for artists, authors, and conventions. Manga, books, posters, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex flex-col min-h-screen bg-slate-900 text-gray-100 antialiased">
        <StoreProvider>
            <Header />
            <CartSidebar />
            <main className="flex-grow">
            {children}
            </main>
            <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
