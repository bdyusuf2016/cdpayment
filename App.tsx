import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import supabaseDefault, {
  SUPABASE_SITE_URL,
  SUPABASE_SITE_KEY,
} from "./utils/supabaseClient";
import StatsCards from "./components/StatsCards";
import DutyPayment from "./components/DutyPayment";
import AssessmentBilling from "./components/AssessmentBilling";
import AinDatabase from "./components/AinDatabase";
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

const normalizeClient = (row: any): Client => {
  const phones = getClientPhones({ phone: row.phone ?? "" });
  return {
    ain: row.ain ?? "",
    name: row.name ?? "",
    phone: phones[0] ?? "",
    phones,
    active: Boolean(row.active),
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
  const [session, setSession] = useState<any>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>("duty");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  const [visibleDutyRows, setVisibleDutyRows] = useState<PaymentRecord[]>([]);
  const [visibleAssessmentRows, setVisibleAssessmentRows] = useState<
    AssessmentRecord[]
  >([]);
  const [visibleAinRows, setVisibleAinRows] = useState<Client[]>([]);
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
        .single();
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
    [assessmentHistory, clients, config, dutyHistory, users],
  );

  useEffect(() => {
    if (!session || !config.autoBackupEnabled) return;

    const checkForAutoBackup = () => {
      if (document.hidden) return;

      const hasData =
        clients.length > 0 ||
        dutyHistory.length > 0 ||
        assessmentHistory.length > 0 ||
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
    clients.length,
    config.autoBackupEnabled,
    config.autoBackupFrequencyHours,
    dutyHistory.length,
    handleBackup,
    session,
    users.length,
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
      ain: "AIN Database",
      reports: "Reports",
      admin: "Admin Panel",
      logs: "Audit Logs",
      logout: "Logout",
      console: "Enterprise Console",
    },
    bn: {
      duty: "ডিউটি পেমেন্ট",
      assessment: "অ্যাসেসমেন্ট",
      ain: "AIN ডাটাবেস",
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
  const canAccessAinModule = hasPermission("ain_view");
  const canAccessReportsModule = hasPermission("report_view");
  const canAccessLogsModule = hasPermission("view_logs");
  const canAccessAdminModule = isAdminUser;
  const tabAccess = useMemo<Record<TabType, boolean>>(
    () => ({
      duty: canAccessDutyModule,
      assessment: canAccessAssessmentModule,
      ain: canAccessAinModule,
      reports: canAccessReportsModule,
      admin: canAccessAdminModule,
      logs: canAccessLogsModule,
      settings: false,
    }),
    [
      canAccessAdminModule,
      canAccessAinModule,
      canAccessAssessmentModule,
      canAccessDutyModule,
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
    { id: "ain", label: t.ain, icon: "fa-database" },
    { id: "reports", label: t.reports, icon: "fa-chart-line" },
    { id: "logs", label: t.logs, icon: "fa-list-check" },
  ];
  if (isAdminUser) {
    allTabs.splice(3, 0, { id: "admin", label: t.admin, icon: "fa-shield-halved" });
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
    visibleAinRows,
    users,
    sortedAuditLogs,
  ]);

  useEffect(() => {
    setActiveStatIndex(null);
  }, [activeTab]);

  const statDetail = useMemo<StatDetailView | null>(() => {
    if (activeStatIndex === null || !stats[activeStatIndex]) return null;
    if (activeTab === "duty" || activeTab === "assessment") return null;
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
    visibleAinRows,
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
      className={`min-h-screen flex flex-col font-sans selection:bg-blue-100 transition-colors duration-300 ${config.theme === "dark" ? "bg-[#0f172a] text-slate-200" : "bg-[#f8fafc] text-slate-900"}`}
    >
      {/* Top Navigation Bar */}
      <header
        className={`px-3 md:px-5 py-3 sticky top-0 z-[60] shadow-sm backdrop-blur-md border-b transition-colors ${config.theme === "dark" ? "bg-[#1e293b]/80 border-slate-700" : "bg-white/80 border-slate-100"}`}
      >
        <div className="max-w-[1600px] mx-auto w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                <i className="fas fa-cube text-white text-base"></i>
              </div>
              <div className="flex flex-col">
                <h1 className="text-base md:text-lg font-black tracking-tight leading-none">
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

            <div className="flex items-center gap-2">
              <div className="hidden lg:flex flex-col items-end mr-2">
                <span className="text-xs font-bold dark:text-white">
                  {session.user.email}
                </span>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                  Logged In
                </span>
              </div>

              <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mr-1 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setConfig((prev) => ({ ...prev, language: "en" }))}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${config.language === "en" ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white" : "text-slate-400"}`}
                >
                  ENG
                </button>
                <button
                  onClick={() => setConfig((prev) => ({ ...prev, language: "bn" }))}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${config.language === "bn" ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white" : "text-slate-400"}`}
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
                  className={`w-8 h-7 rounded-md flex items-center justify-center transition-all ${isDark ? "text-yellow-400" : "text-slate-400 hover:text-slate-600"}`}
                >
                  <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`}></i>
                </button>
              </div>

              {isAdminUser && (
                <button
                  onClick={() => setActiveTab("admin")}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm active:scale-95 border ${activeTab === "admin" ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"}`}
                >
                  <i className="fas fa-cog text-xs"></i>
                </button>
              )}
              <button
                onClick={handleOpenProfileModal}
                className="bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-sm border border-slate-200 dark:border-slate-700"
                title="Profile"
              >
                <i className="fas fa-user text-xs"></i>
              </button>
              <button
                onClick={handleLogout}
                className="bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-600 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-sm border border-red-100 dark:border-red-900/30"
              >
                <i className="fas fa-power-off text-xs"></i>
              </button>
            </div>
          </div>

          {/* Header Flow Navigation */}
          <div className="mt-2.5">
            {/* Mobile Navigation (Dropdown Style) */}
            <div className="md:hidden relative z-50">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={`w-full p-2.5 rounded-xl border shadow-sm flex items-center justify-between transition-all active:scale-[0.99] ${config.theme === "dark" ? "bg-[#0f172a]/70 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg ${config.theme === "dark" ? "bg-slate-700 text-white" : "bg-blue-600 text-white"}`}
                  >
                    <i
                      className={`fas ${navTabs.find((t) => t.id === activeTab)?.icon}`}
                    ></i>
                  </div>
                  <div className="text-left leading-tight">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Current View
                    </p>
                    <p className="text-xs font-black uppercase tracking-widest">
                      {navTabs.find((t) => t.id === activeTab)?.label}
                    </p>
                  </div>
                </div>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isMobileMenuOpen ? "bg-blue-100 text-blue-600 rotate-180" : "bg-slate-100 text-slate-400"}`}
                >
                  <i className="fas fa-chevron-down"></i>
                </div>
              </button>

              {isMobileMenuOpen && (
                <div
                  className={`absolute top-full left-0 w-full mt-2 p-2 rounded-2xl border shadow-xl flex flex-col gap-2 animate-in slide-in-from-top-5 fade-in duration-200 ${config.theme === "dark" ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"}`}
                >
                  {navTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as TabType);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                        activeTab === tab.id
                          ? config.theme === "dark"
                            ? "bg-blue-600 text-white shadow-lg"
                            : "bg-slate-900 text-white shadow-lg"
                          : config.theme === "dark"
                            ? "text-slate-400 hover:bg-slate-800"
                            : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTab === tab.id ? "bg-white/20" : "bg-transparent"}`}
                      >
                        <i className={`fas ${tab.icon}`}></i>
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest">
                        {tab.label}
                      </span>
                      {activeTab === tab.id && (
                        <i className="fas fa-check ml-auto"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop Navigation (Segmented Control) */}
            <div className="hidden md:flex justify-center">
              <nav
                className={`mx-auto flex p-1 rounded-xl shadow-sm border overflow-x-auto no-scrollbar transition-colors ${config.theme === "dark" ? "bg-[#0f172a]/70 border-slate-700" : "bg-white border-slate-200"}`}
              >
                {navTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? "bg-slate-900 dark:bg-blue-600 text-white shadow-lg"
                        : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <i
                      className={`fas ${tab.icon} ${activeTab === tab.id ? "text-white" : "text-slate-400"}`}
                    ></i>
                    <span className="uppercase tracking-widest">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Primary Workspace */}
      <main className="p-4 md:p-8 max-w-[1600px] mx-auto w-full flex-grow">
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
              (activeTab === "ain" && visibleAinRows.length === 0) ||
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
          {activeTab === "reports" && tabAccess.reports && (
            <DailyReport
              dutyHistory={dutyHistory}
              assessmentHistory={assessmentHistory}
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
      </main>

      <footer
        className={`p-8 text-center border-t mt-auto transition-colors ${config.theme === "dark" ? "bg-[#0f172a] border-slate-800" : "bg-white border-slate-100"}`}
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


