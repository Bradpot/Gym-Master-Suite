import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { useGetMembersCalendar } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, UserRound, CalendarDays, X } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full flex-shrink-0",
        status === "active" && "bg-green-500",
        status === "expiring_soon" && "bg-amber-400",
        status === "expired" && "bg-red-500"
      )}
    />
  );
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;

  const { data: calendarData, isLoading } = useGetMembersCalendar(year, month);
  const expiryDates = calendarData?.expiryDates ?? {};

  // Build all the day cells for this month view (including days from prev/next month)
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }

    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [currentMonth]);

  function getDayKey(date: Date) {
    return format(date, "dd");
  }

  function getMembersForDate(date: Date) {
    if (!isSameMonth(date, currentMonth)) return [];
    const key = getDayKey(date);
    return expiryDates[key] ?? [];
  }

  const selectedMembers = selectedDate ? getMembersForDate(selectedDate) : [];

  const totalExpiring = Object.values(expiryDates).flat().length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expiry Calendar</h1>
          <p className="text-muted-foreground mt-1">
            {totalExpiring > 0
              ? `${totalExpiring} membership${totalExpiring !== 1 ? "s" : ""} expiring in ${format(currentMonth, "MMMM yyyy")}`
              : `No memberships expiring in ${format(currentMonth, "MMMM yyyy")}`}
          </p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setCurrentMonth(subMonths(currentMonth, 1));
              setSelectedDate(null);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-semibold min-w-[140px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setCurrentMonth(addMonths(currentMonth, 1));
              setSelectedDate(null);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 text-primary"
            onClick={() => {
              setCurrentMonth(new Date());
              setSelectedDate(null);
            }}
          >
            Today
          </Button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Calendar Grid */}
        <div className="flex-1 min-w-0 rounded-xl border bg-card overflow-hidden shadow-sm">
          {/* Day name headers */}
          <div className="grid grid-cols-7 border-b">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Week rows */}
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Loading calendar...
            </div>
          ) : (
            <div className="divide-y">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 divide-x">
                  {week.map((day) => {
                    const members = getMembersForDate(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const todayDay = isToday(day);
                    const hasMembers = members.length > 0;

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => {
                          if (!isCurrentMonth) return;
                          setSelectedDate(isSelected ? null : day);
                        }}
                        className={cn(
                          "relative min-h-[80px] p-2 flex flex-col gap-1 text-left transition-colors",
                          !isCurrentMonth && "opacity-30 cursor-default bg-muted/20",
                          isCurrentMonth && !isSelected && "hover:bg-accent/40 cursor-pointer",
                          isSelected && "bg-primary/10 ring-1 ring-inset ring-primary",
                          todayDay && !isSelected && "bg-primary/5"
                        )}
                      >
                        {/* Day number */}
                        <span
                          className={cn(
                            "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                            todayDay && "bg-primary text-primary-foreground font-bold",
                            !todayDay && isCurrentMonth && "text-foreground",
                            !isCurrentMonth && "text-muted-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>

                        {/* Member indicators */}
                        {hasMembers && isCurrentMonth && (
                          <div className="flex flex-col gap-0.5 mt-auto w-full">
                            {members.slice(0, 2).map((m) => (
                              <div
                                key={m.id}
                                className={cn(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded truncate leading-tight",
                                  m.status === "active" && "bg-green-500/15 text-green-700 dark:text-green-400",
                                  m.status === "expiring_soon" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                                  m.status === "expired" && "bg-red-500/15 text-red-700 dark:text-red-400"
                                )}
                              >
                                {m.fullName.split(" ")[0]}
                              </div>
                            ))}
                            {members.length > 2 && (
                              <div className="text-[10px] text-muted-foreground px-1">
                                +{members.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div
          className={cn(
            "w-72 flex-shrink-0 rounded-xl border bg-card shadow-sm transition-all duration-200 overflow-hidden",
            selectedDate ? "opacity-100" : "opacity-60"
          )}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">
                {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
              </span>
            </div>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="p-4">
            {!selectedDate ? (
              <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Click a date to see members expiring that day
                </p>
              </div>
            ) : selectedMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <span className="text-green-600 text-lg">✓</span>
                </div>
                <p className="text-sm text-muted-foreground">No expirations on this date</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""} expiring
                </p>
                {selectedMembers.map((member) => (
                  <Link
                    key={member.id}
                    href={`/members/${member.id}/edit`}
                    className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent/50 transition-colors group"
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0 border">
                      <AvatarImage src={member.profilePhotoUrl ?? undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {member.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {member.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.memberId}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <StatusDot status={member.status} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {member.daysRemaining < 0
                          ? "Expired"
                          : member.daysRemaining === 0
                          ? "Today"
                          : `${member.daysRemaining}d`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-green-500/20 border border-green-500/40" />
          Active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" />
          Expiring Soon
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
          Expired
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold">8</span>
          Today
        </span>
      </div>
    </div>
  );
}
