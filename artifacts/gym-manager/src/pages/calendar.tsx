import { useState, useMemo } from "react";
import { format, isSameMonth, isSameDay } from "date-fns";
import { useGetMembersCalendar } from "@workspace/api-client-react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRound } from "lucide-react";
import { Link } from "wouter";

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;

  const { data: calendarData, isLoading } = useGetMembersCalendar(year, month);

  const expiryDates = calendarData?.expiryDates || {};

  const modifiers = useMemo(() => {
    const datesWithExpiries: Date[] = [];
    Object.keys(expiryDates).forEach((dateStr) => {
      if (expiryDates[dateStr].length > 0) {
        datesWithExpiries.push(new Date(dateStr));
      }
    });
    return {
      hasExpiries: datesWithExpiries,
    };
  }, [expiryDates]);

  const modifiersStyles = {
    hasExpiries: {
      fontWeight: "bold",
      backgroundColor: "hsl(var(--primary) / 0.1)",
      color: "hsl(var(--primary))",
    },
  };

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedMembers = selectedDateStr && expiryDates[selectedDateStr] ? expiryDates[selectedDateStr] : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground mt-1">View member expirations by date.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 flex-1 items-start">
        <Card className="md:col-span-2 shadow-sm">
          <CardContent className="p-6 flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
              className="rounded-md border p-4 scale-[1.2] origin-top"
              classNames={{
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              }}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm flex flex-col min-h-[400px]">
          <CardHeader>
            <CardTitle>
              {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
            </CardTitle>
            <CardDescription>
              {selectedMembers.length} member{selectedMembers.length === 1 ? "" : "s"} expiring
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="text-center p-4 text-muted-foreground">Loading calendar data...</div>
            ) : !selectedDate ? (
              <div className="text-center p-4 text-muted-foreground">
                Select a date on the calendar to see expiring members.
              </div>
            ) : selectedMembers.length > 0 ? (
              <div className="space-y-4">
                {selectedMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between space-x-4 border p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-9 w-9 border border-muted">
                        <AvatarImage src={member.profilePhotoUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <UserRound className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <Link href={`/members/${member.id}/edit`} className="text-sm font-medium hover:underline">
                          {member.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{member.phoneNumber}</p>
                      </div>
                    </div>
                    <Badge variant={member.status === "expired" ? "destructive" : "outline"} className={member.status === "expiring_soon" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : ""}>
                      {member.status === "expired" ? "Expired" : `${member.daysRemaining}d`}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
                <p className="text-sm text-muted-foreground">No expirations on this date.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
