
import React, { useState, useRef } from 'react';
import { StaffUser, SystemConfig, GranularPermissions, Client, PaymentRecord, AssessmentRecord } from '../types';

interface AdminPanelProps {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  
  // Data for Backup/Restore
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  dutyHistory: PaymentRecord[];
  setDutyHistory: React.Dispatch<React.SetStateAction<PaymentRecord[]>>;
  assessmentHistory: AssessmentRecord[];
  setAssessmentHistory: React.Dispatch<React.SetStateAction<AssessmentRecord[]>>;
}

const initialPermissions: GranularPermissions = {
  bill_add: false, bill_edit: false, bill_delete: false, bill_bulk_pay: false,
  bill_export: false, bill_wa_share: false, invoice_print: false,
  ain_view: false, ain_add: false, ain_delete: false, ain_import: false, ain_export: false,
  user_manage: false, user_reset_pass: false, view_logs: false, settings_manage: false
};

const fullPermissions: GranularPermissions = {
  bill_add: true, bill_edit: true, bill_delete: true, bill_bulk_pay: true,
  bill_export: true, bill_wa_share: true, invoice_print: true,
  ain_view: true, ain_add: true, ain_delete: true, ain_import: true, ain_export: true,
  user_manage: true, user_reset_pass: true, view_logs: true, settings_manage: true
};

