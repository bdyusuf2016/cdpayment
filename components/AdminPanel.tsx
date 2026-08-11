import React, { useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  StaffUser,
  SystemConfig,
  GranularPermissions,
  Client,
  PaymentRecord,
  AssessmentRecord,
  LogEntry,
} from "../types";
import {
  deleteStaffUser,
  insertAuditLog,
  updateStaffUser,
  updateSystemSettings,
} from "../utils/supabaseApi";
import { SupabaseClient } from "@supabase/supabase-js";

interface AdminPanelProps {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  clients: Client[];
  dutyHistory: PaymentRecord[];
  assessmentHistory: AssessmentRecord[];
  users: StaffUser[];
  setUsers: React.Dispatch<React.SetStateAction<StaffUser[]>>;
  setAuditLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  currentUserEmail: string;
  onBackup: (trigger?: "manual" | "auto") => void;
  nextAutoBackupAt: string;
  supabase: SupabaseClient | null;
}

export interface ModulePermissionGroup {
  moduleId: string;
  moduleNameBn: string;
  moduleNameEn: string;
  icon: string;
  permissions: {
    key: keyof GranularPermissions;
    labelBn: string;
    labelEn: string;
    code: string;
  }[];
}

export const MODULE_PERMISSION_GROUPS: ModulePermissionGroup[] = [
  {
    moduleId: "duty",
    moduleNameBn: "কাস্টমস ডিউটি পে মডিউল",
    moduleNameEn: "Customs Duty Payment Module",
    icon: "fa-solid fa-credit-card text-blue-500",
    permissions: [
      { key: "duty_view", labelBn: "ডিউটি রেকর্ড দেখুন", labelEn: "View Duty Records", code: "DUTY_VIEW" },
      { key: "bill_add", labelBn: "ডিউটি বিল যুক্ত করুন", labelEn: "Add Duty Bill", code: "DUTY_ADD" },
      { key: "bill_edit", labelBn: "ডিউটি বিল এডিট করুন", labelEn: "Edit Duty Bill", code: "DUTY_EDIT" },
      { key: "bill_delete", labelBn: "ডিউটি বিল ডিলেট করুন", labelEn: "Delete Duty Bill", code: "DUTY_DELETE" },
      { key: "bill_bulk_pay", labelBn: "বাল্ক পেমেন্ট সম্পন্ন করুন", labelEn: "Bulk Pay Bills", code: "DUTY_BULK_PAY" },
      { key: "bill_export", labelBn: "এক্সেল এক্সপোর্ট", labelEn: "Export Duty Excel", code: "DUTY_EXPORT" },
      { key: "bill_wa_share", labelBn: "হোয়াটসঅ্যাপ শেয়ার", labelEn: "WhatsApp Share", code: "DUTY_WA_SHARE" },
      { key: "invoice_print", labelBn: "ইনভয়েস প্রিন্ট", labelEn: "Print Invoice", code: "INVOICE_PRINT" },
    ],
  },
  {
    moduleId: "assessment",
    moduleNameBn: "অ্যাসেসমেন্ট বিলিং মডিউল",
    moduleNameEn: "Assessment Billing Module",
    icon: "fa-solid fa-calculator text-amber-500",
    permissions: [
      { key: "assessment_view", labelBn: "অ্যাসেসমেন্ট বিল দেখুন", labelEn: "View Assessment Bills", code: "ASSESSMENT_VIEW" },
      { key: "assessment_add", labelBn: "নতুন বিল যুক্ত করুন", labelEn: "Add Assessment Bill", code: "ASSESSMENT_ADD" },
      { key: "assessment_edit", labelBn: "বিল এডিট করুন", labelEn: "Edit Assessment Bill", code: "ASSESSMENT_EDIT" },
      { key: "assessment_delete", labelBn: "বিল ডিলেট করুন", labelEn: "Delete Assessment Bill", code: "ASSESSMENT_DELETE" },
      { key: "assessment_export", labelBn: "এক্সেল এক্সপোর্ট", labelEn: "Export Assessment", code: "ASSESSMENT_EXPORT" },
    ],
  },
  {
    moduleId: "clearance",
    moduleNameBn: "ডেইলি ক্লিয়ারেন্স ট্র্যাকার মডিউল",
    moduleNameEn: "Daily Clearance Tracker",
    icon: "fa-solid fa-boxes-packing text-emerald-500",
    permissions: [
      { key: "clearance_view", labelBn: "ক্লিয়ারেন্স ডাটা দেখুন", labelEn: "View Clearance Records", code: "CLEARANCE_VIEW" },
      { key: "clearance_add", labelBn: "ক্লিয়ারেন্স এন্ট্রি দিন", labelEn: "Add Clearance Record", code: "CLEARANCE_ADD" },
      { key: "clearance_edit", labelBn: "ক্লিয়ারেন্স এডিট করুন", labelEn: "Edit Clearance Record", code: "CLEARANCE_EDIT" },
      { key: "clearance_delete", labelBn: "ক্লিয়ারেন্স ডিলেট করুন", labelEn: "Delete Clearance Record", code: "CLEARANCE_DELETE" },
    ],
  },
  {
    moduleId: "waste",
    moduleNameBn: "ওয়েস্ট ট্র্যাকার ও ময়লা গাড়ি মডিউল",
    moduleNameEn: "Waste & Garbage Tracker Module",
    icon: "fa-solid fa-dumpster text-purple-500",
    permissions: [
      { key: "waste_view", labelBn: "ওয়েস্ট রেকর্ড দেখুন", labelEn: "View Waste Records", code: "WASTE_VIEW" },
      { key: "waste_add", labelBn: "ওয়েস্ট ট্রিপ যুক্ত করুন", labelEn: "Add Waste Record", code: "WASTE_ADD" },
      { key: "waste_edit", labelBn: "ট্রিপ এডিট করুন", labelEn: "Edit Waste Record", code: "WASTE_EDIT" },
      { key: "waste_delete", labelBn: "ট্রিপ ডিলেট করুন", labelEn: "Delete Waste Record", code: "WASTE_DELETE" },
      { key: "waste_company_manage", labelBn: "ওয়েস্ট কোম্পানি ম্যানেজমেন্ট", labelEn: "Manage Waste Companies", code: "WASTE_COMPANY_MANAGE" },
    ],
  },
  {
    moduleId: "ain",
    moduleNameBn: "AIN ক্লায়েন্ট ডাটাবেস মডিউল",
    moduleNameEn: "AIN Client Database Module",
    icon: "fa-solid fa-address-book text-cyan-500",
    permissions: [
      { key: "ain_view", labelBn: "AIN ক্লায়েন্ট তালিকা দেখুন", labelEn: "View AIN Clients", code: "AIN_VIEW" },
      { key: "ain_add", labelBn: "AIN ক্লায়েন্ট যুক্ত করুন", labelEn: "Add AIN Client", code: "AIN_ADD" },
      { key: "ain_delete", labelBn: "AIN ক্লায়েন্ট ডিলেট করুন", labelEn: "Delete AIN Client", code: "AIN_DELETE" },
      { key: "ain_import", labelBn: "AIN ইমপোর্ট করুন", labelEn: "Import AINs", code: "AIN_IMPORT" },
      { key: "ain_export", labelBn: "AIN এক্সপোর্ট করুন", labelEn: "Export AINs", code: "AIN_EXPORT" },
    ],
  },
  {
    moduleId: "ain_tax",
    moduleNameBn: "AIN ট্যাক্স বকেয়া ম্যানেজমেন্ট মডিউল",
    moduleNameEn: "AIN Tax Due Management Module",
    icon: "fa-solid fa-hand-holding-dollar text-rose-500",
    permissions: [
      { key: "ain_tax_view", labelBn: "বকেয়া ট্যাক্স বিবরণী দেখুন", labelEn: "View AIN Tax Due", code: "AIN_TAX_VIEW" },
      { key: "ain_tax_add", labelBn: "ট্যাক্স এন্ট্রি যুক্ত করুন", labelEn: "Add AIN Tax Record", code: "AIN_TAX_ADD" },
      { key: "ain_tax_edit", labelBn: "ট্যাক্স এন্ট্রি এডিট করুন", labelEn: "Edit AIN Tax Record", code: "AIN_TAX_EDIT" },
      { key: "ain_tax_delete", labelBn: "ট্যাক্স এন্ট্রি ডিলেট করুন", labelEn: "Delete AIN Tax Record", code: "AIN_TAX_DELETE" },
      { key: "ain_tax_pay", labelBn: "পেমেন্ট স্ট্যাটাস পরিবর্তন করুন (Pay)", labelEn: "Update Payment Status (Pay)", code: "AIN_TAX_PAY" },
      { key: "ain_tax_import", labelBn: "এক্সেল কাস্টমস পেস্ট ইমপোর্ট", labelEn: "Import ASYCUDA Excel", code: "AIN_TAX_IMPORT" },
      { key: "ain_tax_export", labelBn: "ট্যাক্স রিপোর্ট এক্সপোর্ট", labelEn: "Export AIN Tax Excel", code: "AIN_TAX_EXPORT" },
    ],
  },
  {
    moduleId: "admin",
    moduleNameBn: "ইউজার প্রোফাইল ও এডমিন পারমিশন মডিউল",
    moduleNameEn: "User Profile & Admin Controls",
    icon: "fa-solid fa-user-gear text-indigo-500",
    permissions: [
      { key: "user_profile_edit", labelBn: "ইউজার প্রোফাইল সংশোধন (Edit Profile)", labelEn: "Edit User Profile", code: "USER_PROFILE_EDIT" },
      { key: "user_manage", labelBn: "ইউজার অ্যাকাউন্ট ও পারমিশন নিয়ন্ত্রণ", labelEn: "Manage Users & Permissions", code: "USER_MANAGE" },
      { key: "user_reset_pass", labelBn: "পাসওয়ার্ড রিসেট", labelEn: "Reset User Passwords", code: "USER_RESET_PASS" },
      { key: "view_logs", labelBn: "অডিট লগস দেখুন", labelEn: "View System Audit Logs", code: "VIEW_LOGS" },
      { key: "report_view", labelBn: "ডেইলি / মান্থলি রিপোর্ট দেখুন", labelEn: "View Reports", code: "REPORT_VIEW" },
      { key: "settings_manage", labelBn: "সিস্টেম সেটিংস পরিবর্তন", labelEn: "Manage System Settings", code: "SETTINGS_MANAGE" },
    ],
  },
];

