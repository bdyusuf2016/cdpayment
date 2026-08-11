import { SupabaseClient } from "@supabase/supabase-js";
import {
  Client,
  PaymentRecord,
  AssessmentRecord,
  ClearanceRecord,
  WasteCompany,
  WasteRecord,
  Vendor,
  AinTaxRecord,
  StaffUser,
  SystemConfig,
  LogEntry,
} from "../types";
import { formatAuditLogDate } from "./auditLogDate";
import { getClientPhones, serializeClientPhones } from "./clientPhones";

const formatSupabaseError = (action: string, error: any): Error => {
  if (error?.code === "23505" && /clients/i.test(action)) {
    return new Error(
      "This AIN already exists. If each user should keep their own separate AIN list, run the per-user AIN migration SQL first.",
    );
  }

  const parts = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code ? `code=${error.code}` : "",
  ].filter(Boolean);
  return new Error(parts.join(" | ") || `${action} failed.`);
};

const toDutyDb = (record: Partial<PaymentRecord>) => ({
  date: record.date,
  receive_date: record.receiveDate,
  ain: record.ain,
  client_name: record.clientName,
  phone: record.phone,
  be_year: record.beYear,
  duty: record.duty,
  received: record.received,
  status: record.status,
  profit: record.profit,
  payment_method: record.paymentMethod,
  r_no: record.rNo,
});

const fromDutyDb = (row: any): PaymentRecord => ({
  id: row.id,
  date: row.date ?? "",
  receiveDate: row.receiveDate ?? row.receive_date ?? "",
  ain: row.ain ?? "",
  clientName: row.clientName ?? row.client_name ?? "",
  phone: row.phone ?? "",
  beYear: row.beYear ?? row.be_year ?? "",
  duty: Number(row.duty ?? 0),
  received: Number(row.received ?? 0),
  status: (row.status ?? "New") as PaymentRecord["status"],
  profit: Number(row.profit ?? 0),
  paymentMethod: row.paymentMethod ?? row.payment_method ?? undefined,
  rNo: row.rNo ?? row.r_no ?? "",
});

