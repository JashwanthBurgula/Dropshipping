import { prisma } from "@/lib/db";

export interface HolidaySeedItem {
  date: string;
  name: string;
  year: number;
  isActive: boolean;
}

/**
 * Seeded Indian national and regional gazetted holidays for 2026 and 2027 (YYYY-MM-DD).
 * Stored in the admin-editable `Holiday` table (`holidays`) and used by `estimateDelivery`.
 */
export const SEED_INDIAN_HOLIDAYS_2026_2027: readonly HolidaySeedItem[] = [
  // 2026 Holidays
  { date: "2026-01-26", name: "Republic Day", year: 2026, isActive: true },
  { date: "2026-03-04", name: "Holi", year: 2026, isActive: true },
  { date: "2026-04-03", name: "Good Friday", year: 2026, isActive: true },
  {
    date: "2026-05-01",
    name: "May Day / Karnataka Labour Day",
    year: 2026,
    isActive: true,
  },
  { date: "2026-08-15", name: "Independence Day", year: 2026, isActive: true },
  { date: "2026-09-14", name: "Ganesh Chaturthi", year: 2026, isActive: true },
  { date: "2026-10-02", name: "Gandhi Jayanti", year: 2026, isActive: true },
  {
    date: "2026-10-20",
    name: "Dussehra / Vijayadashami",
    year: 2026,
    isActive: true,
  },
  {
    date: "2026-11-01",
    name: "Karnataka Rajyotsava",
    year: 2026,
    isActive: true,
  },
  { date: "2026-11-08", name: "Diwali", year: 2026, isActive: true },
  { date: "2026-12-25", name: "Christmas Day", year: 2026, isActive: true },

  // 2027 Holidays
  { date: "2027-01-26", name: "Republic Day", year: 2027, isActive: true },
  { date: "2027-03-22", name: "Holi", year: 2027, isActive: true },
  { date: "2027-03-26", name: "Good Friday", year: 2027, isActive: true },
  {
    date: "2027-05-01",
    name: "May Day / Karnataka Labour Day",
    year: 2027,
    isActive: true,
  },
  { date: "2027-08-15", name: "Independence Day", year: 2027, isActive: true },
  { date: "2027-09-04", name: "Ganesh Chaturthi", year: 2027, isActive: true },
  { date: "2027-10-02", name: "Gandhi Jayanti", year: 2027, isActive: true },
  {
    date: "2027-10-09",
    name: "Dussehra / Vijayadashami",
    year: 2027,
    isActive: true,
  },
  { date: "2027-10-29", name: "Diwali", year: 2027, isActive: true },
  {
    date: "2027-11-01",
    name: "Karnataka Rajyotsava",
    year: 2027,
    isActive: true,
  },
  { date: "2027-12-25", name: "Christmas Day", year: 2027, isActive: true },
] as const;

export const DEFAULT_INDIAN_HOLIDAYS: readonly string[] =
  SEED_INDIAN_HOLIDAYS_2026_2027.filter((h) => h.isActive).map((h) => h.date);

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // UTC+05:30 (Asia/Kolkata)

const inMemoryHolidays = new Map<string, HolidaySeedItem>(
  SEED_INDIAN_HOLIDAYS_2026_2027.map((item) => [item.date, { ...item }])
);

export function resetInMemoryHolidaysForTests(): void {
  inMemoryHolidays.clear();
  for (const item of SEED_INDIAN_HOLIDAYS_2026_2027) {
    inMemoryHolidays.set(item.date, { ...item });
  }
}

/**
 * Lists all active holiday dates (`YYYY-MM-DD`) from the admin-editable `Holiday` table
 * (with deterministic fallback to the seeded 2026/2027 calendar in dev/test).
 */
export async function listActiveHolidaysFromStore(): Promise<string[]> {
  if (process.env.VITEST !== "true" && process.env.DATABASE_URL) {
    try {
      const rows = await prisma.holiday.findMany({
        where: { isActive: true },
        orderBy: { date: "asc" },
      });
      if (rows.length > 0) {
        return rows.map((r) => r.date);
      }
    } catch {
      // Fall back to in-memory holiday map
    }
  }

  return Array.from(inMemoryHolidays.values())
    .filter((h) => h.isActive)
    .map((h) => h.date)
    .sort();
}

