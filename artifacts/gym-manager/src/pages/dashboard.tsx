import {
  useGetDashboardStats,
  useGetExpiringSoon,
  useGetNotificationHistory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, AlertTriangle, CheckCircle2, Clock, TrendingUp, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  iconClass,
  accent,
  loading,
}: {
  title: string;
  value?: number;
  sub?: string;
  icon: React.ElementType;
  iconClass: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute inset-0 opacity-[0.04]", accent)} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-3xl font-bold tracking-tight">{value ?? 0}</div>
        )}
        {sub && !loading && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MembershipBar({ active = 0, expiring = 0, expired = 0 }: { active?: number; expiring?: number; expired?: number }) {
  const total = active + expiring + expired;
  if (total === 0) return null;
  const ap = Math.round((active / total) * 100);
  const ep = Math.round((expiring / total) * 100);
  const xp = 100 - ap - ep;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground font-medium">
        <span>Membership Health</span>
        <span>{total} total</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {ap > 0 && <div className="bg-green-500 rounded-full" style={{ width: `${ap}%` }} />}
        {ep > 0 && <div className="bg-amber-400 rounded-full" style={{ width: `${ep}%` }} />}
        {xp > 0 && <div className="bg-red-500 rounded-full" style={{ width: `${xp}%` }} />}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          {ap}% active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          {ep}% expiring
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          {xp}% expired
        </span>
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")} — Facility Overview
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/members/new">+ New Member</Link>
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Members"
          value={stats?.totalMembers}
          sub={stats?.newMembersThisMonth ? `+${stats.newMembersThisMonth} joined this month` : undefined}
          icon={Users}
          iconClass="bg-blue-500/10 text-blue-500"
          accent="bg-blue-500"
          loading={statsLoading}
        />
        <StatCard
          title="Active"
          value={stats?.activeMembers}
          sub="Memberships in good standing"
          icon={CheckCircle2}
          iconClass="bg-green-500/10 text-green-500"
          accent="bg-green-500"
          loading={statsLoading}
        />
        <StatCard
          title="Expiring Soon"
          value={stats?.expiringSoonMembers}
          sub="Within the next 7 days"
          icon={AlertTriangle}
          iconClass="bg-amber-500/10 text-amber-500"
          accent="bg-amber-500"
          loading={statsLoading}
        />
        <StatCard
          title="Expired"
          value={stats?.expiredMembers}
          sub={stats?.renewalsDue ? `${stats.renewalsDue} renewals due` : "No renewals due"}
          icon={Clock}
          iconClass="bg-red-500/10 text-red-500"
          accent="bg-red-500"
          loading={statsLoading}
        />
      </div>

      {/* Membership health bar */}
      {!statsLoading && stats && (
        <Card>
          <CardContent className="pt-5">
            <MembershipBar
              active={stats.activeMembers}
              expiring={stats.expiringSoonMembers}
              expired={stats.expiredMembers}
            />
          </CardContent>
        </Card>
      )}

      {/* Expiring Soon + Notifications */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Expiring Soon table */}
        <Card className="lg:col-span-4 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Expiring Soon
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Members requiring immediate attention</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/members?status=expiring_soon">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {expiringLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : expiringSoon && expiringSoon.length > 0 ? (
              <div className="space-y-2">
                {expiringSoon.slice(0, 6).map((member) => (
                  <Link
                    key={member.id}
                    href={`/members/${member.id}/edit`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 hover:border-primary/30 transition-all group"
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0 border">
                      <AvatarImage src={member.profilePhotoUrl ?? undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {member.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {member.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.phoneNumber}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">Expires</p>
                      <p className="text-xs font-medium">{format(new Date(member.membershipEndDate), "MMM d")}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "flex-shrink-0 font-mono text-xs",
                        member.daysRemaining <= 2
                          ? "bg-red-500/10 text-red-500 border-red-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      )}
                    >
                      {member.daysRemaining === 0 ? "Today" : `${member.daysRemaining}d`}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col h-[200px] items-center justify-center rounded-lg border border-dashed gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                <p className="text-sm text-muted-foreground">No members expiring soon</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Recent Notifications
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/notifications">History</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {notificationsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/20"
                  >
                    <div
                      className={cn(
                        "mt-0.5 h-2 w-2 rounded-full flex-shrink-0",
                        log.status === "sent" ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{log.memberName}</p>
                      <p className="text-xs text-muted-foreground truncate">{log.message}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                      {format(new Date(log.sentAt), "MMM d")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col h-[200px] items-center justify-center rounded-lg border border-dashed gap-2">
                <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No notifications sent yet</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/notifications">Send Now</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
