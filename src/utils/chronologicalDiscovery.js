const DAY_MS = 24 * 60 * 60 * 1000;

export const parsePortableEventDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const copy = new Date(value);
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "string") {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // APIs backed by SQL commonly return `YYYY-MM-DD HH:mm:ss`, sometimes with
    // fractional seconds. Those shapes are not portable ECMAScript date-time
    // strings and can become Invalid Date on mobile WebKit. Preserve the
    // intended local wall-clock time explicitly.
    const sqlDateTime = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/);
    if (sqlDateTime) {
      const [, year, month, day, hour, minute, second = "0", fraction = ""] = sqlDateTime;
      const millisecond = fraction ? Number(fraction.slice(0, 3).padEnd(3, "0")) : 0;
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        millisecond
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (value) => {
  const date = parsePortableEventDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const calendarDayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;

const localDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const eventDate = (event) => {
  const raw = event?.starts_at || event?.start_at || event?.start_date || event?.date || event?.scheduled_at;
  if (!raw) return null;
  return parsePortableEventDate(raw);
};

const dateTitle = (date) => new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
}).format(date);

export const chronologicalBucketFor = (value, now = new Date()) => {
  const date = startOfDay(value);
  const today = startOfDay(now);
  if (!date || !today) return { key: "unknown", title: "Data a confirmar", order: Number.MAX_SAFE_INTEGER };

  const diff = calendarDayNumber(date) - calendarDayNumber(today);
  if (diff === 0) return { key: "today", title: "Hoje", order: 0 };
  if (diff === 1) return { key: "tomorrow", title: "Amanhã", order: 1 };
  if (diff >= 2 && diff <= 6) return { key: `date:${localDateKey(date)}`, title: dateTitle(date), order: diff };
  if (diff >= 7 && diff <= 13) return { key: "next-week", title: "Próxima semana", order: 7 };
  return { key: `date:${localDateKey(date)}`, title: dateTitle(date), order: diff < 0 ? 10000 + Math.abs(diff) : diff };
};

export const groupEventsChronologically = (events = [], now = new Date()) => {
  const groups = new Map();

  [...events]
    .sort((left, right) => (eventDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (eventDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER))
    .forEach((event) => {
      const date = eventDate(event);
      const bucket = chronologicalBucketFor(date, now);
      if (!groups.has(bucket.key)) groups.set(bucket.key, { ...bucket, events: [] });
      groups.get(bucket.key).events.push(event);
    });

  return [...groups.values()].sort((left, right) => left.order - right.order);
};
