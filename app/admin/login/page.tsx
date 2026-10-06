"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Leaf, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminApi } from "@/lib/supabase/admin";
import { btn, input, Notice } from "@/components/admin/ui";

// Admin-only sign-in (Supabase email + password). There is no sign-up here:
// admin accounts are created by the owner in Supabase. Customers never sign in.
function AdminLogin() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError("Email or password is incorrect.");
      setBusy(false);
      return;
    }
    if (!(await adminApi.isAdmin(supabase))) {
      await supabase.auth.signOut();
      setError("This account doesn't have admin access.");
      setBusy(false);
      return;
    }
    router.replace(next && next.startsWith("/admin") ? next : "/admin");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-surface p-6 ring-1 ring-line-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-leaf text-on-leaf">
          <Leaf className="size-5" strokeWidth={2.5} />
        </span>
        <h1 className="mt-3 text-center font-serif text-2xl font-semibold text-ink">Admin sign in</h1>
        <p className="mt-1 text-center text-sm text-ink-soft">Thanjai Healthy Plate</p>
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink">Email</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1.5`} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1.5`} />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" disabled={busy} className={`${btn.primary} w-full`}>
            <LogIn className="size-4" /> {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLogin />
    </Suspense>
  );
}
