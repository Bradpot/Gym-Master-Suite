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
  getGetMembersCalendarQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, ArrowLeft, Upload, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters."),
  phoneNumber: z.string().min(5, "Please enter a valid phone number."),
  membershipStartDate: z.date({ required_error: "A start date is required." }),
  membershipDurationMonths: z.coerce.number().int().min(1, "Duration must be at least 1 month."),
});

type FormValues = z.infer<typeof formSchema>;

export default function MemberForm() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === "new";
  const memberId = isNew ? 0 : parseInt(params.id as string);

  const { data: member, isLoading: isLoadingMember } = useGetMember(memberId, {
    query: {
      enabled: !isNew && !!memberId,
      queryKey: getGetMemberQueryKey(memberId)
    }
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phoneNumber: "",
      membershipDurationMonths: 1,
    },
  });

  useEffect(() => {
    if (member && !isNew) {
      form.reset({
        fullName: member.fullName,
        phoneNumber: member.phoneNumber,
        membershipStartDate: new Date(member.membershipStartDate),
        membershipDurationMonths: member.membershipDurationMonths,
      });
      if (member.profilePhotoUrl) {
        setPhotoPreview(member.profilePhotoUrl);
      }
    }
  }, [member, isNew, form]);

  const createMutation = useCreateMember({
    mutation: {
      onSuccess: () => {
        toast({ title: "Member created successfully" });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setLocation("/members");
      },
      onError: (err) => {
        toast({ title: "Failed to create member", description: err.error, variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateMember({
    mutation: {
      onSuccess: () => {
        toast({ title: "Member updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(memberId) });
        queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExpiringSoonQueryKey() });
        setLocation("/members");
      },
      onError: (err) => {
        toast({ title: "Failed to update member", description: err.error, variant: "destructive" });
      }
    }
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    }
  };

  const onSubmit = (values: FormValues) => {
    const startStr = format(values.membershipStartDate, "yyyy-MM-dd");
    
    if (isNew) {
      createMutation.mutate({
        data: {
          fullName: values.fullName,
          phoneNumber: values.phoneNumber,
          membershipStartDate: startStr,
          membershipDurationMonths: values.membershipDurationMonths,
          ...(photoFile && { profilePhoto: photoFile }),
        }
      });
    } else {
      updateMutation.mutate({
        id: memberId,
        data: {
          fullName: values.fullName,
          phoneNumber: values.phoneNumber,
          membershipStartDate: startStr,
          membershipDurationMonths: values.membershipDurationMonths,
          ...(photoFile && { profilePhoto: photoFile }),
        }
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!isNew && isLoadingMember) {
    return <div className="p-6 text-center text-muted-foreground">Loading member...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/members")}>
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Back</span>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isNew ? "New Member" : "Edit Member"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isNew ? "Add a new member to the facility." : "Update member details."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="h-24 w-24 border-2 border-muted">
                    <AvatarImage src={photoPreview || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <UserRound className="h-10 w-10" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handlePhotoChange}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                </div>

                <div className="flex-1 space-y-4 w-full">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
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
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 (555) 000-0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="membershipStartDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date("1900-01-01")
                            }
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
                      <FormLabel>Duration (Months)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setLocation("/members")}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Member"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
