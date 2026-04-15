import { useState } from "react";
import { format } from "date-fns";
import { 
  useGetNotificationHistory, 
  useSendNotifications,
  getGetNotificationHistoryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useGetNotificationHistory();

  const sendMutation = useSendNotifications({
    mutation: {
      onSuccess: (data) => {
        toast({ 
          title: "Notifications Sent", 
          description: `Successfully sent ${data.sent} notifications. ${data.failed} failed.` 
        });
        queryClient.invalidateQueries({ queryKey: getGetNotificationHistoryQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to send notifications", description: err.error, variant: "destructive" });
      }
    }
  });

  const handleSendAll = () => {
    sendMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">Manage automated SMS reminders for expiring members.</p>
        </div>
        <Button 
          onClick={handleSendAll} 
          disabled={sendMutation.isPending}
          className="w-full sm:w-auto"
        >
          <Bell className="mr-2 h-4 w-4" />
          {sendMutation.isPending ? "Sending..." : "Trigger Pending Notifications"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification History</CardTitle>
          <CardDescription>A log of all automated messages sent to members.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Sent At</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      Loading history...
                    </TableCell>
                  </TableRow>
                ) : history && history.length > 0 ? (
                  history.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.sentAt), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="font-medium">{log.memberName}</TableCell>
                      <TableCell className="text-muted-foreground">{log.phoneNumber}</TableCell>
                      <TableCell className="max-w-[300px]">
                        <p className="truncate" title={log.message}>
                          {log.message}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={log.status === "sent" ? "outline" : "destructive"}
                          className={log.status === "sent" ? "border-green-500/30 text-green-600 bg-green-500/10" : ""}
                        >
                          <span className="flex items-center gap-1">
                            {log.status === "sent" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            {log.status}
                          </span>
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No notification history found.
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
