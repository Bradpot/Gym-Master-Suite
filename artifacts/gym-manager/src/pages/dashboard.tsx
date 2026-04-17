import {
  useGetDashboardStats,
  useGetExpiringSoon,
  useGetNotificationHistory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, AlertTriangle, CheckCircle2, Clock, TrendingUp, BarChart3, Flame, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";

function AnimatedNumber({ value, loading, delay = 0 }: { value: number; loading: boolean; delay?: number }) {
  const count = useAnimatedCounter(value, 900, !loading);
  return (
    <span
      className="text-3xl font-bold tracking-tight animate-number-pop"
      style={{ animationDelay: `${delay}ms` }}
    >
      {loading ? "—" : count}
    </span>
  );
}

function StatCard({
  title, value, sub, icon: Icon, iconClass, gradientClass, loading, delay,
}: {
  title: string; value?: number; sub?: string;
  icon: React.ElementType; iconClass: string; gradientClass: string;
  loading: boolean; delay?: number;
}) {
  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: `${delay ?? 0}ms` }}
    >
      <Card className="card-hover relative overflow-hidden border bg-card">
        <div className={cn("absolute inset-0 opacity-[0.07]", gradientClass)} />
        {/* Top edge glow */}
        <div className={cn("absolute top-0 left-4 right-4 h-px opacity-60", gradientClass.replace("bg-", "bg-"))} />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center transition-transform duration-300 hover:scale-110", iconClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="relative">
          <AnimatedNumber value={value ?? 0} loading={loading} delay={(delay ?? 0) + 100} />
          {sub && !loading && (
            <p className="text-xs text-muted-foreground mt-1.5 animate-fade-in" style={{ animationDelay: `${(delay ?? 0) + 300}ms` }}>
              {sub}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MembershipBar({ active = 0, expiring = 0, expired = 0 }: { active?: number; expiring?: number; expired?: number }) {
  const total = active + expiring + expired;
  if (total === 0) return null;
  const ap = Math.round((active / total) * 100);
  const ep = Math.round((expiring / total) * 100);
  const xp = 100 - ap - ep;

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="font-medium">Membership Health</span>
        <span className="text-muted-foreground font-mono text-xs">{total} total</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-muted/30">
        {ap > 0 && (
          <div
            className="bar-segment bg-green-500 rounded-l-full"
            style={{ width: `${ap}%`, animationDelay: "100ms" }}
          />
        )}
        {ep > 0 && (
          <div
            className="bar-segment bg-amber-400"
            style={{ width: `${ep}%`, animationDelay: "250ms" }}
          />
        )}
        {xp > 0 && (
          <div
            className="bar-segment bg-red-500 rounded-r-full"
            style={{ width: `${xp}%`, animationDelay: "400ms" }}
          />
        )}
      </div>
      <div className="flex gap-5 text-xs text-muted-foreground">
        {[
          { label: "Active", pct: ap, color: "bg-green-500", count: active },
          { label: "Expiring", pct: ep, color: "bg-amber-400", count: expiring },
          { label: "Expired", pct: xp, color: "bg-red-500", count: expired },
        ].map(({ label, pct, color, count }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full inline-block", color)} />
            <span className="font-semibold text-foreground">{count}</span>
            <span>{label} ({pct}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: expiringSoon, isLoading: expiringLoading } = useGetExpiringSoon();
  const { data: notifications, isLoading: notificationsLoading } = useGetNotificationHistory();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Welcome banner */}
      <div className="relative rounded-2xl overflow-hidden border bg-card px-8 py-7 animate-fade-in-up">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/8 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-violet-500/6 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/40 flex-shrink-0 animate-float-bob">
              <Flame className="h-7 w-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome back to{" "}
                <span className="text-shimmer">Fitness Temple</span>
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {format(new Date(), "EEEE, MMMM d, yyyy")}
                {stats?.expiringSoonMembers ? (
                  <span className="ml-2 text-amber-500 font-medium animate-pulse">
                    · {stats.expiringSoonMembers} expiring soon
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="btn-glow flex-shrink-0">
            <Link href="/members/new">+ New Member</Link>
          </Button>
        </div>
      </div>

      {/* Stats grid — staggered entrance */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Members" value={stats?.totalMembers} delay={0}
          sub={stats?.newMembersThisMonth ? `+${stats.newMembersThisMonth} this month` : "No new members"}
          icon={Users} iconClass="bg-blue-500/15 text-blue-500" gradientClass="bg-blue-500" loading={statsLoading}
        />
        <StatCard
          title="Active" value={stats?.activeMembers} delay={80}
          sub="Good standing"
          icon={CheckCircle2} iconClass="bg-green-500/15 text-green-500" gradientClass="bg-green-500" loading={statsLoading}
        />
        <StatCard
          title="Expiring Soon" value={stats?.expiringSoonMembers} delay={160}
          sub="Within 7 days"
          icon={AlertTriangle} iconClass="bg-amber-500/15 text-amber-500" gradientClass="bg-amber-500" loading={statsLoading}
        />
        <StatCard
          title="Expired" value={stats?.expiredMembers} delay={240}
          sub={stats?.renewalsDue ? `${stats.renewalsDue} renewal${stats.renewalsDue !== 1 ? "s" : ""} due` : "No renewals pending"}
          icon={Clock} iconClass="bg-red-500/15 text-red-500" gradientClass="bg-red-500" loading={statsLoading}
        />
      </div>

      {/* Membership health bar */}
      {!statsLoading && stats && (
        <div className="animate-fade-in-up" style={{ animationDelay: "320ms" }}>
          <Card className="border bg-card">
            <CardContent className="pt-5 pb-5">
              <MembershipBar
                active={stats.activeMembers}
                expiring={stats.expiringSoonMembers}
                expired={stats.expiredMembers}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lower section */}
      <div className="grid gap-6 lg:grid-cols-7">

        {/* Expiring Soon */}
        <div className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <Card className="border bg-card h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  Expiring Soon
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1 ml-9">Members needing renewal</p>
              </div>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-primary hover:text-primary">
                <Link href="/members?status=expiring_soon">
                  View All <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {expiringLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : expiringSoon && expiringSoon.length > 0 ? (
                <div className="space-y-2 stagger">
                  {expiringSoon.slice(0, 6).map((member) => (
                    <Link
                      key={member.id}
                      href={`/members/${member.id}/edit`}
                      className="animate-fade-in-up flex items-center gap-3 p-3 rounded-xl border hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 group card-hover"
                    >
                      <Avatar className="h-9 w-9 flex-shrink-0 border transition-transform duration-200 group-hover:scale-105">
                        <AvatarImage src={member.profilePhotoUrl ?? undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                          {member.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{member.fullName}</p>
                        <p className="text-xs text-muted-foreground">{member.phoneNumber}</p>
                      </div>
                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <p className="text-xs text-muted-foreground">Expires</p>
                        <p className="text-xs font-medium">{format(new Date(member.membershipEndDate), "MMM d")}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "flex-shrink-0 font-mono text-xs",
                          member.daysRemaining <= 2
                            ? "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        )}
                      >
                        {member.daysRemaining === 0 ? "Today" : `${member.daysRemaining}d`}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col h-[180px] items-center justify-center rounded-xl border border-dashed gap-3 animate-scale-in">
                  <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center animate-float-bob">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">All memberships are in good standing</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Notifications */}
        <div className="lg:col-span-3 animate-fade-in-up" style={{ animationDelay: "480ms" }}>
          <Card className="border bg-card h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-primary hover:text-primary">
                <Link href="/notifications">
                  History <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {notificationsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                </div>
              ) : notifications && notifications.length > 0 ? (
                <div className="space-y-2 stagger">
                  {notifications.slice(0, 6).map((log) => (
                    <div
                      key={log.id}
                      className="animate-fade-in-up flex items-start gap-3 p-3 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors duration-150"
                    >
                      <div className={cn(
                        "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                        log.status === "sent" ? "bg-green-500 animate-pulse" : "bg-red-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{log.memberName}</p>
                        <p className="text-xs text-muted-foreground truncate">{log.message}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5 font-mono">
                        {format(new Date(log.sentAt), "MMM d")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col h-[180px] items-center justify-center rounded-xl border border-dashed gap-3 animate-scale-in">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center animate-float-bob">
                    <TrendingUp className="h-6 w-6 text-primary/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">No notifications sent yet</p>
                  <Button variant="outline" size="sm" asChild className="btn-glow">
                    <Link href="/notifications">Send Reminders</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