/**
 * Allows an administrator to add or update a holiday in the `Holiday` table.
 */
export async function upsertHolidayForAdmin(params: {
  date: string;
  name: string;
  isActive?: boolean;
}): Promise<HolidaySeedItem> {
  const cleanedDate = params.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) {
    throw new Error("Holiday date must be in YYYY-MM-DD format.");
  }
  const year = Number(cleanedDate.slice(0, 4));
  const isActive = params.isActive ?? true;
  const record: HolidaySeedItem = {
    date: cleanedDate,
    name: params.name.trim(),
    year,
    isActive,
  };

  inMemoryHolidays.set(cleanedDate, record);

  if (process.env.VITEST !== "true" && process.env.DATABASE_URL) {
    try {
      await prisma.holiday.upsert({
        where: { date: cleanedDate },
        update: {
          name: record.name,
          year: record.year,
          isActive: record.isActive,
        },
        create: record,
      });
    } catch {
      // Stored in memory fallback
    }
  }

  return record;
}

export interface EstimateDeliveryInput {
  /** Studio processing and quality-check days before courier pickup */
  processingDays: number;
  /** PIN code zone transit days from serviceable_pin_codes */
  transitDays: number;
  /** Optional starting date or timestamp (converted to Asia/Kolkata calendar date & time) */
  startDate?: Date | string;
  /** Optional custom list of YYYY-MM-DD holiday dates to skip (defaults to active 2026/2027 holidays) */
  holidays?: readonly string[];
  /**
   * Optional daily order cut-off hour in Asia/Kolkata (0..23, e.g. 14 for 14:00 IST).
   * When set and the order timestamp in Asia/Kolkata is at or after `cutoffHourIst:cutoffMinuteIst`,
   * +1 working day is added to processing before dispatch.
   */
  cutoffHourIst?: number | null;
  /** Optional daily order cut-off minute in Asia/Kolkata (0..59, defaults to 0) */
  cutoffMinuteIst?: number;
}

export interface DeliveryEstimateResult {
  processingDays: number;
  effectiveProcessingDays: number;
  passedDailyCutoff: boolean;
  startDateIst: string;
  transitDays: number;
  totalBusinessDaysMin: number;
  totalBusinessDaysMax: number;
  estimatedDispatchDate: string;
  estimatedDeliveryDateMin: string;
  estimatedDeliveryDateMax: string;
  formattedDispatchDate: string;
  formattedDeliveryWindow: string;
  skippedSundays: number;
  skippedHolidays: string[];
}

export interface IstCalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoDate: string;
  hasExplicitTime: boolean;
}

/**
 * Converts a Date or date/ISO string into `Asia/Kolkata` (`UTC+05:30`) calendar components.
 * Plain `YYYY-MM-DD` strings are interpreted directly as that calendar date in `Asia/Kolkata`
 * at 09:00 IST (`hasExplicitTime = false`).
 */
export function extractIstCalendarParts(
  input?: Date | string
): IstCalendarParts {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [y = 2026, m = 1, d = 1] = input.trim().split("-").map(Number);
    const isoDate = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return {
      year: y,
      month: m,
      day: d,
      hour: 9,
      minute: 0,
      isoDate,
      hasExplicitTime: false,
    };
  }

  const instant = input ? new Date(input) : new Date();
  const istShifted = new Date(instant.getTime() + IST_OFFSET_MS);
  const year = istShifted.getUTCFullYear();
  const month = istShifted.getUTCMonth() + 1;
  const day = istShifted.getUTCDate();
  const hour = istShifted.getUTCHours();
  const minute = istShifted.getUTCMinutes();
  const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate,
    hasExplicitTime: true,
  };
}

/**
 * Formats a UTC Date object representing an IST calendar day as YYYY-MM-DD.
 */
export function toIsoDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortHumanDate(isoDate: string): string {
  const [y = 2026, m = 1, d = 1] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dt);
}

/**
 * Advances a calendar date by `businessDaysToAdd` working days, skipping Sundays
 * (day 0) and any date present in `holidaySet` (YYYY-MM-DD).
 */
