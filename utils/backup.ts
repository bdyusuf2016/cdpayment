import { AssessmentRecord, Client, PaymentRecord, StaffUser, SystemConfig } from "../types";

export const BACKUP_STORAGE_KEYS = {
  lastBackupAt: "backup_last_backup_at",
  autoBackupEnabled: "backup_auto_enabled",
  autoBackupFrequencyHours: "backup_auto_frequency_hours",
} as const;

export const DEFAULT_AUTO_BACKUP_FREQUENCY_HOURS = 24;

interface BackupPayloadInput {
  config: SystemConfig;
  clients: Client[];
  dutyHistory: PaymentRecord[];
  assessmentHistory: AssessmentRecord[];
  users: StaffUser[];
  trigger: "manual" | "auto";
}

export const buildBackupPayload = ({
  config,
  clients,
  dutyHistory,
  assessmentHistory,
  users,
  trigger,
}: BackupPayloadInput) => ({
  timestamp: new Date().toISOString(),
  trigger,
  config,
  clients,
  dutyHistory,
  assessmentHistory,
  users,
});

export const downloadBackupFile = (
  payload: ReturnType<typeof buildBackupPayload>,
  agencyName: string,
) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeAgencyName = (agencyName || "agency").trim().replace(/\s+/g, "_");

  link.href = url;
  link.download = `${payload.trigger}_backup_${safeAgencyName}_${payload.timestamp.split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
