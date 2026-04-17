import {
  useGetDashboardStats,
  useGetExpiringSoon,
  useGetNotificationHistory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dumbbell, Zap, Heart, Timer, TrendingUp, Activity,
  Flame, ArrowRight, Trophy, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import { HeartbeatLine } from "@/components/heartbeat-line";

/* ── Animated number ─────────────────────────────────────────── */
function AnimatedNumber({ value, loading, delay = 0 }: { value: number; loading: boolean; delay?: number }) {
  const count = useAnimatedCounter(value, 900, !loading);
  return (
    <span className="text-3xl font-bold tracking-tight animate-number-pop" style={{ animationDelay: `${delay}ms` }}>
      {loading ? "—" : count}
    </span>
  );
}

/* ── Stat card ───────────────────────────────────────────────── */
interface StatCardProps {
  title: string;
  value?: number;
  sub?: string;
  icon: React.ElementType;
  iconClass: string;
  cardGlow: string;
  iconAnim: string;
  loading: boolean;
  delay?: number;
}

function StatCard({ title, value, sub, icon: Icon, iconClass, cardGlow, iconAnim, loading, delay }: StatCardProps) {
  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${delay ?? 0}ms` }}>
      <Card className={cn("card-hover relative overflow-hidden border bg-card group", cardGlow)}>
        {/* Left edge accent bar */}
        <div className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-300 group-hover:top-0 group-hover:bottom-0", iconClass.replace("bg-", "").replace("/15 text-", "/60 bg-").split(" ")[0])} />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pl-5">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconClass)}>
            <Icon className={cn("h-5 w-5", iconAnim)} />
          </div>
        </CardHeader>
        <CardContent className="pl-5">
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

/* ── Membership health bar ───────────────────────────────────── */
function MembershipBar({ active = 0, expiring = 0, expired = 0 }: { active?: number; expiring?: number; expired?: number }) {
  const total = active + expiring + expired;
  if (total === 0) return null;
  const ap = Math.round((active / total) * 100);
  const ep = Math.round((expiring / total) * 100);
  const xp = 100 - ap - ep;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary animate-heartbeat-pulse" />
          Membership Health
        </span>
        <span className="text-muted-foreground font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-full">{total} total</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-muted/40">
        {ap > 0 && <div className="bar-segment bg-gradient-to-r from-green-500 to-emerald-400 rounded-l-full" style={{ width: `${ap}%`, animationDelay: "100ms" }} />}
        {ep > 0 && <div className="bar-segment bg-gradient-to-r from-amber-400 to-orange-400" style={{ width: `${ep}%`, animationDelay: "250ms" }} />}
        {xp > 0 && <div className="bar-segment bg-gradient-to-r from-red-500 to-rose-400 rounded-r-full" style={{ width: `${xp}%`, animationDelay: "400ms" }} />}
      </div>
      <div className="flex gap-5 text-xs text-muted-foreground">
        {[
          { label: "Active", pct: ap, color: "bg-green-500", count: active },
          { label: "Expiring", pct: ep, color: "bg-amber-400", count: expiring },
          { label: "Expired", pct: xp, color: "bg-red-500", count: expired },
        ].map(({ label, pct, color, count }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full inline-block", color)} />
            <span className="font-bold text-foreground">{count}</span>
            <span>{label} ({pct}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: expiringSoon, isLoading: expiringLoading } = useGetExpiringSoon();
  const { data: notifications, isLoading: notificationsLoading } = useGetNotificationHistory();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Welcome / Hero Banner ─────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border bg-card animate-fade-in-up" style={{ minHeight: 160 }}>
        {/* Deep gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-violet-500/8 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-blue-500/5" />
        {/* Glow orbs */}
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-primary/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-8 left-1/3 w-48 h-48 rounded-full bg-violet-500/8 blur-3xl" />

        {/* Content */}
        <div className="relative px-8 pt-7 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-4">
              {/* Animated flame icon */}
              <div className="relative flex-shrink-0">
                <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/50">
                  <Flame className="h-7 w-7 text-white animate-fire-flicker" strokeWidth={2.5} />
                </div>
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-card animate-ripple-ring" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary/70 mb-1">
                  Fitness Temple — Control Center
                </p>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">
                  Welcome back,{" "}
                  <span className="text-power-surge">Coach</span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {format(new Date(), "EEEE, MMMM d, yyyy")}
                  {stats?.expiringSoonMembers ? (
                    <span className="ml-2 text-amber-500 font-semibold animate-pulse">
                      · {stats.expiringSoonMembers} expiring soon
                    </span>
                  ) : (
                    <span className="ml-2 text-green-500 font-medium">· All memberships healthy</span>
                  )}
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="btn-glow flex-shrink-0 shadow-lg shadow-primary/30">
              <Link href="/members/new">
                <Dumbbell className="mr-2 h-4 w-4" />
                Add Member
              </Link>
            </Button>
          </div>

          {/* Quick stats pills */}
          {!statsLoading && stats && (
            <div className="flex flex-wrap gap-2 mb-4 animate-fade-in" style={{ animationDelay: "300ms" }}>
              {[
                { label: "Total", val: stats.totalMembers, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                { label: "Active", val: stats.activeMembers, color: "text-green-400 bg-green-500/10 border-green-500/20" },
                { label: "Renew", val: stats.renewalsDue ?? 0, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
              ].map(({ label, val, color }) => (
                <span key={label} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-3 py-1", color)}>
                  <span className="text-sm font-bold">{val}</span> {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* EKG Heartbeat line at the bottom of banner */}
        <HeartbeatLine className="h-10 w-full" opacity={0.5} speed={2.8} />
      </div>

      {/* ── Stat Cards ───────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Members" value={stats?.totalMembers} delay={0}
          sub={stats?.newMembersThisMonth ? `+${stats.newMembersThisMonth} joined this month` : "No new this month"}
          icon={Dumbbell}
          iconClass="bg-blue-500/15 text-blue-400"
          cardGlow="hover:shadow-blue-500/10"
          iconAnim="animate-dumbbell-lift"
          loading={statsLoading}
        />
        <StatCard
          title="Active" value={stats?.activeMembers} delay={80}
          sub="Memberships in good standing"
          icon={Zap}
          iconClass="bg-green-500/15 text-green-400"
          cardGlow="hover:shadow-green-500/10"
          iconAnim="animate-zap-flash"
          loading={statsLoading}
        />
        <StatCard
          title="Expiring Soon" value={stats?.expiringSoonMembers} delay={160}
          sub="Expires within 7 days"
          icon={Heart}
          iconClass="bg-amber-500/15 text-amber-400"
          cardGlow="hover:shadow-amber-500/10"
          iconAnim="animate-heartbeat-pulse"
          loading={statsLoading}
        />
        <StatCard
          title="Expired" value={stats?.expiredMembers} delay={240}
          sub={stats?.renewalsDue ? `${stats.renewalsDue} renewal${stats.renewalsDue !== 1 ? "s" : ""} due` : "None pending"}
          icon={Timer}
          iconClass="bg-red-500/15 text-red-400"
          cardGlow="hover:shadow-red-500/10"
          iconAnim="animate-clock-tick"
          loading={statsLoading}
        />
      </div>

      {/* ── Membership Health Bar ────────────────────────── */}
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

      {/* ── Bottom Section ───────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-7">

        {/* Expiring Soon */}
        <div className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <Card className="border bg-card h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="h-8 w-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Heart className="h-4 w-4 text-amber-400 animate-heartbeat-pulse" />
                  </div>
                  Expiring Soon
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1 ml-10">Members needing renewal</p>
              </div>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-primary hover:text-primary">
                <Link href="/members?status=expiring_soon">
                  View All <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {expiringLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
              ) : expiringSoon && expiringSoon.length > 0 ? (
                <div className="space-y-2 stagger">
                  {expiringSoon.slice(0, 6).map((member) => (
                    <Link
                      key={member.id}
                      href={`/members/${member.id}/edit`}
                      className="animate-fade-in-up flex items-center gap-3 p-3 rounded-xl border hover:border-amber-500/30 hover:bg-amber-500/5 transition-all duration-200 group"
                    >
                      <Avatar className="h-9 w-9 flex-shrink-0 border transition-transform duration-200 group-hover:scale-105">
                        <AvatarImage src={member.profilePhotoUrl ?? undefined} />
                        <AvatarFallback className="bg-amber-500/10 text-amber-500 text-xs font-bold">
                          {member.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate group-hover:text-amber-500 transition-colors">{member.fullName}</p>
                        <p className="text-xs text-muted-foreground">{member.phoneNumber}</p>
                      </div>
                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <p className="text-xs text-muted-foreground">Expires</p>
                        <p className="text-xs font-medium">{format(new Date(member.membershipEndDate), "MMM d")}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "flex-shrink-0 font-mono text-xs font-bold",
                          member.daysRemaining <= 2
                            ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}
                      >
                        {member.daysRemaining === 0 ? "TODAY" : `${member.daysRemaining}d`}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col h-[180px] items-center justify-center rounded-xl border border-dashed gap-3 animate-scale-in">
                  <div className="h-14 w-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                    <Trophy className="h-7 w-7 text-green-500 animate-muscle-flex" />
                  </div>
                  <p className="text-sm font-medium">All athletes are in good standing!</p>
                  <p className="text-xs text-muted-foreground">No renewals due in the next 7 days</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-3 animate-fade-in-up" style={{ animationDelay: "480ms" }}>
          <Card className="border bg-card h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-primary animate-heartbeat-pulse" style={{ animationDelay: "700ms" }} />
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
                <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
              ) : notifications && notifications.length > 0 ? (
                <div className="space-y-2 stagger">
                  {notifications.slice(0, 6).map((log) => (
                    <div key={log.id} className="animate-fade-in-up flex items-start gap-3 p-3 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors duration-150">
                      <span className={cn(
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
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-7 w-7 text-primary/60 animate-float-bob" />
                  </div>
                  <p className="text-sm font-medium">No notifications yet</p>
                  <Button variant="outline" size="sm" asChild className="btn-glow">
                    <Link href="/notifications">
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                      Send Reminders
                    </Link>
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
