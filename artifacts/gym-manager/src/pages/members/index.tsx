import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  useListMembers,
  useDeleteMember,
  useExportMembersCsv,
  getListMembersQueryKey,
} from "@workspace/api-client-react";
import type { ListMembersStatus, Member } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, Plus, MoreHorizontal, Edit, Trash2, Download, UserRound, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20">Active</Badge>;
  }
  if (status === "expiring_soon") {
    return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20">Expiring Soon</Badge>;
  }
  return <Badge variant="destructive" className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20">Expired</Badge>;
}

export default function Members() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ListMembersStatus>("all");
  const [page, setPage] = useState(1);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  // Proper debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useListMembers({
    search: debouncedSearch || undefined,
    status: status === "all" ? undefined : status,
    page,
    limit: 10,
  });

  const deleteMutation = useDeleteMember({
    mutation: {
      onSuccess: () => {
        toast({ title: "Member deleted" });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        setMemberToDelete(null);
      },
      onError: () => {
        toast({ title: "Failed to delete member", variant: "destructive" });
      },
    },
  });

  const { refetch: exportCsv, isFetching: isExporting } = useExportMembersCsv({
    query: { enabled: false },
  });

  const handleExport = async () => {
    try {
      const res = await exportCsv();
      if (res.data) {
        const blob = new Blob([res.data], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fitness-temple-members-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast({ title: "Export downloaded" });
      }
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const totalShowing = data ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, data.total)} of ${data.total}` : "";

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">Manage memberships and member records.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} disabled={isExporting} size="sm">
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
          <Button asChild size="sm">
            <Link href="/members/new">
              <Plus className="mr-2 h-4 w-4" />
              New Member
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by name, member ID, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(val: ListMembersStatus) => {
            setStatus(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[56px]"></TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="hidden md:table-cell">Start Date</TableHead>
              <TableHead className="hidden md:table-cell">End Date</TableHead>
              <TableHead className="hidden sm:table-cell">Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Days Left</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data && data.members.length > 0 ? (
              data.members.map((member) => (
                <TableRow key={member.id} className="group">
                  <TableCell className="pr-0">
                    <Avatar className="h-9 w-9 border">
                      <AvatarImage src={member.profilePhotoUrl ?? undefined} alt={member.fullName} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {member.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium leading-tight">{member.fullName}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{member.memberId}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{member.phoneNumber}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {format(new Date(member.membershipStartDate), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {format(new Date(member.membershipEndDate), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {member.membershipDurationMonths}mo
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={member.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    <span
                      className={cn(
                        "text-sm font-mono font-medium",
                        member.daysRemaining < 0 && "text-red-500",
                        member.daysRemaining >= 0 && member.daysRemaining <= 7 && "text-amber-500",
                        member.daysRemaining > 7 && "text-green-500"
                      )}
                    >
                      {member.daysRemaining < 0 ? `${Math.abs(member.daysRemaining)}d ago` : `${member.daysRemaining}d`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/members/${member.id}/edit`}
                            className="cursor-pointer flex items-center w-full"
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive cursor-pointer"
                          onClick={() => setMemberToDelete(member)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <UserRound className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {search || status !== "all" ? "No members match your search." : "No members yet."}
                    </p>
                    {!search && status === "all" && (
                      <Button size="sm" asChild className="mt-1">
                        <Link href="/members/new">Add your first member</Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.totalPages >= 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data.total > 0 ? `Showing ${totalShowing}` : "No results"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              Page {page} of {data.totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">{memberToDelete?.fullName}</span> and all
              their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (memberToDelete) deleteMutation.mutate({ id: memberToDelete.id });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
