import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import supabaseDefault, {
  SUPABASE_SITE_URL,
  SUPABASE_SITE_KEY,
} from "./utils/supabaseClient";
import StatsCards from "./components/StatsCards";
import DutyPayment from "./components/DutyPayment";
import AssessmentBilling from "./components/AssessmentBilling";
import AssessmentRecordTab from "./components/AssessmentRecordTab";
import WasteCompanySetup from "./components/WasteCompanySetup";
import WasteManagement from "./components/WasteManagement";
import VendorManagement from "./components/VendorManagement";
import AinDatabase from "./components/AinDatabase";
import AinTaxManagement from "./components/AinTaxManagement";
import AdminPanel from "./components/AdminPanel";
import AuditLogs from "./components/AuditLogs";
import Auth from "./components/Auth";
import DailyReport from "./components/DailyReport";
import { insertAuditLog, updateSystemSettings } from "./utils/supabaseApi";
import {
  BACKUP_STORAGE_KEYS,
  buildBackupPayload,
  DEFAULT_AUTO_BACKUP_FREQUENCY_HOURS,
  downloadBackupFile,
} from "./utils/backup";
import { formatAuditLogDate, parseAuditLogDate } from "./utils/auditLogDate";
import { getClientPhones } from "./utils/clientPhones";
import {
  TabType,
  Client,
  SystemConfig,
  PaymentRecord,
  AssessmentRecord,
  ClearanceRecord,
  WasteCompany,
  WasteRecord,
  Vendor,
  AinTaxRecord,
  StaffUser,
  LogEntry,
} from "./types";

const fixMojibake = (value: string): string =>
  value.replace(/à§³/g, "৳").replace(/â€¢/g, "•");

const sanitizeData = (input: any): any => {
  if (typeof input === "string") return fixMojibake(input);
  if (Array.isArray(input)) return input.map((item) => sanitizeData(item));
  if (input && typeof input === "object") {
    const output: Record<string, any> = {};
    Object.keys(input).forEach((key) => {
      output[key] = sanitizeData(input[key]);
    });
    return output;
  }
  return input;
};

const normalizeDutyRecord = (row: any): PaymentRecord => ({
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
});

