import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useGetMember,
  useCreateMember,
  useUpdateMember,
  getGetMemberQueryKey,
  getListMembersQueryKey,
  getGetDashboardStatsQueryKey,
  getGetExpiringSoonQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";
import { CalendarIcon, ArrowLeft, Camera, UserRound, Sparkles, Phone, User, CalendarDays, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters."),
  phoneNumber: z.string().min(5, "Please enter a valid phone number."),
  membershipStartDate: z.date({ required_error: "A start date is required." }),
  membershipDurationMonths: z.coerce.number().int().min(1, "Duration must be at least 1 month."),
});

type FormValues = z.infer<typeof formSchema>;

const DURATION_PRESETS = [1, 3, 6, 12];

export default function MemberForm() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isNew = !params.id || params.id === "new";
  const memberId = isNew ? 0 : parseInt(params.id as string);

  const { data: member, isLoading: isLoadingMember } = useGetMember(memberId, {
    query: { enabled: !isNew && !!memberId, queryKey: getGetMemberQueryKey(memberId) },
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", phoneNumber: "", membershipDurationMonths: 3 },
  });

  useEffect(() => {
    if (member && !isNew) {
      form.reset({
        fullName: member.fullName,
        phoneNumber: member.phoneNumber,
        membershipStartDate: new Date(member.membershipStartDate),
        membershipDurationMonths: member.membershipDurationMonths,
      });
      if (member.profilePhotoUrl) setPhotoPreview(member.profilePhotoUrl);
    }
  }, [member, isNew, form]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetExpiringSoonQueryKey() });
  };

  const createMutation = useCreateMember({
    mutation: {
      onSuccess: () => { toast({ title: "Member created" }); invalidateAll(); setLocation("/members"); },
      onError: () => toast({ title: "Failed to create member", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateMember({
    mutation: {
      onSuccess: () => {
        toast({ title: "Member updated" });
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(memberId) });
        invalidateAll();
        setLocation("/members");
      },
      onError: () => toast({ title: "Failed to update member", variant: "destructive" }),
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const onSubmit = (values: FormValues) => {
    const startStr = format(values.membershipStartDate, "yyyy-MM-dd");
    const payload = {
      fullName: values.fullName,
      phoneNumber: values.phoneNumber,
      membershipStartDate: startStr,
      membershipDurationMonths: values.membershipDurationMonths,
      ...(photoFile && { profilePhoto: photoFile }),
    };
    if (isNew) {
      createMutation.mutate({ data: payload });
    } else {
      updateMutation.mutate({ id: memberId, data: payload });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const watchedStart = form.watch("membershipStartDate");
  const watchedDuration = form.watch("membershipDurationMonths");
  const computedEnd = watchedStart && watchedDuration
    ? format(addMonths(watchedStart, watchedDuration), "MMM d, yyyy")
    : null;

  const initials = form.watch("fullName")
    ? form.watch("fullName").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : null;

  if (!isNew && isLoadingMember) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading member data...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-12 space-y-6">
      {/* Back header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setLocation("/members")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "Add New Member" : "Edit Member"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isNew ? "Fill in the details to register a new member." : `Editing ${member?.memberId ?? "..."}`}
          </p>
        </div>
        {!isNew && member && (
          <Badge variant="outline" className="ml-auto font-mono">{member.memberId}</Badge>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* Photo + Name section */}
          <div className="rounded-2xl border bg-card p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <User className="h-4 w-4" /> Member Identity
            </h2>

            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Photo upload */}
              <div className="flex flex-col items-center gap-3 flex-shrink-0">
                <div className="relative group">
                  <Avatar className="h-24 w-24 border-2 border-muted">
                    <AvatarImage src={photoPreview ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                      {initials ?? <UserRound className="h-10 w-10" />}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </button>
                </div>
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handlePhotoChange} />
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5 mr-1.5" /> Upload Photo
                </Button>
              </div>

              {/* Name + Phone fields */}
              <div className="flex-1 w-full space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" /> Full Name
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Alex Johnson" className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Phone Number
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="+1 (555) 000-0000" className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Membership section */}
          <div className="rounded-2xl border bg-card p-6 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Membership Period
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="membershipStartDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" /> Start Date
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn("w-full pl-3 text-left font-normal rounded-xl", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="membershipDurationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-muted-foreground" /> Duration
                    </FormLabel>
                    <div className="space-y-2">
                      <div className="flex gap-1.5">
                        {DURATION_PRESETS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => field.onChange(m)}
                            className={cn(
                              "flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all",
                              field.value === m
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground"
                            )}
                          >
                            {m}mo
                          </button>
                        ))}
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            className="rounded-xl"
                            placeholder="Custom months"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">months</span>
                        </div>
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* End date preview */}
            {computedEnd && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/15">
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-sm">
                  <span className="text-muted-foreground">Membership ends on </span>
                  <span className="font-semibold text-foreground">{computedEnd}</span>
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setLocation("/members")} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl min-w-[120px]" disabled={isPending}>
              {isPending ? "Saving..." : isNew ? "Create Member" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