const toAssessmentDb = (record: Partial<AssessmentRecord>) => ({
  date: record.date,
  ain: record.ain,
  client_name: record.clientName,
  phone: record.phone,
  comments: record.comments,
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
  comments: row.comments ?? "",
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

const toClearanceDb = (record: Partial<ClearanceRecord>) => ({
  date: record.date,
  total_clearance: record.totalClearance,
  notes: record.notes,
  sl_no: record.slNo,
  client_name: record.clientName,
  assessable_value: record.assessableValue,
  cd: record.cd,
  rd: record.rd,
  vat: record.vat,
  ait: record.ait,
  atv_at: record.atvAt,
  duty_tax: record.dutyTax,
  trnx_id: record.trnxId,
  payment_date: record.paymentDate,
  payment_status: record.paymentStatus,
  circle: record.circle,
  in_word: record.inWord,
});

const fromClearanceDb = (row: any): ClearanceRecord => ({
  id: row.id,
  date: row.date ?? "",
  totalClearance: Number(row.totalClearance ?? row.total_clearance ?? 0),
  notes: row.notes ?? "",
  slNo: row.sl_no ?? "",
  clientName: row.client_name ?? "",
  assessableValue: Number(row.assessable_value ?? 0),
  cd: Number(row.cd ?? 0),
  rd: Number(row.rd ?? 0),
  vat: Number(row.vat ?? 0),
  ait: Number(row.ait ?? 0),
  atvAt: Number(row.atv_at ?? 0),
  dutyTax: Number(row.duty_tax ?? 0),
  trnxId: row.trnx_id ?? "",
  paymentDate: row.payment_date ?? "",
  paymentStatus: (row.payment_status ?? "Unpaid") as "Paid" | "Unpaid",
  circle: row.circle ?? "",
  inWord: row.in_word ?? "",
});

const toWasteCompanyDb = (company: Partial<WasteCompany>) => ({
  name: company.name,
  phone: company.phone,
  address: company.address,
  active: company.active,
});

const fromWasteCompanyDb = (row: any): WasteCompany => ({
  id: row.id,
  name: row.name ?? "",
  phone: row.phone ?? "",
  address: row.address ?? "",
  active: Boolean(row.active),
});

const toVendorDb = (vendor: Partial<Vendor>) => ({
  vendor_name: vendor.vendorName,
  owner_name: vendor.ownerName,
  phone: vendor.phone,
  bin_no: vendor.binNo,
  e_tin_no: vendor.eTinNo,
  address: vendor.address,
  notes: vendor.notes,
  active: vendor.active,
});

const fromVendorDb = (row: any): Vendor => ({
  id: row.id,
  vendorName: row.vendorName ?? row.vendor_name ?? "",
  ownerName: row.ownerName ?? row.owner_name ?? "",
  phone: row.phone ?? "",
  binNo: row.binNo ?? row.bin_no ?? "",
  eTinNo: row.eTinNo ?? row.e_tin_no ?? "",
  address: row.address ?? "",
  notes: row.notes ?? "",
  active: Boolean(row.active ?? true),
  createdAt: row.createdAt ?? row.created_at ?? "",
});

const toWasteRecordDb = (record: Partial<WasteRecord>) => ({
  date: record.date,
  company_id: record.companyId,
  company_name: record.companyName,
  car_type: record.carType,
  garbage_trips: record.garbageTrips,
  wastage_trips: record.wastageTrips,
  total_trips: record.totalTrips,
  rate_per_trip: record.ratePerTrip,
  amount: record.amount,
  received: record.received,
  due: record.due,
  payment_method: record.paymentMethod,
  notes: record.notes,
  status: record.status,
});

const fromWasteRecordDb = (row: any): WasteRecord => ({
  id: row.id,
  date: row.date ?? "",
  companyId: row.companyId ?? row.company_id ?? "",
  companyName: row.companyName ?? row.company_name ?? "",
  carType:
    (row.carType ?? row.car_type ?? "Wastage & Garbage") as WasteRecord["carType"],
  garbageTrips: Number(row.garbageTrips ?? row.garbage_trips ?? 0),
  wastageTrips: Number(row.wastageTrips ?? row.wastage_trips ?? 0),
  totalTrips:
    Number(row.totalTrips ?? row.total_trips ?? 0) ||
    (Number(row.garbageTrips ?? row.garbage_trips ?? 0) + Number(row.wastageTrips ?? row.wastage_trips ?? 0)),
  ratePerTrip: Number(row.ratePerTrip ?? row.rate_per_trip ?? 0),
  amount: Number(row.amount ?? 0),
  received: Number(row.received ?? 0),
  due: Number(row.due ?? 0),
  paymentMethod: row.paymentMethod ?? row.payment_method ?? undefined,
  notes: row.notes ?? "",
  status: (row.status ?? "Unpaid") as WasteRecord["status"],
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
    .insert(toClientDb(client))
    .select()
    .single();
  if (error) {
    console.error("insertClient error", error);
    throw formatSupabaseError("Insert client", error);
  }
  return fromClientDb(data);
}

export async function updateClient(
  supabase: SupabaseClient,
  ain: string,
  client: Partial<Client>,
): Promise<Client | null> {
  const dbPatch = toClientDb(client) as Record<string, unknown>;
  Object.keys(dbPatch).forEach((key) => {
    if (dbPatch[key] === undefined) delete dbPatch[key];
  });
  const { data, error } = await supabase
    .from("clients")
    .update(dbPatch)
    .eq("ain", ain)
    .select()
    .single();
  if (error) {
    console.error("updateClient error", error);
    throw formatSupabaseError("Update client", error);
  }
  return fromClientDb(data);
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
    throw formatSupabaseError("Delete client", error);
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

// Clearance records CRUD
export async function insertClearanceRecord(
  supabase: SupabaseClient,
  record: Omit<ClearanceRecord, "id">,
): Promise<ClearanceRecord | null> {
  const { data, error } = await supabase
    .from("clearance_records")
    .insert(toClearanceDb(record))
    .select()
    .single();
  if (error) {
    console.error("insertClearanceRecord error", error);
    throw formatSupabaseError("Insert clearance record", error);
  }
  return fromClearanceDb(data);
}

export async function updateClearanceRecord(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ClearanceRecord>,
): Promise<ClearanceRecord | null> {
  const dbPatch = toClearanceDb(patch) as Record<string, unknown>;
  Object.keys(dbPatch).forEach((key) => {
    if (dbPatch[key] === undefined) delete dbPatch[key];
  });
  const { data, error } = await supabase
    .from("clearance_records")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateClearanceRecord error", error);
    throw formatSupabaseError("Update clearance record", error);
  }
  return fromClearanceDb(data);
}

export async function deleteClearanceRecord(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("clearance_records")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    console.error("deleteClearanceRecord error", error);
    throw formatSupabaseError("Delete clearance record", error);
  }
  return data ? { id: data.id } : null;
}

// Waste companies CRUD
export async function insertWasteCompany(
  supabase: SupabaseClient,
  company: Omit<WasteCompany, "id">,
): Promise<WasteCompany | null> {
  const { data, error } = await supabase
    .from("waste_companies")
    .insert(toWasteCompanyDb(company))
    .select()
    .single();
  if (error) {
    console.error("insertWasteCompany error", error);
    throw formatSupabaseError("Insert waste company", error);
  }
  return fromWasteCompanyDb(data);
}

export async function updateWasteCompany(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<WasteCompany>,
): Promise<WasteCompany | null> {
  const dbPatch = toWasteCompanyDb(patch) as Record<string, unknown>;
  Object.keys(dbPatch).forEach((key) => {
    if (dbPatch[key] === undefined) delete dbPatch[key];
  });
  const { data, error } = await supabase
    .from("waste_companies")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateWasteCompany error", error);
    throw formatSupabaseError("Update waste company", error);
  }
  return fromWasteCompanyDb(data);
}

// Vendor CRUD
export async function insertVendor(
  supabase: SupabaseClient,
  vendor: Omit<Vendor, "id">,
): Promise<Vendor | null> {
  const { data, error } = await supabase
    .from("vendors")
    .insert(toVendorDb(vendor))
    .select()
    .single();
  if (error) {
    console.error("insertVendor error", error);
    throw formatSupabaseError("Insert vendor", error);
  }
  return fromVendorDb(data);
}

export async function updateVendor(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Vendor>,
): Promise<Vendor | null> {
  const dbPatch = toVendorDb(patch) as Record<string, unknown>;
  Object.keys(dbPatch).forEach(
    (key) => dbPatch[key] === undefined && delete dbPatch[key],
  );

  const { data, error } = await supabase
    .from("vendors")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateVendor error", error);
    throw formatSupabaseError("Update vendor", error);
  }
  return fromVendorDb(data);
}

