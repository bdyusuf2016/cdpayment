import React, { useEffect, useMemo, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { SystemConfig, WasteCompany, WasteRecord } from "../types";
import { createSimplePdfBlob } from "../utils/simplePdf";
import { PdfSettingsModal, PdfSettings } from "./PdfSettingsModal";
import { printElement } from "../utils/printTable";
import { useResizableColumns } from "../utils/useResizableColumns";
import ColumnVisibilityToggle from "./ColumnVisibilityToggle";
import {
  deleteWasteRecord,
  insertWasteRecord,
  updateWasteRecord,
} from "../utils/supabaseApi";

interface WasteManagementProps {
  companies: WasteCompany[];
  history: WasteRecord[];
  setHistory: React.Dispatch<React.SetStateAction<WasteRecord[]>>;
  onVisibleRowsChange: (rows: WasteRecord[]) => void;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
  dashboardFilter?: "all" | "received" | "due";
}

const CAR_TYPES: WasteRecord["carType"][] = [
  "Wastage & Garbage",
  "Garbage Only",
  "Wastage Only",
];

const getTodayDateInputValue = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().split("T")[0];
};

const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(0);
  if (dateStr.includes("/")) {
    const [day, month, year] = dateStr.split("/");
    const parsed = new Date(`${year}-${month}-${day}`);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const formatDisplayDate = (value: string): string => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const convertDisplayDateToInput = (displayDate: string): string => {
  if (displayDate.includes("/")) {
    const [day, month, year] = displayDate.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return displayDate;
};

const updateSettleDateInNotes = (existingNotes: string | null | undefined, newDateStr: string): string => {
  const noteAppend = `Settle Date: ${formatDisplayDate(newDateStr)}`;
  if (!existingNotes) return noteAppend;

  let cleaned = existingNotes.replace(/Settle Date:\s*[^|]+/gi, "").trim();
  cleaned = cleaned
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" | ");

  return cleaned ? `${cleaned} | ${noteAppend}` : noteAppend;
};

const money = (value: number) => `Tk ${value.toLocaleString("en-BD")}`;
const formatRate = (value: number) => (value > 0 ? money(value) : "Optional");

const getCarTypeFromTrips = (
  garbageTripsValue: string,
  wastageTripsValue: string,
): WasteRecord["carType"] | null => {
  const garbage = Math.max(0, Number(garbageTripsValue) || 0);
  const wastage = Math.max(0, Number(wastageTripsValue) || 0);

  if (garbage > 0 && wastage > 0) return "Wastage & Garbage";
  if (garbage > 0) return "Garbage Only";
  if (wastage > 0) return "Wastage Only";
  return null;
};

const toCsvValue = (value: string | number | null | undefined) => {
  const str = String(value ?? "");
  if (str.includes("\"") || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
};

const WasteManagement: React.FC<WasteManagementProps> = ({
  companies,
  history,
  setHistory,
  onVisibleRowsChange,
  systemConfig,
  supabase,
  dashboardFilter = "all",
}) => {
  const isDark = systemConfig.theme === "dark";
  const [entryDate, setEntryDate] = useState(getTodayDateInputValue);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [carType, setCarType] = useState<WasteRecord["carType"]>("Wastage & Garbage");
  const [garbageTrips, setGarbageTrips] = useState("0");
  const [wastageTrips, setWastageTrips] = useState("0");
  const [ratePerTrip, setRatePerTrip] = useState("");
  const [received, setReceived] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [showHistoryCompanyDropdown, setShowHistoryCompanyDropdown] = useState(false);
  const [historyCompanySearchQuery, setHistoryCompanySearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState(getTodayDateInputValue);
  const [endDate, setEndDate] = useState(getTodayDateInputValue);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementRecord, setSettlementRecord] = useState<WasteRecord | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState("");

  // PDF Layout Settings States
  const [pdfSettingsModalOpen, setPdfSettingsModalOpen] = useState(false);
  const [pdfSettingsPendingAction, setPdfSettingsPendingAction] = useState<{
    title: string;
    lines: string[];
    fontName: "Helvetica" | "Courier";
    fontSize: number;
    startX: number;
    startY: number;
    filename: string;
    options: any;
  } | null>(null);

  const triggerPdfExport = (
    title: string,
    lines: string[],
    defaultFont: "Helvetica" | "Courier",
    defaultFontSize: number,
    defaultStartX: number,
    defaultStartY: number,
    filename: string,
    baseOptions: any
  ) => {
    setPdfSettingsPendingAction({
      title,
      lines,
      fontName: defaultFont,
      fontSize: defaultFontSize,
      startX: defaultStartX,
      startY: defaultStartY,
      filename,
      options: baseOptions,
    });
    setPdfSettingsModalOpen(true);
  };

  const handlePdfConfirm = (settings: PdfSettings) => {
    if (!pdfSettingsPendingAction) return;
    const { title, lines, fontSize, startX, startY, filename, options } = pdfSettingsPendingAction;
    
    const finalOptions = {
      ...options,
      pageSize: settings.pageSize,
      orientation: settings.orientation,
      scale: settings.scale,
      showPageNumbers: settings.showPageNumbers,
    };

    const pdfBlob = createSimplePdfBlob(
      title,
      lines,
      settings.fontName,
      fontSize,
      startX,
      startY,
      finalOptions
    );

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setPdfSettingsModalOpen(false);
    setPdfSettingsPendingAction(null);
  };
  const [settlementDate, setSettlementDate] = useState(getTodayDateInputValue);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sorting State
  const [sortKey, setSortKey] = useState<"date" | "companyName" | "totalTrips" | "amount" | "received" | "due" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Bulk Settlement & Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkSettlementModal, setShowBulkSettlementModal] = useState(false);
  const [bulkSettlementAmount, setBulkSettlementAmount] = useState("");
  const [bulkSettlementPaymentMethod, setBulkSettlementPaymentMethod] = useState("");
  const [bulkSettlementDate, setBulkSettlementDate] = useState(getTodayDateInputValue);
  const [bulkSettlementIds, setBulkSettlementIds] = useState<string[]>([]);

  // Reset selectedIds when filters change to prevent actions on hidden records
  useEffect(() => {
    setSelectedIds([]);
  }, [search, companyFilter, statusFilter, startDate, endDate]);

  const activeCompanies = useMemo(
    () =>
      [...companies]
        .filter((company) => company.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  useEffect(() => {
    if (!paymentMethod && systemConfig.paymentMethods.length > 0) {
      setPaymentMethod(systemConfig.paymentMethods[0]);
    }
  }, [paymentMethod, systemConfig.paymentMethods]);

  useEffect(() => {
    if (!selectedCompanyId && activeCompanies.length > 0) {
      setSelectedCompanyId(activeCompanies[0].id);
    }
  }, [activeCompanies, selectedCompanyId]);



  const handleGarbageTripsChange = (value: string) => {
    setGarbageTrips(value);
    const nextCarType = getCarTypeFromTrips(value, wastageTrips);
    if (nextCarType) {
      setCarType(nextCarType);
    }
  };

  const handleWastageTripsChange = (value: string) => {
    setWastageTrips(value);
    const nextCarType = getCarTypeFromTrips(garbageTrips, value);
    if (nextCarType) {
      setCarType(nextCarType);
    }
  };

  const filteredCompaniesInDropdown = useMemo(() => {
    const query = companySearchQuery.trim().toLowerCase();
    return activeCompanies.filter((company) =>
      company.name.toLowerCase().includes(query)
    );
  }, [activeCompanies, companySearchQuery]);

  const filteredCompaniesInHistoryDropdown = useMemo(() => {
    const query = historyCompanySearchQuery.trim().toLowerCase();
    return companies.filter((company) =>
      company.name.toLowerCase().includes(query)
    );
  }, [companies, historyCompanySearchQuery]);

  const totals = useMemo(() => {
    const garbage = Math.max(0, Number(garbageTrips) || 0);
    const wastage = Math.max(0, Number(wastageTrips) || 0);
    const totalTrips = garbage + wastage;
    const rate = Math.max(0, Number(ratePerTrip) || 0);
    const amount = totalTrips * rate;
    const receivedAmount = Math.max(0, Number(received) || 0);
    const due = Math.max(0, amount - receivedAmount);
    const status: WasteRecord["status"] =
      due <= 0 && amount > 0 ? "Paid" : receivedAmount > 0 ? "Partial" : "Unpaid";
    return { garbage, wastage, totalTrips, rate, amount, receivedAmount, due, status };
  }, [garbageTrips, wastageTrips, ratePerTrip, received]);

  const filteredHistory = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...history]
      .filter((record) => {
        const recordDate = parseDate(record.date);
        const matchesSearch =
          !normalizedSearch ||
          record.companyName.toLowerCase().includes(normalizedSearch) ||
          String(record.notes || "").toLowerCase().includes(normalizedSearch) ||
          String(record.carType || "").toLowerCase().includes(normalizedSearch);
        const matchesCompany =
          companyFilter === "all" || record.companyId === companyFilter;
        const matchesStatus =
          statusFilter === "all" || record.status.toLowerCase() === statusFilter;

        let matchesDate = true;
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          matchesDate = matchesDate && recordDate >= start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && recordDate <= end;
        }

        // Dashboard Filter
        let matchesDashboard = true;
        if (dashboardFilter === "received") {
          matchesDashboard = (record.received || 0) > 0;
        } else if (dashboardFilter === "due") {
          matchesDashboard = (record.due || 0) > 0;
        }

        return matchesSearch && matchesCompany && matchesStatus && matchesDate && matchesDashboard;
      })
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [companyFilter, endDate, history, search, startDate, statusFilter, dashboardFilter]);

  const historyForDayWiseReport = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...history]
      .filter((record) => {
        const matchesSearch =
          !normalizedSearch ||
          record.companyName.toLowerCase().includes(normalizedSearch) ||
          String(record.notes || "").toLowerCase().includes(normalizedSearch) ||
          String(record.carType || "").toLowerCase().includes(normalizedSearch);
        const matchesCompany =
          companyFilter === "all" || record.companyId === companyFilter;
        const matchesStatus =
          statusFilter === "all" || record.status.toLowerCase() === statusFilter;
        const isDueOnly = (record.due || 0) > 0 || (record.received || 0) <= 0;

        return matchesSearch && matchesCompany && matchesStatus && isDueOnly;
      })
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [companyFilter, history, search, statusFilter]);

  const sortedHistory = useMemo(() => {
    const rows = [...filteredHistory];
    rows.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";

      if (sortKey === "date") {
        left = parseDate(a.date).getTime();
        right = parseDate(b.date).getTime();
      } else if (sortKey === "companyName") {
        left = (a.companyName || "").toLowerCase();
        right = (b.companyName || "").toLowerCase();
      } else if (sortKey === "totalTrips") {
        left = Number(a.totalTrips) || 0;
        right = Number(b.totalTrips) || 0;
      } else if (sortKey === "amount") {
        left = Number(a.amount) || 0;
        right = Number(b.amount) || 0;
      } else if (sortKey === "received") {
        left = Number(a.received) || 0;
        right = Number(b.received) || 0;
      } else if (sortKey === "due") {
        left = Number(a.due) || 0;
        right = Number(b.due) || 0;
      } else if (sortKey === "status") {
        left = (a.status || "").toLowerCase();
        right = (b.status || "").toLowerCase();
      }

      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filteredHistory, sortKey, sortDir]);

  const toggleSort = (
    key: "date" | "companyName" | "totalTrips" | "amount" | "received" | "due" | "status",
  ) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "date" ? "desc" : "asc");
  };

  const getSortIcon = (
    key: "date" | "companyName" | "totalTrips" | "amount" | "received" | "due" | "status",
  ) => {
    if (sortKey !== key) return "fa-sort text-slate-400 ml-1";
    return sortDir === "asc"
      ? "fa-sort-up text-blue-600 ml-1"
      : "fa-sort-down text-blue-600 ml-1";
  };

  useEffect(() => {
    onVisibleRowsChange(sortedHistory);
  }, [sortedHistory, onVisibleRowsChange]);

  useEffect(() => {
    setSearch("");
    setCompanyFilter("all");
    setStartDate(getTodayDateInputValue());
    setEndDate(getTodayDateInputValue());
    if (dashboardFilter === "due") {
      setStatusFilter("unpaid");
    } else {
      setStatusFilter("all");
    }
  }, [dashboardFilter]);

  const selectedRecords = useMemo(() => {
    return filteredHistory.filter((r) => selectedIds.includes(r.id));
  }, [filteredHistory, selectedIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  }, [selectedRecords]);

  const selectedDueAmount = useMemo(() => {
    return selectedRecords.reduce((sum, r) => sum + (r.due || 0), 0);
  }, [selectedRecords]);

  const selectedTotalTrips = useMemo(() => {
    return selectedRecords.reduce((sum, r) => sum + (r.totalTrips || 0), 0);
  }, [selectedRecords]);

  const summary = useMemo(
    () =>
      filteredHistory.reduce(
        (acc, row) => {
          acc.garbageTrips += row.garbageTrips || 0;
          acc.wastageTrips += row.wastageTrips || 0;
          acc.totalTrips += row.totalTrips || 0;
          acc.amount += row.amount || 0;
          acc.received += row.received || 0;
          acc.due += row.due || 0;
          return acc;
        },
        { garbageTrips: 0, wastageTrips: 0, totalTrips: 0, amount: 0, received: 0, due: 0 },
      ),
    [filteredHistory],
  );

  const monthlySummary = useMemo(() => {
    const grouped = new Map<string, { month: string; trips: number; amount: number; received: number; due: number }>();
    filteredHistory.forEach((row) => {
      const date = parseDate(row.date);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const current = grouped.get(key) || { month: key, trips: 0, amount: 0, received: 0, due: 0 };
      current.trips += row.totalTrips || 0;
      current.amount += row.amount || 0;
      current.received += row.received || 0;
      current.due += row.due || 0;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredHistory]);

  const dayWiseSummary = useMemo(() => {
    const grouped = new Map<
      string,
      {
        date: string;
        companySet: Set<string>;
        trips: number;
        amount: number;
        received: number;
        due: number;
      }
    >();
    historyForDayWiseReport.forEach((row) => {
      const key = row.date;
      const current = grouped.get(key) || {
        date: key,
        companySet: new Set<string>(),
        trips: 0,
        amount: 0,
        received: 0,
        due: 0,
      };
      if (row.companyId || row.companyName) {
        current.companySet.add(row.companyId || row.companyName);
      }
      current.trips += row.totalTrips || 0;
      current.amount += row.amount || 0;
      current.received += row.received || 0;
      current.due += row.due || 0;
      grouped.set(key, current);
    });
    return Array.from(grouped.values())
      .map((item) => ({
        date: item.date,
        companyCount: item.companySet.size,
        trips: item.trips,
        amount: item.amount,
        received: item.received,
        due: item.due,
      }))
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [historyForDayWiseReport]);

  const reportRangeLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Up to ${endDate}`;
    return "All dates";
  }, [endDate, startDate]);

  const resetEntryForm = () => {
    setEditingRecordId(null);
    setEntryDate(getTodayDateInputValue());
    if (activeCompanies.length > 0) {
      setSelectedCompanyId(activeCompanies[0].id);
    } else {
      setSelectedCompanyId("");
    }
    setCarType("Wastage & Garbage");
    setGarbageTrips("0");
    setWastageTrips("0");
    setRatePerTrip("");
    setReceived("");
    setNotes("");
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const company = companies.find((item) => item.id === selectedCompanyId);
    if (!company) {
      setActionError("Please select a company.");
      return;
    }
    if (totals.totalTrips <= 0) {
      setActionError("At least one garbage or wastage trip is required.");
      return;
    }
    const payload = {
      date: formatDisplayDate(entryDate),
      companyId: company.id,
      companyName: company.name,
      carType,
      garbageTrips: totals.garbage,
      wastageTrips: totals.wastage,
      totalTrips: totals.totalTrips,
      ratePerTrip: totals.rate,
      amount: totals.amount,
      received: totals.receivedAmount,
      due: totals.due,
      paymentMethod: paymentMethod || undefined,
      notes: notes.trim(),
      status: totals.status,
    } satisfies Omit<WasteRecord, "id">;

    setActionError(null);
    try {
      if (editingRecordId) {
        const updated = await updateWasteRecord(supabase, editingRecordId, payload);
        if (updated) {
          setHistory((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        }
      } else {
        const created = await insertWasteRecord(supabase, payload);
        if (created) {
          setHistory((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        }
      }
      resetEntryForm();
    } catch (error: any) {
      setActionError(error?.message || "Failed to save daily waste record.");
    }
  };

  const handleRecordEdit = (record: WasteRecord) => {
    setEditingRecordId(record.id);
    const parsed = parseDate(record.date);
    if (parsed.getTime() > 0) {
      const offset = parsed.getTimezoneOffset();
      const local = new Date(parsed.getTime() - offset * 60000);
      setEntryDate(local.toISOString().split("T")[0]);
    }
    setSelectedCompanyId(record.companyId);
    setCarType(record.carType || "Wastage & Garbage");
    setGarbageTrips(String(record.garbageTrips || 0));
    setWastageTrips(String(record.wastageTrips || 0));
    setRatePerTrip(record.ratePerTrip ? String(record.ratePerTrip) : "");
    setReceived(String(record.received || 0));
    setPaymentMethod(record.paymentMethod || systemConfig.paymentMethods[0] || "");
    setNotes(record.notes || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRecordDelete = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Delete this waste collection entry?")) return;
    setActionError(null);
    try {
      await deleteWasteRecord(supabase, id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (editingRecordId === id) resetEntryForm();
    } catch (error: any) {
      setActionError(error?.message || "Failed to delete record.");
    }
  };

  const closeSettlementModal = () => {
    setShowSettlementModal(false);
    setSettlementRecord(null);
    setSettlementAmount("");
    setSettlementDate(getTodayDateInputValue());
    setSettlementPaymentMethod("");
    setActionError(null);
  };

  const handleSettlementStart = (record: WasteRecord) => {
    setSettlementRecord(record);
    const defaultSettlementAmount =
      record.amount > 0 ? record.received || 0 : record.amount || record.received || 0;
    setSettlementAmount(String(defaultSettlementAmount));
    setSettlementDate(getTodayDateInputValue());
    setSettlementPaymentMethod(
      record.paymentMethod || systemConfig.paymentMethods[0] || paymentMethod || "",
    );
    setActionError(null);
    setShowSettlementModal(true);
  };

  const handleSettlementSubmit = async () => {
    if (!supabase || !settlementRecord) return;

    const amount = Math.max(0, Number(settlementAmount) || 0);
    const hasFixedAmount = (settlementRecord.ratePerTrip || 0) > 0;

    if (hasFixedAmount && amount > (settlementRecord.amount || 0)) {
      setActionError("Settlement amount cannot be greater than bill amount.");
      return;
    }

    const nextAmount = hasFixedAmount ? settlementRecord.amount || 0 : amount;
    const nextReceived = amount;
    const nextDue = Math.max(0, nextAmount - nextReceived);
    const nextStatus: WasteRecord["status"] =
      nextDue <= 0 && nextAmount > 0
        ? "Paid"
        : nextReceived > 0
          ? "Partial"
          : "Unpaid";

    const nextNotes = updateSettleDateInNotes(settlementRecord.notes, settlementDate);

    const patch: Partial<WasteRecord> = {
      amount: nextAmount,
      received: nextReceived,
      due: nextDue,
      status: nextStatus,
      paymentMethod: settlementPaymentMethod || settlementRecord.paymentMethod,
      notes: nextNotes,
    };

    setActionError(null);
    try {
      const updated = await updateWasteRecord(supabase, settlementRecord.id, patch);
      if (updated) {
        setHistory((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      closeSettlementModal();
    } catch (error: any) {
      setActionError(error?.message || "Failed to settle waste record.");
    }
  };

  const initiateBulkPayment = (ids: string[]) => {
    const targetRecords = history.filter((r) => ids.includes(r.id));
    if (targetRecords.length === 0) return;
    setBulkSettlementIds(targetRecords.map((r) => r.id));
    const totalDue = targetRecords.reduce((sum, r) => sum + (r.due || 0), 0);
    const hasFlexibleAmountRecord = targetRecords.some((r) => (r.ratePerTrip || 0) <= 0);
    setBulkSettlementAmount(totalDue > 0 ? String(totalDue) : hasFlexibleAmountRecord ? "" : "0");
    setBulkSettlementDate(getTodayDateInputValue());
    setBulkSettlementPaymentMethod(
      targetRecords[0]?.paymentMethod || systemConfig.paymentMethods[0] || "Cash"
    );
    setActionError(null);
    setShowBulkSettlementModal(true);
  };

  const closeBulkSettlementModal = () => {
    setShowBulkSettlementModal(false);
    setBulkSettlementIds([]);
    setBulkSettlementAmount("");
    setBulkSettlementDate(getTodayDateInputValue());
    setBulkSettlementPaymentMethod("");
    setActionError(null);
  };

  const handleBulkSettlementSubmit = async () => {
    if (!supabase || bulkSettlementIds.length === 0) return;

    const amount = Math.max(0, Number(bulkSettlementAmount) || 0);
    const targetRecords = history.filter((r) => bulkSettlementIds.includes(r.id));
    const totalFixedAmount = targetRecords.reduce(
      (sum, r) => sum + ((r.ratePerTrip || 0) > 0 ? r.amount || 0 : 0),
      0,
    );
    const flexibleRecords = targetRecords.filter((r) => (r.ratePerTrip || 0) <= 0);

    if (flexibleRecords.length === 0 && amount > totalFixedAmount) {
      setActionError("Received amount cannot be greater than total bill amount.");
      return;
    }

    const allocateByWeight = (
      records: WasteRecord[],
      totalCents: number,
      getWeight: (record: WasteRecord) => number,
    ) => {
      const weights = records.map((record) => Math.max(0, getWeight(record)));
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      const centsById: Record<string, number> = {};

      if (records.length === 0 || totalCents <= 0) {
        return centsById;
      }

      if (weightSum <= 0) {
        const base = Math.floor(totalCents / records.length);
        let rem = totalCents - base * records.length;
        records.forEach((record) => {
          centsById[record.id] = base + (rem > 0 ? 1 : 0);
          if (rem > 0) rem -= 1;
        });
        return centsById;
      }

      const raw = records.map((record, index) => {
        const exact = (totalCents * weights[index]) / weightSum;
        const floor = Math.floor(exact);
        return { id: record.id, floor, frac: exact - floor };
      });

      let used = 0;
      raw.forEach((item) => {
        centsById[item.id] = item.floor;
        used += item.floor;
      });

      let rem = totalCents - used;
      raw
        .sort((a, b) => b.frac - a.frac)
        .forEach((item) => {
          if (rem <= 0) return;
          centsById[item.id] += 1;
          rem -= 1;
        });

      return centsById;
    };

    const allocateBulkSettlement = (records: WasteRecord[], settleAmount: number) => {
      const sorted = [...records].sort(
        (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime(),
      );
      const amountById: Record<string, number> = {};
      let remainingCents = Math.max(0, Math.round(settleAmount * 100));
      let activeRecords = [...sorted];

      sorted.forEach((record) => {
        amountById[record.id] = 0;
      });

      while (remainingCents > 0 && activeRecords.length > 0) {
        const weighted = allocateByWeight(
          activeRecords,
          remainingCents,
          (record) => {
            const tripCount =
              (record.garbageTrips || 0) + (record.wastageTrips || 0);
            const totalTrips = record.totalTrips || 0;
            return Math.max(tripCount || totalTrips, 1);
          },
        );

        let distributedThisRound = 0;
        const stillActive: WasteRecord[] = [];

        activeRecords.forEach((record) => {
          const proposed = weighted[record.id] || 0;
          const cap =
            (record.ratePerTrip || 0) > 0
              ? Math.max(0, Math.round((record.amount || 0) * 100)) -
                Math.round((amountById[record.id] || 0) * 100)
              : Number.POSITIVE_INFINITY;
          const applied = Math.max(0, Math.min(proposed, cap));
          amountById[record.id] = (Math.round((amountById[record.id] || 0) * 100) + applied) / 100;
          distributedThisRound += applied;

          const hasRemainingCapacity =
            (record.ratePerTrip || 0) > 0
              ? Math.round((record.amount || 0) * 100) >
                Math.round((amountById[record.id] || 0) * 100)
              : true;

          if (hasRemainingCapacity) {
            stillActive.push(record);
          }
        });

        if (distributedThisRound <= 0) {
          break;
        }

        remainingCents = Math.max(0, remainingCents - distributedThisRound);
        activeRecords = stillActive;
      }

      return amountById;
    };

    const receivedById = allocateBulkSettlement(targetRecords, amount);

    setActionError(null);
    try {
      const results = await Promise.all(
        targetRecords.map(async (rec) => {
          const appliedAmount = receivedById[rec.id] ?? 0;
          const hasFixedAmount = (rec.ratePerTrip || 0) > 0;
          const nextAmount = hasFixedAmount ? rec.amount || 0 : appliedAmount;
          const nextReceived = appliedAmount;
          const nextDue = Math.max(0, nextAmount - nextReceived);
          const nextStatus: WasteRecord["status"] =
            nextDue <= 0 && (nextReceived > 0 || nextAmount > 0)
              ? "Paid"
              : nextReceived > 0
                ? "Partial"
                : "Unpaid";

          const nextNotes = appliedAmount > 0
            ? updateSettleDateInNotes(rec.notes, bulkSettlementDate)
            : rec.notes;

          const patch: Partial<WasteRecord> = {
            amount: nextAmount,
            received: nextReceived,
            due: nextDue,
            status: nextStatus,
            paymentMethod: bulkSettlementPaymentMethod || rec.paymentMethod,
            notes: nextNotes,
          };
          const updated = await updateWasteRecord(supabase, rec.id, patch);
          return { id: rec.id, updated };
        })
      );

      setHistory((prev) =>
        prev.map((rec) => {
          const res = results.find((r) => r.id === rec.id)?.updated;
          return res ? res : rec;
        })
      );

      closeBulkSettlementModal();
      setSelectedIds([]);
    } catch (err: any) {
      setActionError(err?.message || "Failed to save bulk settlement.");
    }
  };

  const handleBulkDelete = async () => {
    if (!supabase || selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected waste collection entry(ies)?`)) return;

    setActionError(null);
    try {
      await Promise.all(selectedIds.map((id) => deleteWasteRecord(supabase, id)));
      setHistory((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
      setSelectedIds([]);
    } catch (error: any) {
      setActionError(error?.message || "Failed to delete selected records.");
    }
  };

  const downloadCsv = () => {
    const lines: string[] = [];
    lines.push(`Waste Management Report,${reportRangeLabel}`);
    lines.push(`Company Filter,${companyFilter === "all" ? "All Company" : companies.find((company) => company.id === companyFilter)?.name || "-"}`);
    lines.push(`Status Filter,${statusFilter}`);
    lines.push("");
    lines.push("Summary,Value");
    lines.push(`Total Trips,${summary.totalTrips}`);
    lines.push(`Garbage Trips,${summary.garbageTrips}`);
    lines.push(`Wastage Trips,${summary.wastageTrips}`);
    lines.push(`Bill Amount,${summary.amount}`);
    lines.push(`Received,${summary.received}`);
    lines.push(`Due,${summary.due}`);
    lines.push("");
    lines.push("Date,Company Count,Trips,Amount,Received,Due");
    dayWiseSummary.forEach((row) => {
      lines.push([row.date, row.companyCount, row.trips, row.amount, row.received, row.due].map(toCsvValue).join(","));
    });
    lines.push("");
    lines.push("Date,Company,Car Type,Garbage,Wastage,Total Trips,Rate,Amount,Received,Due,Status,Payment Method,Notes");
    filteredHistory.forEach((row) => {
      lines.push(
        [
          row.date,
          row.companyName,
          row.carType,
          row.garbageTrips,
          row.wastageTrips,
          row.totalTrips,
          row.ratePerTrip,
          row.amount,
          row.received,
          row.due,
          row.status,
          row.paymentMethod || "",
          row.notes || "",
        ].map(toCsvValue).join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `waste_report_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const padRight = (str: string, length: number) => {
      const s = String(str);
      return s + " ".repeat(Math.max(0, length - s.length));
    };
    const padLeft = (str: string, length: number) => {
      const s = String(str);
      return " ".repeat(Math.max(0, length - s.length)) + s;
    };
    const truncateStr = (str: string, len: number) => {
      if (str.length <= len) return str;
      return str.slice(0, len - 3) + "...";
    };

    const separator = "=".repeat(96);
    const thinSeparator = "-".repeat(96);

    const agencyText = systemConfig.agencyName ? `Agency: ${systemConfig.agencyName}` : "";
    const addressText = systemConfig.agencyAddress || "";

    const lines: string[] = [];

    // Header block
    lines.push(separator);
    if (agencyText) {
      lines.push(padLeft(agencyText, Math.floor((96 + agencyText.length) / 2)));
    }
    if (addressText) {
      lines.push(padLeft(addressText, Math.floor((96 + addressText.length) / 2)));
    }
    lines.push(separator);

    // Meta Block
    lines.push(`Date Range: ${reportRangeLabel}`);
    lines.push(`Company   : ${companyFilter === "all" ? "All Company" : companies.find((company) => company.id === companyFilter)?.name || "-"}`);
    lines.push(`Status    : ${statusFilter}`);
    lines.push(`Generated : ${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`);
    lines.push("");

    // Summary Section
    lines.push("SUMMARY");
    lines.push(thinSeparator);
    lines.push(`${padRight(`Total Trips: ${summary.totalTrips} (Garbage: ${summary.garbageTrips}, Wastage: ${summary.wastageTrips})`, 48)}${padRight(`Bill Amount: ${money(summary.amount)}`, 48)}`);
    lines.push(`${padRight(`Received   : ${money(summary.received)}`, 48)}${padRight(`Due Amount : ${money(summary.due)}`, 48)}`);
    lines.push(thinSeparator);
    lines.push("");

    // Day-wise report Section
    lines.push("DAY-WISE SUMMARY");
    lines.push(thinSeparator);
    lines.push(
      `${padRight("Date", 12)}${padLeft("Companies", 11)}${padLeft("Trips", 9)}${padLeft("Amount", 16)}${padLeft("Received", 16)}${padLeft("Due", 16)}`
    );
    lines.push(thinSeparator);
    dayWiseSummary.forEach((row) => {
      lines.push(
        `${padRight(row.date, 12)}${padLeft(String(row.companyCount), 11)}${padLeft(String(row.trips), 9)}${padLeft(money(row.amount), 16)}${padLeft(money(row.received), 16)}${padLeft(money(row.due), 16)}`
      );
    });
    lines.push(thinSeparator);
    lines.push("");

    // Detailed History Section
    lines.push("DETAILED TRANSACTION HISTORY");
    lines.push(thinSeparator);
    lines.push(
      `${padRight("Date", 11)}${padRight("Company", 22)}${padRight("Car Type", 18)}${padLeft("Trips", 6)}${padLeft("Amount", 13)}${padLeft("Received", 13)}${padLeft("Due", 13)}`
    );
    lines.push(thinSeparator);
    filteredHistory.forEach((row) => {
      const company = truncateStr(row.companyName, 22);
      const carType = truncateStr(row.carType || "", 18);
      const tripsText = `${row.totalTrips}`;
      lines.push(
        `${padRight(row.date, 11)}${padRight(company, 22)}${padRight(carType, 18)}${padLeft(tripsText, 6)}${padLeft(money(row.amount), 13)}${padLeft(money(row.received), 13)}${padLeft(money(row.due), 13)}`
      );
    });
    lines.push(separator);

    triggerPdfExport(
      "WASTE MANAGEMENT REPORT",
      lines,
      "Courier",
      8.5,
      25,
      800,
      `waste_report_${new Date().toISOString().split("T")[0]}.pdf`,
      { repeatTitle: true, linesPerPage: 56, lineHeight: 12 }
    );
  };

  // Table Column Resizing & Visibility
  const initialColumnWidths = useMemo(
    () => ({
      select: 50,
      date: 110,
      companyName: 200,
      carType: 120,
      garbageTrips: 90,
      wastageTrips: 90,
      totalTrips: 90,
      ratePerTrip: 90,
      amount: 110,
      received: 110,
      due: 110,
      status: 100,
      action: 140,
    }),
    []
  );

  const {
    columnWidths,
    startResizing,
    toggleColumnVisibility,
    isColumnVisible,
    showAllColumns,
    resetColumns,
  } = useResizableColumns(initialColumnWidths, 50, "waste_management_table");

  const tableColumns = useMemo(
    () => [
      { key: "select", label: "Select Checkbox" },
      { key: "date", label: "Date" },
      { key: "companyName", label: "Company" },
      { key: "carType", label: "Car Type" },
      { key: "garbageTrips", label: "Garbage" },
      { key: "wastageTrips", label: "Wastage" },
      { key: "totalTrips", label: "Trips" },
      { key: "ratePerTrip", label: "Rate" },
      { key: "amount", label: "Amount" },
      { key: "received", label: "Received" },
      { key: "due", label: "Due" },
      { key: "status", label: "Status" },
      { key: "action", label: "Action" },
    ],
    []
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {actionError}
        </div>
      )}

      <form
        onSubmit={handleRecordSubmit}
        className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>Daily Car Entry</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">
              Keep daily waste and garbage car collection with car type control.
            </p>
          </div>
          {editingRecordId && (
            <button
              type="button"
              onClick={resetEntryForm}
              className="rounded-xl bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <div className="relative w-full">
            <button
              type="button"
              onClick={() => {
                setShowCompanyDropdown(!showCompanyDropdown);
                setCompanySearchQuery("");
              }}
              className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 font-bold outline-none text-left ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            >
              <span className="truncate">
                {companies.find((c) => c.id === selectedCompanyId)?.name || "Select company"}
              </span>
              <svg className="w-4 h-4 ml-2 fill-current shrink-0 text-slate-400" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </button>

            {showCompanyDropdown && (
              <>
                <div
                  className="fixed inset-0 z-[80]"
                  onClick={() => setShowCompanyDropdown(false)}
                />
                
                <div
                  className={`absolute left-0 right-0 mt-2 z-[85] max-h-60 rounded-xl border shadow-xl flex flex-col overflow-hidden ${
                    isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                  }`}
                >
                  <div className={`p-2 border-b ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search company..."
                      value={companySearchQuery}
                      onChange={(e) => setCompanySearchQuery(e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-bold outline-none ${
                        isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  <div className="overflow-y-auto flex-1 max-h-48 text-xs font-semibold">
                    {filteredCompaniesInDropdown.length > 0 ? (
                      filteredCompaniesInDropdown.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => {
                            setSelectedCompanyId(company.id);
                            setShowCompanyDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-blue-500 hover:text-white transition-all ${
                            selectedCompanyId === company.id
                              ? isDark
                                ? "bg-blue-900/40 text-blue-400"
                                : "bg-blue-50 text-blue-600"
                              : isDark
                                ? "text-slate-200 hover:bg-slate-800"
                                : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {company.name}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-slate-400 text-center italic">No company found</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <select value={carType} onChange={(e) => setCarType(e.target.value as WasteRecord["carType"])} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
            {CAR_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input type="number" min="0" value={garbageTrips} onChange={(e) => handleGarbageTripsChange(e.target.value)} placeholder="Garbage trips" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <input type="number" min="0" value={wastageTrips} onChange={(e) => handleWastageTripsChange(e.target.value)} placeholder="Wastage trips" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <input type="number" min="0" value={ratePerTrip} onChange={(e) => setRatePerTrip(e.target.value)} placeholder="Rate per trip (optional)" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <input type="number" min="0" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="Received amount" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
            <option value="">Payment method</option>
            {systemConfig.paymentMethods.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
        </div>

        <div className={`mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Trips</p><p className={`mt-2 text-xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>{totals.totalTrips}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bill Amount</p><p className="mt-2 text-xl font-black text-blue-600">{money(totals.amount)}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Received</p><p className="mt-2 text-xl font-black text-emerald-600">{money(totals.receivedAmount)}</p></div>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Due</p><p className="mt-2 text-xl font-black text-rose-500">{money(totals.due)}</p></div>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-400">
          Rate empty রাখলেও entry save হবে। পরে settlement update করলে নতুন amount-টাই final হিসেবে save হবে।
        </p>

        <div className="mt-5 flex justify-end">
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700">
            {editingRecordId ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </form>

      <div className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between mb-6">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>Collection History</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">Daily collection, received amount and due balance by company.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history..."
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none w-full md:w-48 ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            />
            
            <div className="relative w-full md:w-44">
              <button
                type="button"
                onClick={() => {
                  setShowHistoryCompanyDropdown(!showHistoryCompanyDropdown);
                  setHistoryCompanySearchQuery("");
                }}
                className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold outline-none text-left ${
                  isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                <span className="truncate">
                  {companyFilter === "all" ? "All Company" : companies.find((c) => c.id === companyFilter)?.name || "All Company"}
                </span>
                <svg className="w-3.5 h-3.5 ml-2 fill-current shrink-0 text-slate-400" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </button>

              {showHistoryCompanyDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-[80]"
                    onClick={() => setShowHistoryCompanyDropdown(false)}
                  />
                  
                  <div
                    className={`absolute right-0 w-64 mt-2 z-[85] max-h-60 rounded-xl border shadow-xl flex flex-col overflow-hidden ${
                      isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                    }`}
                  >
                    <div className={`p-2 border-b ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Search company..."
                        value={historyCompanySearchQuery}
                        onChange={(e) => setHistoryCompanySearchQuery(e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-bold outline-none ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        }`}
                      />
                    </div>

                    <div className="overflow-y-auto flex-1 max-h-48 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setCompanyFilter("all");
                          setShowHistoryCompanyDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-blue-500 hover:text-white transition-all ${
                          companyFilter === "all"
                            ? isDark
                              ? "bg-blue-900/40 text-blue-400"
                              : "bg-blue-50 text-blue-600"
                            : isDark
                              ? "text-slate-200 hover:bg-slate-800"
                              : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        All Company
                      </button>

                      {filteredCompaniesInHistoryDropdown.length > 0 ? (
                        filteredCompaniesInHistoryDropdown.map((company) => (
                          <button
                            key={company.id}
                            type="button"
                            onClick={() => {
                              setCompanyFilter(company.id);
                              setShowHistoryCompanyDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-blue-500 hover:text-white transition-all ${
                              companyFilter === company.id
                                ? isDark
                                  ? "bg-blue-900/40 text-blue-400"
                                  : "bg-blue-50 text-blue-600"
                                : isDark
                                  ? "text-slate-200 hover:bg-slate-800"
                                  : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {company.name}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-2 text-slate-400 text-center italic">No company found</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none w-full md:w-32 ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none w-full md:w-36 ${
                  isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              />
              <span className="text-slate-400 text-xs font-bold shrink-0">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none w-full md:w-36 ${
                  isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  const today = getTodayDateInputValue();
                  setStartDate(today);
                  setEndDate(today);
                }}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md active:scale-95 transition-all shrink-0"
              >
                Today
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCompanyFilter("all");
                setStatusFilter("all");
                setStartDate("");
                setEndDate("");
              }}
              className="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border dark:border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 w-full md:w-auto transition-all"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => printElement(document.getElementById("waste-table"), "Waste Management Records", {
                header: {
                  organization: systemConfig.agencyName || undefined,
                  subtext: systemConfig.agencyAddress || undefined,
                },
                autoExcludeControls: true,
                dateRange: startDate || endDate ? { startDate, endDate } : undefined,
              })}
              className="rounded-xl bg-slate-600 hover:bg-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md active:scale-95 transition-all w-full md:w-auto"
            >
              <i className="fas fa-print mr-1"></i> Print Table
            </button>

            <ColumnVisibilityToggle
              columns={tableColumns}
              isColumnVisible={isColumnVisible}
              toggleColumnVisibility={toggleColumnVisibility}
              showAllColumns={showAllColumns}
              resetColumns={resetColumns}
              isDark={isDark}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-blue-50 border-blue-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtered Bill</p><p className="mt-2 text-2xl font-black text-blue-600">{money(summary.amount)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{reportRangeLabel}</p></div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-emerald-50 border-emerald-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collected</p><p className="mt-2 text-2xl font-black text-emerald-600">{money(summary.received)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{filteredHistory.length} record(s)</p></div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-rose-50 border-rose-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding Due</p><p className="mt-2 text-2xl font-black text-rose-500">{money(summary.due)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{dayWiseSummary.filter((row) => row.due > 0).length} day(s)</p></div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-amber-50 border-amber-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Trips</p><p className="mt-2 text-2xl font-black text-amber-500">{summary.totalTrips.toLocaleString("en-BD")}</p><p className="mt-1 text-[11px] font-bold text-slate-400">G {summary.garbageTrips.toLocaleString("en-BD")} | W {summary.wastageTrips.toLocaleString("en-BD")}</p></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Day-wise Due Report</p>
              <span className="text-[10px] font-bold text-slate-400">{dayWiseSummary.length} day(s)</span>
            </div>
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead className={`${isDark ? "bg-slate-800 text-slate-300" : "bg-white text-slate-500"}`}><tr><th className="px-4 py-3 font-black uppercase tracking-widest">Date</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Company Count</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Trips</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Amount</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Received</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Due</th></tr></thead>
                <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
                  {dayWiseSummary.map((row) => (
                    <tr key={row.date} onClick={() => { const inputDate = convertDisplayDateToInput(row.date); setStartDate(inputDate); setEndDate(inputDate); }} className={`cursor-pointer ${isDark ? "hover:bg-slate-800/70" : "hover:bg-blue-50"}`}>
                      <td className="px-4 py-3 font-bold">{row.date}</td><td className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-300">{row.companyCount}</td><td className="px-4 py-3 text-right">{row.trips}</td><td className="px-4 py-3 text-right text-blue-600 font-black">{money(row.amount)}</td><td className="px-4 py-3 text-right text-emerald-600 font-black">{money(row.received)}</td><td className="px-4 py-3 text-right text-rose-500 font-black">{money(row.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Report</p>
              <div className="flex gap-2">
                <button type="button" onClick={downloadCsv} className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">CSV</button>
                <button type="button" onClick={downloadPdf} className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600">PDF</button>
              </div>
            </div>
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className={`${isDark ? "bg-slate-800 text-slate-300" : "bg-white text-slate-500"}`}><tr><th className="px-4 py-3 font-black uppercase tracking-widest">Month</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Trips</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Amount</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Received</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Due</th></tr></thead>
                <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
                  {monthlySummary.map((row) => (
                    <tr key={row.month}>
                      <td className="px-4 py-3 font-bold">{row.month}</td><td className="px-4 py-3 text-right">{row.trips}</td><td className="px-4 py-3 text-right text-blue-600 font-black">{money(row.amount)}</td><td className="px-4 py-3 text-right text-emerald-600 font-black">{money(row.received)}</td><td className="px-4 py-3 text-right text-rose-500 font-black">{money(row.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table id="waste-table" className="w-full min-w-[1200px] text-left text-xs">
            <thead className={`relative select-none ${isDark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-500"}`}>
              <tr>
                {isColumnVisible("select") && (
                  <th
                    style={{ width: columnWidths.select, minWidth: columnWidths.select }}
                    className="px-4 py-3 w-10 text-center relative group"
                  >
                    <input
                      type="checkbox"
                      checked={
                        sortedHistory.length > 0 &&
                        selectedIds.length === sortedHistory.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(sortedHistory.map((r) => r.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div
                      onMouseDown={(e) => startResizing("select", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("date") && (
                  <th
                    style={{ width: columnWidths.date, minWidth: columnWidths.date }}
                    onClick={() => toggleSort("date")}
                    className="px-4 py-3 font-black uppercase tracking-widest cursor-pointer hover:text-blue-600 relative group"
                  >
                    Date <i className={`fas ${getSortIcon("date")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("date", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("companyName") && (
                  <th
                    style={{ width: columnWidths.companyName, minWidth: columnWidths.companyName }}
                    onClick={() => toggleSort("companyName")}
                    className="px-4 py-3 font-black uppercase tracking-widest cursor-pointer hover:text-blue-600 relative group"
                  >
                    Company <i className={`fas ${getSortIcon("companyName")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("companyName", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("carType") && (
                  <th
                    style={{ width: columnWidths.carType, minWidth: columnWidths.carType }}
                    className="px-4 py-3 font-black uppercase tracking-widest relative group"
                  >
                    Car Type
                    <div
                      onMouseDown={(e) => startResizing("carType", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("garbageTrips") && (
                  <th
                    style={{ width: columnWidths.garbageTrips, minWidth: columnWidths.garbageTrips }}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right relative group"
                  >
                    Garbage
                    <div
                      onMouseDown={(e) => startResizing("garbageTrips", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("wastageTrips") && (
                  <th
                    style={{ width: columnWidths.wastageTrips, minWidth: columnWidths.wastageTrips }}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right relative group"
                  >
                    Wastage
                    <div
                      onMouseDown={(e) => startResizing("wastageTrips", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("totalTrips") && (
                  <th
                    style={{ width: columnWidths.totalTrips, minWidth: columnWidths.totalTrips }}
                    onClick={() => toggleSort("totalTrips")}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right cursor-pointer hover:text-blue-600 relative group"
                  >
                    Trips <i className={`fas ${getSortIcon("totalTrips")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("totalTrips", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("ratePerTrip") && (
                  <th
                    style={{ width: columnWidths.ratePerTrip, minWidth: columnWidths.ratePerTrip }}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right relative group"
                  >
                    Rate
                    <div
                      onMouseDown={(e) => startResizing("ratePerTrip", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("amount") && (
                  <th
                    style={{ width: columnWidths.amount, minWidth: columnWidths.amount }}
                    onClick={() => toggleSort("amount")}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right cursor-pointer hover:text-blue-600 relative group"
                  >
                    Amount <i className={`fas ${getSortIcon("amount")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("amount", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("received") && (
                  <th
                    style={{ width: columnWidths.received, minWidth: columnWidths.received }}
                    onClick={() => toggleSort("received")}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right cursor-pointer hover:text-blue-600 relative group"
                  >
                    Received <i className={`fas ${getSortIcon("received")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("received", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("due") && (
                  <th
                    style={{ width: columnWidths.due, minWidth: columnWidths.due }}
                    onClick={() => toggleSort("due")}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right cursor-pointer hover:text-blue-600 relative group"
                  >
                    Due <i className={`fas ${getSortIcon("due")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("due", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("status") && (
                  <th
                    style={{ width: columnWidths.status, minWidth: columnWidths.status }}
                    onClick={() => toggleSort("status")}
                    className="px-4 py-3 font-black uppercase tracking-widest text-center cursor-pointer hover:text-blue-600 relative group"
                  >
                    Status <i className={`fas ${getSortIcon("status")}`}></i>
                    <div
                      onMouseDown={(e) => startResizing("status", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("action") && (
                  <th
                    style={{ width: columnWidths.action, minWidth: columnWidths.action }}
                    className="px-4 py-3 font-black uppercase tracking-widest text-right"
                  >
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
              {sortedHistory.map((record) => (
                <tr
                  key={record.id}
                  className={`group transition-all ${
                    selectedIds.includes(record.id) ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                  }`}
                >
                  {isColumnVisible("select") && (
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...prev, record.id]);
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== record.id));
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  )}
                  {isColumnVisible("date") && (
                    <td className="px-4 py-3 font-bold">{record.date}</td>
                  )}
                  {isColumnVisible("companyName") && (
                    <td className="px-4 py-3"><div className="font-bold">{record.companyName}</div>{record.notes ? <div className="mt-1 text-[11px] text-slate-400">{record.notes}</div> : null}</td>
                  )}
                  {isColumnVisible("carType") && (
                    <td className="px-4 py-3">{record.carType}</td>
                  )}
                  {isColumnVisible("garbageTrips") && (
                    <td className="px-4 py-3 text-right">{record.garbageTrips}</td>
                  )}
                  {isColumnVisible("wastageTrips") && (
                    <td className="px-4 py-3 text-right">{record.wastageTrips}</td>
                  )}
                  {isColumnVisible("totalTrips") && (
                    <td className="px-4 py-3 text-right font-black">{record.totalTrips}</td>
                  )}
                  {isColumnVisible("ratePerTrip") && (
                    <td className="px-4 py-3 text-right">{formatRate(record.ratePerTrip)}</td>
                  )}
                  {isColumnVisible("amount") && (
                    <td className="px-4 py-3 text-right text-blue-600 font-black">{money(record.amount)}</td>
                  )}
                  {isColumnVisible("received") && (
                    <td className="px-4 py-3 text-right text-emerald-600 font-black">{money(record.received)}</td>
                  )}
                  {isColumnVisible("due") && (
                    <td className="px-4 py-3 text-right text-rose-500 font-black">{money(record.due)}</td>
                  )}
                  {isColumnVisible("status") && (
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${record.status === "Paid" ? "bg-emerald-50 text-emerald-600" : record.status === "Partial" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>{record.status}</span></td>
                  )}
                  {isColumnVisible("action") && (
                    <td className="px-4 py-3"><div className="flex justify-end gap-2">{record.due > 0 || record.amount <= 0 ? <button type="button" onClick={() => handleSettlementStart(record)} className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">Settle</button> : null}<button type="button" onClick={() => handleRecordEdit(record)} className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600">Edit</button><button type="button" onClick={() => handleRecordDelete(record.id)} className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600">Delete</button></div></td>
                  )}
                </tr>
              ))}
              <tr className={`${isDark ? "bg-slate-900 text-slate-100" : "bg-slate-100 text-slate-900"}`}>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 font-black uppercase tracking-widest" colSpan={3}>Grand Total</td>
                <td className="px-4 py-3 text-right font-black">{summary.garbageTrips}</td>
                <td className="px-4 py-3 text-right font-black">{summary.wastageTrips}</td>
                <td className="px-4 py-3 text-right font-black">{summary.totalTrips}</td>
                <td className="px-4 py-3 text-right font-black">-</td>
                <td className="px-4 py-3 text-right font-black text-blue-600">{money(summary.amount)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-600">{money(summary.received)}</td>
                <td className="px-4 py-3 text-right font-black text-rose-500">{money(summary.due)}</td>
                <td className="px-4 py-3 text-center font-black">{sortedHistory.length} row(s)</td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {showSettlementModal && settlementRecord ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm rounded-[1.5rem] shadow-2xl p-5 sm:p-6 ${isDark ? "bg-slate-800" : "bg-white"}`}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>Waste Settlement</h3>
                <p className="mt-1 text-xs font-medium text-slate-400">{settlementRecord.companyName} | {settlementRecord.date}</p>
              </div>
              <button
                type="button"
                onClick={closeSettlementModal}
                className={`rounded-full px-3 py-1 text-xs font-black ${isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500"}`}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {actionError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                  {actionError}
                </div>
              ) : null}
              <div className={`grid grid-cols-3 gap-3 rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Amount</p><p className="mt-2 text-sm font-black text-blue-600">{money(settlementRecord.amount)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Received</p><p className="mt-2 text-sm font-black text-emerald-600">{money(settlementRecord.received)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Due</p><p className="mt-2 text-sm font-black text-rose-500">{money(settlementRecord.due)}</p></div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Settlement Date
                </label>
                <input
                  type="date"
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  {(settlementRecord.ratePerTrip || 0) > 0 ? "Settlement Amount" : "Final Amount"}
                </label>
                <input
                  type="number"
                  min="0"
                  max={(settlementRecord.ratePerTrip || 0) > 0 ? settlementRecord.due : undefined}
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  placeholder={(settlementRecord.ratePerTrip || 0) > 0 ? "Settlement amount" : "Final amount"}
                  className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                />
              </div>

              {(settlementRecord.ratePerTrip || 0) <= 0 ? (
                <p className="text-xs font-medium text-slate-400">
                  এই record-এ আগে amount set করা নেই। এখন যা receive করবেন, সেটাই final amount হিসেবে save হবে।
                </p>
              ) : (
                <p className="text-xs font-medium text-slate-400">
                  নতুন settlement দিলে আগের received বাদ যাবে, এই amount-টাই final settlement হিসেবে থাকবে।
                </p>
              )}

              <select
                value={settlementPaymentMethod}
                onChange={(e) => setSettlementPaymentMethod(e.target.value)}
                className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
              >
                <option value="">Payment method</option>
                {systemConfig.paymentMethods.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSettlementSubmit}
                className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-emerald-700"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && !showBulkSettlementModal && (
        <div className="fixed top-[112px] md:top-[116px] left-1/2 -translate-x-1/2 z-[90] w-[calc(100vw-1rem)] md:w-auto md:max-w-[calc(100vw-2rem)] px-2 md:px-4 pt-2">
          <div
            className={`rounded-xl border px-3 md:px-4 py-2.5 shadow-lg backdrop-blur flex items-center gap-2 md:gap-3 flex-wrap justify-center ${
              isDark
                ? "bg-slate-900/95 border-slate-700 text-slate-100"
                : "bg-white/95 border-slate-200 text-slate-700"
            }`}
          >
            <span className="text-xs font-black uppercase tracking-wider">
              Selected {selectedIds.length}
            </span>
            <span className="text-base md:text-lg font-extrabold tracking-wide text-amber-500">
              Trips {selectedTotalTrips}
            </span>
            <span className="text-base md:text-lg font-extrabold tracking-wide">
              Total {money(selectedTotalAmount)}
            </span>
            <span className="text-base md:text-lg font-extrabold tracking-wide text-red-500">
              Due {money(selectedDueAmount)}
            </span>
            <button
              type="button"
              onClick={() => initiateBulkPayment(selectedIds)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-md transition-all active:scale-95"
            >
              Bulk Settle
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-md transition-all active:scale-95"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-sm transition-all active:scale-95 ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk Settlement Modal */}
      {showBulkSettlementModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm rounded-[1.5rem] shadow-2xl p-5 sm:p-6 ${isDark ? "bg-slate-800" : "bg-white"}`}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>Waste Bulk Settlement</h3>
                <p className="mt-1 text-xs font-medium text-slate-400">Processing {bulkSettlementIds.length} entry(ies) ({selectedTotalTrips} total trips)</p>
              </div>
              <button
                type="button"
                onClick={closeBulkSettlementModal}
                className={`rounded-full px-3 py-1 text-xs font-black ${isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500"}`}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {actionError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                  {actionError}
                </div>
              ) : null}

              <div className={`grid grid-cols-3 gap-2 rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Trips</p>
                  <p className="mt-2 text-sm font-black text-amber-500">{selectedTotalTrips}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Selected</p>
                  <p className="mt-2 text-sm font-black text-blue-600">{money(selectedTotalAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Due</p>
                  <p className="mt-2 text-sm font-black text-rose-500">{money(selectedDueAmount)}</p>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-400">
                Settlement amount selected record-গুলোর total car/trips অনুযায়ী distribute হবে।
              </p>
              <p className="text-xs font-medium text-slate-400">
                আবার bulk settlement দিলে আগের settlement replace হয়ে নতুন distributed amount-ই final হিসেবে save হবে।
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Settlement Date
                </label>
                <input
                  type="date"
                  value={bulkSettlementDate}
                  onChange={(e) => setBulkSettlementDate(e.target.value)}
                  className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Received Amount
                </label>
                <input
                  type="number"
                  min="0"
                  value={bulkSettlementAmount}
                  onChange={(e) => setBulkSettlementAmount(e.target.value)}
                  placeholder="Settlement amount"
                  className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Payment Method
                </label>
                <select
                  value={bulkSettlementPaymentMethod}
                  onChange={(e) => setBulkSettlementPaymentMethod(e.target.value)}
                  className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
                >
                  <option value="">Payment method</option>
                  {systemConfig.paymentMethods.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleBulkSettlementSubmit}
                className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-all mt-2"
              >
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}
      <PdfSettingsModal
        isOpen={pdfSettingsModalOpen}
        onClose={() => {
          setPdfSettingsModalOpen(false);
          setPdfSettingsPendingAction(null);
        }}
        onConfirm={handlePdfConfirm}
        isDark={isDark}
      />
    </div>
  );
};

export default WasteManagement;
