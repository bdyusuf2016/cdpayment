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
import {
  TabType,
  Client,
  SystemConfig,
  PaymentRecord,
  AssessmentRecord,
  StaffUser,
} from "./types";

const normalizeDutyRecord = (row: any): PaymentRecord => ({
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
  name: row.name ?? "",
  role: row.role ?? "Staff",
  permissions: row.permissions ?? {},
  lastActive: row.lastActive ?? row.last_active ?? "",
  active: Boolean(row.active),
});

const normalizeSystemConfig = (row: any): Partial<SystemConfig> => ({
  agencyName: row.agencyName ?? row.agency_name,
  agencyAddress: row.agencyAddress ?? row.agency_address,
  defaultRate: Number(row.defaultRate ?? row.default_rate ?? 0),
  autoInvoice: row.autoInvoice ?? row.auto_invoice,
  currency: row.currency,
  theme: row.theme,
  themeTemplate: row.themeTemplate ?? row.theme_template,
  language: row.language,
  paymentMethods: row.paymentMethods ?? row.payment_methods,
});

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>("duty");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const [config, setConfig] = useState<SystemConfig>({
    defaultRate: 100,
    agencyName: "Customs Duty Pro Ltd.",
    agencyAddress: "House #12, Road #4, Sector #7, Uttara, Dhaka-1230",
    autoInvoice: true,
    currency: "BDT",
    theme: "light",
    themeTemplate:
      (localStorage.getItem("ui_theme_template") as
        | SystemConfig["themeTemplate"]
        | null) || "soft",
    language: "en",
    paymentMethods: ["Cash", "Bank", "bKash", "Nagad"],
    supabaseUrl: SUPABASE_SITE_URL || "",
    supabaseKey: SUPABASE_SITE_KEY || "",
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

    const fetchAndSubscribe = async (
      tableName: string,
      setter: React.Dispatch<React.SetStateAction<any[]>>,
      transform?: (row: any) => any,
    ) => {
      // Fetch initial data
      const { data, error } = await supabase.from(tableName).select("*");
      if (error) {
        console.error(`Error fetching ${tableName}:`, error);
      } else {
        setter((data || []).map((row) => (transform ? transform(row) : row)));
      }

      // Subscribe to changes
      const channel = supabase
        .channel(`public:${tableName}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: tableName },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const record = transform ? transform(payload.new) : payload.new;
              setter((current) => [...current, record]);
            }
            if (payload.eventType === "UPDATE") {
              const record = transform ? transform(payload.new) : payload.new;
              setter((current) =>
                current.map((item) =>
                  item.id === payload.new.id ? record : item,
                ),
              );
            }
            if (payload.eventType === "DELETE") {
              setter((current) =>
                current.filter((item) => item.id !== payload.old.id),
              );
            }
          },
        )
        .subscribe();

      return channel;
    };

    const channels: any[] = [];
    fetchAndSubscribe("clients", setClients).then((channel) =>
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
      admin: "Admin Panel",
      logs: "Audit Logs",
      logout: "Logout",
      console: "Enterprise Console",
    },
    bn: {
      duty: "ডিউটি পেমেন্ট",
      assessment: "অ্যাসেসমেন্ট",
      ain: "AIN ডাটাবেস",
      admin: "এডমিন প্যানেল",
      logs: "অডিট লগ",
      logout: "লগআউট",
      console: "এন্টারপ্রাইজ কনসোল",
    },
  };

  const t = translations[config.language];
  const isDark = config.theme === "dark";

  const navTabs = [
    { id: "duty", label: t.duty, icon: "fa-file-invoice" },
    { id: "assessment", label: t.assessment, icon: "fa-calculator" },
    { id: "ain", label: t.ain, icon: "fa-database" },
    { id: "admin", label: t.admin, icon: "fa-shield-halved" },
    { id: "logs", label: t.logs, icon: "fa-list-check" },
  ];

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
            label: config.language === "en" ? "Active" : "সক্রিয়",
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
        const outstanding = totalNet - totalReceived;
        return [
          {
            label: "Total Billed",
            value: `৳ ${totalNet.toLocaleString()}`,
            color: "#2563eb",
          },
          {
            label: "Received",
            value: `৳ ${totalReceived.toLocaleString()}`,
            color: "#10b981",
          },
            {
              label: "Outstanding",
              value: `৳ ${outstanding.toLocaleString()}`,
              color: "#ef4444",
            },
            {
              label: "Total B/E",
              value: totalBeCount.toLocaleString(),
              color: "#f59e0b",
            },
          ];
      }
      default: {
        const rows = visibleDutyRows;
        const grossDuty = rows.reduce((acc, r) => acc + r.duty, 0);
        const totalCollection = rows.reduce(
          (acc, r) => acc + r.received,
          0,
        );
        const serviceProfit = rows.reduce((acc, r) => acc + r.profit, 0);
        return [
          {
            label: "Gross Duty",
            value: `৳ ${grossDuty.toLocaleString()}`,
            color: "#2563eb",
          },
          {
            label: "Total Collection",
            value: `৳ ${totalCollection.toLocaleString()}`,
            color: "#10b981",
          },
          {
            label: "Service Profit",
            value: `৳ ${serviceProfit.toLocaleString()}`,
            color: "#f59e0b",
          },
          {
            label: "Pending Job",
            value: rows.filter((r) => r.status !== "Paid").length,
            color: "#ef4444",
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
  ]);

  useEffect(() => {
    setVisibleDutyRows(dutyHistory);
  }, [dutyHistory]);

  useEffect(() => {
    setVisibleAssessmentRows(assessmentHistory);
  }, [assessmentHistory]);

  useEffect(() => {
    setVisibleAinRows(clients);
  }, [clients]);

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
        className={`px-6 py-4 flex items-center justify-between sticky top-0 z-[60] shadow-sm backdrop-blur-md border-b transition-colors ${config.theme === "dark" ? "bg-[#1e293b]/80 border-slate-700" : "bg-white/80 border-slate-100"}`}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <i className="fas fa-cube text-white text-lg"></i>
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-tight leading-none">
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

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex flex-col items-end mr-2">
            <span className="text-xs font-bold dark:text-white">
              {session.user.email}
            </span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
              Logged In
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mr-2 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setConfig((prev) => ({ ...prev, language: "en" }))}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${config.language === "en" ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white" : "text-slate-400"}`}
            >
              ENG
            </button>
            <button
              onClick={() => setConfig((prev) => ({ ...prev, language: "bn" }))}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${config.language === "bn" ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white" : "text-slate-400"}`}
            >
              BAN
            </button>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></div>
            <button
              onClick={() =>
                setConfig((prev) => ({
                  ...prev,
                  theme: isDark ? "light" : "dark",
                }))
              }
              className={`w-8 h-7 rounded-md flex items-center justify-center transition-all ${isDark ? "text-yellow-400" : "text-slate-400 hover:text-slate-600"}`}
            >
              <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`}></i>
            </button>
          </div>

          <button
            onClick={() => setActiveTab("admin")}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 border ${activeTab === "admin" ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"}`}
          >
            <i className="fas fa-cog text-sm"></i>
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-600 hover:text-white w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm border border-red-100 dark:border-red-900/30"
          >
            <i className="fas fa-power-off text-sm"></i>
          </button>
        </div>
      </header>

      {/* Primary Workspace */}
      <main className="p-4 md:p-8 max-w-[1600px] mx-auto w-full flex-grow">
        <StatsCards cards={stats} />

        {/* Mobile Navigation (Dropdown Style) */}
        <div className="md:hidden mb-6 relative z-50">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`w-full p-4 rounded-2xl border shadow-sm flex items-center justify-between transition-all active:scale-[0.99] ${config.theme === "dark" ? "bg-[#1e293b] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${config.theme === "dark" ? "bg-slate-700 text-white" : "bg-blue-600 text-white"}`}
              >
                <i
                  className={`fas ${navTabs.find((t) => t.id === activeTab)?.icon}`}
                ></i>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Current View
                </p>
                <p className="text-sm font-black uppercase tracking-widest">
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
        <div className="hidden md:flex justify-center mb-8">
          <nav
            className={`flex p-1.5 rounded-2xl shadow-sm border overflow-x-auto no-scrollbar transition-colors ${config.theme === "dark" ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"}`}
          >
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black transition-all whitespace-nowrap ${
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

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {activeTab === "duty" && (
            <DutyPayment
              clients={clients}
              history={dutyHistory}
              setHistory={setDutyHistory}
              onVisibleRowsChange={setVisibleDutyRows}
              systemConfig={config}
              supabase={supabase}
            />
          )}
          {activeTab === "assessment" && (
            <AssessmentBilling
              clients={clients}
              systemConfig={config}
              history={assessmentHistory}
              setHistory={setAssessmentHistory}
              onVisibleRowsChange={setVisibleAssessmentRows}
              supabase={supabase}
            />
          )}
          {activeTab === "ain" && (
            <AinDatabase
              clients={clients}
              setClients={setClients}
              onVisibleRowsChange={setVisibleAinRows}
              systemConfig={config}
              supabase={supabase}
            />
          )}
          {activeTab === "admin" && (
            <AdminPanel
              config={config}
              setConfig={setConfig}
              clients={clients}
              dutyHistory={dutyHistory}
              assessmentHistory={assessmentHistory}
              users={users}
              supabase={supabase}
            />
          )}
          {activeTab === "logs" && (
            <AuditLogs systemConfig={config} supabase={supabase} />
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
            System v2.0 • {config.agencyAddress}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