export async function deleteVendor(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) {
    console.error("deleteVendor error", error);
    throw formatSupabaseError("Delete vendor", error);
  }
  return true;
}

// Waste records CRUD
export async function insertWasteRecord(
  supabase: SupabaseClient,
  record: Omit<WasteRecord, "id">,
): Promise<WasteRecord | null> {
  const { data, error } = await supabase
    .from("waste_records")
    .insert(toWasteRecordDb(record))
    .select()
    .single();
  if (error) {
    console.error("insertWasteRecord error", error);
    throw formatSupabaseError("Insert waste record", error);
  }
  return fromWasteRecordDb(data);
}

export async function updateWasteRecord(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<WasteRecord>,
): Promise<WasteRecord | null> {
  const dbPatch = toWasteRecordDb(patch) as Record<string, unknown>;
  Object.keys(dbPatch).forEach((key) => {
    if (dbPatch[key] === undefined) delete dbPatch[key];
  });
  const { data, error } = await supabase
    .from("waste_records")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("updateWasteRecord error", error);
    throw formatSupabaseError("Update waste record", error);
  }
  return fromWasteRecordDb(data);
}

export async function deleteWasteRecord(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string } | null> {
  const { error, data } = await supabase
    .from("waste_records")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    console.error("deleteWasteRecord error", error);
    throw formatSupabaseError("Delete waste record", error);
  }
  return data ? { id: data.id } : null;
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
  return {
    id: data.id,
    authId: data.authId ?? data.auth_id ?? undefined,
    name: data.name ?? "",
    role: data.role ?? "User",
    permissions: data.permissions ?? {},
    lastActive: data.lastActive ?? data.last_active ?? "",
    active: Boolean(data.active),
  };
}

export async function insertStaffUser(
  supabase: SupabaseClient,
  payload: Omit<StaffUser, "id">,
): Promise<StaffUser | null> {
  const dbPayload = {
    name: payload.name,
    role: payload.role,
    permissions: payload.permissions,
    last_active: payload.lastActive,
    active: payload.active,
  };
  const { data, error } = await supabase
    .from("staff_users")
    .insert(dbPayload)
    .select()
    .single();
  if (error) {
    console.error("insertStaffUser error", error);
    return null;
  }
  return {
    id: data.id,
    authId: data.authId ?? data.auth_id ?? undefined,
    name: data.name ?? "",
    role: data.role ?? "User",
    permissions: data.permissions ?? {},
    lastActive: data.lastActive ?? data.last_active ?? "",
    active: Boolean(data.active),
  };
}

