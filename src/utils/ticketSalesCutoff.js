export const SALES_CUTOFF_PRESETS = [
  { value: "at_start", label: "Até o início do evento", mode: "at_start", offsetMinutes: 0 },
  { value: "before_start_30", label: "30 min antes do início", mode: "before_start", offsetMinutes: 30 },
  { value: "before_start_60", label: "1h antes do início", mode: "before_start", offsetMinutes: 60 },
  { value: "before_start_120", label: "2h antes do início", mode: "before_start", offsetMinutes: 120 },
  { value: "after_start_60", label: "1h depois do início", mode: "after_start", offsetMinutes: 60 },
  { value: "after_start_120", label: "2h depois do início", mode: "after_start", offsetMinutes: 120 },
  { value: "custom", label: "Personalizado" },
];

const presetByValue = (value) => SALES_CUTOFF_PRESETS.find((item) => item.value === value) || SALES_CUTOFF_PRESETS[0];

export const buildSalesCutoffRule = ({
  preset = "at_start",
  customMode = "after_start",
  customAmount = 2,
  customUnit = "hours",
} = {}) => {
  const selected = presetByValue(preset);
  if (selected.value !== "custom") {
    return { mode: selected.mode, offsetMinutes: selected.offsetMinutes };
  }

  const amount = Math.max(1, Number(customAmount || 1));
  const multiplier = customUnit === "days" ? 1440 : customUnit === "hours" ? 60 : 1;
  const offsetMinutes = Math.min(525600, Math.max(1, Math.round(amount * multiplier)));
  const allowedModes = ["before_start", "after_start", "before_end"];

  return {
    mode: allowedModes.includes(customMode) ? customMode : "after_start",
    offsetMinutes,
  };
};

export const describeSalesCutoffRule = ({ mode = "at_start", offsetMinutes = 0 } = {}) => {
  if (mode === "at_start") return "Até o início do evento";
  const minutes = Math.max(1, Number(offsetMinutes || 1));
  const duration = minutes % 1440 === 0
    ? `${minutes / 1440} dia${minutes / 1440 === 1 ? "" : "s"}`
    : minutes % 60 === 0
      ? `${minutes / 60}h`
      : `${minutes} min`;
  if (mode === "before_start") return `${duration} antes do início`;
  if (mode === "before_end") return `${duration} antes do término`;
  return `${duration} depois do início`;
};

const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const calculateSalesCutoffForEvent = (event, rule, now = new Date()) => {
  const start = validDate(event?.start_date);
  const end = validDate(event?.end_date);
  if (!start || !end || end <= start) {
    return { valid: false, date: null, clamped: false, reason: "Evento sem início e término válidos." };
  }

  const offsetMs = Math.max(0, Number(rule?.offsetMinutes || 0)) * 60 * 1000;
  let cutoff;
  if (rule?.mode === "before_start") cutoff = new Date(start.getTime() - offsetMs);
  else if (rule?.mode === "after_start") cutoff = new Date(start.getTime() + offsetMs);
  else if (rule?.mode === "before_end") cutoff = new Date(end.getTime() - offsetMs);
  else cutoff = new Date(start.getTime());

  let clamped = false;
  if (cutoff > end) {
    cutoff = new Date(end.getTime());
    clamped = true;
  }

  if (cutoff <= now) {
    return {
      valid: false,
      date: cutoff,
      clamped,
      reason: "O encerramento calculado já passou.",
    };
  }

  return { valid: true, date: cutoff, clamped, reason: "" };
};

export const ruleFromTicket = (ticket) => {
  const storedMode = String(ticket?.sales_cutoff_mode || "");
  if (["at_start", "before_start", "after_start", "before_end"].includes(storedMode)) {
    return {
      mode: storedMode,
      offsetMinutes: storedMode === "at_start" ? 0 : Math.max(1, Number(ticket?.sales_cutoff_offset_minutes || 1)),
    };
  }

  const start = validDate(ticket?.source_event?.start_date || ticket?.event?.start_date);
  const limit = validDate(ticket?.limit_date);
  if (start && limit) {
    const deltaMinutes = Math.max(0, Math.round(Math.abs(limit.getTime() - start.getTime()) / 60000));
    if (deltaMinutes < 1) return { mode: "at_start", offsetMinutes: 0 };
    if (limit < start) return { mode: "before_start", offsetMinutes: deltaMinutes };
    return { mode: "after_start", offsetMinutes: deltaMinutes };
  }

  return { mode: "at_start", offsetMinutes: 0 };
};
