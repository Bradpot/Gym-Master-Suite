import { Link, useLocation } from "wouter";
import {
  Dumbbell,
  LayoutDashboard,
  Users,
  Calendar,
  Bell,
  Sun,
  Moon,
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

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-sidebar flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-lg text-sidebar-primary">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-4.5 w-4.5 text-primary" />
            </div>
            IronTrack
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150",
                  active
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </span>
                {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none",
                      active
                        ? "bg-white/20 text-white"
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

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 rounded-lg bg-muted/30">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Status</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">All systems running</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground hidden sm:block">
              {navItems.find((i) => isActive(i.href))?.label ?? "IronTrack"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stats?.expiringSoonMembers ? (
              <div className="hidden sm:flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {stats.expiringSoonMembers} expiring soon
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9"
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
