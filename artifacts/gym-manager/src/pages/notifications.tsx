import { format } from "date-fns";
import {
  useGetNotificationHistory,
  useSendNotifications,
  useGetExpiringSoon,
  getGetNotificationHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, AlertCircle, Send, Info, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useGetNotificationHistory();
  const { data: expiringSoon } = useGetExpiringSoon();

  const sendMutation = useSendNotifications({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Notifications Sent",
          description: `${data.sent} sent successfully${data.failed > 0 ? `, ${data.failed} failed` : ""}.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetNotificationHistoryQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to send notifications", variant: "destructive" });
      },
    },
  });

  const pendingCount = expiringSoon?.length ?? 0;
  const sentCount = history?.filter((l) => l.status === "sent").length ?? 0;
  const failedCount = history?.filter((l) => l.status === "failed").length ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Automated expiry reminders sent to members.
          </p>
        </div>
        <Button
          onClick={() => sendMutation.mutate()}
          disabled={sendMutation.isPending || pendingCount === 0}
          className="w-full sm:w-auto gap-2"
        >
          <Send className="h-4 w-4" />
          {sendMutation.isPending
            ? "Sending..."
            : pendingCount > 0
            ? `Send to ${pendingCount} Member${pendingCount !== 1 ? "s" : ""}`
            : "No Pending Notifications"}
        </Button>
      </div>

      {/* Info cards row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-sm text-muted-foreground">Pending (expiring in 7d)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sentCount}</p>
              <p className="text-sm text-muted-foreground">Total Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{failedCount}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl border bg-primary/5 border-primary/20">
        <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">How it works: </span>
          A daily job runs at <span className="font-medium text-foreground">9:00 AM</span> and
          automatically sends renewal reminders to all members whose membership expires within the
          next 7 days. You can also trigger notifications manually using the button above. Message
          format: <span className="italic">"Your gym membership expires on [DATE]. Please renew to continue."</span>
        </div>
      </div>

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>Notification History</CardTitle>
          <CardDescription>
            {history ? `${history.length} notification${history.length !== 1 ? "s" : ""} logged` : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-b-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="pl-6">Sent At</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Message</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : history && history.length > 0 ? (
                  history.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="pl-6 whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(log.sentAt), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{log.memberName}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {log.phoneNumber}
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[280px]">
                        <p className="truncate text-sm text-muted-foreground" title={log.message}>
                          {log.message}
                        </p>
                      </TableCell>
                      <TableCell className="pr-6">
                        <Badge
                          variant="outline"
                          className={cn(
                            "gap-1.5 font-medium",
                            log.status === "sent"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                          )}
                        >
                          {log.status === "sent" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {log.status === "sent" ? "Sent" : "Failed"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Bell className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No notifications sent yet</p>
                        <p className="text-xs text-muted-foreground">
                          Trigger a manual send or wait for the daily job at 9 AM
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
