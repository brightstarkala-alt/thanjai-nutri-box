"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCog, ClipboardList, LayoutDashboard, Leaf, LogOut, ShieldAlert, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminApi } from "@/lib/supabase/admin";
import { btn, Loading } from "@/components/admin/ui";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/menu", label: "Menu", icon: CalendarCog },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/payments", label: "Payments", icon: Wallet },
];

type GateState = "checking" | "admin" | "not-admin";

// Admin pages are only shown to a signed-in user whose profile is an admin
// (is_admin()). This gate is for usability — the real protection is RLS in
// the database, which refuses admin reads/writes to anyone else.
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setEmail(data.session.user.email ?? null);
      const ok = await adminApi.isAdmin(supabase);
      if (!cancelled) setState(ok ? "admin" : "not-admin");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/admin/login");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [isLogin, pathname, router]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/admin/login");
  }

  if (isLogin) return <div className="flex flex-1 flex-col bg-canvas font-body text-ink">{children}</div>;

  if (state !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas px-4 font-body text-ink">
        {state === "checking" ? (
          <Loading text="Checking admin access…" />
        ) : (
          <div className="max-w-sm rounded-2xl bg-surface p-6 text-center ring-1 ring-line-soft">
            <ShieldAlert className="mx-auto size-8 text-danger" />
            <p className="mt-3 font-semibold">This account doesn&apos;t have admin access.</p>
            {email && <p className="mt-1 text-sm text-ink-soft">Signed in as {email}</p>}
            <button type="button" onClick={signOut} className={`${btn.secondary} mt-4`}>
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <div className="flex flex-1 flex-col bg-canvas font-body text-ink md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line-soft bg-surface px-4 py-5 md:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-full bg-leaf text-on-leaf">
            <Leaf className="size-4" strokeWidth={2.5} />
          </span>
          <span className="leading-tight">
            <span className="block font-serif text-base font-semibold">Thanjai Healthy Plate</span>
            <span className="block text-xs text-ink-soft">Admin</span>
          </span>
        </Link>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Admin">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(href) ? "bg-leaf text-on-leaf" : "text-ink hover:bg-leaf-soft"
              }`}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line-soft pt-4">
          <p className="truncate px-2 text-xs text-ink-soft">{email}</p>
          <button type="button" onClick={signOut} className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar + compact nav */}
      <header className="sticky top-0 z-10 border-b border-line-soft bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-leaf text-on-leaf">
              <Leaf className="size-4" strokeWidth={2.5} />
            </span>
            <span className="font-serif text-base font-semibold">Admin</span>
          </Link>
          <button type="button" onClick={signOut} className="flex items-center gap-1.5 text-sm text-ink-soft" aria-label="Sign out">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <nav className="grid grid-cols-4 border-t border-line-soft" aria-label="Admin">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive(href) ? "text-leaf" : "text-ink-soft"}`}
            >
              <Icon className="size-5" /> {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
