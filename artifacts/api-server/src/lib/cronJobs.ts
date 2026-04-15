import cron from "node-cron";
import { db, membersTable, notificationLogsTable } from "@workspace/db";
import { buildMemberResponse } from "./memberHelpers";
import { logger } from "./logger";

export function startCronJobs() {
  cron.schedule("0 9 * * *", async () => {
    logger.info("Running daily expiry notification job");
    try {
      const allMembers = await db.select().from(membersTable);
      const mapped = allMembers.map(buildMemberResponse);
      const expiringSoon = mapped.filter((m) => m.status === "expiring_soon");

      let sent = 0;
      for (const member of expiringSoon) {
        const message = `Your gym membership expires on ${member.membershipEndDate}. Please renew to continue.`;
        await db.insert(notificationLogsTable).values({
          memberId: member.id,
          memberName: member.fullName,
          phoneNumber: member.phoneNumber,
          message,
          status: "sent",
          sentAt: new Date(),
        });
        sent++;
        logger.info({ memberId: member.id, name: member.fullName }, "Daily notification sent");
      }
      logger.info({ sent }, "Daily notification job complete");
    } catch (err) {
      logger.error({ err }, "Daily notification job failed");
    }
  });

  logger.info("Cron jobs registered: daily expiry notifications at 9am");
}
