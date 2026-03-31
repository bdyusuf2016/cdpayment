const pad = (value: number) => String(value).padStart(2, "0");

export const formatAuditLogDate = (value?: string | Date): string => {
  const date =
    value instanceof Date
      ? value
      : value
        ? new Date(value)
        : new Date();

  if (Number.isNaN(date.getTime())) {
    return value ? String(value) : "";
  }

  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const parseAuditLogDate = (value?: string): number => {
  if (!value) return 0;
  const normalized = value.trim();

  if (/^\d{2}-\d{2}-\d{4}( \d{2}:\d{2})?$/.test(normalized)) {
    const [datePart, timePart] = normalized.split(" ");
    const [day, month, year] = datePart.split("-").map(Number);
    const [hours, minutes] = (timePart || "00:00").split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes).getTime();
  }

  if (normalized.includes("/") && normalized.includes(",")) {
    const [datePart, timePart] = normalized.split(",");
    const [day, month, year] = datePart.trim().split("/");
    const parsed = new Date(
      `${year}-${month}-${day}T${(timePart || "00:00:00").trim()}`,
    ).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};
