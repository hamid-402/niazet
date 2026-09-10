"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeSwitcher } from "./theme-switcher";
import { NotificationCenter } from "./notification-center";
import { MobileDrawer } from "./mobile-drawer";
import { BrandMark } from './brand-mark';
import { LayoutDashboard, BriefcaseBusiness, MessagesSquare, WalletCards, ShieldCheck, ChartNoAxesCombined, UsersRound, SlidersHorizontal, Layers3 } from 'lucide-react';

function navIcon(href: string) {
  if (href.includes('reports') || href.includes('performance')) return ChartNoAxesCombined;
  if (href.includes('finance') || href.includes('wallet')) return WalletCards;
  if (href.includes('security') || href.includes('audit')) return ShieldCheck;
  if (href.includes('staff') || href.includes('users') || href.includes('admins')) return UsersRound;
  if (href.includes('tickets') || href.includes('support') || href.includes('feedback')) return MessagesSquare;
  if (href.includes('orders')) return BriefcaseBusiness;
  if (href.includes('settings') || href.includes('ai-controls')) return SlidersHorizontal;
  if (href.includes('services') || href.includes('qc')) return Layers3;
  return LayoutDashboard;
}

export interface NavItem {
  href: string;
  label: string;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="icon-md" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M3 5.5h14M3 10h14M3 14.5h14"
      />
    </svg>
  );
}

function NavLinks({
  navItems,
  onNavigate,
}: {
  navItems: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeHref = navItems.filter(item => pathname === item.href || pathname.startsWith(`${item.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="منوی میز کار" className="workspace-navigation flex flex-1 flex-col gap-1">
      {navItems.map((item) => {
        const active = item.href === activeHref;
        const Icon = navIcon(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`workspace-nav-link relative rounded-control px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent-subtle text-accent"
                : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
            }`}
          >
            <Icon size={18} strokeWidth={1.65} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  navItems,
  title,
}: {
  children: ReactNode;
  navItems: NavItem[];
  title: string;
}) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="workspace-shell flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="workspace-sidebar hidden w-64 shrink-0 border-l border-border bg-surface p-5 md:flex md:flex-col">
        <Link href="/" className="mb-8 text-lg font-extrabold text-fg">
          <BrandMark />
        </Link>
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {title}
        </p>
        <NavLinks navItems={navItems} />
        <div className="mt-6 border-t border-border pt-4">
          <div className="mb-3">
            <ThemeSwitcher />
          </div>
          <p className="text-sm font-medium text-fg">{user?.fullName}</p>
          <p dir="ltr" className="text-right text-xs text-fg-subtle">
            {user?.phone}
          </p>
          <button
            onClick={handleLogout}
            className="mt-3 inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium text-fg-muted hover:underline"
          >
            خروج از حساب
          </button>
        </div>
      </aside>

      {/* Mobile off-canvas nav */}
      <MobileDrawer id="workspace-mobile-drawer" open={mobileOpen} onClose={closeMobile} title="نیازت با ما">
           <div className="mb-5"><BrandMark caption={false} /></div>
           <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
             {title}
           </p>
           <NavLinks
             navItems={navItems}
              onNavigate={closeMobile}
           />
           <div className="mt-6 border-t border-border pt-4">
             <div className="mb-3">
               <ThemeSwitcher />
             </div>
             <p className="text-sm font-medium text-fg">{user?.fullName}</p>
             <button
               onClick={handleLogout}
               className="mt-3 inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium text-fg-muted hover:underline"
             >
               خروج از حساب
             </button>
           </div>
      </MobileDrawer>

      <div className="min-w-0 flex-1">
        <header className="workspace-header sticky top-0 z-sticky flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="باز کردن منو"
            aria-expanded={mobileOpen}
            aria-controls="workspace-mobile-drawer"
            className="rounded-control p-1.5 text-fg-muted hover:bg-bg-subtle md:hidden"
          >
            <MenuIcon />
          </button>
          <span className="md:hidden"><BrandMark caption={false} /></span>
          <span className="hidden text-sm font-bold text-fg md:block">
            {title}
          </span>
          <NotificationCenter />
        </header>
        <main id="main-content" className="page-container py-6 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
