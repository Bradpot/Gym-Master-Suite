import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Bell,
  Sun,
  Moon,
  Flame,
} from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: stats } = useGetDashboardStats();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      href: "/members",
      label: "Members",
      icon: Users,
      badge: stats?.totalMembers ?? null,
    },
    { href: "/calendar", label: "Calendar", icon: Calendar },
    {
      href: "/notifications",
      label: "Notifications",
      icon: Bell,
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
      {/* Sidebar */}
      <aside className="w-[220px] border-r border-sidebar-border bg-sidebar flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shadow-sm shadow-primary/30 transition-transform group-hover:scale-105">
              <Flame className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span
              className="font-display font-bold text-[15px] leading-tight text-sidebar-foreground tracking-tight"
              style={{ fontFamily: "var(--app-font-display)" }}
            >
              Fitness<br />
              <span className="text-primary">Temple</span>
            </span>
          </Link>
        </div>

        {/* Nav section label */}
        <div className="px-4 pt-5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Navigation
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 pb-4 space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-150 font-medium",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <span className="flex items-center gap-3">
                  <item.icon
                    className={cn("h-4 w-4 flex-shrink-0", active ? "opacity-100" : "opacity-70")}
                    strokeWidth={active ? 2.5 : 2}
                  />
                  {item.label}
                </span>
                {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none",
                      active
                        ? "bg-white/25 text-white"
                        : item.badgeUrgent
                        ? "bg-amber-500 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer status */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[11px] text-muted-foreground">Systems operational</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground/80 hidden sm:block">
              {activeLabel ?? "Fitness Temple"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {stats?.expiringSoonMembers ? (
              <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {stats.expiringSoonMembers} expiring soon
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 rounded-xl"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
