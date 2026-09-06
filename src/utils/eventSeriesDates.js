const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

const pad = (number) => String(number).padStart(2, "0");

const validDateParts = (year, month, day) => {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
};

export const toDateInput = (value) => {
  if (typeof value === "string") {
    const match = value.match(DATE_INPUT_PATTERN);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return validDateParts(year, month, day) ? `${match[1]}-${match[2]}-${match[3]}` : "";
    }
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toLocalCalendarDate = (value) => {
  const input = toDateInput(value);
  if (!input) return null;
  const [year, month, day] = input.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

export const addCalendarDays = (value, days) => {
  const date = toLocalCalendarDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return toDateInput(date);
};

export const calendarWeekday = (value) => {
  const date = toLocalCalendarDate(value);
  return date ? date.getDay() : null;
};

export const seriesDefaults = (eventStart, tomorrowInput) => {
  const tomorrow = toDateInput(tomorrowInput);
  const sourceDate = toDateInput(eventStart);
  const nextEdition = sourceDate ? addCalendarDays(sourceDate, 7) : tomorrow;
  const rangeStart = nextEdition && tomorrow && nextEdition >= tomorrow ? nextEdition : tomorrow;

  return {
    sourceDate,
    candidateDate: rangeStart,
    rangeStart,
    rangeEnd: addCalendarDays(rangeStart, 56),
    weekday: sourceDate ? calendarWeekday(sourceDate) : null,
  };
};
