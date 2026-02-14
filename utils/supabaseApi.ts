import { SupabaseClient } from "@supabase/supabase-js";
import {
  Client,
  PaymentRecord,
  AssessmentRecord,
  StaffUser,
  SystemConfig,
  LogEntry,
} from "../types";

const toDutyDb = (record: Partial<PaymentRecord>) => ({
  date: record.date,
  ain: record.ain,
  client_name: record.clientName,
  phone: record.phone,
  be_year: record.beYear,
  duty: record.duty,
  received: record.received,
  status: record.status,
  profit: record.profit,
  payment_method: record.paymentMethod,
});

const fromDutyDb = (row: any): PaymentRecord => ({
  id: row.id,
  date: row.date ?? "",
  ain: row.ain ?? "",
  clientName: row.clientName ?? row.client_name ?? "",
  phone: row.phone ?? "",
  beYear: row.beYear ?? row.be_year ?? "",
  duty: Number(row.duty ?? 0),
  received: Number(row.received ?? 0),
  status: (row.status ?? "New") as PaymentRecord["status"],
  profit: Number(row.profit ?? 0),
  paymentMethod: row.paymentMethod ?? row.payment_method ?? undefined,
});

const toAssessmentDb = (record: Partial<AssessmentRecord>) => ({
  date: record.date,
  ain: record.ain,
  client_name: record.clientName,
  phone: record.phone,
  nos_of_be: record.nosOfBe,
  rate: record.rate,
  amount: record.amount,
  discount: record.discount,
  net: record.net,
  received: record.received,
  status: record.status,
  profit: record.profit,
  payment_method: record.paymentMethod,
});

const fromAssessmentDb = (row: any): AssessmentRecord => ({
  id: row.id,
  date: row.date ?? "",
  ain: row.ain ?? "",
  clientName: row.clientName ?? row.client_name ?? "",
  phone: row.phone ?? "",
  nosOfBe: Number(row.nosOfBe ?? row.nos_of_be ?? 0),
  rate: Number(row.rate ?? 0),
  amount: Number(row.amount ?? 0),
  discount: Number(row.discount ?? 0),
  net: Number(row.net ?? 0),
  received: Number(row.received ?? 0),
  status: (row.status ?? "New") as AssessmentRecord["status"],
  profit: Number(row.profit ?? 0),
  paymentMethod: row.paymentMethod ?? row.payment_method ?? undefined,
});

// Generic fetch
export async function fetchData<T>(
  supabase: SupabaseClient,
  tableName: string,
): Promise<T[]> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as T[]) || [];
  } catch (err) {
    console.error(`Error fetching ${tableName}:`, err);
    return [];
  }
}

// Client CRUD
export async function insertClient(
  supabase: SupabaseClient,
  client: Omit<Client, "created_at">,
): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .insert(client)
    .select()
    .single();
  if (error) {
    console.error("insertClient error", error);
    return null;
  }
  return data;
}

export async function updateClient(
  supabase: SupabaseClient,
  ain: string,
  client: Partial<Client>,
): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .update(client)
    .eq("ain", ain)
    .select()
    .single();
  if (error) {
    console.error("updateClient error", error);
    return null;
  }
  return data;
}

export async function deleteClient(
  supabase: SupabaseClient,
  ain: string,
): Promise<{ ain: string } | null> {
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("ain", ain)
    .select()
    .single();
  if (error) {
    console.error("deleteClient error", error);
    return null;
  }
  return data ? { ain } : null; // Return identifier for UI update
}

// Duty Payments CRUD
export async function insertDuty(
  supabase: SupabaseClient,
  record: Omit<PaymentRecord, "id" | "created_at">,
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("duty_payments")
    .insert(toDutyDb(record))
    .select()
    .single();
  if (error) {
    console.error("insertDuty error", error);
    return null;
  }
  return fromDutyDb(data);
}

export async function updateDuty(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<PaymentRecord>,
): Promise<PaymentRecord | null> {
  const dbPatch = toDutyDb(patch);
  Object.keys(dbPatch).forEach((k) => {
    if ((dbPatch as any)[k] === undefined) delete (dbPatch as any)[k];
  });
  const { data, error } = await supabase
    .from("duty_payments")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateDuty error", error);
    return null;
  }
  return fromDutyDb(data);
}

export async function deleteDuty(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string } | null> {
  const { error, data } = await supabase
    .from("duty_payments")
    .delete()
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("deleteDuty error", error);
    return null;
  }
  return data ? { id } : null;
}

// Assessments CRUD
export async function insertAssessment(
  supabase: SupabaseClient,
  record: Omit<AssessmentRecord, "id" | "created_at">,
): Promise<AssessmentRecord | null> {
  const { data, error } = await supabase
    .from("assessments")
    .insert(toAssessmentDb(record))
    .select()
    .single();
  if (error) {
    console.error("insertAssessment error", error);
    return null;
  }
  return fromAssessmentDb(data);
}

