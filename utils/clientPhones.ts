import { Client } from "../types";

const PHONE_DELIMITER = " | ";

export const parseClientPhones = (value?: string | null): string[] =>
  Array.from(
    new Set(
      String(value || "")
        .split(/[\n,;|]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

export const serializeClientPhones = (phones: string[]): string =>
  parseClientPhones(phones.join(PHONE_DELIMITER)).join(PHONE_DELIMITER);

export const getClientPhones = (client?: Partial<Client> | null): string[] => {
  if (!client) return [];
  if (Array.isArray(client.phones) && client.phones.length > 0) {
    return parseClientPhones(client.phones.join(PHONE_DELIMITER));
  }
  return parseClientPhones(client.phone);
};

export const getPrimaryClientPhone = (client?: Partial<Client> | null): string =>
  getClientPhones(client)[0] || "";
