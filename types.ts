
export interface Client {
  ain: string;
  name: string;
  phone: string;
  active: boolean;
}

export interface DutyItem {
  id: string;
  beNumber: string;
  year: string;
  duty: number;
}

export interface PaymentRecord {
  id: string;
  date: string;
  ain: string;
  client_name: string;
  phone: string;
  be_year: string;
  duty: number;
  received: number;
  status: 'Completed' | 'Pending' | 'Paid' | 'New';
  profit: number;
  payment_method?: string;
}

export interface AssessmentItem {
  id: string;
  nosOfBe: number;
  rate: number;
  amount: number;
  discount: number;
  net: number;
}

export interface AssessmentRecord extends Omit<PaymentRecord, 'duty' | 'be_year'> {
  nosOfBe: number;
  rate: number;
  amount: number;
  discount: number;
  net: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  details: string;
  type: 'info' | 'warning' | 'danger' | 'success';
}

export interface GranularPermissions {
  bill_add: boolean;
  bill_edit: boolean;
  bill_delete: boolean;
  bill_bulk_pay: boolean;
  bill_export: boolean;
  bill_wa_share: boolean;
  invoice_print: boolean;
  ain_view: boolean;
  ain_add: boolean;
  ain_delete: boolean;
  ain_import: boolean;
  ain_export: boolean;
  user_manage: boolean;
  user_reset_pass: boolean;
  view_logs: boolean;
  settings_manage: boolean;
  [key: string]: boolean;
}

export interface StaffUser {
  id: string;
  name: string;
  role: string; // 'Admin' | 'Staff' | 'Viewer'
  permissions: GranularPermissions;
  lastActive: string;
  active: boolean;
}

export interface SystemConfig {
  defaultRate: number;
  agencyName: string;
  agencyAddress: string;
  autoInvoice: boolean;
  currency: string;
  theme: 'light' | 'dark';
  language: 'en' | 'bn';
  paymentMethods: string[];
  // Supabase & Backup Settings
  supabaseUrl?: string;
  supabaseKey?: string;
  lastBackup?: string;
  lastMaintenance?: string;
}

export type TabType = 'duty' | 'assessment' | 'ain' | 'admin' | 'logs' | 'settings';