export async function updateAssessment(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<AssessmentRecord>,
): Promise<AssessmentRecord | null> {
  const dbPatch = toAssessmentDb(patch);
  Object.keys(dbPatch).forEach((k) => {
    if ((dbPatch as any)[k] === undefined) delete (dbPatch as any)[k];
  });
  const { data, error } = await supabase
    .from("assessments")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateAssessment error", error);
    return null;
  }
  return fromAssessmentDb(data);
}

export async function deleteAssessment(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string } | null> {
  const { error, data } = await supabase
    .from("assessments")
    .delete()
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("deleteAssessment error", error);
    return null;
  }
  return data ? { id } : null;
}

// Staff Users CRUD
export async function fetchStaffUsers(
  supabase: SupabaseClient,
): Promise<StaffUser[]> {
  return fetchData<StaffUser>(supabase, "staff_users");
}

export async function updateStaffUser(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<StaffUser>,
): Promise<StaffUser | null> {
  const { data, error } = await supabase
    .from("staff_users")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateStaffUser error", error);
    return null;
  }
  return data;
}

// System Settings
export async function fetchSystemSettings(
  supabase: SupabaseClient,
): Promise<SystemConfig | null> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("*")
    .limit(1)
    .single();
  if (error) {
    console.error("fetchSystemSettings error", error);
    return null;
  }
  return {
    defaultRate: Number(data.defaultRate ?? data.default_rate ?? 0),
    agencyName: data.agencyName ?? data.agency_name ?? "",
    agencyAddress: data.agencyAddress ?? data.agency_address ?? "",
    autoInvoice: data.autoInvoice ?? data.auto_invoice ?? true,
    currency: data.currency ?? "BDT",
    theme: data.theme ?? "light",
    language: data.language ?? "en",
    paymentMethods: data.paymentMethods ?? data.payment_methods ?? [],
    supabaseUrl: data.supabaseUrl,
    supabaseKey: data.supabaseKey,
    lastBackup: data.lastBackup,
    lastMaintenance: data.lastMaintenance,
  };
}

export async function updateSystemSettings(
  supabase: SupabaseClient,
  patch: Partial<SystemConfig>,
): Promise<SystemConfig | null> {
  const dbPatch = {
    agency_name: patch.agencyName,
    agency_address: patch.agencyAddress,
    default_rate: patch.defaultRate,
    auto_invoice: patch.autoInvoice,
    currency: patch.currency,
    theme: patch.theme,
    language: patch.language,
    payment_methods: patch.paymentMethods,
  } as Record<string, unknown>;
  Object.keys(dbPatch).forEach((k) => {
    if (dbPatch[k] === undefined) delete dbPatch[k];
  });

  // There's only one settings row, so we update it.
  const { data, error } = await supabase
    .from("system_settings")
    .update(dbPatch)
    .eq("id", 1) // Assuming the settings row has id 1
    .select()
    .single();
  if (error) {
    console.error("updateSystemSettings error", error);
    return null;
  }
  return {
    defaultRate: Number(data.defaultRate ?? data.default_rate ?? 0),
    agencyName: data.agencyName ?? data.agency_name ?? "",
    agencyAddress: data.agencyAddress ?? data.agency_address ?? "",
    autoInvoice: data.autoInvoice ?? data.auto_invoice ?? true,
    currency: data.currency ?? "BDT",
    theme: data.theme ?? "light",
    language: data.language ?? "en",
    paymentMethods: data.paymentMethods ?? data.payment_methods ?? [],
    supabaseUrl: data.supabaseUrl,
    supabaseKey: data.supabaseKey,
    lastBackup: data.lastBackup,
    lastMaintenance: data.lastMaintenance,
  };
}

// Audit logs
export async function fetchAuditLogs(
  supabase: SupabaseClient,
): Promise<LogEntry[]> {
  return fetchData<LogEntry>(supabase, "audit_logs");
}

export async function insertAuditLog(
  supabase: SupabaseClient,
  entry: {
    timestamp?: string;
    user_name?: string;
    action: string;
    module: string;
    details?: string;
    type?: "info" | "warning" | "danger" | "success";
  },
) {
  try {
    const payload = {
      timestamp: entry.timestamp ?? new Date().toLocaleString(),
      user_name: entry.user_name ?? "system",
      action: entry.action,
      module: entry.module,
      details: entry.details ?? "",
      type: entry.type ?? "info",
    };
    const { error } = await supabase.from("audit_logs").insert([payload]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("insertAuditLog error", err);
    return false;
  }
}
