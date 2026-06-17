const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export type HolidayCalendar = {
  year: number;
  holidays: Set<string>;
  makeUpWorkdays: Set<string>;
};

export const createHolidayCalendar = (
  year: number,
  holidays: string[],
  makeUpWorkdays: string[] = []
): HolidayCalendar => ({
  year,
  holidays: new Set(holidays),
  makeUpWorkdays: new Set(makeUpWorkdays)
});

// Default calendar follows the 2026 public holiday schedule. It is configurable
// in storage so annual updates do not require scheduler code changes.
export const china2026HolidayCalendar = createHolidayCalendar(
  2026,
  [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-02-21",
    "2026-02-22",
    "2026-04-04",
    "2026-04-05",
    "2026-04-06",
    "2026-05-01",
    "2026-05-02",
    "2026-05-03",
    "2026-05-04",
    "2026-05-05",
    "2026-06-19",
    "2026-06-20",
    "2026-06-21",
    "2026-09-25",
    "2026-09-26",
    "2026-09-27",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07"
  ],
  [
    "2026-02-14",
    "2026-02-28",
    "2026-05-09",
    "2026-09-20",
    "2026-10-10"
  ]
);

export const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
};

export const formatIsoDate = (date: Date) => iso(date);

export const endOfFiveWorkdayWindow = (mondayIso: string) => formatIsoDate(addDays(parseIsoDate(mondayIso), 4));

export const eachMonday = (year: number) => {
  const result: string[] = [];
  let date = new Date(year, 0, 1);
  while (date.getDay() !== 1) {
    date = addDays(date, 1);
  }
  while (date.getFullYear() === year) {
    result.push(formatIsoDate(date));
    date = addDays(date, 7);
  }
  return result;
};

export const isWorkday = (date: Date, calendar: HolidayCalendar) => {
  const key = formatIsoDate(date);
  if (calendar.holidays.has(key)) return false;
  if (calendar.makeUpWorkdays.has(key)) return true;
  const day = date.getDay();
  return day >= 1 && day <= 5;
};

export const isCompleteWorkWeek = (mondayIso: string, calendar: HolidayCalendar) => {
  const monday = parseIsoDate(mondayIso);
  if (monday.getDay() !== 1) return false;
  for (let offset = 0; offset < 5; offset += 1) {
    if (!isWorkday(addDays(monday, offset), calendar)) return false;
  }
  return true;
};

export const availableWeeks = (year: number, calendar = china2026HolidayCalendar) =>
  eachMonday(year).filter((monday) => isCompleteWorkWeek(monday, calendar));

export const monthOf = (isoDate: string) => parseIsoDate(isoDate).getMonth() + 1;

export const halfOf = (isoDate: string) => (monthOf(isoDate) <= 6 ? "H1" : "H2");

export const monthsApart = (a: string, b: string) => {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  return Math.abs((da.getFullYear() - db.getFullYear()) * 12 + da.getMonth() - db.getMonth());
};

export const daysApart = (a: string, b: string) => {
  const diff = Math.abs(parseIsoDate(a).getTime() - parseIsoDate(b).getTime());
  return Math.floor(diff / 86_400_000);
};

export const yearsMonthsApart = (a: string, b: string) => {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  return (da.getFullYear() - db.getFullYear()) * 12 + da.getMonth() - db.getMonth();
};

export const sortWeeksNearMonth = (weeks: string[], targetMonth: number) =>
  [...weeks].sort((a, b) => {
    const da = Math.abs(monthOf(a) - targetMonth);
    const db = Math.abs(monthOf(b) - targetMonth);
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
