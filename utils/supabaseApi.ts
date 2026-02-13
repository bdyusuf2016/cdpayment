import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Client, PaymentRecord, AssessmentRecord } from "../types";

export function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key);
}

export async function fetchClients(
  url: string,
  key: string,
): Promise<Client[]> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<Client>("clients")
      .select("*")
      .order("created_at", { ascending: false });
    console.log("fetchClients data:", data);
    console.log("fetchClients error:", error);
    if (error) throw error;
    const clients = (data || []) as Client[];
    console.log("fetchClients returning:", clients);
    return clients;
  } catch (err) {
    console.error("fetchClients error", err);
    throw err;
  }
}

export async function insertClient(
  url: string,
  key: string,
  client: Client,
): Promise<boolean> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { error } = await supabase.from("clients").insert([client]);
    if (error) throw error;
    // Log audit
    try {
      await insertAuditLog(url, key, {
        timestamp: new Date().toLocaleString(),
        user_name: "system",
        action: "Create Client",
        module: "clients",
        details: `Created client AIN=${client.ain} name=${client.name}`,
        type: "success",
      });
    } catch (e) {
      // ignore logging failure
    }
    return true;
  } catch (err) {
    console.error("insertClient error", err);
    return false;
  }
}

export async function updateClient(
  url: string,
  key: string,
  ain: string,
  client: Partial<Client>,
): Promise<boolean> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { error } = await supabase
      .from("clients")
      .update(client)
      .eq("ain", ain);
    if (error) throw error;
    try {
      await insertAuditLog(url, key, {
        timestamp: new Date().toLocaleString(),
        user_name: "system",
        action: "Update Client",
        module: "clients",
        details: `Updated client AIN=${ain}`,
        type: "info",
      });
    } catch (e) {}
    return true;
  } catch (err) {
    console.error("updateClient error", err);
    return false;
  }
}

export async function deleteClient(
  url: string,
  key: string,
  ain: string,
): Promise<boolean> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { error } = await supabase.from("clients").delete().eq("ain", ain);
    if (error) throw error;
    // Log audit
    try {
      await insertAuditLog(url, key, {
        timestamp: new Date().toLocaleString(),
        user_name: "system",
        action: "Delete Client",
        module: "clients",
        details: `Deleted client AIN=${ain}`,
        type: "danger",
      });
    } catch (e) {
      // ignore
    }
    return true;
  } catch (err) {
    console.error("deleteClient error", err);
    return false;
  }
}

export async function fetchDutyHistory(
  url: string,
  key: string,
): Promise<PaymentRecord[]> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<PaymentRecord>("duty_payments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as PaymentRecord[];
  } catch (err) {
    console.error("fetchDutyHistory error", err);
    throw err;
  }
}

export async function fetchAssessmentHistory(
  url: string,
  key: string,
): Promise<AssessmentRecord[]> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<AssessmentRecord>("assessments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as AssessmentRecord[];
  } catch (err) {
    console.error("fetchAssessmentHistory error", err);
    throw err;
  }
}

// Audit logs
export async function fetchAuditLogs(url: string, key: string) {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("fetchAuditLogs error", err);
    throw err;
  }
}

export async function insertAuditLog(
  url: string,
  key: string,
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
    const supabase = createSupabaseClient(url, key);
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

// Duty payments CRUD
export async function insertDuties(
  url: string,
  key: string,
  records: Partial<PaymentRecord>[],
): Promise<PaymentRecord[]> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<PaymentRecord>("duty_payments")
      .insert(records)
      .select("*");
    if (error) throw error;
    return (data || []) as PaymentRecord[];
  } catch (err) {
    console.error("insertDuties error", err);
    return [];
  }
}

export async function updateDuty(
  url: string,
  key: string,
  id: string,
  patch: Partial<PaymentRecord>,
): Promise<PaymentRecord | null> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<PaymentRecord>("duty_payments")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return (data as PaymentRecord) || null;
  } catch (err) {
    console.error("updateDuty error", err);
    return null;
  }
}

export async function deleteDuty(
  url: string,
  key: string,
  id: string,
): Promise<boolean> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { error } = await supabase
      .from("duty_payments")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("deleteDuty error", err);
    return false;
  }
}

// Assessments CRUD
export async function insertAssessments(
  url: string,
  key: string,
  records: Partial<AssessmentRecord>[],
): Promise<AssessmentRecord[]> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<AssessmentRecord>("assessments")
      .insert(records)
      .select("*");
    if (error) throw error;
    return (data || []) as AssessmentRecord[];
  } catch (err) {
    console.error("insertAssessments error", err);
    return [];
  }
}

export async function updateAssessment(
  url: string,
  key: string,
  id: string,
  patch: Partial<AssessmentRecord>,
): Promise<AssessmentRecord | null> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { data, error } = await supabase
      .from<AssessmentRecord>("assessments")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return (data as AssessmentRecord) || null;
  } catch (err) {
    console.error("updateAssessment error", err);
    return null;
  }
}

export async function deleteAssessment(
  url: string,
  key: string,
  id: string,
): Promise<boolean> {
  try {
    const supabase = createSupabaseClient(url, key);
    const { error } = await supabase.from("assessments").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("deleteAssessment error", err);
    return false;
  }
}
