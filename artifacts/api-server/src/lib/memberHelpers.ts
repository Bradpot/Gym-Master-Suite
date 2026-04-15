import { addMonths, differenceInDays, parseISO, format } from "date-fns";

export function computeEndDate(startDate: string, durationMonths: number): string {
  const start = parseISO(startDate);
  const end = addMonths(start, durationMonths);
  return format(end, "yyyy-MM-dd");
}

export function computeDaysRemaining(endDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = parseISO(endDate);
  return differenceInDays(end, today);
}

export type MemberStatus = "active" | "expiring_soon" | "expired";

export function computeStatus(daysRemaining: number): MemberStatus {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= 7) return "expiring_soon";
  return "active";
}

export function generateMemberId(count: number): string {
  const num = String(count + 1).padStart(4, "0");
  return `GYM-${num}`;
}

export function buildMemberResponse(member: {
  id: number;
  memberId: string;
  fullName: string;
  phoneNumber: string;
  profilePhotoUrl: string | null;
  membershipStartDate: string;
  membershipDurationMonths: number;
  createdAt: Date;
}) {
  const membershipEndDate = computeEndDate(member.membershipStartDate, member.membershipDurationMonths);
  const daysRemaining = computeDaysRemaining(membershipEndDate);
  const status = computeStatus(daysRemaining);

  return {
    id: member.id,
    memberId: member.memberId,
    fullName: member.fullName,
    phoneNumber: member.phoneNumber,
    profilePhotoUrl: member.profilePhotoUrl ?? null,
    membershipStartDate: member.membershipStartDate,
    membershipDurationMonths: member.membershipDurationMonths,
    membershipEndDate,
    status,
    daysRemaining,
    createdAt: member.createdAt.toISOString(),
  };
}