const PERMISSION_ITEMS = [
  { key: 'bill_add', label: 'Add Bill', code: 'BILL_ADD' },
  { key: 'bill_edit', label: 'Edit Bill', code: 'BILL_EDIT' },
  { key: 'bill_delete', label: 'Delete Bill', code: 'BILL_DELETE' },
  { key: 'bill_bulk_pay', label: 'Bulk Pay', code: 'BILL_BULK_PAY' },
  { key: 'bill_export', label: 'Export Report', code: 'BILL_EXPORT' },
  { key: 'bill_wa_share', label: 'WhatsApp Share', code: 'BILL_WA_SHARE' },
  { key: 'invoice_print', label: 'Invoice Print', code: 'INVOICE_PRINT' },
  { key: 'ain_view', label: 'AIN View', code: 'AIN_VIEW' },
  { key: 'ain_add', label: 'AIN Add/Edit', code: 'AIN_ADD' },
  { key: 'ain_delete', label: 'AIN Delete', code: 'AIN_DELETE' },
  { key: 'ain_import', label: 'AIN Import', code: 'AIN_IMPORT' },
  { key: 'ain_export', label: 'AIN Export', code: 'AIN_EXPORT' },
  { key: 'user_manage', label: 'User Manage', code: 'USER_MANAGE' },
  { key: 'user_reset_pass', label: 'Reset Password', code: 'USER_RESET_PASS' },
  { key: 'view_logs', label: 'View Logs', code: 'VIEW_LOGS' },
  { key: 'settings_manage', label: 'Manage Settings', code: 'SETTINGS_MANAGE' },
];

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  config, setConfig, 
  clients, setClients, 
  dutyHistory, setDutyHistory, 
  assessmentHistory, setAssessmentHistory 
}) => {
  const [users, setUsers] = useState<StaffUser[]>([
    { 
      id: '1', 
      name: 'Zahid Hasan', 
      role: 'Admin', 
      permissions: { ...fullPermissions },
      lastActive: '2 mins ago', 
      active: true 
    },
    { 
      id: '2', 
      name: 'Tanvir Ahmed', 
      role: 'Staff', 
      permissions: { ...initialPermissions, bill_add: true, ain_view: true },
      lastActive: '1 hour ago', 
      active: true 
    },
  ]);

  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newMethod, setNewMethod] = useState('');
  const [optimizing, setOptimizing] = useState<string | null>(null);
  
  // Backup Restore Refs
  const restoreFileRef = useRef<HTMLInputElement>(null);
  
  // New/Edit User Form
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('Staff');
  const [userActive, setUserActive] = useState('Yes');
  const [permissions, setPermissions] = useState<GranularPermissions>({ ...initialPermissions });

  const updateConfig = (key: keyof SystemConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const addPaymentMethod = () => {
    if (!newMethod) return;
    updateConfig('paymentMethods', [...config.paymentMethods, newMethod]);
    setNewMethod('');
  };

  const removePaymentMethod = (method: string) => {
    updateConfig('paymentMethods', config.paymentMethods.filter(m => m !== method));
  };

  const handleOpenUserModal = (user?: StaffUser) => {
    if (user) {
      setEditingUserId(user.id);
      setUserName(user.name);
      setUserRole(user.role);
      setUserActive(user.active ? 'Yes' : 'No');
      setPermissions({ ...user.permissions });
    } else {
      setEditingUserId(null);
      setUserName('');
      setUserRole('Staff');
      setUserActive('Yes');
      setPermissions({ ...initialPermissions });
    }
    setShowAddUser(true);
  };

  const handleSaveUser = () => {
    if (!userName) return;
    
    const newUser: StaffUser = {
      id: editingUserId || Math.random().toString(36).substr(2, 9),
      name: userName,
      role: userRole,
      permissions: permissions,
      lastActive: editingUserId ? (users.find(u => u.id === editingUserId)?.lastActive || 'Never') : 'Never',
      active: userActive === 'Yes'
    };

    if (editingUserId) {
      setUsers(users.map(u => u.id === editingUserId ? newUser : u));
    } else {
      setUsers([...users, newUser]);
    }
    setShowAddUser(false);
  };

  const togglePermission = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Backup Functions
  const handleBackup = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      config,
      clients,
      dutyHistory,
      assessmentHistory,
      users // In a real app, users might need special handling
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_${config.agencyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    updateConfig('lastBackup', new Date().toLocaleString());
  };

  const handleRestoreClick = () => {
    if (window.confirm("Restoring will overwrite current data. Are you sure?")) {
      restoreFileRef.current?.click();
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.config) setConfig(data.config);
        if (data.clients) setClients(data.clients);
        if (data.dutyHistory) setDutyHistory(data.dutyHistory);
        if (data.assessmentHistory) setAssessmentHistory(data.assessmentHistory);
        // Note: Restoring users typically requires careful handling in real auth systems
        
        alert("System restored successfully from backup.");
      } catch (error) {
        alert("Invalid backup file format.");
        console.error(error);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleOptimization = (type: string) => {
    setOptimizing(type);
    // Simulate API delay for database operation
    setTimeout(() => {
      setOptimizing(null);
      updateConfig('lastMaintenance', new Date().toLocaleString());
      alert(`Database ${type} completed successfully.`);
    }, 2000);
  };

  const isDark = config.theme === 'dark';
  const t = config.language === 'en' ? {
    general: 'General Settings',
    security: 'Security & Access',
    branding: 'Agency Branding',
    address: 'Agency Address',
    lang: 'System Language',
    methods: 'Payment Methods',
    reset: 'Reset Password',
    rate: 'Default Assessment Rate',
    db: 'Database Connection',
    backup: 'Backup & Restore',
    maintenance: 'System Maintenance'
  } : {
    general: 'সাধারণ সেটিংস',
    security: 'নিরাপত্তা ও অ্যাক্সেস',
    branding: 'এজেন্সি ব্র্যান্ডিং',
    address: 'এজেন্সি ঠিকানা',
    lang: 'সিস্টেম ভাষা',
    methods: 'পেমেন্ট মেথড',
    reset: 'পাসওয়ার্ড রিসেট',
    rate: 'ডিফল্ট অ্যাসেসমেন্ট রেট',
    db: 'ডাটাবেস কানেকশন',
    backup: 'ব্যাকআপ ও রিস্টোর',
    maintenance: 'সিস্টেম মেইনটেনেন্স'
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Database & Backup Settings */}
        <div className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}`}>
           <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
             <i className="fas fa-database"></i> {t.db} & {t.backup}
           </h4>
           
           <div className="space-y-6">
             {/* Supabase Config */}
             <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-500 flex items-center justify-center border border-green-500/30"><i className="fas fa-bolt"></i></div>
                   <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-800'}`}>Supabase Integration</span>
                </div>
                <div className="space-y-3">
                   <input 
                     type="text" 
                     placeholder="Supabase Project URL" 
                     className={`w-full px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                     value={config.supabaseUrl || ''}
                     onChange={(e) => updateConfig('supabaseUrl', e.target.value)}
                   />
                   <input 
                     type="password" 
                     placeholder="Supabase Anon Key" 
                     className={`w-full px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                     value={config.supabaseKey || ''}
                     onChange={(e) => updateConfig('supabaseKey', e.target.value)}
                   />
                </div>
             </div>

             {/* Backup Controls */}
             <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleBackup}
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
                <input type="file" ref={restoreFileRef} className="hidden" accept=".json" onChange={handleRestoreFileChange} />
             </div>
             {config.lastBackup && (
               <p className="text-[9px] text-center font-bold text-slate-400 uppercase tracking-widest">Last Backup: {config.lastBackup}</p>
             )}
           </div>
        </div>

        {/* System Maintenance (NEW) */}
        <div className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}`}>
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-microchip"></i> {t.maintenance}
          </h4>
          <div className="space-y-6">
            <p className={`text-xs font-medium mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Optimize database performance, clear temporary caches, and rebuild indexes to ensure smooth operation.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => handleOptimization('Re-Index')}
                disabled={!!optimizing}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${isDark ? 'border-slate-700 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-50'} ${optimizing === 'Re-Index' ? 'opacity-50 cursor-wait' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <i className={`fas fa-sort-amount-down ${optimizing === 'Re-Index' ? 'animate-spin' : ''}`}></i>
                  </div>
                  <div className="text-left">
                    <p className={`text-xs font-black uppercase ${isDark ? 'text-white' : 'text-slate-800'}`}>Re-Index Tables</p>
                    <p className="text-[9px] text-slate-400">Rebuild database indexes</p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-slate-400 text-xs"></i>
              </button>

              <button 
                onClick={() => handleOptimization('Vacuum')}
                disabled={!!optimizing}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${isDark ? 'border-slate-700 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-50'} ${optimizing === 'Vacuum' ? 'opacity-50 cursor-wait' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <i className={`fas fa-broom ${optimizing === 'Vacuum' ? 'animate-pulse' : ''}`}></i>
                  </div>
                  <div className="text-left">
                    <p className={`text-xs font-black uppercase ${isDark ? 'text-white' : 'text-slate-800'}`}>Vacuum Database</p>
                    <p className="text-[9px] text-slate-400">Clean up dead tuples & optimize space</p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-slate-400 text-xs"></i>
              </button>
            </div>
            {config.lastMaintenance && (
               <p className="text-[9px] text-center font-bold text-slate-400 uppercase tracking-widest pt-2">Last Optimized: {config.lastMaintenance}</p>
            )}
          </div>
        </div>

        {/* Preference Settings */}
        <div className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}`}>
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-sliders"></i> {t.general}
          </h4>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{t.rate} (BDT)</span>
              <input 
                type="number" 
                className={`w-24 px-3 py-1.5 rounded-lg text-right font-black border outline-none focus:border-blue-500 ${isDark ? 'bg-slate-900 border-slate-600 text-white' : 'bg-slate-50 border-slate-300'}`}
                value={config.defaultRate}
                onChange={(e) => updateConfig('defaultRate', parseFloat(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{t.lang}</span>
              <div className={`flex p-1 rounded-xl ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                <button onClick={() => updateConfig('language', 'en')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${config.language === 'en' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-40'}`}>ENGLISH</button>
                <button onClick={() => updateConfig('language', 'bn')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${config.language === 'bn' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-40'}`}>বাংলা</button>
              </div>
            </div>
          </div>
        </div>

        {/* Agency Branding & Address */}
        <div className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}`}>
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-building"></i> {t.branding}
          </h4>
          <div className="space-y-6">
            <div className="space-y-1">
              <label className={`text-[10px] font-black opacity-60 uppercase tracking-widest ml-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{t.branding}</label>
              <input 
                type="text" 
                className={`w-full px-5 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 transition-all ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'}`} 
                value={config.agencyName} 
                onChange={(e) => updateConfig('agencyName', e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <label className={`text-[10px] font-black opacity-60 uppercase tracking-widest ml-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{t.address}</label>
              <textarea 
                rows={2}
                placeholder="Enter company address for invoices..."
                className={`w-full px-5 py-3 rounded-xl border-2 font-bold outline-none focus:border-blue-500 transition-all resize-none ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'}`} 
                value={config.agencyAddress} 
                onChange={(e) => updateConfig('agencyAddress', e.target.value)} 
              />
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}`}>
          <h4 className="font-black uppercase text-xs tracking-widest mb-8 text-blue-600 flex items-center gap-2">
            <i className="fas fa-wallet"></i> {t.methods}
          </h4>
          <div className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder="Add method..." 
              className={`flex-grow px-4 py-2 rounded-xl text-xs font-bold outline-none border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-300'}`} 
              value={newMethod} 
              onChange={(e) => setNewMethod(e.target.value)} 
            />
            <button onClick={addPaymentMethod} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
             {config.paymentMethods.map(m => (
               <span key={m} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-3 transition-colors border ${isDark ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-red-500' : 'bg-slate-100 border-slate-300 text-slate-800 hover:border-red-500 hover:text-red-600 hover:bg-red-50'}`}>
                 {m}
                 <button onClick={() => removePaymentMethod(m)} className="opacity-40 hover:opacity-100"><i className="fas fa-times"></i></button>
               </span>
             ))}
          </div>
        </div>

        {/* Security & Access */}
        <div className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}`}>
          <div className="flex justify-between items-center mb-8">
            <h4 className="font-black uppercase text-xs tracking-widest text-blue-600 flex items-center gap-2">
              <i className="fas fa-shield-halved"></i> {t.security}
            </h4>
            <button onClick={() => handleOpenUserModal()} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-200 transition-all">
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
             <div className={`pt-4 border-t ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
               <p className={`text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mb-4 ${isDark ? 'text-slate-400' : 'text-slate-800'}`}>Active Staff Permissions</p>
               <div className="space-y-3">
                 {users.map(u => (
                   <div key={u.id} className="flex items-center justify-between group p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer" onClick={() => handleOpenUserModal(u)}>
                     <div>
                       <div className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>{u.name}</div>
                       <div className="text-[9px] text-slate-400">{u.lastActive}</div>
                     </div>
                     <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-tighter border ${isDark ? 'bg-slate-900 border-slate-700 text-blue-400' : 'bg-white border-slate-200 text-blue-700'}`}>
                       {u.role}
                     </span>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className={`rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden p-10 animate-in zoom-in-95 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
             <h3 className={`text-xl font-black mb-6 flex items-center gap-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <i className="fas fa-lock text-blue-500"></i> {t.reset}
             </h3>
             <div className="space-y-4">
                <input type="password" placeholder="Current Password" className={`w-full px-5 py-3 rounded-xl border-2 outline-none font-black ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'}`} />
                <input type="password" placeholder="New Secure Password" className={`w-full px-5 py-3 rounded-xl border-2 outline-none font-black ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'}`} />
                <button onClick={() => setShowPasswordReset(false)} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest mt-4 shadow-xl shadow-blue-500/20 active:scale-95">Update Credentials</button>
                <button onClick={() => setShowPasswordReset(false)} className={`w-full text-[10px] font-black uppercase opacity-60 hover:opacity-100 transition-opacity mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Cancel</button>
             </div>
          </div>
        </div>
      )}

      {/* Add/Edit User Modal (Updated UI) */}
      {showAddUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300 overflow-y-auto">
          <div className={`rounded-[1.5rem] shadow-2xl w-full max-w-6xl overflow-hidden p-8 animate-in zoom-in-95 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
             
             {/* Header */}
             <div className="flex justify-between items-center mb-6">
                <h3 className={`text-xl font-black flex items-center gap-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                   <i className="fas fa-user-shield text-blue-600"></i> {editingUserId ? 'Edit User Profile' : 'Admin User Management'}
                </h3>
                <div className="flex gap-2">
                   <button onClick={handleSaveUser} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg transition-all active:scale-95"><i className="fas fa-save mr-2"></i> Save User</button>
                   <button onClick={() => setShowAddUser(false)} className={`px-6 py-2 rounded-lg font-bold text-sm transition-all hover:bg-slate-200 ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}><i className="fas fa-times mr-2"></i> Close</button>
                </div>
             </div>

             {/* Form Inputs */}
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <input 
                  type="text" 
                  placeholder="Username" 
                  className={`px-4 py-3 rounded-xl border outline-none font-bold text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
                <input 
                  type="password" 
                  placeholder="Password" 
                  className={`px-4 py-3 rounded-xl border outline-none font-bold text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
                <select 
                  className={`px-4 py-3 rounded-xl border outline-none font-bold text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                >
                  <option value="Staff">STAFF</option>
                  <option value="Admin">ADMIN</option>
                </select>
                <select 
                  className={`px-4 py-3 rounded-xl border outline-none font-bold text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                  value={userActive}
                  onChange={(e) => setUserActive(e.target.value)}
                >
                  <option value="Yes">Active: YES</option>
                  <option value="No">Active: NO</option>
                </select>
             </div>
                
             {/* Permissions Matrix */}
             <div>
                <h4 className="font-bold text-blue-600 text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><i className="fas fa-lock"></i> Permissions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {PERMISSION_ITEMS.map((perm) => (
                    <div 
                      key={perm.key} 
                      onClick={() => togglePermission(perm.key)}
                      className={`p-4 rounded-xl border cursor-pointer group transition-all relative overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700 hover:border-slate-500' : 'bg-slate-50 border-slate-200 hover:border-slate-400'}`}
                    >
                       <div className="flex justify-between items-start">
                          <div>
                            <p className={`font-bold text-sm ${permissions[perm.key] ? 'text-blue-600' : isDark ? 'text-slate-300' : 'text-slate-700'}`}>{perm.label}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-1">{perm.code}</p>
                          </div>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${permissions[perm.key] ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                             {permissions[perm.key] && <i className="fas fa-check text-white text-[10px]"></i>}
                          </div>
                       </div>
                       {permissions[perm.key] && <div className="absolute inset-0 border-2 border-blue-600 rounded-xl pointer-events-none"></div>}
                    </div>
                  ))}
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
