import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aydin Creative Studio",
  description: "Studio interno per produzione video AI di Aydin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${inter.variable} ${instrument.variable} ${jetbrains.variable} h-full dark`}
    >
      <body className="min-h-full bg-background text-foreground flex gradient-mesh">
        <aside className="w-64 shrink-0 border-r border-border/50 glass flex flex-col">
          <div className="px-6 py-7 border-b border-border/50">
            <Link href="/" className="block group">
              <div className="font-display text-2xl tracking-tight">
                Aydin <span className="italic text-primary">Studio</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-widest">
                Creative video AI
              </div>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-5 space-y-0.5">
            <SidebarLink href="/" label="Dashboard" icon="◇" />
            <SidebarLink href="/clients" label="Clienti" icon="◈" />
            <SidebarLink href="/projects/new" label="Nuovo video" icon="✦" highlight />
            <SidebarLink href="/library" label="Libreria video" icon="▤" />
            <div className="pt-4 mt-4 border-t border-border/40">
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                Risorse
              </div>
              <SidebarLink href="/avatars" label="Avatar" icon="◐" />
              <SidebarLink href="/voices" label="Voci" icon="◔" />
            </div>
          </nav>

          <div className="px-6 py-4 border-t border-border/50">
            <div className="text-[10px] text-muted-foreground/70 uppercase tracking-widest">
              v0.1.0
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">single-tenant agency</div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">{children}</main>

        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  highlight,
}: {
  href: string;
  label: string;
  icon?: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
        highlight
          ? "bg-primary/15 text-primary font-medium hover:bg-primary/20 ring-1 ring-primary/30"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {icon && <span className="text-base opacity-60">{icon}</span>}
      <span>{label}</span>
    </Link>
  );
}
