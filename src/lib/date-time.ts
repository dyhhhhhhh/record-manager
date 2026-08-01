const TIME_ZONE = "Asia/Shanghai";

function dateParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("日期时间无效");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatShanghaiDate(value: string | Date) {
  const { year, month, day } = dateParts(value);
  return `${year}/${month}/${day}`;
}

export function formatShanghaiDateTime(value: string | Date) {
  const { year, month, day, hour, minute } = dateParts(value);
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export function toShanghaiDateTimeInput(value: string | Date) {
  const { year, month, day, hour, minute } = dateParts(value);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function parseShanghaiDateTimeInput(value: string) {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+08:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("订单时间无效");
  return date.toISOString();
}
