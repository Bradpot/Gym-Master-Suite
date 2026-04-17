import { Link, useLocation } from "wouter";
import {
  Dumbbell,
  Calendar,
  Bell,
  Sun,
  Moon,
  Flame,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { HeartbeatLine } from "./heartbeat-line";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: stats } = useGetDashboardStats();

  const navItems = [
    { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard },
    { href: "/members",       label: "Members",       icon: Dumbbell,    badge: stats?.totalMembers ?? null },
    { href: "/calendar",      label: "Calendar",      icon: Calendar },
    {
      href: "/notifications", label: "Notifications", icon: Bell,
      badge: stats?.expiringSoonMembers ? stats.expiringSoonMembers : null,
      badgeUrgent: true,
    },
  ];

  const isActive = (href: string) =>
    location === href ||
    (href !== "/dashboard" && href !== "/" && location.startsWith(href));

  const activeLabel = navItems.find((i) => isActive(i.href))?.label;

  return (
    <div className="flex min-h-[100dvh] bg-background">

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className="w-[220px] border-r border-sidebar-border bg-sidebar flex-shrink-0 flex flex-col animate-slide-in-left">

        {/* Logo */}
        <div className="relative h-20 flex items-center px-5 border-b border-sidebar-border overflow-hidden">
          {/* Subtle glow behind logo area */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
          <Link href="/dashboard" className="relative flex items-center gap-3 group">
            {/* Flame icon with flicker */}
            <div className="relative h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/40 flex-shrink-0">
              <Flame className="h-5 w-5 text-white animate-fire-flicker" strokeWidth={2.5} />
              {/* Ring pulse */}
              <span className="absolute inset-0 rounded-2xl animate-ripple-ring" />
            </div>
            <div>
              <span
                className="block font-bold text-[16px] leading-none tracking-tight text-sidebar-foreground"
                style={{ fontFamily: "var(--app-font-display)" }}
              >
                Fitness
              </span>
              <span
                className="block text-[15px] leading-none font-bold text-power-surge mt-0.5"
                style={{ fontFamily: "var(--app-font-display)" }}
              >
                Temple
              </span>
            </div>
          </Link>
        </div>

        {/* Nav section label */}
        <div className="px-4 pt-5 pb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
            Navigation
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 pb-4 space-y-0.5 stagger">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "nav-pill animate-slide-in-left relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium overflow-hidden",
                  active
                    ? "active bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                {/* Active left glow bar */}
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-white/50" />
                )}
                <span className="flex items-center gap-3 pl-1">
                  <item.icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0 transition-all duration-300",
                      active ? "opacity-100 scale-110" : "opacity-55"
                    )}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  {item.label}
                </span>
                {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none transition-all duration-300",
                    active
                      ? "bg-white/25 text-white"
                      : item.badgeUrgent
                      ? "bg-amber-500 text-white"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom heartbeat + status */}
        <div className="border-t border-sidebar-border animate-fade-in" style={{ animationDelay: "500ms" }}>
          <HeartbeatLine className="h-8 w-full" opacity={0.3} speed={3.5} />
          <div className="p-3 pt-0">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-[11px] text-muted-foreground">Systems operational</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10 animate-fade-in">
          <div className="flex items-center gap-3">
            {/* Gym icon for current section */}
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Flame className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-foreground/85 hidden sm:block">
              {activeLabel ?? "Fitness Temple"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {stats?.expiringSoonMembers ? (
              <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1.5 animate-scale-in">
                <Zap className="h-3 w-3 animate-zap-flash" />
                {stats.expiringSoonMembers} expiring soon
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 rounded-xl transition-all duration-300 hover:rotate-[20deg] hover:scale-110 hover:bg-primary/10"
            >
              {theme === "dark"
                ? <Sun className="h-4 w-4 text-amber-400" />
                : <Moon className="h-4 w-4 text-primary" />}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          <div key={location} className="animate-fade-in-up h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
