import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
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

function useNavLinks() {
  const { t } = useLanguage();
  const studentLinks = [
    { to: "/dashboard", label: t("nav.dashboard") },
    { to: "/pass", label: t("nav.boardingPass") },
    { to: "/trips", label: t("nav.myTrips") },
    { to: "/daily-pass", label: t("nav.dailyPass") },
  ];
  const adminLinks = [
    { to: "/admin/manifests", label: t("nav.manifests") },
    { to: "/route-dashboard", label: t("routeDash.title") },
    { to: "/trips-balance", label: t("tripsBalance.title") },
    { to: "/admin/installments", label: t("nav.installments") },
    { to: "/admin/requests", label: t("nav.adminDailyPass") },
    { to: "/admin/summer-bookings", label: t("nav.summerBookings") },
    { to: "/admin/students", label: t("nav.students") },
    { to: "/whatsapp-live", label: t("nav.whatsappLive") },
    { to: "/admin/users", label: t("nav.users") },
    { to: "/admin/scan", label: t("nav.scanQr") },
  ];
  const supervisorLinks = [
    { to: "/supervisor/students", label: t("nav.students") },
    { to: "/route-dashboard", label: t("routeDash.title") },
    { to: "/trips-balance", label: t("tripsBalance.title") },
    { to: "/whatsapp-live", label: t("nav.whatsappLive") },
    { to: "/admin/scan", label: t("nav.scanQr") },
  ];
  return { studentLinks, adminLinks, supervisorLinks };
}

export function AppHeader() {
  const { user, isAdmin, isSupervisor, signOut } = useAuth();
  const { t, toggleLanguage } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { studentLinks, adminLinks, supervisorLinks } = useNavLinks();

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
          <Button variant="ghost" size="sm" onClick={toggleLanguage} className="ms-1">
            <Globe className="size-4" /> {t("nav.langToggle")}
          </Button>
          {user ? (
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" /> {t("nav.signOut")}
            </Button>
          ) : (
            <Link to="/auth" className="ms-1">
              <Button size="sm" className="btn-gold">
                {t("auth.signIn")}
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
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm"
            onClick={toggleLanguage}
          >
            <Globe className="size-4" /> {t("nav.langToggle")}
          </button>
          {user ? (
            <button
              className="block w-full rounded-lg px-3 py-2 text-start text-sm"
              onClick={() => void signOut()}
            >
              {t("nav.signOut")}
            </button>
          ) : (
            <Link to="/auth" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm">
              {t("auth.signIn")}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