export async function deleteStaffUser(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("staff_users")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    console.error("deleteStaffUser error", error);
    return null;
  }
  return data ? { id: data.id } : null;
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
    developerCreditName:
      data.developerCreditName ?? data.developer_credit_name ?? "",
    developerCreditUrl:
      data.developerCreditUrl ?? data.developer_credit_url ?? "",
    showDeveloperCredit:
      data.showDeveloperCredit ?? data.show_developer_credit ?? false,
    autoInvoice: data.autoInvoice ?? data.auto_invoice ?? true,
    currency: data.currency ?? "BDT",
    theme: data.theme ?? "light",
    themeTemplate: data.themeTemplate ?? data.theme_template ?? "soft",
    language: data.language ?? "en",
    paymentMethods: data.paymentMethods ?? data.payment_methods ?? [],
    adminGlobalDataAccess:
      data.adminGlobalDataAccess ?? data.admin_global_data_access ?? true,
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
    developer_credit_name: patch.developerCreditName,
    developer_credit_url: patch.developerCreditUrl,
    show_developer_credit: patch.showDeveloperCredit,
    default_rate: patch.defaultRate,
    auto_invoice: patch.autoInvoice,
    currency: patch.currency,
    theme: patch.theme,
    theme_template: patch.themeTemplate,
    language: patch.language,
    payment_methods: patch.paymentMethods,
    admin_global_data_access: patch.adminGlobalDataAccess,
  } as Record<string, unknown>;
  Object.keys(dbPatch).forEach((k) => {
    if (dbPatch[k] === undefined) delete dbPatch[k];
  });

  // There's only one settings row, so we update it or insert if missing
  let { data, error } = await supabase
    .from("system_settings")
    .update(dbPatch)
    .eq("id", 1) // Assuming the settings row has id 1
    .select()
    .maybeSingle();

  if (!data && !error) {
    const insertRes = await supabase
      .from("system_settings")
      .insert([{ id: 1, ...dbPatch }])
      .select()
      .maybeSingle();
    data = insertRes.data;
    error = insertRes.error;
  }

  if (error || !data) {
    console.error("updateSystemSettings error", error);
    return null;
  }
  return {
    defaultRate: Number(data.defaultRate ?? data.default_rate ?? 0),
    agencyName: data.agencyName ?? data.agency_name ?? "",
    agencyAddress: data.agencyAddress ?? data.agency_address ?? "",
    developerCreditName:
      data.developerCreditName ?? data.developer_credit_name ?? "",
    developerCreditUrl:
      data.developerCreditUrl ?? data.developer_credit_url ?? "",
    showDeveloperCredit:
      data.showDeveloperCredit ?? data.show_developer_credit ?? false,
    autoInvoice: data.autoInvoice ?? data.auto_invoice ?? true,
    currency: data.currency ?? "BDT",
    theme: data.theme ?? "light",
    themeTemplate: data.themeTemplate ?? data.theme_template ?? "soft",
    language: data.language ?? "en",
    paymentMethods: data.paymentMethods ?? data.payment_methods ?? [],
    adminGlobalDataAccess:
      data.adminGlobalDataAccess ?? data.admin_global_data_access ?? true,
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
): Promise<LogEntry | null> {
  try {
    const payload = {
      timestamp: formatAuditLogDate(entry.timestamp),
      user_name: entry.user_name ?? "system",
      action: entry.action,
      module: entry.module,
      details: entry.details ?? "",
      type: entry.type ?? "info",
    };
    const { data, error } = await supabase
      .from("audit_logs")
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      timestamp: formatAuditLogDate(
        data.createdAt ?? data.created_at ?? data.timestamp ?? payload.timestamp,
      ),
      createdAt: data.createdAt ?? data.created_at ?? undefined,
      user: data.user_name ?? data.user ?? payload.user_name,
      action: data.action || payload.action,
      module: data.module || payload.module,
      details: data.details || payload.details,
      type: data.type || payload.type,
    };
  } catch (err) {
    console.error("insertAuditLog error", err);
    return null;
  }
}
const toClientDb = (client: Partial<Client>) => ({
  ain: client.ain,
  name: client.name,
  phone: serializeClientPhones(getClientPhones(client)),
  active: client.active,
  circle: client.circle,
});

const fromClientDb = (row: any): Client => {
  const phone = row.phone ?? "";
  const phones = getClientPhones({ phone });
  return {
    ain: row.ain ?? "",
    name: row.name ?? "",
    phone: phones[0] ?? "",
    phones,
    active: Boolean(row.active),
    circle: row.circle ?? "",
  };
};

export interface CustomContactItem {
  id: string;
  name: string;
  phone: string;
}