export function advanceWorkingDays(
  startUtcDate: Date,
  businessDaysToAdd: number,
  holidaySet: ReadonlySet<string>
): {
  targetDate: Date;
  skippedSundays: number;
  skippedHolidays: string[];
} {
  const cursor = new Date(startUtcDate.getTime());
  let remaining = Math.max(0, Math.floor(businessDaysToAdd));
  let skippedSundays = 0;
  const skippedHolidays: string[] = [];

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dayOfWeek = cursor.getUTCDay();
    const iso = toIsoDateString(cursor);

    if (dayOfWeek === 0) {
      skippedSundays += 1;
      continue;
    }

    if (holidaySet.has(iso)) {
      skippedHolidays.push(iso);
      continue;
    }

    remaining -= 1;
  }

  return {
    targetDate: cursor,
    skippedSundays,
    skippedHolidays,
  };
}

/**
 * Shared delivery estimator used on Product Detail pages, Cart, and Checkout.
 *
 * Computes all dates in `Asia/Kolkata` (`UTC+05:30`), honors an optional daily
 * order cut-off time (`cutoffHourIst`, `cutoffMinuteIst`), and skips Sundays
 * plus active Indian holidays for 2026 and 2027.
 */
export function estimateDelivery(
  input: EstimateDeliveryInput
): DeliveryEstimateResult {
  const processingDays = Math.max(1, Math.floor(input.processingDays));
  const transitDays = Math.max(1, Math.floor(input.transitDays));
  const activeDefaultHolidays = Array.from(inMemoryHolidays.values())
    .filter((h) => h.isActive)
    .map((h) => h.date);
  const holidays = input.holidays ?? activeDefaultHolidays;
  const holidaySet = new Set(holidays);

  const istParts = extractIstCalendarParts(input.startDate);
  const baseDate = new Date(
    Date.UTC(istParts.year, istParts.month - 1, istParts.day)
  );

  let passedDailyCutoff = false;
  if (
    typeof input.cutoffHourIst === "number" &&
    input.cutoffHourIst >= 0 &&
    input.cutoffHourIst <= 23 &&
    istParts.hasExplicitTime
  ) {
    const cutoffMinute = input.cutoffMinuteIst ?? 0;
    if (
      istParts.hour > input.cutoffHourIst ||
      (istParts.hour === input.cutoffHourIst && istParts.minute >= cutoffMinute)
    ) {
      passedDailyCutoff = true;
    }
  }

  const effectiveProcessingDays =
    processingDays + (passedDailyCutoff ? 1 : 0);

  const dispatchStep = advanceWorkingDays(
    baseDate,
    effectiveProcessingDays,
    holidaySet
  );
  const minDeliveryStep = advanceWorkingDays(
    dispatchStep.targetDate,
    transitDays,
    holidaySet
  );
  const maxDeliveryStep = advanceWorkingDays(
    minDeliveryStep.targetDate,
    1,
    holidaySet
  );

  const estimatedDispatchDate = toIsoDateString(dispatchStep.targetDate);
  const estimatedDeliveryDateMin = toIsoDateString(minDeliveryStep.targetDate);
  const estimatedDeliveryDateMax = toIsoDateString(maxDeliveryStep.targetDate);

  return {
    processingDays,
    effectiveProcessingDays,
    passedDailyCutoff,
    startDateIst: istParts.isoDate,
    transitDays,
    totalBusinessDaysMin: effectiveProcessingDays + transitDays,
    totalBusinessDaysMax: effectiveProcessingDays + transitDays + 1,
    estimatedDispatchDate,
    estimatedDeliveryDateMin,
    estimatedDeliveryDateMax,
    formattedDispatchDate: formatShortHumanDate(estimatedDispatchDate),
    formattedDeliveryWindow: `${formatShortHumanDate(estimatedDeliveryDateMin)} to ${formatShortHumanDate(estimatedDeliveryDateMax)}`,
    skippedSundays:
      dispatchStep.skippedSundays +
      minDeliveryStep.skippedSundays +
      maxDeliveryStep.skippedSundays,
    skippedHolidays: [
      ...dispatchStep.skippedHolidays,
      ...minDeliveryStep.skippedHolidays,
      ...maxDeliveryStep.skippedHolidays,
    ],
  };
}
