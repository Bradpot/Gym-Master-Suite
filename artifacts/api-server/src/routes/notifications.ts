import { Router, type IRouter } from "express";
import { db, membersTable, notificationLogsTable } from "@workspace/db";
import { buildMemberResponse } from "../lib/memberHelpers";
import { logger } from "../lib/logger";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.post("/notifications/send", async (req, res): Promise<void> => {
  const allMembers = await db.select().from(membersTable);
  const mapped = allMembers.map(buildMemberResponse);
  const expiringSoon = mapped.filter((m) => m.status === "expiring_soon");

  let sent = 0;
  let failed = 0;
  const memberNames: string[] = [];

  for (const member of expiringSoon) {
    const message = `Your gym membership expires on ${member.membershipEndDate}. Please renew to continue.`;
    try {
      await db.insert(notificationLogsTable).values({
        memberId: member.id,
        memberName: member.fullName,
        phoneNumber: member.phoneNumber,
        message,
        status: "sent",
        sentAt: new Date(),
      });
      sent++;
      memberNames.push(member.fullName);
      logger.info({ memberId: member.id, name: member.fullName }, "Notification logged");
    } catch (err) {
      failed++;
      logger.error({ err, memberId: member.id }, "Failed to log notification");
      try {
        await db.insert(notificationLogsTable).values({
          memberId: member.id,
          memberName: member.fullName,
          phoneNumber: member.phoneNumber,
          message,
          status: "failed",
          sentAt: new Date(),
        });
      } catch {}
    }
  }

  res.json({ sent, failed, members: memberNames });
});

router.get("/notifications/history", async (_req, res): Promise<void> => {
  const logs = await db.select().from(notificationLogsTable).orderBy(desc(notificationLogsTable.sentAt)).limit(100);
  const mapped = logs.map((l) => ({
    id: l.id,
    memberId: l.memberId,
    memberName: l.memberName,
    phoneNumber: l.phoneNumber,
    message: l.message,
    status: l.status as "sent" | "failed",
    sentAt: l.sentAt.toISOString(),
  }));
  res.json(mapped);
});

export default router;