export async function fetchCustomContacts(supabase: SupabaseClient): Promise<CustomContactItem[]> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_contacts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("fetchCustomContacts warning (table might not exist yet):", error.message);
      return [];
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name ?? "",
      phone: row.phone ?? "",
    }));
  } catch (err) {
    console.error("fetchCustomContacts error", err);
    return [];
  }
}

export async function insertCustomContact(
  supabase: SupabaseClient,
  contact: CustomContactItem
): Promise<CustomContactItem | null> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_contacts")
      .insert({ id: contact.id, name: contact.name, phone: contact.phone })
      .select()
      .single();
    if (error) {
      console.warn("insertCustomContact error:", error.message);
      return null;
    }
    return {
      id: data.id,
      name: data.name ?? contact.name,
      phone: data.phone ?? contact.phone,
    };
  } catch (err) {
    console.error("insertCustomContact error", err);
    return null;
  }
}

export async function deleteCustomContact(
  supabase: SupabaseClient,
  id: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("whatsapp_contacts")
      .delete()
      .eq("id", id);
    if (error) {
      console.warn("deleteCustomContact error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("deleteCustomContact error", err);
    return false;
  }
}

// AIN Tax Records CRUD
export const toAinTaxDb = (record: Partial<AinTaxRecord>) => ({
  year: record.year ?? "",
  ain_name: record.ainName ?? "",
  ain_no: record.ainNo ?? "",
  ref: record.ref ?? "",
  reg_no: record.regNo ?? "",
  date: record.date ?? "",
  type: record.type ?? "",
  total_tax: record.totalTax ?? 0,
  a_no: record.aNo ?? "",
  payment_status: record.paymentStatus ?? "Unpaid",
  payment_date: record.paymentDate ?? "",
  payment_method: record.paymentMethod ?? "",
});

export const fromAinTaxDb = (row: any): AinTaxRecord => ({
  id: row.id,
  year: row.year ?? "",
  ainName: row.ainName ?? row.ain_name ?? "",
  ainNo: row.ainNo ?? row.ain_no ?? "",
  ref: row.ref ?? "",
  regNo: row.regNo ?? row.reg_no ?? "",
  date: row.date ?? "",
  type: row.type ?? "",
  totalTax: Number(row.totalTax ?? row.total_tax ?? 0),
  aNo: row.aNo ?? row.a_no ?? "",
  paymentStatus: (row.paymentStatus ?? row.payment_status ?? "Unpaid") as "Paid" | "Unpaid",
  paymentDate: row.paymentDate ?? row.payment_date ?? "",
  paymentMethod: row.paymentMethod ?? row.payment_method ?? "",
  createdAt: row.createdAt ?? row.created_at ?? undefined,
});

export async function insertAinTaxRecord(
  supabase: SupabaseClient,
  record: Omit<AinTaxRecord, "id" | "createdAt">
): Promise<AinTaxRecord | null> {
  const { data, error } = await supabase
    .from("ain_tax_records")
    .insert(toAinTaxDb(record))
    .select()
    .single();
  if (error) {
    console.error("insertAinTaxRecord error", error);
    throw formatSupabaseError("Insert AIN Tax record", error);
  }
  return fromAinTaxDb(data);
}

export async function bulkInsertAinTaxRecords(
  supabase: SupabaseClient,
  records: Omit<AinTaxRecord, "id" | "createdAt">[]
): Promise<AinTaxRecord[]> {
  const payload = records.map((r) => toAinTaxDb(r));
  const { data, error } = await supabase
    .from("ain_tax_records")
    .insert(payload)
    .select();
  if (error) {
    console.error("bulkInsertAinTaxRecords error", error);
    throw formatSupabaseError("Bulk insert AIN Tax records", error);
  }
  return (data || []).map((row) => fromAinTaxDb(row));
}

export async function updateAinTaxRecord(
  supabase: SupabaseClient,
  id: string,
  record: Partial<AinTaxRecord>
): Promise<AinTaxRecord | null> {
  const dbPatch = toAinTaxDb(record) as Record<string, unknown>;
  Object.keys(dbPatch).forEach((key) => {
    if (dbPatch[key] === undefined) delete dbPatch[key];
  });
  const { data, error } = await supabase
    .from("ain_tax_records")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    console.error("updateAinTaxRecord error", error);
    throw formatSupabaseError("Update AIN Tax record", error);
  }
  return data ? fromAinTaxDb(data) : null;
}

export async function deleteAinTaxRecord(
  supabase: SupabaseClient,
  id: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("ain_tax_records")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    console.error("deleteAinTaxRecord error", error);
    throw formatSupabaseError("Delete AIN Tax record", error);
  }
  return { id };
}


