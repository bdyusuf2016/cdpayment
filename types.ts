
export interface Client {
  ain: string;
  name: string;
  phone: string;
  phones?: string[];
  active: boolean;
  circle?: string;
}

export interface DutyItem {
  id: string;
  beNumber: string;
  year: string;
  duty: number;
  ain?: string;
  clientName?: string;
  phone?: string;
}

export interface PaymentRecord {
  id: string;
  date: string;
  receiveDate?: string;
  ain: string;
  clientName: string;
  phone: string;
  comments?: string;
  beYear: string;
  duty: number;
  received: number;
  status: 'Completed' | 'Pending' | 'Paid' | 'New';
  profit: number;
  paymentMethod?: string;
  rNo?: string;
}

export interface AssessmentItem {
  id: string;
  ain: string;
  clientName: string;
  phone: string;
  comments?: string;
  nosOfBe: number;
  rate: number;
  amount: number;
  discount: number;
  net: number;
}

export interface AssessmentRecord extends Omit<PaymentRecord, 'duty' | 'beYear'> {
  nosOfBe: number;
  rate: number;
  amount: number;
  discount: number;
  net: number;
}

export interface WasteCompany {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  active: boolean;
}

export interface Vendor {
  id: string;
  vendorName: string;
  ownerName?: string;
  phone?: string;
  binNo?: string;
  eTinNo?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdAt?: string;
}

export interface WasteRecord {
  id: string;
  date: string;
  companyId: string;
  companyName: string;
  carType: 'Wastage & Garbage' | 'Garbage Only' | 'Wastage Only';
  garbageTrips: number;
  wastageTrips: number;
  totalTrips: number;
  ratePerTrip: number;
  amount: number;
  received: number;
  due: number;
  paymentMethod?: string;
  notes?: string;
  status: 'Paid' | 'Partial' | 'Unpaid';
}

export interface ClearanceRecord {
  id: string;
  date: string;
  totalClearance: number;
  notes?: string;
  slNo?: string;
  clientName?: string;
  assessableValue?: number;
  cd?: number;
  rd?: number;
  vat?: number;
  ait?: number;
  atvAt?: number;
  dutyTax?: number;
  trnxId?: string;
  paymentDate?: string;
  paymentStatus?: "Paid" | "Unpaid";
  circle?: string;
  inWord?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  createdAt?: string;
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
  report_view: boolean;
  settings_manage: boolean;
  [key: string]: boolean;
}

export interface StaffUser {
  id: string;
  authId?: string;
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
  developerCreditName?: string;
  developerCreditUrl?: string;
  showDeveloperCredit?: boolean;
  autoInvoice: boolean;
  currency: string;
  theme: 'light' | 'dark';
  themeTemplate?: 'soft' | 'paper' | 'sand' | 'ink';
  language: 'en' | 'bn';
  paymentMethods: string[];
  adminGlobalDataAccess?: boolean;
  // Supabase & Backup Settings
  supabaseUrl?: string;
  supabaseKey?: string;
  lastBackup?: string;
  autoBackupEnabled?: boolean;
  autoBackupFrequencyHours?: number;
  lastMaintenance?: string;
}

export type TabType =
  | 'duty'
  | 'assessment'
  | 'clearance'
  | 'wasteCompanies'
  | 'waste'
  | 'vendors'
  | 'ain'
  | 'reports'
  | 'admin'
  | 'logs'
  | 'settings';