const normalizeAssessmentRecord = (row: any): AssessmentRecord => ({
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

const normalizeWasteCompany = (row: any): WasteCompany => ({
  id: row.id,
  name: row.name ?? "",
  phone: row.phone ?? "",
  address: row.address ?? "",
  active: Boolean(row.active),
});

const normalizeVendor = (row: any): Vendor => ({
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



const normalizeClearanceRecord = (row: any): ClearanceRecord => ({
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

const normalizeWasteRecord = (row: any): WasteRecord => ({
  id: row.id,
  date: row.date ?? "",
  companyId: row.companyId ?? row.company_id ?? "",
  companyName: row.companyName ?? row.company_name ?? "",
  carType:
    (row.carType ?? row.car_type ?? "Wastage & Garbage") as WasteRecord["carType"],
  garbageTrips: Number(row.garbageTrips ?? row.garbage_trips ?? 0),
  wastageTrips: Number(row.wastageTrips ?? row.wastage_trips ?? 0),
  totalTrips:
    (Number(row.garbageTrips ?? row.garbage_trips ?? 0) +
      Number(row.wastageTrips ?? row.wastage_trips ?? 0)) ||
    Number(row.totalTrips ?? row.total_trips ?? 0),
  ratePerTrip: Number(row.ratePerTrip ?? row.rate_per_trip ?? 0),
  amount: Number(row.amount ?? 0),
  received: Number(row.received ?? 0),
  due: Number(row.due ?? 0),
  paymentMethod: row.paymentMethod ?? row.payment_method ?? undefined,
  notes: row.notes ?? "",
  status: (row.status ?? "Unpaid") as WasteRecord["status"],
});

const normalizeStaffUser = (row: any): StaffUser => ({
  id: row.id,
  authId: row.authId ?? row.auth_id ?? undefined,
  name: row.name ?? "",
  role: row.role ?? "Staff",
  permissions: row.permissions ?? {},
  lastActive: row.lastActive ?? row.last_active ?? "",
  active: Boolean(row.active),
});

const normalizeAuditLog = (row: any): LogEntry => ({
  id: row.id,
  timestamp: formatAuditLogDate(row.createdAt ?? row.created_at ?? row.timestamp),
  createdAt: row.createdAt ?? row.created_at ?? undefined,
  user: row.user ?? row.user_name ?? "system",
  action: row.action || "",
  module: row.module || "",
  details: row.details || "",
  type: row.type || "info",
});

const normalizeAinTaxRecord = (row: any): AinTaxRecord => ({
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

const normalizeClient = (row: any): Client => {
  const phones = getClientPhones({ phone: row.phone ?? "" });
  return {
    ain: row.ain ?? "",
    name: row.name ?? "",
    phone: phones[0] ?? "",
    phones,
    active: Boolean(row.active),
    circle: row.circle ?? "",
  };
};

const normalizeSystemConfig = (row: any): Partial<SystemConfig> => ({
  agencyName: row.agencyName ?? row.agency_name,
  agencyAddress: row.agencyAddress ?? row.agency_address,
  developerCreditName:
    row.developerCreditName ?? row.developer_credit_name ?? "",
  developerCreditUrl: row.developerCreditUrl ?? row.developer_credit_url ?? "",
  showDeveloperCredit:
    row.showDeveloperCredit ?? row.show_developer_credit ?? false,
  defaultRate: Number(row.defaultRate ?? row.default_rate ?? 0),
  autoInvoice: row.autoInvoice ?? row.auto_invoice,
  currency: row.currency,
  theme: row.theme,
  themeTemplate: row.themeTemplate ?? row.theme_template,
  language: row.language,
  paymentMethods: row.paymentMethods ?? row.payment_methods,
  adminGlobalDataAccess:
    row.adminGlobalDataAccess ?? row.admin_global_data_access ?? true,
});

const getStoredBoolean = (key: string, fallback: boolean): boolean => {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return value === "true";
};

const getStoredNumber = (key: string, fallback: number): number => {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

interface StatDetailView {
  title: string;
  items: string[];
}

const App: React.FC = () => {
  const [dutyCardFilter, setDutyCardFilter] = useState<
    "all" | "collection" | "profit" | "due"
  >("all");
  const [clearanceCardFilter, setClearanceCardFilter] = useState<
    "all" | "collected" | "due"
  >("all");
  const [wasteCardFilter, setWasteCardFilter] = useState<
    "all" | "received" | "due"
  >("all");
  const [session, setSession] = useState<any>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>("duty");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };
  const [activeStatIndex, setActiveStatIndex] = useState<number | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Data State
  const [clients, setClients] = useState<Client[]>([]);
  const [dutyHistory, setDutyHistory] = useState<PaymentRecord[]>([]);
  const [assessmentHistory, setAssessmentHistory] = useState<
    AssessmentRecord[]
  >([]);
  const [clearanceHistory, setClearanceHistory] = useState<ClearanceRecord[]>([]);
  const [wasteCompanies, setWasteCompanies] = useState<WasteCompany[]>([]);
  const [wasteHistory, setWasteHistory] = useState<WasteRecord[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ainTaxHistory, setAinTaxHistory] = useState<AinTaxRecord[]>([]);
  const [visibleDutyRows, setVisibleDutyRows] = useState<PaymentRecord[]>([]);
  const [visibleAssessmentRows, setVisibleAssessmentRows] = useState<
    AssessmentRecord[]
  >([]);
  const [visibleClearanceRows, setVisibleClearanceRows] = useState<
    ClearanceRecord[]
  >([]);
  const [visibleWasteRows, setVisibleWasteRows] = useState<WasteRecord[]>([]);
  const [visibleAinRows, setVisibleAinRows] = useState<Client[]>([]);
  const [visibleAinTaxRows, setVisibleAinTaxRows] = useState<AinTaxRecord[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<LogEntry[]>([]);

  const [config, setConfig] = useState<SystemConfig>({
    defaultRate: 100,
    agencyName: "Customs Duty Pro Ltd.",
    agencyAddress: "House #12, Road #4, Sector #7, Uttara, Dhaka-1230",
    developerCreditName: "",
    developerCreditUrl: "",
    showDeveloperCredit: false,
    autoInvoice: true,
    currency: "BDT",
    theme: "light",
    themeTemplate:
      (localStorage.getItem("ui_theme_template") as
        | SystemConfig["themeTemplate"]
        | null) || "soft",
    language: "en",
    paymentMethods: ["Cash", "Bank", "bKash", "Nagad"],
    adminGlobalDataAccess: true,
    supabaseUrl: SUPABASE_SITE_URL || "",
    supabaseKey: SUPABASE_SITE_KEY || "",
    lastBackup: localStorage.getItem(BACKUP_STORAGE_KEYS.lastBackupAt)
      ? new Date(
          localStorage.getItem(BACKUP_STORAGE_KEYS.lastBackupAt) as string,
        ).toLocaleString()
      : "",
    autoBackupEnabled: getStoredBoolean(
      BACKUP_STORAGE_KEYS.autoBackupEnabled,
      false,
    ),
    autoBackupFrequencyHours: getStoredNumber(
      BACKUP_STORAGE_KEYS.autoBackupFrequencyHours,
      DEFAULT_AUTO_BACKUP_FREQUENCY_HOURS,
    ),
  });

  const supabase = useMemo(() => {
    // Prefer build-time Vite env client if available
    if (SUPABASE_SITE_URL && SUPABASE_SITE_KEY) return supabaseDefault;

    const savedUrl = localStorage.getItem("supabase_url");
    const savedKey = localStorage.getItem("supabase_key");
    if (savedUrl && savedKey) {
      return createClient(savedUrl, savedKey);
    }
    return null;
  }, [config.supabaseUrl, config.supabaseKey]);

  const sortedAuditLogs = useMemo(
    () =>
      [...auditLogs].sort(
        (a, b) =>
          parseAuditLogDate(b.createdAt || b.timestamp) -
          parseAuditLogDate(a.createdAt || a.timestamp),
      ),
    [auditLogs],
  );

  // Check for existing session on mount
  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setIsLoadingSession(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    } else {
      setIsLoadingSession(false);
    }
  }, [supabase]);

  // When session is set, load data and set up realtime subscriptions
  useEffect(() => {
    if (!session || !supabase) return;

    const writeAuditLog = async (
      tableName: string,
      eventType: "INSERT" | "UPDATE" | "DELETE",
      payload: any,
    ) => {
      if (tableName === "audit_logs" || tableName === "staff_users") return;
      const row = eventType === "DELETE" ? payload.old : payload.new;
      const identifier = row?.id || row?.ain || "n/a";
      await insertAuditLog(supabase, {
        user_name: session?.user?.email || "system",
        action: eventType,
        module: tableName,
        details: `Row ${identifier}`,
        type:
          eventType === "DELETE"
            ? "danger"
            : eventType === "UPDATE"
              ? "warning"
              : "success",
      });
    };

    const fetchAndSubscribe = async (
      tableName: string,
      setter: React.Dispatch<React.SetStateAction<any[]>>,
      transform?: (row: any) => any,
    ) => {
      const getRowKey = (row: any) => row?.id ?? row?.ain;

      // Fetch initial data
      const query = supabase.from(tableName).select("*");
      const { data, error } =
        tableName === "audit_logs"
          ? await query.order("created_at", { ascending: false })
          : await query;
      if (error) {
        console.error(`Error fetching ${tableName}:`, error);
      } else {
        setter(
          (data || []).map((rawRow) => {
            const row = sanitizeData(rawRow);
            return transform ? transform(row) : row;
          }),
        );
      }

      // Subscribe to changes
      const channel = supabase
        .channel(`public:${tableName}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: tableName },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const nextRow = sanitizeData(payload.new);
              const record = transform ? transform(nextRow) : nextRow;
              setter((current) => {
                const key = getRowKey(record);
                const next = current.filter((item) => getRowKey(item) !== key);
                return [...next, record];
              });
              writeAuditLog(tableName, "INSERT", payload);
            }
            if (payload.eventType === "UPDATE") {
              const nextRow = sanitizeData(payload.new);
              const record = transform ? transform(nextRow) : nextRow;
              const key = getRowKey(nextRow);
              setter((current) =>
                current.map((item) =>
                  getRowKey(item) === key ? record : item,
                ),
              );
              writeAuditLog(tableName, "UPDATE", payload);
            }
            if (payload.eventType === "DELETE") {
              const oldRow = sanitizeData(payload.old);
              const key = getRowKey(oldRow);
              setter((current) =>
                current.filter((item) => getRowKey(item) !== key),
              );
              writeAuditLog(tableName, "DELETE", payload);
            }
          },
        )
        .subscribe();

      return channel;
    };

    const channels: any[] = [];
    fetchAndSubscribe("clients", setClients, normalizeClient).then((channel) =>
      channels.push(channel),
    );
    fetchAndSubscribe("duty_payments", setDutyHistory, normalizeDutyRecord).then(
      (channel) => channels.push(channel),
    );
    fetchAndSubscribe(
      "assessments",
      setAssessmentHistory,
      normalizeAssessmentRecord,
    ).then((channel) => channels.push(channel));
    fetchAndSubscribe(
      "clearance_records",
      setClearanceHistory,
      normalizeClearanceRecord,
    ).then((channel) => channels.push(channel));
    fetchAndSubscribe(
      "waste_companies",
      setWasteCompanies,
      normalizeWasteCompany,
    ).then((channel) => channels.push(channel));
    fetchAndSubscribe(
      "waste_records",
      setWasteHistory,
      normalizeWasteRecord,
    ).then((channel) => channels.push(channel));
    fetchAndSubscribe("vendors", setVendors, normalizeVendor).then(
      (channel) => channels.push(channel),
    );
    fetchAndSubscribe(
      "ain_tax_records",
      setAinTaxHistory,
      normalizeAinTaxRecord,
    ).then((channel) => channels.push(channel));
    fetchAndSubscribe("staff_users", setUsers, normalizeStaffUser).then(
      (channel) => channels.push(channel),
    );
    fetchAndSubscribe("audit_logs", setAuditLogs, normalizeAuditLog).then(
      (channel) => channels.push(channel),
    );

    // Special handling for system_settings (assuming single row)
    const fetchAndSubscribeSettings = async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setConfig((prev) => ({ ...prev, ...normalizeSystemConfig(data) }));
      }
      const settingsChannel = supabase
        .channel("public:system_settings")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "system_settings" },
          (payload) => {
            setConfig((prev) => ({
              ...prev,
              ...normalizeSystemConfig(payload.new),
            }));
          },
        )
        .subscribe();
      channels.push(settingsChannel);
    };
    fetchAndSubscribeSettings();

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [session, supabase]);

  // Update theme class on config change
  useEffect(() => {
    const templates = ["soft", "paper", "sand", "ink"];
    templates.forEach((tpl) =>
      document.documentElement.classList.remove(`template-${tpl}`),
    );

    if (config.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    const activeTemplate = config.themeTemplate || "soft";
    document.documentElement.classList.add(`template-${activeTemplate}`);
    localStorage.setItem("ui_theme_template", activeTemplate);
  }, [config.theme, config.themeTemplate]);

  useEffect(() => {
    document.documentElement.lang = config.language === "bn" ? "bn" : "en";
  }, [config.language]);

  useEffect(() => {
    localStorage.setItem(
      BACKUP_STORAGE_KEYS.autoBackupEnabled,
      String(Boolean(config.autoBackupEnabled)),
    );
    localStorage.setItem(
      BACKUP_STORAGE_KEYS.autoBackupFrequencyHours,
      String(
        config.autoBackupFrequencyHours || DEFAULT_AUTO_BACKUP_FREQUENCY_HOURS,
      ),
    );
  }, [config.autoBackupEnabled, config.autoBackupFrequencyHours]);

  const handleBackup = useCallback(
    (trigger: "manual" | "auto" = "manual") => {
      const payload = buildBackupPayload({
        config,
        clients,
        dutyHistory,
        assessmentHistory,
        clearanceHistory,
        wasteCompanies,
        wasteHistory,
        vendors,
        ainTaxHistory,
        users,
        trigger,
      });
      downloadBackupFile(payload, config.agencyName);
      localStorage.setItem(BACKUP_STORAGE_KEYS.lastBackupAt, payload.timestamp);
      setConfig((prev) => ({
        ...prev,
        lastBackup: new Date(payload.timestamp).toLocaleString(),
      }));
    },
    [ainTaxHistory, assessmentHistory, clearanceHistory, clients, config, dutyHistory, users, vendors, wasteCompanies, wasteHistory],
  );

  useEffect(() => {
    if (!session || !config.autoBackupEnabled) return;

    const checkForAutoBackup = () => {
      if (document.hidden) return;

      const hasData =
        clients.length > 0 ||
        dutyHistory.length > 0 ||
        assessmentHistory.length > 0 ||
        clearanceHistory.length > 0 ||
        wasteCompanies.length > 0 ||
        wasteHistory.length > 0 ||
        users.length > 0;
      if (!hasData) return;

      const lastBackupAt = localStorage.getItem(BACKUP_STORAGE_KEYS.lastBackupAt);
      const lastBackupMs = lastBackupAt ? Date.parse(lastBackupAt) : 0;
      const intervalMs =
        (config.autoBackupFrequencyHours ||
          DEFAULT_AUTO_BACKUP_FREQUENCY_HOURS) *
        60 *
        60 *
        1000;

      if (!lastBackupMs || Date.now() - lastBackupMs >= intervalMs) {
        handleBackup("auto");
      }
    };

    checkForAutoBackup();
    const timerId = window.setInterval(checkForAutoBackup, 60 * 1000);
    return () => window.clearInterval(timerId);
  }, [
    assessmentHistory.length,
    clearanceHistory.length,
    clients.length,
    config.autoBackupEnabled,
    config.autoBackupFrequencyHours,
    dutyHistory.length,
    handleBackup,
    session,
    users.length,
    wasteCompanies.length,
    wasteHistory.length,
  ]);

  const nextAutoBackupAt = useMemo(() => {
    if (!config.autoBackupEnabled) return "";
    const lastBackupAt = localStorage.getItem(BACKUP_STORAGE_KEYS.lastBackupAt);
    if (!lastBackupAt) return "Runs after the first synced backup";

    const nextRun = new Date(
      Date.parse(lastBackupAt) +
        (config.autoBackupFrequencyHours ||
          DEFAULT_AUTO_BACKUP_FREQUENCY_HOURS) *
          60 *
          60 *
          1000,
    );
    return nextRun.toLocaleString();
  }, [
    config.autoBackupEnabled,
    config.autoBackupFrequencyHours,
    config.lastBackup,
  ]);

  // Handle Login from Auth Component
  const handleLoginSuccess = (newSession: any, url: string, key: string) => {
    localStorage.setItem("supabase_url", url);
    localStorage.setItem("supabase_key", key);
    setConfig((prev) => ({ ...prev, supabaseUrl: url, supabaseKey: key }));
    setSession(newSession);
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      localStorage.removeItem("supabase_url");
      localStorage.removeItem("supabase_key");
      setSession(null);
      setConfig((prev) => ({ ...prev, supabaseUrl: "", supabaseKey: "" }));
    }
  };

  // Translations
  const translations = {
    en: {
      duty: "Duty Payment",
      assessment: "Assessment",
      clearance: "Assesment Record",
      wasteCompanies: "Company Setup",
      waste: "Waste Management",
      vendors: "Vendor Management",
      ain: "AIN Database",
      ainTax: "AIN Tax Due",
      reports: "Reports",
      admin: "Admin Panel",
      logs: "Audit Logs",
      logout: "Logout",
      console: "Enterprise Console",
    },
    bn: {
      duty: "ডিউটি পেমেন্ট",
      assessment: "অ্যাসেসমেন্ট",
      clearance: "অ্যাসেসমেন্ট রেকর্ড",
      wasteCompanies: "কোম্পানি সেটআপ",
      waste: "গারবেজ ও ওয়েস্টেজ",
      vendors: "ভেন্ডার মডিউল",
      ain: "AIN ডাটাবেস",
      ainTax: "AIN ট্যাক্স বকেয়া",
      reports: "রিপোর্ট",
      admin: "এডমিন প্যানেল",
      logs: "অডিট লগ",
      logout: "লগআউট",
      console: "এন্টারপ্রাইজ কনসোল",
    },
  };

  const t = translations[config.language];
  const isDark = config.theme === "dark";
  const currentStaffUser = useMemo(() => {
    const authUserId = session?.user?.id;
    if (!authUserId) return null;
    return users.find((u) => u.authId === authUserId) || null;
  }, [session, users]);
  const currentUserRole = useMemo(() => {
    if (!currentStaffUser || !currentStaffUser.active) return "User";
    return currentStaffUser.role || "User";
  }, [currentStaffUser]);
  const isAdminUser = currentUserRole === "Admin";
  const hasPermission = useCallback(
    (key: string) => {
      if (isAdminUser) return true;
      return Boolean(currentStaffUser?.permissions?.[key]);
    },
    [currentStaffUser, isAdminUser],
  );
  const canAccessDutyModule = useMemo(
    () =>
      hasPermission("bill_add") ||
      hasPermission("bill_edit") ||
      hasPermission("bill_delete") ||
      hasPermission("bill_bulk_pay") ||
      hasPermission("bill_export") ||
      hasPermission("bill_wa_share") ||
      hasPermission("invoice_print"),
    [hasPermission],
  );
  const canAccessAssessmentModule = canAccessDutyModule;
  const canAccessClearanceModule = canAccessDutyModule;
  const canAccessWasteCompanyModule = canAccessDutyModule;
  const canAccessWasteModule = canAccessDutyModule;
  const canAccessVendorModule = canAccessDutyModule;
  const canAccessAinModule = hasPermission("ain_view");
  const canAccessAinTaxModule = canAccessDutyModule || hasPermission("ain_tax_view") || hasPermission("ain_view");
  const canAccessReportsModule = hasPermission("report_view");
  const canAccessLogsModule = hasPermission("view_logs");
  const canAccessAdminModule = isAdminUser;
  const tabAccess = useMemo<Record<TabType, boolean>>(
    () => ({
      duty: canAccessDutyModule,
      assessment: canAccessAssessmentModule,
      clearance: canAccessClearanceModule,
      wasteCompanies: canAccessWasteCompanyModule,
      waste: canAccessWasteModule,
      vendors: canAccessVendorModule,
      ain: canAccessAinModule,
      ainTax: canAccessAinTaxModule,
      reports: canAccessReportsModule,
      admin: canAccessAdminModule,
      logs: canAccessLogsModule,
      settings: false,
    }),
    [
      canAccessAdminModule,
      canAccessAinModule,
      canAccessAinTaxModule,
      canAccessAssessmentModule,
      canAccessClearanceModule,
      canAccessWasteCompanyModule,
      canAccessDutyModule,
      canAccessWasteModule,
      canAccessReportsModule,
      canAccessLogsModule,
    ],
  );

  const handleOpenProfileModal = useCallback(() => {
    setProfileName(
      currentStaffUser?.name ||
        session?.user?.user_metadata?.full_name ||
        session?.user?.email?.split("@")?.[0] ||
        "",
    );
    setProfileEmail(session?.user?.email || "");
    setProfilePassword("");
    setProfileConfirmPassword("");
    setProfileError(null);
    setProfileSuccess(null);
    setShowProfileModal(true);
  }, [currentStaffUser, session]);

  const handleUpdateProfile = useCallback(async () => {
    if (!supabase || !session?.user) return;

    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);

    try {
      const normalizedName = profileName.trim();
      const normalizedEmail = profileEmail.trim();
      const currentEmail = session.user.email || "";
      const nextPassword = profilePassword.trim();

      if (!normalizedName) {
        throw new Error("Name is required.");
      }
      if (!normalizedEmail) {
        throw new Error("Email is required.");
      }
      if (nextPassword) {
        if (nextPassword.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        if (nextPassword !== profileConfirmPassword.trim()) {
          throw new Error("Password confirmation does not match.");
        }
      }

      const userUpdates: {
        email?: string;
        password?: string;
        data: { full_name: string };
      } = {
        data: { full_name: normalizedName },
      };

      if (normalizedEmail !== currentEmail) {
        userUpdates.email = normalizedEmail;
      }
      if (nextPassword) {
        userUpdates.password = nextPassword;
      }

      const { data: authData, error: authError } =
        await supabase.auth.updateUser(userUpdates);
      if (authError) {
        throw authError;
      }

      const now = new Date().toLocaleString();
      const { error: staffError } = await supabase
        .from("staff_users")
        .update({
          name: normalizedName,
          last_active: now,
        })
        .eq("auth_id", session.user.id);
      if (staffError) {
        throw staffError;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.authId === session.user.id
            ? { ...u, name: normalizedName, lastActive: now }
            : u,
        ),
      );

      if (authData?.user) {
        setSession((prev: any) =>
          prev
            ? {
                ...prev,
                user: {
                  ...prev.user,
                  ...authData.user,
                },
              }
            : prev,
        );
      }

      await insertAuditLog(supabase, {
        user_name: normalizedEmail || currentEmail || "system",
        action: "UPDATE",
        module: "profile",
        details: "Profile information updated",
        type: "warning",
      });

      setProfilePassword("");
      setProfileConfirmPassword("");
      setProfileSuccess(
        normalizedEmail !== currentEmail
          ? "Profile updated. Check your inbox to confirm email change."
          : "Profile updated successfully.",
      );
    } catch (error: any) {
      setProfileError(error?.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    profileName,
    profileEmail,
    profilePassword,
    profileConfirmPassword,
    session,
    supabase,
  ]);

  const allTabs = [
    { id: "duty", label: t.duty, icon: "fa-file-invoice" },
    { id: "assessment", label: t.assessment, icon: "fa-calculator" },
    { id: "clearance", label: t.clearance, icon: "fa-clipboard-check" },
    { id: "vendors", label: t.vendors, icon: "fa-store" },
    { id: "waste", label: t.waste, icon: "fa-truck-moving" },
    { id: "wasteCompanies", label: t.wasteCompanies, icon: "fa-building" },
    { id: "ain", label: t.ain, icon: "fa-database" },
    { id: "ainTax", label: t.ainTax, icon: "fa-receipt" },
    { id: "reports", label: t.reports, icon: "fa-chart-line" },
    { id: "logs", label: t.logs, icon: "fa-list-check" },
  ];
  if (isAdminUser) {
    allTabs.splice(4, 0, { id: "admin", label: t.admin, icon: "fa-shield-halved" });
  }
  const navTabs = allTabs.filter((tab) => tabAccess[tab.id as TabType]);

  useEffect(() => {
    if (!tabAccess[activeTab]) {
      const fallbackTab = navTabs.find((tab) => tabAccess[tab.id as TabType]);
      if (fallbackTab) {
        setActiveTab(fallbackTab.id as TabType);
      }
    }
  }, [activeTab, navTabs, tabAccess]);

  const stats = useMemo(() => {
    switch (activeTab) {
      case "ainTax": {
        const rows = visibleAinTaxRows;
        const totalTaxSum = rows.reduce((acc, r) => acc + (r.totalTax || 0), 0);
        const uniqueAins = new Set(
          rows.map((r) => r.ainNo || r.ainName).filter(Boolean),
        ).size;
        const topTax =
          rows.length > 0
            ? Math.max(...rows.map((r) => r.totalTax || 0))
            : 0;
        return [
          {
            label:
              config.language === "en" ? "Total Tax Due" : "মোট ট্যাক্স বাকী",
            value: `Tk ${totalTaxSum.toLocaleString("en-BD")}`,
            color: "#ef4444",
          },
          {
            label: config.language === "en" ? "Total Entries" : "মোট এন্ট্রি",
            value: rows.length.toLocaleString(),
            color: "#2563eb",
          },
          {
            label: config.language === "en" ? "Unique AINs" : "ইউনিক AIN",
            value: uniqueAins.toLocaleString(),
            color: "#f59e0b",
          },
          {
            label:
              config.language === "en"
                ? "Highest Tax Due"
                : "সর্বোচ্চ একক বাকী",
            value: `Tk ${topTax.toLocaleString("en-BD")}`,
            color: "#10b981",
          },
        ];
      }
      case "ain":
        {
          const rows = visibleAinRows;
        return [
          {
            label: config.language === "en" ? "Total Database" : "মোট ডাটাবেস",
            value: rows.length,
            color: "#2563eb",
          },
          {
            label: config.language === "en" ? "Verified" : "ভেরিফাইড",
            value: rows.filter((c) => c.phone).length,
            color: "#10b981",
          },
          {
            label: config.language === "en" ? "Active" : "সক্রিয়",
            value: rows.filter((c) => c.active).length,
            color: "#3b82f6",
          },
          {
            label: config.language === "en" ? "Version" : "ভার্সন",
            value: "Pro v3.6",
            color: "#f59e0b",
          },
        ];
      }
      case "assessment": {
        const rows = visibleAssessmentRows;
        const totalNet = rows.reduce((acc, r) => acc + r.net, 0);
        const totalReceived = rows.reduce(
          (acc, r) => acc + r.received,
          0,
        );
        const totalBeCount = rows.reduce(
          (acc, r) => acc + Number(r.nosOfBe || 0),
          0,
        );
        const outstanding = Math.max(0, totalNet - totalReceived);
        return [
          {
            label: "Total Billed",
            value: `Tk ${totalNet.toLocaleString()}`,
            color: "#2563eb",
          },
          {
            label: "Received",
            value: `Tk ${totalReceived.toLocaleString()}`,
            color: "#10b981",
          },
            {
              label: "Due Amount",
              value: `Tk ${outstanding.toLocaleString()}`,
              color: "#ef4444",
            },
            {
              label: "Total B/E",
              value: totalBeCount.toLocaleString(),
              color: "#f59e0b",
            },
        ];
      }
      case "clearance": {
        const rows = visibleClearanceRows;
        const totalPaid = rows
          .filter((r) => r.paymentStatus === "Paid")
          .reduce((sum, r) => sum + (r.dutyTax || 0), 0);
        const totalUnpaid = rows
          .filter((r) => r.paymentStatus !== "Paid")
          .reduce((sum, r) => sum + (r.dutyTax || 0), 0);
        const unpaidCount = rows.filter((r) => r.paymentStatus !== "Paid").length;
        const totalAssessable = rows.reduce((sum, r) => sum + (r.assessableValue || 0), 0);
        
        return [
          {
            label: config.language === "en" ? "Revenue Collected" : "সংগৃহীত শুল্ক",
            value: `Tk ${totalPaid.toLocaleString("en-BD")}`,
            color: "#10b981",
          },
          {
            label: config.language === "en" ? "Pending Revenue" : "বকেয়া শুল্ক",
            value: `Tk ${totalUnpaid.toLocaleString("en-BD")}`,
            color: "#ef4444",
          },
          {
            label: config.language === "en" ? "Unpaid Count" : "অ পরিশোধিত এন্ট্রি",
            value: unpaidCount.toString().padStart(2, "0"),
            color: "#f59e0b",
          },
          {
            label: config.language === "en" ? "Assessable Value" : "শুল্কায়নযোগ্য মূল্য",
            value: `Tk ${totalAssessable.toLocaleString("en-BD")}`,
            color: "#3b82f6",
          },
        ];
      }
      case "wasteCompanies": {
        const totalCompanies = wasteCompanies.length;
        const activeCompanies = wasteCompanies.filter((company) => company.active).length;
        const inactiveCompanies = totalCompanies - activeCompanies;
        const withPhone = wasteCompanies.filter((company) => Boolean(company.phone)).length;
        return [
          { label: "Total Company", value: totalCompanies, color: "#2563eb" },
          { label: "Active", value: activeCompanies, color: "#10b981" },
          { label: "Inactive", value: inactiveCompanies, color: "#ef4444" },
          { label: "With Phone", value: withPhone, color: "#f59e0b" },
        ];
      }
      case "waste": {
        const rows = visibleWasteRows;
        const totalAmount = rows.reduce((acc, r) => acc + (r.amount || 0), 0);
        const totalReceived = rows.reduce((acc, r) => acc + (r.received || 0), 0);
        const totalDue = rows.reduce((acc, r) => acc + (r.due || 0), 0);
        const totalTrips = rows.reduce((acc, r) => acc + (r.totalTrips || 0), 0);
        const garbageTrips = rows.reduce((acc, r) => acc + (r.garbageTrips || 0), 0);
        return [
          {
            label: "Total Bill",
            value: `Tk ${totalAmount.toLocaleString()}`,
            color: "#2563eb",
            subtitle: `${rows.length.toLocaleString()} entries`,
          },
          {
            label: "Received",
            value: `Tk ${totalReceived.toLocaleString()}`,
            color: "#10b981",
            subtitle: `${rows.filter((r) => (r.received || 0) > 0).length.toLocaleString()} entries`,
          },
          {
            label: "Due",
            value: `Tk ${totalDue.toLocaleString()}`,
            color: "#ef4444",
            subtitle: `${rows.filter((r) => (r.due || 0) > 0).length.toLocaleString()} entries`,
          },
          {
            label: "Trips",
            value: totalTrips.toLocaleString(),
            color: "#f59e0b",
            subtitle: `${garbageTrips.toLocaleString()} garbage`,
          },
        ];
      }
      case "admin": {
        const totalUsers = users.length;
        const activeUsers = users.filter((u) => u.active).length;
        const admins = users.filter((u) => u.role === "Admin").length;
        const inactive = totalUsers - activeUsers;
        return [
          { label: "Total Users", value: totalUsers, color: "#2563eb" },
          { label: "Active Users", value: activeUsers, color: "#10b981" },
          { label: "Admins", value: admins, color: "#f59e0b" },
          { label: "Inactive", value: inactive, color: "#ef4444" },
        ];
      }
      case "logs": {
        const totalLogs = sortedAuditLogs.length;
        const warningCount = sortedAuditLogs.filter((l) => l.type === "warning").length;
        const dangerCount = sortedAuditLogs.filter((l) => l.type === "danger").length;
        const successCount = sortedAuditLogs.filter((l) => l.type === "success").length;
        return [
          { label: "Total Logs", value: totalLogs, color: "#2563eb" },
          { label: "Success", value: successCount, color: "#10b981" },
          { label: "Warnings", value: warningCount, color: "#f59e0b" },
          { label: "Critical", value: dangerCount, color: "#ef4444" },
        ];
      }
      default: {
        const rows = visibleDutyRows;
        const paidRows = rows.filter(
          (r) => String(r.status || "").trim().toLowerCase() === "paid",
        );
        const dueRows = rows.filter((r) => Math.max(0, r.duty - (r.received || 0)) > 0);
        const collectionRows = rows.filter((r) => (r.received || 0) > 0);
        const grossDuty = rows.reduce((acc, r) => acc + r.duty, 0);
        const collection = rows.reduce(
          (acc, r) => acc + r.received,
          0,
        );
        const profit = paidRows.reduce(
          (acc, r) => acc + ((r.received || 0) - (r.duty || 0)),
          0,
        );
        const dueAmount = rows.reduce(
          (acc, r) => acc + Math.max(0, r.duty - (r.received || 0)),
          0,
        );
        return [
          {
            label: "Gross Duty",
            value: `Tk ${grossDuty.toLocaleString()}`,
            color: "#2563eb",
            subtitle: `${rows.length.toLocaleString()} B/E`,
          },
          {
            label: "Collection",
            value: `Tk ${collection.toLocaleString()}`,
            color: "#10b981",
            subtitle: `${collectionRows.length.toLocaleString()} B/E`,
          },
          {
            label: "Profit",
            value: `Tk ${profit.toLocaleString()}`,
            color: "#f59e0b",
            subtitle: `${paidRows.length.toLocaleString()} B/E`,
          },
          {
            label: "Due",
            value: `Tk ${dueAmount.toLocaleString()}`,
            color: "#ef4444",
            subtitle: `${dueRows.length.toLocaleString()} B/E`,
          },
        ];
      }
    }
  }, [
    activeTab,
    config,
    visibleDutyRows,
    visibleAssessmentRows,
    visibleClearanceRows,
    visibleWasteRows,
    visibleAinRows,
    wasteCompanies,
    users,
    sortedAuditLogs,
  ]);

  useEffect(() => {
    setActiveStatIndex(null);
    setDutyCardFilter("all");
    setClearanceCardFilter("all");
    setWasteCardFilter("all");
  }, [activeTab]);

  const statDetail = useMemo<StatDetailView | null>(() => {
    if (activeStatIndex === null || !stats[activeStatIndex]) return null;
    const money = (n: number) => `Tk ${n.toLocaleString("en-BD")}`;

    switch (activeTab) {
      case "duty": {
        if (activeStatIndex === 0) {
          const totalRecords = visibleDutyRows.length;
          const avgDuty =
            totalRecords > 0
              ? visibleDutyRows.reduce((acc, r) => acc + (r.duty || 0), 0) /
                totalRecords
              : 0;
          return {
            title: "Gross Duty Details",
            items: [
              `Total Records: ${totalRecords}`,
              `Average Duty per Record: ${money(Math.round(avgDuty))}`,
            ],
          };
        }
        if (activeStatIndex === 1) {
          const withReceived = visibleDutyRows.filter((r) => (r.received || 0) > 0);
          return {
            title: "Collection Details",
            items: [
              `Records with Collection: ${withReceived.length}`,
              `Fully Paid Records: ${visibleDutyRows.filter((r) => String(r.status || "").trim().toLowerCase() === "paid").length}`,
            ],
          };
        }
        if (activeStatIndex === 2) {
          const paidRows = visibleDutyRows.filter(
            (r) => String(r.status || "").trim().toLowerCase() === "paid",
          );
          return {
            title: "Profit Details",
            items: [
              `Paid Records Count: ${paidRows.length}`,
              `Unpaid Records Count: ${Math.max(0, visibleDutyRows.length - paidRows.length)}`,
            ],
          };
        }
        return null;
      }
      case "assessment": {
        if (activeStatIndex === 0) {
          return {
            title: "Total Billed Details",
            items: [
              `Total Rows: ${visibleAssessmentRows.length}`,
              `Total B/E Count: ${visibleAssessmentRows.reduce((acc, r) => acc + Number(r.nosOfBe || 0), 0).toLocaleString("en-BD")}`,
            ],
          };
        }
        if (activeStatIndex === 1) {
          const paid = visibleAssessmentRows.filter(
            (r) => String(r.status || "").trim().toLowerCase() === "paid",
          ).length;
          return {
            title: "Received Details",
            items: [
              `Paid Rows: ${paid}`,
              `Unpaid Rows: ${Math.max(0, visibleAssessmentRows.length - paid)}`,
            ],
          };
        }
        if (activeStatIndex === 2) {
          return null;
        }
        return {
          title: "Total B/E Details",
          items: [
            `Rows Count: ${visibleAssessmentRows.length}`,
            `Combined B/E Quantity: ${visibleAssessmentRows.reduce((acc, r) => acc + Number(r.nosOfBe || 0), 0).toLocaleString("en-BD")}`,
          ],
        };
      }
      case "clearance": {
        if (activeStatIndex === 0) {
          const rows = visibleClearanceRows;
          const paid = rows.filter((r) => r.paymentStatus === "Paid");
          const totalPaid = paid.reduce((sum, r) => sum + (r.dutyTax || 0), 0);
          return {
            title: config.language === "en" ? "Revenue Collected Details" : "সংগৃহীত শুল্কের বিবরণ",
            items: [
              `Paid Rows: ${paid.length}`,
              `Total Collected: Tk ${totalPaid.toLocaleString("en-BD")}`,
            ],
          };
        }
        if (activeStatIndex === 1) {
          const rows = visibleClearanceRows;
          const unpaid = rows.filter((r) => r.paymentStatus !== "Paid");
          const totalUnpaid = unpaid.reduce((sum, r) => sum + (r.dutyTax || 0), 0);
          return {
            title: config.language === "en" ? "Pending Revenue Details" : "বকেয়া শুল্কের বিবরণ",
            items: [
              `Unpaid Rows: ${unpaid.length}`,
              `Total Pending: Tk ${totalUnpaid.toLocaleString("en-BD")}`,
            ],
          };
        }
        if (activeStatIndex === 2) {
          const rows = visibleClearanceRows;
          const unpaidCount = rows.filter((r) => r.paymentStatus !== "Paid").length;
          return {
            title: config.language === "en" ? "Unpaid Count Details" : "অ পরিশোধিত বিবরণ",
            items: [
              `Total Unpaid Entries: ${unpaidCount}`,
              `Latest Pending: ${rows.find((r) => r.paymentStatus !== "Paid")?.clientName || "-"}`,
            ],
          };
        }
        const rows = visibleClearanceRows;
        const totalAssessable = rows.reduce((sum, r) => sum + (r.assessableValue || 0), 0);
        return {
          title: config.language === "en" ? "Assessable Value Details" : "শুল্কায়নযোগ্য মূল্যের বিবরণ",
          items: [
            `Total Rows: ${rows.length}`,
            `Total Value: Tk ${totalAssessable.toLocaleString("en-BD")}`,
          ],
        };
      }
      case "waste": {
        if (activeStatIndex === 0) {
          return {
            title: "Waste Billing Details",
            items: [
              `Entries: ${visibleWasteRows.length}`,
              `Companies: ${new Set(visibleWasteRows.map((row) => row.companyId)).size}`,
            ],
          };
        }
        if (activeStatIndex === 1) {
          return {
            title: "Collection Details",
            items: [
              `Received Entries: ${visibleWasteRows.filter((row) => (row.received || 0) > 0).length}`,
              `Paid Entries: ${visibleWasteRows.filter((row) => row.status === "Paid").length}`,
            ],
          };
        }
        if (activeStatIndex === 2) {
          return {
            title: "Due Details",
            items: [
              `Entries With Due: ${visibleWasteRows.filter((row) => (row.due || 0) > 0).length}`,
              `Outstanding Due: ${money(visibleWasteRows.reduce((sum, row) => sum + (row.due || 0), 0))}`,
            ],
          };
        }
        return {
          title: "Trip Details",
          items: [
            `Garbage Trips: ${visibleWasteRows.reduce((sum, row) => sum + (row.garbageTrips || 0), 0)}`,
            `Wastage Trips: ${visibleWasteRows.reduce((sum, row) => sum + (row.wastageTrips || 0), 0)}`,
          ],
        };
      }
      case "wasteCompanies": {
        return {
          title: `${stats[activeStatIndex].label} Details`,
          items: [
            `Total Companies: ${wasteCompanies.length}`,
            `Active Companies: ${wasteCompanies.filter((company) => company.active).length}`,
            `Inactive Companies: ${wasteCompanies.filter((company) => !company.active).length}`,
          ],
        };
      }
      case "ain": {
        const noPhone = visibleAinRows.filter((c) => !c.phone).length;
        const inactive = visibleAinRows.filter((c) => !c.active).length;
        return {
          title: `${stats[activeStatIndex].label} Details`,
          items: [
            `Total AIN in View: ${visibleAinRows.length}`,
            `Without Phone: ${noPhone}`,
            `Inactive AIN: ${inactive}`,
          ],
        };
      }
      case "ainTax": {
        const rows = visibleAinTaxRows;
        const totalTaxSum = rows.reduce((acc, r) => acc + (r.totalTax || 0), 0);
        const uniqueAins = new Set(
          rows.map((r) => r.ainNo || r.ainName).filter(Boolean),
        ).size;
        return {
          title: `${stats[activeStatIndex].label} Details`,
          items: [
            `Total Filtered Entries: ${rows.length}`,
            `Total Tax Due: Tk ${totalTaxSum.toLocaleString("en-BD")}`,
            `Unique AIN Holders: ${uniqueAins}`,
          ],
        };
      }
      case "logs": {
        const latest = sortedAuditLogs
          .slice(0, 8)
          .map(
            (l) =>
              `${formatAuditLogDate(l.createdAt ?? l.timestamp)} | ${l.module} | ${l.action}`,
          );
        return {
          title: `${stats[activeStatIndex].label} Details`,
          items: latest.length > 0 ? latest : ["No logs available."],
        };
      }
      case "admin": {
        return {
          title: `${stats[activeStatIndex].label} Details`,
          items: [
            `Total Users: ${users.length}`,
            `Active: ${users.filter((u) => u.active).length}`,
            `Inactive: ${users.filter((u) => !u.active).length}`,
          ],
        };
      }
      default:
        return null;
    }
  }, [
    activeStatIndex,
    activeTab,
    stats,
    visibleDutyRows,
    visibleAssessmentRows,
    visibleClearanceRows,
    visibleWasteRows,
    visibleAinRows,
    wasteCompanies,
    sortedAuditLogs,
    users,
  ]);

  // Loading Screen
  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f172a]">
        <i className="fas fa-circle-notch animate-spin text-3xl text-blue-600"></i>
      </div>
    );
  }

  // Auth Screen if no session
  if (!session) {
    return (
      <Auth
        onLogin={handleLoginSuccess}
        initialConfig={{
          url: config.supabaseUrl || "",
          key: config.supabaseKey || "",
        }}
      />
    );
  }

  // Main App
  return (
    <div
      className={`h-screen flex flex-col overflow-hidden font-sans selection:bg-blue-100 transition-colors duration-300 ${config.theme === "dark" ? "bg-[#0f172a] text-slate-200" : "bg-[#f8fafc] text-slate-900"}`}
    >
      {/* Top Header Bar */}
      <header
        className={`px-4 py-2.5 shrink-0 z-40 shadow-sm backdrop-blur-md border-b transition-colors ${
          config.theme === "dark"
            ? "bg-[#1e293b]/90 border-slate-800"
            : "bg-white/90 border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Hamburger (mobile), Sidebar Toggle (desktop), Agency Brand & Active Breadcrumb */}
          <div className="flex items-center gap-3">
            {/* Mobile drawer toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`p-2 rounded-xl border md:hidden transition-all ${
                config.theme === "dark"
                  ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
              title="Menu"
            >
              <i className="fa-solid fa-bars text-sm"></i>
            </button>

            {/* Desktop collapse toggle */}
            <button
              onClick={toggleSidebar}
              className={`hidden md:flex p-2 rounded-xl border transition-all ${
                config.theme === "dark"
                  ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <i className={`fa-solid ${isSidebarCollapsed ? "fa-indent" : "fa-outdent"} text-sm`}></i>
            </button>

            {/* Logo & Agency Name */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold">
                <i className="fas fa-cube text-base"></i>
              </div>
              <div className="hidden sm:flex flex-col">
                <h1 className="text-base font-black tracking-tight leading-none">
                  {config.agencyName}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-[9px] font-black opacity-50 uppercase tracking-widest">
                    {t.console} 2.0
                  </span>
                </div>
              </div>
            </div>

            {/* Active View Breadcrumb Badge */}
            <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-300 dark:border-slate-700">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center gap-2">
                <i className={`fas ${navTabs.find((t) => t.id === activeTab)?.icon}`}></i>
                {navTabs.find((t) => t.id === activeTab)?.label}
              </span>
            </div>
          </div>

          {/* Right Header Quick Controls */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex flex-col items-end mr-2">
              <span className="text-xs font-bold dark:text-white">
                {session.user.email}
              </span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                {currentUserRole}
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setConfig((prev) => ({ ...prev, language: "en" }))}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${config.language === "en" ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white" : "text-slate-400"}`}
              >
                ENG
              </button>
              <button
                onClick={() => setConfig((prev) => ({ ...prev, language: "bn" }))}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${config.language === "bn" ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white" : "text-slate-400"}`}
              >
                BAN
              </button>
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></div>
              <button
                onClick={() => {
                  const nextTheme = isDark ? "light" : "dark";
                  setConfig((prev) => ({ ...prev, theme: nextTheme }));
                  if (supabase) {
                    updateSystemSettings(supabase, { theme: nextTheme });
                  }
                }}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${isDark ? "text-yellow-400" : "text-slate-400 hover:text-slate-600"}`}
                title="Toggle Theme"
              >
                <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`}></i>
              </button>
            </div>

            {isAdminUser && (
              <button
                onClick={() => setActiveTab("admin")}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 border ${activeTab === "admin" ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-500"}`}
                title={t.admin}
              >
                <i className="fas fa-cog text-sm"></i>
              </button>
            )}

            <button
              onClick={handleOpenProfileModal}
              className="bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm border border-slate-200 dark:border-slate-700"
              title="Profile"
            >
              <i className="fas fa-user text-sm"></i>
            </button>

            <button
              onClick={handleLogout}
              className="bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-600 hover:text-white w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm border border-red-100 dark:border-red-900/30"
              title={t.logout}
            >
              <i className="fas fa-power-off text-sm"></i>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with Independent Scrolling Sidebar and Content */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Desktop Collapsible Left Sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r h-full transition-all duration-300 ease-in-out shrink-0 ${
            isSidebarCollapsed ? "w-20" : "w-64"
          } ${
            config.theme === "dark"
              ? "bg-[#1e293b]/70 border-slate-800"
              : "bg-white/90 border-slate-200"
          }`}
        >
          <div className="p-3 flex-1 overflow-y-auto space-y-1">
            {!isSidebarCollapsed && (
              <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                {config.language === "bn" ? "মডিউলসমূহ" : "MODULES"}
              </p>
            )}

            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  title={isSidebarCollapsed ? tab.label : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                    isSidebarCollapsed ? "justify-center" : "justify-start"
                  } ${
                    isActive
                      ? config.theme === "dark"
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                      : config.theme === "dark"
                      ? "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <i
                    className={`fas ${tab.icon} text-base transition-transform ${
                      isActive ? "scale-110" : "opacity-70"
                    }`}
                  ></i>
                  {!isSidebarCollapsed && (
                    <span className="uppercase tracking-wider font-extrabold truncate">
                      {tab.label}
                    </span>
                  )}
                  {!isSidebarCollapsed && isActive && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-white animate-pulse"></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sidebar Footer Collapse Toggle */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={toggleSidebar}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isSidebarCollapsed ? "justify-center" : "justify-start"
              } ${
                config.theme === "dark"
                  ? "bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
            >
              <i
                className={`fa-solid ${
                  isSidebarCollapsed ? "fa-angles-right" : "fa-angles-left"
                } text-sm`}
              ></i>
              {!isSidebarCollapsed && (
                <span className="uppercase tracking-wider text-[11px]">
                  {config.language === "bn" ? "ছোট করুন" : "Collapse"}
                </span>
              )}
            </button>
          </div>
        </aside>

        {/* Mobile Slide-over Overlay Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            ></div>

            {/* Mobile Drawer Content */}
            <div
              className={`relative flex-1 max-w-xs w-full flex flex-col p-4 shadow-2xl transition-all ${
                config.theme === "dark"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900"
              }`}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-700/50 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md">
                    <i className="fas fa-cube text-sm"></i>
                  </div>
                  <span className="font-bold text-sm truncate">{config.agencyName}</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg opacity-60 hover:opacity-100"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1">
                {navTabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as TabType);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? config.theme === "dark"
                            ? "bg-blue-600 text-white shadow-lg"
                            : "bg-slate-900 text-white shadow-lg"
                          : config.theme === "dark"
                          ? "text-slate-400 hover:bg-slate-800"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <i className={`fas ${tab.icon} text-base`}></i>
                      <span className="uppercase tracking-widest">{tab.label}</span>
                      {isActive && <i className="fas fa-check ml-auto"></i>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Primary Workspace */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-8 w-full">
        <StatsCards
          cards={stats}
          activeIndex={activeStatIndex}
          onCardClick={(index) => {
            if (activeTab === "duty") {
              setActiveStatIndex((prev) => {
                const isSame = prev === index;
                if (isSame) {
                  setDutyCardFilter("all");
                  return null;
                }
                const mapped: "all" | "collection" | "profit" | "due" =
                  index === 1
                    ? "collection"
                    : index === 2
                      ? "profit"
                      : index === 3
                        ? "due"
                        : "all";
                setDutyCardFilter(mapped);
                if (index === 3) return null;
                return index;
              });
              return;
            }
            if (activeTab === "clearance") {
              setActiveStatIndex((prev) => {
                const isSame = prev === index;
                if (isSame) {
                  setClearanceCardFilter("all");
                  return null;
                }
                const mapped: "all" | "collected" | "due" =
                  index === 0
                    ? "collected"
                    : index === 1 || index === 2
                      ? "due"
                      : "all";
                setClearanceCardFilter(mapped);
                return index;
              });
              return;
            }
            if (activeTab === "waste") {
              setActiveStatIndex((prev) => {
                const isSame = prev === index;
                if (isSame) {
                  setWasteCardFilter("all");
                  return null;
                }
                const mapped: "all" | "received" | "due" =
                  index === 1
                    ? "received"
                    : index === 2
                      ? "due"
                      : "all";
                setWasteCardFilter(mapped);
                return index;
              });
              return;
            }
            if (activeTab === "assessment" && index === 2) {
              setActiveStatIndex(null);
              return;
            }
            setActiveStatIndex((prev) => (prev === index ? null : index));
          }}
        />
        {statDetail && (
          <div
            className={`mb-6 rounded-2xl border p-4 ${
              isDark
                ? "bg-slate-900/60 border-slate-700 text-slate-200"
                : "bg-white border-slate-200 text-slate-700"
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-extrabold tracking-wide uppercase">
                {statDetail.title}
              </p>
              <button
                onClick={() => setActiveStatIndex(null)}
                className={`text-xs font-bold px-2 py-1 rounded ${
                  isDark
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Close
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {statDetail.items.map((item, idx) => (
                <p key={`${item}-${idx}`}>{item}</p>
              ))}
            </div>
          </div>
        )}
        {!isAdminUser && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-xs font-bold ${
              isDark
                ? "bg-slate-800 border-slate-700 text-slate-300"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            Your access is limited by role permissions. Contact an admin if you
            need additional modules.
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {!isAdminUser &&
            ((activeTab === "duty" && visibleDutyRows.length === 0) ||
              (activeTab === "assessment" &&
                visibleAssessmentRows.length === 0) ||
              (activeTab === "clearance" &&
                visibleClearanceRows.length === 0) ||
              (activeTab === "wasteCompanies" && wasteCompanies.length === 0) ||
              (activeTab === "waste" && visibleWasteRows.length === 0) ||
              (activeTab === "ain" && visibleAinRows.length === 0) ||
              (activeTab === "ainTax" && visibleAinTaxRows.length === 0) ||
              (activeTab === "logs" && auditLogs.length === 0)) && (
              <div
                className={`mb-4 rounded-xl border px-4 py-3 text-xs font-bold ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-slate-300"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}
              >
                No records available in this view for your account.
              </div>
            )}
          {activeTab === "duty" && tabAccess.duty && (
            <DutyPayment
              clients={clients}
              history={dutyHistory}
              setHistory={setDutyHistory}
              onVisibleRowsChange={setVisibleDutyRows}
              systemConfig={config}
              supabase={supabase}
              dashboardFilter={dutyCardFilter}
            />
          )}
          {activeTab === "assessment" && tabAccess.assessment && (
            <AssessmentBilling
              clients={clients}
              systemConfig={config}
              history={assessmentHistory}
              setHistory={setAssessmentHistory}
              onVisibleRowsChange={setVisibleAssessmentRows}
              supabase={supabase}
            />
          )}
          {activeTab === "clearance" && tabAccess.clearance && (
            <AssessmentRecordTab
              history={clearanceHistory}
              setHistory={setClearanceHistory}
              onVisibleRowsChange={setVisibleClearanceRows}
              systemConfig={config}
              supabase={supabase}
              companies={wasteCompanies}
              dashboardFilter={clearanceCardFilter}
              clients={clients}
            />
          )}
          {activeTab === "wasteCompanies" && tabAccess.wasteCompanies && (
            <WasteCompanySetup
              companies={wasteCompanies}
              setCompanies={setWasteCompanies}
              systemConfig={config}
              supabase={supabase}
            />
          )}
          {activeTab === "vendors" && tabAccess.vendors && (
            <VendorManagement
              vendors={vendors}
              setVendors={setVendors}
              systemConfig={config}
              supabase={supabase}
            />
          )}
          {activeTab === "waste" && tabAccess.waste && (
            <WasteManagement
              companies={wasteCompanies}
              history={wasteHistory}
              setHistory={setWasteHistory}
              onVisibleRowsChange={setVisibleWasteRows}
              systemConfig={config}
              supabase={supabase}
              dashboardFilter={wasteCardFilter}
            />
          )}
          {activeTab === "ain" && tabAccess.ain && (
            <AinDatabase
              clients={clients}
              setClients={setClients}
              onVisibleRowsChange={setVisibleAinRows}
              systemConfig={config}
              supabase={supabase}
              canAdd={hasPermission("ain_add")}
              canDelete={hasPermission("ain_delete")}
              canImport={hasPermission("ain_import")}
              canExport={hasPermission("ain_export")}
            />
          )}
          {activeTab === "ainTax" && tabAccess.ainTax && (
            <AinTaxManagement
              history={ainTaxHistory}
              setHistory={setAinTaxHistory}
              onVisibleRowsChange={setVisibleAinTaxRows}
              systemConfig={config}
              supabase={supabase}
            />
          )}
          {activeTab === "reports" && tabAccess.reports && (
            <DailyReport
              dutyHistory={dutyHistory}
              assessmentHistory={assessmentHistory}
              clearanceHistory={clearanceHistory}
              systemConfig={config}
            />
          )}
          {activeTab === "admin" && tabAccess.admin && (
            <AdminPanel
              config={config}
              setConfig={setConfig}
              clients={clients}
              dutyHistory={dutyHistory}
              assessmentHistory={assessmentHistory}
              users={users}
              setUsers={setUsers}
              setAuditLogs={setAuditLogs}
              currentUserEmail={session?.user?.email || "system"}
              onBackup={handleBackup}
              nextAutoBackupAt={nextAutoBackupAt}
              supabase={supabase}
            />
          )}
          {activeTab === "logs" && tabAccess.logs && (
            <AuditLogs systemConfig={config} supabase={supabase} logs={sortedAuditLogs} />
          )}
          {!tabAccess[activeTab] && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-300"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              You do not have permission to access this module.
            </div>
          )}
        </div>
          <footer
            className={`p-6 text-center border-t mt-auto transition-colors ${config.theme === "dark" ? "bg-[#0f172a]/50 border-slate-800" : "bg-white/50 border-slate-100"}`}
          >
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em]">
                {config.agencyName}
              </p>
              <p className="text-[9px] font-bold text-slate-400 max-w-sm">
                System v2.1.0 • {config.agencyAddress}
              </p>
              {config.showDeveloperCredit && config.developerCreditName ? (
                <p className="text-[10px] font-bold text-slate-500">
                  Developed by{" "}
                  {config.developerCreditUrl ? (
                    <a
                      href={config.developerCreditUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {config.developerCreditName}
                    </a>
                  ) : (
                    config.developerCreditName
                  )}
                </p>
              ) : null}
            </div>
          </footer>
        </main>
      </div>

      {showProfileModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div
            className={`rounded-[1.5rem] shadow-2xl w-full max-w-lg overflow-hidden p-8 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <div className="flex items-center justify-between mb-6">
              <h3
                className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}
              >
                User Profile Management
              </h3>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className={`w-9 h-9 rounded-lg border transition-colors ${isDark ? "border-slate-700 text-slate-300 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {profileError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
                {profileSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label
                  className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <label
                  className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
                >
                  New Password
                </label>
                <input
                  type="password"
                  value={profilePassword}
                  onChange={(e) => setProfilePassword(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  placeholder="Leave blank to keep current password"
                />
              </div>

              <div>
                <label
                  className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
                >
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={profileConfirmPassword}
                  onChange={(e) => setProfileConfirmPassword(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  placeholder="Re-enter new password"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-7">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateProfile}
                disabled={isSavingProfile}
                className="flex-1 py-3 rounded-xl text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


