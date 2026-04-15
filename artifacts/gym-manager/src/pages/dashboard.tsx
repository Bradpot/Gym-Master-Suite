import { 
  useGetDashboardStats, 
  useGetExpiringSoon, 
  useGetNotificationHistory 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: expiringSoon, isLoading: expiringLoading } = useGetExpiringSoon();
  const { data: notifications, isLoading: notificationsLoading } = useGetNotificationHistory();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your facility's active metrics.</p>
      </div>

      {statsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMembers}</div>
              <p className="text-xs text-muted-foreground">+{stats.newMembersThisMonth} this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeMembers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.expiringSoonMembers}</div>
              <p className="text-xs text-muted-foreground">{stats.renewalsDue} renewals due</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <Clock className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.expiredMembers}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Alerts: Expiring Soon</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Members requiring immediate attention.</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/members?status=expiring_soon">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {expiringLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : expiringSoon && expiringSoon.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiringSoon.slice(0, 5).map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          <Link href={`/members/${member.id}/edit`} className="hover:underline">
                            {member.fullName}
                          </Link>
                        </TableCell>
                        <TableCell>{member.phoneNumber}</TableCell>
                        <TableCell>{format(new Date(member.membershipEndDate), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">
                            {member.daysRemaining} days
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
                <p className="text-sm text-muted-foreground">No members expiring soon.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Notifications</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/notifications">History</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {notificationsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-4">
                {notifications.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{log.memberName}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={log.message}>
                        {log.message}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                        {log.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(log.sentAt), "MMM d")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
                <p className="text-sm text-muted-foreground">No recent notifications.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