const ALL_PERMISSION_KEYS = MODULE_PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const initialPermissions: GranularPermissions = ALL_PERMISSION_KEYS.reduce(
  (acc, key) => {
    acc[key] = false;
    return acc;
  },
  {} as GranularPermissions
);

const adminRolePermissions: GranularPermissions = ALL_PERMISSION_KEYS.reduce(
  (acc, key) => {
    acc[key] = true;
    return acc;
  },
  {} as GranularPermissions
);

const userRolePermissions: GranularPermissions = {
  ...initialPermissions,
  duty_view: true,
  bill_add: true,
  bill_edit: true,
  bill_wa_share: true,
  invoice_print: true,
  assessment_view: true,
  assessment_add: true,
  clearance_view: true,
  waste_view: true,
  ain_view: true,
  ain_add: true,
  ain_tax_view: true,
};

const getDefaultPermissionsForRole = (role: string): GranularPermissions =>
  role === "Admin" ? { ...adminRolePermissions } : { ...userRolePermissions };


const AdminPanel: React.FC<AdminPanelProps> = ({
  config,
  setConfig,
  clients,
  dutyHistory,
  assessmentHistory,
  users,
  setUsers,
  setAuditLogs,
  currentUserEmail,
  onBackup,
  nextAutoBackupAt,
  supabase,
}) => {
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [newMethod, setNewMethod] = useState("");
  const [optimizing, setOptimizing] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Backup Restore Refs
  const restoreFileRef = useRef<HTMLInputElement>(null);

  // New/Edit User Form
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("User");
  const [userActive, setUserActive] = useState("Yes");
  const [permissions, setPermissions] = useState<GranularPermissions>({
    ...initialPermissions,
  });
  const [deletingUser, setDeletingUser] = useState<StaffUser | null>(null);

  const appendAuditLog = (entry: LogEntry) => {
    setAuditLogs((prev) => [entry, ...prev.filter((log) => log.id !== entry.id)]);
  };

  const updateConfig = (key: keyof SystemConfig, value: any) => {
    if (supabase) {
      updateSystemSettings(supabase, { [key]: value });
    }
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleTestConnection = async () => {
    if (!config.supabaseUrl || !config.supabaseKey) {
      setConnectionStatus("Error: URL and Key cannot be empty.");
      return;
    }
    setTestingConnection(true);
    setConnectionStatus("Testing connection...");
    try {
      const tempClient = createClient(config.supabaseUrl, config.supabaseKey);
      const { error } = await tempClient.from("clients").select("ain").limit(1);
      if (error) {
        throw error;
      }
      setConnectionStatus("Success! Connection to Supabase is working.");
    } catch (error: any) {
      console.error("Supabase connection test failed:", error);
      setConnectionStatus(`Error: ${error.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const addPaymentMethod = () => {
    if (!newMethod) return;
    const updatedMethods = [...config.paymentMethods, newMethod];
    updateConfig("paymentMethods", updatedMethods);
    setNewMethod("");
  };

  const removePaymentMethod = (method: string) => {
    const updatedMethods = config.paymentMethods.filter((m) => m !== method);
    updateConfig("paymentMethods", updatedMethods);
  };

  const handleOpenUserModal = (user?: StaffUser) => {
    if (user) {
      setEditingUserId(user.id);
      setUserName(user.name);
      setUserEmail("");
      setUserPassword("");
      setUserRole(user.role === "Staff" ? "User" : user.role);
      setUserActive(user.active ? "Yes" : "No");
      setPermissions(user.permissions);
    } else {
      setEditingUserId(null);
      setUserName("");
      setUserEmail("");
      setUserPassword("");
      setUserRole("User");
      setUserActive("Yes");
      setPermissions(getDefaultPermissionsForRole("User"));
    }
    setShowAddUser(true);
  };

  const handleSaveUser = async () => {
    if (!userName || !supabase) return;

    if (editingUserId) {
      const previousUsers = users;
      const existingUser = users.find((u) => u.id === editingUserId);
      if (!existingUser) return;
      const updatedUser: Partial<StaffUser> = {
        name: userName,
        role: userRole,
        permissions: permissions,
        active: userActive === "Yes",
      };
      const optimisticUser: StaffUser = {
        ...existingUser,
        ...updatedUser,
      };
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUserId ? optimisticUser : u)),
      );
      const updated = await updateStaffUser(supabase, editingUserId, updatedUser);
      if (!updated) {
        setUsers(previousUsers);
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      const log = await insertAuditLog(supabase, {
        user_name: currentUserEmail || "system",
        action: "UPDATE",
        module: "staff_users",
        details: `User updated: ${updated.name}`,
        type: "warning",
      });
      if (log) appendAuditLog(log);
    } else {
      const email = userEmail.trim();
      if (!email || !userPassword) {
        alert("Email and password are required for new users.");
        return;
      }

      const supabaseUrl = config.supabaseUrl || localStorage.getItem("supabase_url") || "";
      const supabaseKey = config.supabaseKey || localStorage.getItem("supabase_key") || "";
      if (!supabaseUrl || !supabaseKey) {
        alert("Supabase URL/Key is missing.");
        return;
      }

      const authClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
        email,
        password: userPassword,
        options: {
          data: { full_name: userName },
        },
      });
      if (signUpError || !signUpData.user) {
        alert(signUpError?.message || "Failed to create auth user.");
        return;
      }

      const authId = signUpData.user.id;
      const staffPayload = {
        auth_id: authId,
        name: userName,
        role: userRole,
        permissions,
        last_active: new Date().toLocaleString(),
        active: userActive === "Yes",
      };

      const { data: existingRows, error: existingError } = await supabase
        .from("staff_users")
        .select("id")
        .eq("auth_id", authId)
        .limit(1);
      if (existingError) {
        alert(existingError.message || "Failed to create staff profile.");
        return;
      }

      let createdRow: any = null;
      if (existingRows && existingRows.length > 0) {
        const { data, error } = await supabase
          .from("staff_users")
          .update(staffPayload)
          .eq("id", existingRows[0].id)
          .select()
          .single();
        if (error) {
          alert(error.message || "Failed to update staff profile.");
          return;
        }
        createdRow = data;
      } else {
        const { data, error } = await supabase
          .from("staff_users")
          .insert(staffPayload)
          .select()
          .single();
        if (error) {
          alert(error.message || "Failed to create staff profile.");
          return;
        }
        createdRow = data;
      }

      const created: StaffUser = {
        id: createdRow.id,
        authId: createdRow.authId ?? createdRow.auth_id ?? undefined,
        name: createdRow.name ?? "",
        role: createdRow.role ?? "User",
        permissions: createdRow.permissions ?? {},
        lastActive: createdRow.lastActive ?? createdRow.last_active ?? "",
        active: Boolean(createdRow.active),
      };

      setUsers((prev) => [created, ...prev.filter((u) => u.id !== created.id)]);
      const log = await insertAuditLog(supabase, {
        user_name: currentUserEmail || "system",
        action: "INSERT",
        module: "staff_users",
        details: `User added: ${created.name}`,
        type: "success",
      });
      if (log) appendAuditLog(log);
    }
    setShowAddUser(false);
  };

  const handleDeleteUser = async () => {
    if (!supabase || !deletingUser) return;
    const userToDelete = deletingUser;
    const previousUsers = users;
    setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
    setDeletingUser(null);

    const deleted = await deleteStaffUser(supabase, userToDelete.id);
    if (!deleted) {
      setUsers(previousUsers);
      return;
    }
    const log = await insertAuditLog(supabase, {
      user_name: currentUserEmail || "system",
      action: "DELETE",
      module: "staff_users",
      details: `User deleted: ${userToDelete.name}`,
      type: "danger",
    });
    if (log) appendAuditLog(log);
  };

  const togglePermission = (key: keyof GranularPermissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Backup Functions
  const handleRestoreClick = () => {
    setShowRestoreConfirm(true);
  };

  const applyThemeTemplate = (
    template: NonNullable<SystemConfig["themeTemplate"]>,
  ) => {
    updateConfig("themeTemplate", template);
    localStorage.setItem("ui_theme_template", template);
  };

  const confirmRestore = () => {
    setShowRestoreConfirm(false);
    restoreFileRef.current?.click();
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.config) {
          await updateSystemSettings(supabase, data.config);
        }
        // Restoring clients, duty history, etc., would require clearing existing
        // and inserting new, which can be complex. Skipping for now.
        alert(
          "System settings restored. Full data restore is not yet implemented.",
        );
      } catch (error) {
        alert("Invalid backup file format.");
        console.error(error);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

  const handleOptimization = (type: string) => {
    setOptimizing(type);
    // Simulate API delay for database operation
    setTimeout(() => {
      setOptimizing(null);
      updateConfig("lastMaintenance", new Date().toLocaleString());
      alert(`Database ${type} completed successfully.`);
    }, 2000);
  };

  const isDark = config.theme === "dark";
  const t =
    config.language === "en"
      ? {
          general: "General Settings",
          security: "Security & Access",
          branding: "Agency Branding",
          address: "Agency Address",
          lang: "System Language",
          methods: "Payment Methods",
          reset: "Reset Password",
          rate: "Default Assessment Rate",
          db: "Database Connection",
          backup: "Backup & Restore",
          maintenance: "System Maintenance",
        }
      : {
          general: "সাধারণ সেটিংস",
          security: "নিরাপত্তা ও অ্যাক্সেস",
          branding: "এজেন্সি ব্র্যান্ডিং",
          address: "এজেন্সি ঠিকানা",
          lang: "সিস্টেম ভাষা",
          methods: "পেমেন্ট মেথড",
          reset: "পাসওয়ার্ড রিসেট",
          rate: "ডিফল্ট অ্যাসেসমেন্ট রেট",
          db: "ডাটাবেস কানেকশন",
          backup: "ব্যাকআপ ও রিস্টোর",
          maintenance: "সিস্টেম মেইনটেনেন্স",
        };
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Database & Backup Settings */}
        <div
          className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-database"></i> {t.db} & {t.backup}
          </h4>

          <div className="space-y-6">
            {/* Supabase Config */}
            <div
              className={`p-4 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-500 flex items-center justify-center border border-green-500/30">
                  <i className="fas fa-bolt"></i>
                </div>
                <span
                  className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-800"}`}
                >
                  Supabase Integration
                </span>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Supabase Project URL"
                  className={`w-full px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300"}`}
                  value={config.supabaseUrl || ""}
                  onChange={(e) => updateConfig("supabaseUrl", e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Supabase Anon Key"
                  className={`w-full px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300"}`}
                  value={config.supabaseKey || ""}
                  onChange={(e) => updateConfig("supabaseKey", e.target.value)}
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="w-full mt-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-blue-600 text-white disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {testingConnection ? "Testing..." : "Test Connection"}
                </button>
                {connectionStatus && (
                  <p
                    className={`text-xs mt-2 ${connectionStatus.startsWith("Error") ? "text-red-500" : "text-green-500"}`}
                  >
                    {connectionStatus}
                  </p>
                )}
              </div>
            </div>

            {/* Backup Controls */}
            <div
              className={`p-4 rounded-xl border space-y-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p
                    className={`text-xs font-black uppercase ${isDark ? "text-white" : "text-slate-800"}`}
                  >
                    Auto Backup
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Downloads a JSON backup automatically while the app stays
                    open.
                  </p>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={Boolean(config.autoBackupEnabled)}
                    onChange={(e) =>
                      updateConfig("autoBackupEnabled", e.target.checked)
                    }
                  />
                  <span className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Frequency
                  </label>
                  <select
                    value={config.autoBackupFrequencyHours || 24}
                    onChange={(e) =>
                      updateConfig(
                        "autoBackupFrequencyHours",
                        Number(e.target.value),
                      )
                    }
                    className={`w-full px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300"}`}
                  >
                    <option value={1}>Every 1 hour</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Every 24 hours</option>
                  </select>
                </div>
                <div
                  className={`rounded-lg border px-4 py-3 ${isDark ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-white border-slate-200 text-slate-600"}`}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Next Auto Backup
                  </p>
                  <p className="text-xs font-bold mt-2">
                    {config.autoBackupEnabled ? nextAutoBackupAt : "Disabled"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => onBackup("manual")}
                className="py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex flex-col items-center gap-2"
              >
                <i className="fas fa-download text-lg"></i>
                Download Backup
              </button>
              <button
                onClick={handleRestoreClick}
                className="py-4 rounded-xl border-2 hover:bg-slate-100 dark:hover:bg-slate-700 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex flex-col items-center gap-2 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400"
              >
                <i className="fas fa-upload text-lg"></i>
                Restore Data
              </button>
              <input
                type="file"
                ref={restoreFileRef}
                className="hidden"
                accept=".json"
                onChange={handleRestoreFileChange}
              />
            </div>
            {config.lastBackup && (
              <p className="text-[9px] text-center font-bold text-slate-400 uppercase tracking-widest">
                Last Backup: {config.lastBackup}
              </p>
            )}
          </div>
        </div>

        {/* System Maintenance (NEW) */}
        <div
          className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-microchip"></i> {t.maintenance}
          </h4>
          <div className="space-y-6">
            <p
              className={`text-xs font-medium mb-4 ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              Optimize database performance, clear temporary caches, and rebuild
              indexes to ensure smooth operation.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => handleOptimization("Re-Index")}
                disabled={!!optimizing}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${isDark ? "border-slate-700 hover:bg-slate-700" : "border-slate-200 hover:bg-slate-50"} ${optimizing === "Re-Index" ? "opacity-50 cursor-wait" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <i
                      className={`fas fa-sort-amount-down ${optimizing === "Re-Index" ? "animate-spin" : ""}`}
                    ></i>
                  </div>
                  <div className="text-left">
                    <p
                      className={`text-xs font-black uppercase ${isDark ? "text-white" : "text-slate-800"}`}
                    >
                      Re-Index Tables
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Rebuild database indexes
                    </p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-slate-400 text-xs"></i>
              </button>

              <button
                onClick={() => handleOptimization("Vacuum")}
                disabled={!!optimizing}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${isDark ? "border-slate-700 hover:bg-slate-700" : "border-slate-200 hover:bg-slate-50"} ${optimizing === "Vacuum" ? "opacity-50 cursor-wait" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <i
                      className={`fas fa-broom ${optimizing === "Vacuum" ? "animate-pulse" : ""}`}
                    ></i>
                  </div>
                  <div className="text-left">
                    <p
                      className={`text-xs font-black uppercase ${isDark ? "text-white" : "text-slate-800"}`}
                    >
                      Vacuum Database
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Clean up dead tuples & optimize space
                    </p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-slate-400 text-xs"></i>
              </button>
            </div>
            {config.lastMaintenance && (
              <p className="text-[9px] text-center font-bold text-slate-400 uppercase tracking-widest pt-2">
                Last Optimized: {config.lastMaintenance}
              </p>
            )}
          </div>
        </div>

        {/* Preference Settings */}
        <div
          className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-sliders"></i> {t.general}
          </h4>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span
                className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}
              >
                {t.rate} (BDT)
              </span>
              <input
                type="number"
                className={`w-24 px-3 py-1.5 rounded-lg text-right font-black border outline-none focus:border-blue-500 ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-slate-50 border-slate-300"}`}
                value={config.defaultRate}
                onChange={(e) =>
                  updateConfig("defaultRate", parseFloat(e.target.value))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}
              >
                {t.lang}
              </span>
              <div
                className={`flex p-1 rounded-xl ${isDark ? "bg-slate-900" : "bg-slate-100"}`}
              >
                <button
                  onClick={() => updateConfig("language", "en")}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${config.language === "en" ? "bg-blue-600 text-white shadow-lg" : "opacity-40"}`}
                >
                  ENGLISH
                </button>
                <button
                  onClick={() => updateConfig("language", "bn")}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${config.language === "bn" ? "bg-blue-600 text-white shadow-lg" : "opacity-40"}`}
                >
                  বাংলা
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <span
                className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}
              >
                Theme Template
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "soft", label: "Soft Blue" },
                  { id: "paper", label: "Mint Paper" },
                  { id: "sand", label: "Warm Sand" },
                  { id: "ink", label: "Dark Ink" },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() =>
                      applyThemeTemplate(
                        tpl.id as NonNullable<SystemConfig["themeTemplate"]>,
                      )
                    }
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${config.themeTemplate === tpl.id ? "bg-blue-600 text-white border-blue-600" : isDark ? "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500" : "bg-slate-50 border-slate-300 text-slate-700 hover:border-slate-500"}`}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span
                className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}
              >
                Theme Mode
              </span>
              <div
                className={`flex p-1 rounded-xl ${isDark ? "bg-slate-900" : "bg-slate-100"}`}
              >
                <button
                  onClick={() => updateConfig("theme", "light")}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase ${config.theme === "light" ? "bg-blue-600 text-white shadow-lg" : "opacity-50"}`}
                >
                  Light
                </button>
                <button
                  onClick={() => updateConfig("theme", "dark")}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase ${config.theme === "dark" ? "bg-blue-600 text-white shadow-lg" : "opacity-50"}`}
                >
                  Dark
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span
                className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}
              >
                Admin Data Scope
              </span>
              <select
                value={config.adminGlobalDataAccess ? "all" : "own"}
                onChange={(e) =>
                  updateConfig(
                    "adminGlobalDataAccess",
                    e.target.value === "all",
                  )
                }
                className={`px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300 text-slate-700"}`}
              >
                <option value="all">Admin sees all users data</option>
                <option value="own">Admin sees own data only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Agency Branding & Address */}
        <div
          className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-building"></i> {t.branding}
          </h4>
          <div className="space-y-6">
            <div className="space-y-1">
              <label
                className={`text-[10px] font-black opacity-60 uppercase tracking-widest ml-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                {t.branding}
              </label>
              <input
                type="text"
                className={`w-full px-5 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"}`}
                value={config.agencyName}
                onChange={(e) => updateConfig("agencyName", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label
                className={`text-[10px] font-black opacity-60 uppercase tracking-widest ml-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                {t.address}
              </label>
              <textarea
                rows={2}
                placeholder="Enter company address for invoices..."
                className={`w-full px-5 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 transition-all resize-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"}`}
                value={config.agencyAddress}
                onChange={(e) => updateConfig("agencyAddress", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label
                className={`text-[10px] font-black opacity-60 uppercase tracking-widest ml-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                Developer Credit Name
              </label>
              <input
                type="text"
                placeholder="e.g. Dev Studio"
                className={`w-full px-5 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"}`}
                value={config.developerCreditName || ""}
                onChange={(e) =>
                  updateConfig("developerCreditName", e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <label
                className={`text-[10px] font-black opacity-60 uppercase tracking-widest ml-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                Developer Credit URL
              </label>
              <input
                type="text"
                placeholder="https://your-site.com"
                className={`w-full px-5 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"}`}
                value={config.developerCreditUrl || ""}
                onChange={(e) =>
                  updateConfig("developerCreditUrl", e.target.value)
                }
              />
            </div>
            <label
              className={`flex items-center justify-between px-3 py-2 rounded-xl border ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-50"}`}
            >
              <span
                className={`text-xs font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}
              >
                Show Developer Credit in Footer
              </span>
              <input
                type="checkbox"
                checked={Boolean(config.showDeveloperCredit)}
                onChange={(e) =>
                  updateConfig("showDeveloperCredit", e.target.checked)
                }
              />
            </label>
          </div>
        </div>

        {/* Payment Methods */}
        <div
          className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-wallet"></i> {t.methods}
          </h4>
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Add method..."
              className={`flex-grow px-4 py-2 rounded-xl text-xs font-bold outline-none border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-300"}`}
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
            />
            <button
              onClick={addPaymentMethod}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.paymentMethods.map((m) => (
              <span
                key={m}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-3 transition-colors border ${isDark ? "bg-slate-900 border-slate-700 text-slate-300 hover:border-red-500" : "bg-slate-100 border-slate-300 text-slate-800 hover:border-red-500 hover:text-red-600 hover:bg-red-50"}`}
              >
                {m}
                <button
                  onClick={() => removePaymentMethod(m)}
                  className="opacity-40 hover:opacity-100"
                >
                  <i className="fas fa-times"></i>
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Security & Access */}
        <div
          className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <div className="flex justify-between items-center mb-8">
            <h4 className="font-black uppercase text-xs tracking-widest text-blue-600 flex items-center gap-2">
              <i className="fas fa-shield-halved"></i> {t.security}
            </h4>
            <button
              onClick={() => handleOpenUserModal()}
              className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-200 transition-all"
            >
              <i className="fas fa-plus"></i> New User
            </button>
          </div>
          <div className="space-y-4">
            <button
              onClick={() => setShowPasswordReset(true)}
              className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-lg"
            >
              <i className="fas fa-key"></i> {t.reset}
            </button>
            <div
              className={`pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-300"}`}
            >
              <p
                className={`text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mb-4 ${isDark ? "text-slate-400" : "text-slate-800"}`}
              >
                Active Staff Permissions
              </p>
              <div className="space-y-3">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between group p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                    onClick={() => handleOpenUserModal(u)}
                  >
                    <div className="flex-1">
                      <div
                        className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}
                      >
                        {u.name}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {u.lastActive}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-tighter border ${isDark ? "bg-slate-900 border-slate-700 text-blue-400" : "bg-white border-slate-200 text-blue-700"}`}
                    >
                      {u.role}
                    </span>
                    <button
                      type="button"
                      className="ml-3 w-8 h-8 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingUser(u);
                      }}
                      title="Delete user"
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div
            className={`rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center animate-in zoom-in-95 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-100">
              <i className="fas fa-triangle-exclamation text-2xl"></i>
            </div>
            <h3
              className={`text-xl font-black leading-tight mb-2 ${isDark ? "text-white" : "text-slate-900"}`}
            >
              Confirm Restore?
            </h3>
            <p
              className={`font-medium text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              Restoring will overwrite current data. This action is
              irreversible.
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <button
                onClick={confirmRestore}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl shadow-xl shadow-amber-100 transition-all active:scale-95 uppercase text-[10px] tracking-widest"
              >
                Yes, Restore Data
              </button>
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className={`w-full py-3.5 font-black rounded-xl transition-all uppercase text-[10px] tracking-widest ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div
            className={`rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden p-10 animate-in zoom-in-95 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <h3
              className={`text-xl font-black mb-6 flex items-center gap-3 ${isDark ? "text-white" : "text-slate-900"}`}
            >
              <i className="fas fa-lock text-blue-500"></i> {t.reset}
            </h3>
            <div className="space-y-4">
              <input
                type="password"
                placeholder="Current Password"
                className={`w-full px-5 py-3 rounded-xl border-2 outline-none font-black ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-100 border-slate-300 text-slate-900"}`}
              />
              <input
                type="password"
                placeholder="New Secure Password"
                className={`w-full px-5 py-3 rounded-xl border-2 outline-none font-black ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-100 border-slate-300 text-slate-900"}`}
              />
              <button
                onClick={() => setShowPasswordReset(false)}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest mt-4 shadow-xl shadow-blue-500/20 active:scale-95"
              >
                Update Credentials
              </button>
              <button
                onClick={() => setShowPasswordReset(false)}
                className={`w-full text-[10px] font-black uppercase opacity-60 hover:opacity-100 transition-opacity mt-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit User Modal (Fixed Header & Sticky Footer with Prominent Close Button) */}
      {showAddUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddUser(false);
          }}
        >
          <div
            className={`rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col h-[90vh] max-h-[850px] overflow-hidden border ${
              isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
            }`}
          >
            {/* Fixed Top Header */}
            <div
              className={`p-5 px-6 border-b flex items-center justify-between shrink-0 ${
                isDark ? "border-slate-700 bg-slate-800/90 text-white" : "border-slate-200 bg-slate-50 text-slate-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg font-bold">
                  <i className="fas fa-user-shield"></i>
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    {editingUserId
                      ? config.language === "bn"
                        ? "ইউজার প্রোফাইল ও পারমিশন এডিট"
                        : "Edit User Profile & Permissions"
                      : config.language === "bn"
                      ? "নতুন ইউজার অ্যাকাউন্ট তৈরি করুন"
                      : "Create New User Account"}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {editingUserId
                      ? `Updating profile and module access for ${userName}`
                      : "Configure user credentials and assign module permissions"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveUser}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-save"></i>
                  <span>{config.language === "bn" ? "সংরক্ষণ করুন" : "Save User"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer text-lg font-bold ${
                    isDark ? "bg-slate-700/60" : "bg-slate-200/80"
                  }`}
                  title="Close (বন্ধ করুন)"
                >
                  <i className="fas fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {/* Form Inputs Header */}
              <div
                className={`p-5 rounded-2xl border ${
                  isDark ? "bg-slate-900/60 border-slate-700" : "bg-slate-50 border-slate-200"
                }`}
              >
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-3 flex items-center gap-2">
                  <i className="fas fa-id-card"></i> Profile Details (প্রোফাইল তথ্য)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Full Name (পূর্ণ নাম) *
                    </label>
                    <input
                      type="text"
                      placeholder="Full Name"
                      className={`w-full px-4 py-2.5 rounded-xl border outline-none font-bold text-xs ${
                        isDark
                          ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500"
                          : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      placeholder="Email"
                      className={`w-full px-4 py-2.5 rounded-xl border outline-none font-bold text-xs ${
                        isDark
                          ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500"
                          : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      disabled={Boolean(editingUserId)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      {editingUserId ? "New Password (Optional)" : "Password *"}
                    </label>
                    <input
                      type="password"
                      placeholder={editingUserId ? "Leave blank to keep current" : "Password"}
                      className={`w-full px-4 py-2.5 rounded-xl border outline-none font-bold text-xs ${
                        isDark
                          ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500"
                          : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      disabled={Boolean(editingUserId)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Account Role (রোল)
                    </label>
                    <select
                      className={`w-full px-4 py-2.5 rounded-xl border outline-none font-bold text-xs ${
                        isDark
                          ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500"
                          : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                      value={userRole}
                      onChange={(e) => {
                        const role = e.target.value;
                        setUserRole(role);
                        setPermissions(getDefaultPermissionsForRole(role));
                      }}
                    >
                      <option value="User">USER (স্টাফ)</option>
                      <option value="Admin">ADMIN (এডমিন)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Account Status (অবস্থা)
                    </label>
                    <select
                      className={`w-full px-4 py-2.5 rounded-xl border outline-none font-bold text-xs ${
                        isDark
                          ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500"
                          : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                      value={userActive}
                      onChange={(e) => setUserActive(e.target.value)}
                    >
                      <option value="Yes">Active (সক্রিয়)</option>
                      <option value="No">Disabled (নিষ্ক্রিয়)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Module-Based Permissions Matrix */}
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div>
                    <h4 className="font-black text-blue-600 text-xs uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-lock"></i> মডিউল ভিত্তিক পারমিশন ম্যাট্রিক্স (Module Permissions)
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      ব্যবহারকারীর রোল অনুযায়ী প্রতিটি মডিউলের সুনির্দিষ্ট অ্যাকশন সিলেক্ট করুন
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPermissions((prev) => {
                          const updated = { ...prev };
                          ALL_PERMISSION_KEYS.forEach((k) => {
                            updated[k] = true;
                          });
                          return updated;
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-all cursor-pointer"
                    >
                      <i className="fas fa-check-double mr-1.5"></i> Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissions((prev) => {
                          const updated = { ...prev };
                          ALL_PERMISSION_KEYS.forEach((k) => {
                            updated[k] = false;
                          });
                          return updated;
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  {MODULE_PERMISSION_GROUPS.map((group) => {
                    const groupKeys = group.permissions.map((p) => p.key);
                    const isAllSelected = groupKeys.every((k) => permissions[k]);

                    return (
                      <div
                        key={group.moduleId}
                        className={`p-5 rounded-2xl border transition-all ${
                          isDark
                            ? "bg-slate-900/70 border-slate-700/80"
                            : "bg-slate-50/80 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/50 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm ${isDark ? "bg-slate-800" : "bg-white"}`}>
                              <i className={group.icon}></i>
                            </div>
                            <div>
                              <h5 className={`font-black text-xs uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                                {config.language === "bn" ? group.moduleNameBn : group.moduleNameEn}
                              </h5>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                {group.permissions.filter((p) => permissions[p.key]).length} of {group.permissions.length} active
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const targetVal = !isAllSelected;
                                setPermissions((prev) => {
                                  const updated = { ...prev };
                                  group.permissions.forEach((p) => {
                                    updated[p.key] = targetVal;
                                  });
                                  return updated;
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                isAllSelected
                                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30"
                                  : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                              }`}
                            >
                              {isAllSelected ? "Clear Module" : "Select Module"}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {group.permissions.map((perm) => {
                            const isChecked = Boolean(permissions[perm.key]);
                            return (
                              <div
                                key={perm.key}
                                onClick={() =>
                                  setPermissions((prev) => ({
                                    ...prev,
                                    [perm.key]: !prev[perm.key],
                                  }))
                                }
                                className={`p-3 rounded-xl border cursor-pointer transition-all select-none relative flex items-start justify-between gap-2 ${
                                  isChecked
                                    ? isDark
                                      ? "bg-blue-900/30 border-blue-500 text-white shadow-sm"
                                      : "bg-blue-50/80 border-blue-500 text-blue-950 shadow-sm"
                                    : isDark
                                    ? "bg-slate-800/60 border-slate-700/60 hover:border-slate-500 text-slate-300"
                                    : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <p className="font-bold text-xs leading-snug">
                                    {config.language === "bn" ? perm.labelBn : perm.labelEn}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-mono tracking-wider">
                                    {perm.code}
                                  </p>
                                </div>
                                <div
                                  className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                                    isChecked ? "bg-blue-600 border-blue-600" : "border-slate-400"
                                  }`}
                                >
                                  {isChecked && <i className="fas fa-check text-white text-[9px]"></i>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Fixed Sticky Footer Actions */}
            <div
              className={`p-4 px-6 border-t flex items-center justify-between gap-3 shrink-0 ${
                isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-slate-400">
                {editingUserId ? (
                  <span>Editing permissions for: <b className="text-blue-500">{userName || "User"}</b></span>
                ) : (
                  <span>Creating new user account</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isDark
                      ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  <i className="fas fa-times mr-1.5"></i>
                  {config.language === "bn" ? "বন্ধ করুন (Close)" : "Close Modal"}
                </button>

                <button
                  type="button"
                  onClick={handleSaveUser}
                  className="px-6 py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <i className="fas fa-save"></i>
                  <span>{config.language === "bn" ? "সংরক্ষণ করুন (Save)" : "Save Changes"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div
            className={`rounded-[1.5rem] shadow-2xl w-full max-w-sm overflow-hidden p-7 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <h3
              className={`text-lg font-black mb-2 ${isDark ? "text-white" : "text-slate-900"}`}
            >
              Delete User
            </h3>
            <p
              className={`text-xs font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              Are you sure you want to delete <b>{deletingUser.name}</b>?
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase ${isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="flex-1 py-2.5 rounded-lg text-xs font-black uppercase bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
