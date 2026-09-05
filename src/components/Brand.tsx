import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <img
      src="/logo.jpg"
      alt="Waleed & Talaat crest"
      width={size}
      height={size}
      className="rounded-xl border-gilded object-cover shadow-gilded"
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark() {
  return (
    <div className="leading-tight">
      <p className="font-display text-base font-semibold tracking-tight">Waleed &amp; Talaat</p>
      <p className="text-[11px] tracking-[0.28em] text-muted-foreground uppercase">
        Executive Shuttle
      </p>
    </div>
  );
}

const studentLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pass", label: "Boarding pass" },
  { to: "/trips", label: "My trips" },
  { to: "/daily-pass", label: "Daily pass" },
];

const adminLinks = [
  { to: "/admin/manifests", label: "Manifests" },
  { to: "/admin/installments", label: "Installments" },
  { to: "/admin/requests", label: "Daily Pass" },
  { to: "/admin/summer-bookings", label: "Summer Bookings" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/scan", label: "Scan QR" },
];

const supervisorLinks = [{ to: "/admin/scan", label: "Scan QR" }];

export function AppHeader() {
  const { user, isAdmin, isSupervisor, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  // Admins and supervisors never see the student booking links — they
  // get a dedicated nav for their own section instead.
  const nav = isAdmin ? adminLinks : isSupervisor ? supervisorLinks : studentLinks;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-3">
          <Logo size={40} />
          <Wordmark />
        </Link>
        <nav className="ms-auto hidden items-center gap-1 md:flex">
          {nav.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                pathname === l.to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <Button variant="ghost" size="sm" onClick={() => void signOut()} className="ms-1">
              <LogOut className="size-4" /> Sign out
            </Button>
          ) : (
            <Link to="/auth" className="ms-1">
              <Button size="sm" className="btn-gold">
                Sign in
              </Button>
            </Link>
          )}
        </nav>
        <button
          className="ms-auto rounded-lg border border-border p-2 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="border-t border-border/60 px-4 pb-3 md:hidden">
          {nav.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm"
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <button
              className="block w-full rounded-lg px-3 py-2 text-start text-sm"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          ) : (
            <Link to="/auth" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm">
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
