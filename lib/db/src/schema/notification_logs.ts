import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationLogsTable = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull(),
  memberName: text("member_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationLogSchema = createInsertSchema(notificationLogsTable).omit({ id: true });
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLogsTable.$inferSelect;
