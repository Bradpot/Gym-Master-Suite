import { Router, type IRouter } from "express";
import { db, membersTable } from "@workspace/db";
import { eq, ilike, or, sql, asc, desc, and, gte, lte, lt, gt } from "drizzle-orm";
import {
  buildMemberResponse,
  computeEndDate,
  computeStatus,
  computeDaysRemaining,
  generateMemberId,
} from "../lib/memberHelpers";
import { addDays, format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router: IRouter = Router();

router.get("/members", async (req, res): Promise<void> => {
  const { search, status, page = "1", limit = "10", sortBy = "createdAt", sortOrder = "desc" } = req.query as Record<string, string>;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  const today = format(new Date(), "yyyy-MM-dd");
  const sevenDaysLater = format(addDays(new Date(), 7), "yyyy-MM-dd");

  let allMembers = await db.select().from(membersTable);

  let filtered = allMembers.map(buildMemberResponse);

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.fullName.toLowerCase().includes(s) ||
        m.memberId.toLowerCase().includes(s) ||
        m.phoneNumber.includes(s)
    );
  }

  if (status && status !== "all") {
    filtered = filtered.filter((m) => m.status === status);
  }

  const total = filtered.length;

  const sortedMembers = [...filtered].sort((a, b) => {
    const field = sortBy as keyof typeof a;
    const aVal = a[field];
    const bVal = b[field];
    if (aVal == null || bVal == null) return 0;
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const paginated = sortedMembers.slice(offset, offset + limitNum);

  res.json({
    members: paginated,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

router.post("/members", upload.single("profilePhoto"), async (req, res): Promise<void> => {
  const { fullName, phoneNumber, membershipStartDate, membershipDurationMonths } = req.body;

  if (!fullName || !phoneNumber || !membershipStartDate || !membershipDurationMonths) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const duration = parseInt(membershipDurationMonths, 10);
  if (isNaN(duration) || duration < 1) {
    res.status(400).json({ error: "Invalid membership duration" });
    return;
  }

  const count = await db.select({ count: sql<number>`count(*)` }).from(membersTable);
  const totalCount = Number(count[0].count);
  const memberId = generateMemberId(totalCount);

  let profilePhotoUrl: string | null = null;
  if (req.file) {
    profilePhotoUrl = `/api/uploads/${req.file.filename}`;
  }

  const [created] = await db.insert(membersTable).values({
    memberId,
    fullName,
    phoneNumber,
    profilePhotoUrl,
    membershipStartDate,
    membershipDurationMonths: duration,
  }).returning();

  res.status(201).json(buildMemberResponse(created));
});

router.get("/members/export/csv", async (_req, res): Promise<void> => {
  const allMembers = await db.select().from(membersTable);
  const mapped = allMembers.map(buildMemberResponse);

  const headers = ["Member ID", "Full Name", "Phone Number", "Start Date", "End Date", "Duration (months)", "Status", "Days Remaining"];
  const rows = mapped.map((m) => [
    m.memberId,
    `"${m.fullName}"`,
    m.phoneNumber,
    m.membershipStartDate,
    m.membershipEndDate,
    m.membershipDurationMonths,
    m.status,
    m.daysRemaining,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="members-${format(new Date(), "yyyy-MM-dd")}.csv"`);
  res.send(csv);
});

router.get("/members/calendar/:year/:month", async (req, res): Promise<void> => {
  const year = parseInt(req.params.year as string, 10);
  const month = parseInt(req.params.month as string, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ error: "Invalid year or month" });
    return;
  }

  const allMembers = await db.select().from(membersTable);
  const mapped = allMembers.map(buildMemberResponse);

  const expiryDates: Record<string, typeof mapped> = {};

  for (const m of mapped) {
    const endDate = m.membershipEndDate;
    const [y, mo] = endDate.split("-").map(Number);
    if (y === year && mo === month) {
      const day = endDate.split("-")[2];
      if (!expiryDates[day]) expiryDates[day] = [];
      expiryDates[day].push(m);
    }
  }

  res.json({ year, month, expiryDates });
});

router.get("/members/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.json(buildMemberResponse(member));
});

router.put("/members/:id", upload.single("profilePhoto"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const { fullName, phoneNumber, membershipStartDate, membershipDurationMonths } = req.body;

  const updateData: Partial<typeof existing> = {};
  if (fullName) updateData.fullName = fullName;
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (membershipStartDate) updateData.membershipStartDate = membershipStartDate;
  if (membershipDurationMonths) updateData.membershipDurationMonths = parseInt(membershipDurationMonths, 10);

  if (req.file) {
    updateData.profilePhotoUrl = `/api/uploads/${req.file.filename}`;
  }

  const [updated] = await db.update(membersTable).set(updateData).where(eq(membersTable.id, id)).returning();

  res.json(buildMemberResponse(updated));
});

router.delete("/members/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db.delete(membersTable).where(eq(membersTable.id, id)).returning();

  if (!deleted) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.json({ success: true, message: "Member deleted" });
});

export default router;
