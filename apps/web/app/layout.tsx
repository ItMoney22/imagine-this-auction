import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navigation/navbar";
import { Toaster } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ImagineThisAuction - Multi-Auctioneer Marketplace",
  description: "Modern auction platform with real-time bidding, credit system, and mobile-first design",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userProfile = null
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    userProfile = data
  }

  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <div className="relative min-h-screen">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[-10rem] top-[-12rem] h-72 w-72 rounded-full bg-purple-400/20 blur-[160px]" />
            <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-indigo-300/20 blur-[150px]" />
            <div className="absolute inset-x-0 bottom-[-8rem] h-[18rem] bg-gradient-to-t from-white via-white/40 to-transparent" />
          </div>

          <Navbar user={userProfile} />
          <main className="relative z-10">
            {children}
          </main>
          <Toaster />
        </div>
      </body>
    </html>
  );
}
