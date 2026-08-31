"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeSwitcher } from "./theme-switcher";
import { NotificationCenter } from "./notification-center";
import { MobileDrawer } from "./mobile-drawer";

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
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-control px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent-subtle text-accent"
                : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
            }`}
          >
            {item.label}
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
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-l border-border bg-surface p-5 md:flex md:flex-col">
        <Link href="/" className="mb-8 text-lg font-extrabold text-fg">
          نیازت با ما
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
            className="mt-3 text-xs font-medium text-danger hover:underline"
          >
            خروج از حساب
          </button>
        </div>
      </aside>

      {/* Mobile off-canvas nav */}
      <MobileDrawer open={mobileOpen} onClose={closeMobile} title="نیازت با ما">
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
               className="mt-3 text-xs font-medium text-danger hover:underline"
             >
               خروج از حساب
             </button>
           </div>
      </MobileDrawer>

      <div className="flex-1">
        <header className="sticky top-0 z-sticky flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="باز کردن منو"
            className="rounded-control p-1.5 text-fg-muted hover:bg-bg-subtle md:hidden"
          >
            <MenuIcon />
          </button>
          <span className="font-bold text-fg md:hidden">نیازت با ما</span>
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
