const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const eventDate = (event) => {
  const raw = event?.starts_at || event?.start_at || event?.start_date || event?.date || event?.scheduled_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
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

  const diff = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  if (diff === 0) return { key: "today", title: "Hoje", order: 0 };
  if (diff === 1) return { key: "tomorrow", title: "Amanhã", order: 1 };
  if (diff >= 2 && diff <= 6) return { key: `date:${date.toISOString().slice(0, 10)}`, title: dateTitle(date), order: diff };
  if (diff >= 7 && diff <= 13) return { key: "next-week", title: "Próxima semana", order: 7 };
  return { key: `date:${date.toISOString().slice(0, 10)}`, title: dateTitle(date), order: diff < 0 ? 10000 + Math.abs(diff) : diff };
};

export const groupEventsChronologically = (events = [], now = new Date()) => {
  const groups = new Map();

  [...events]
    .sort((left, right) => (eventDate(left)?.getTime() || Number.MAX_SAFE_INTEGER) - (eventDate(right)?.getTime() || Number.MAX_SAFE_INTEGER))
    .forEach((event) => {
      const date = eventDate(event);
      const bucket = chronologicalBucketFor(date, now);
      if (!groups.has(bucket.key)) groups.set(bucket.key, { ...bucket, events: [] });
      groups.get(bucket.key).events.push(event);
    });

  return [...groups.values()].sort((left, right) => left.order - right.order);
};
