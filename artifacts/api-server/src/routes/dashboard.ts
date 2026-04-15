import { Router, type IRouter } from "express";
import { db, membersTable } from "@workspace/db";
import { buildMemberResponse } from "../lib/memberHelpers";
import { format, startOfMonth, endOfMonth } from "date-fns";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const allMembers = await db.select().from(membersTable);
  const mapped = allMembers.map(buildMemberResponse);

  const today = new Date();
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");

  const totalMembers = mapped.length;
  const activeMembers = mapped.filter((m) => m.status === "active").length;
  const expiringSoonMembers = mapped.filter((m) => m.status === "expiring_soon").length;
  const expiredMembers = mapped.filter((m) => m.status === "expired").length;
  const newMembersThisMonth = mapped.filter(
    (m) => m.membershipStartDate >= monthStart && m.membershipStartDate <= monthEnd
  ).length;
  const renewalsDue = expiringSoonMembers + expiredMembers;

  res.json({
    totalMembers,
    activeMembers,
    expiringSoonMembers,
    expiredMembers,
    newMembersThisMonth,
    renewalsDue,
  });
});

router.get("/dashboard/expiring-soon", async (_req, res): Promise<void> => {
  const allMembers = await db.select().from(membersTable);
  const mapped = allMembers.map(buildMemberResponse);
  const expiring = mapped
    .filter((m) => m.status === "expiring_soon")
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  res.json(expiring);
});

export default router;
