import React, { useEffect, useMemo, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { SystemConfig, WasteCompany, WasteRecord } from "../types";
import { createSimplePdfBlob } from "../utils/simplePdf";
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

const money = (value: number) => `Tk ${value.toLocaleString("en-BD")}`;

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
}) => {
  const isDark = systemConfig.theme === "dark";
  const [entryDate, setEntryDate] = useState(getTodayDateInputValue);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

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

  useEffect(() => {
    if (carType === "Garbage Only") {
      setWastageTrips("0");
    }
    if (carType === "Wastage Only") {
      setGarbageTrips("0");
    }
  }, [carType]);

  const totals = useMemo(() => {
    const garbage =
      carType === "Wastage Only" ? 0 : Math.max(0, Number(garbageTrips) || 0);
    const wastage =
      carType === "Garbage Only" ? 0 : Math.max(0, Number(wastageTrips) || 0);
    const totalTrips = garbage + wastage;
    const rate = Math.max(0, Number(ratePerTrip) || 0);
    const amount = totalTrips * rate;
    const receivedAmount = Math.max(0, Number(received) || 0);
    const due = Math.max(0, amount - receivedAmount);
    const status: WasteRecord["status"] =
      due <= 0 && amount > 0 ? "Paid" : receivedAmount > 0 ? "Partial" : "Unpaid";
    return { garbage, wastage, totalTrips, rate, amount, receivedAmount, due, status };
  }, [carType, garbageTrips, wastageTrips, ratePerTrip, received]);

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

        return matchesSearch && matchesCompany && matchesStatus && matchesDate;
      })
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [companyFilter, endDate, history, search, startDate, statusFilter]);

  useEffect(() => {
    onVisibleRowsChange(filteredHistory);
  }, [filteredHistory, onVisibleRowsChange]);

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

  const companyDueSummary = useMemo(() => {
    const grouped = new Map<string, { companyId: string; companyName: string; totalTrips: number; amount: number; received: number; due: number }>();
    filteredHistory.forEach((row) => {
      const current = grouped.get(row.companyId) || {
        companyId: row.companyId,
        companyName: row.companyName,
        totalTrips: 0,
        amount: 0,
        received: 0,
        due: 0,
      };
      current.totalTrips += row.totalTrips || 0;
      current.amount += row.amount || 0;
      current.received += row.received || 0;
      current.due += row.due || 0;
      grouped.set(row.companyId, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.due - a.due);
  }, [filteredHistory]);

  const reportRangeLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Up to ${endDate}`;
    return "All dates";
  }, [endDate, startDate]);

  const resetEntryForm = () => {
    setEditingRecordId(null);
    setEntryDate(getTodayDateInputValue());
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
    if (totals.rate <= 0) {
      setActionError("Rate per trip is required.");
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
    setRatePerTrip(String(record.ratePerTrip || 0));
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
    lines.push("Company,Trips,Amount,Received,Due");
    companyDueSummary.forEach((row) => {
      lines.push([row.companyName, row.totalTrips, row.amount, row.received, row.due].map(toCsvValue).join(","));
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
    const lines = [
      `Date Range: ${reportRangeLabel}`,
      `Company Filter: ${companyFilter === "all" ? "All Company" : companies.find((company) => company.id === companyFilter)?.name || "-"}`,
      `Status Filter: ${statusFilter}`,
      "",
      `Total Trips: ${summary.totalTrips}`,
      `Garbage Trips: ${summary.garbageTrips}`,
      `Wastage Trips: ${summary.wastageTrips}`,
      `Bill Amount: ${money(summary.amount)}`,
      `Received: ${money(summary.received)}`,
      `Due: ${money(summary.due)}`,
      "",
      "Company-wise Due Summary",
      ...companyDueSummary.map((row) => `${row.companyName} | Trips ${row.totalTrips} | Due ${money(row.due)}`),
      "",
      "Detailed History",
      ...filteredHistory.map(
        (row) =>
          `${row.date} | ${row.companyName} | ${row.carType} | G:${row.garbageTrips} W:${row.wastageTrips} | Amount ${money(row.amount)} | Due ${money(row.due)}`,
      ),
    ];
    const blob = createSimplePdfBlob("Waste Management Report", lines, "Helvetica", 10, 36, 800, {
      repeatTitle: true,
      showPageNumbers: true,
      lineHeight: 14,
      linesPerPage: 48,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `waste_report_${new Date().toISOString().split("T")[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
          <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
            <option value="">Select company</option>
            {activeCompanies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <select value={carType} onChange={(e) => setCarType(e.target.value as WasteRecord["carType"])} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
            {CAR_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input type="number" min="0" disabled={carType === "Wastage Only"} value={garbageTrips} onChange={(e) => setGarbageTrips(e.target.value)} placeholder="Garbage trips" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"} ${carType === "Wastage Only" ? "opacity-50" : ""}`} />
          <input type="number" min="0" disabled={carType === "Garbage Only"} value={wastageTrips} onChange={(e) => setWastageTrips(e.target.value)} placeholder="Wastage trips" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"} ${carType === "Garbage Only" ? "opacity-50" : ""}`} />
          <input type="number" min="0" value={ratePerTrip} onChange={(e) => setRatePerTrip(e.target.value)} placeholder="Rate per trip" className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
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

        <div className="mt-5 flex justify-end">
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700">
            {editingRecordId ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </form>

      <div className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between mb-6">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>Collection History</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">Daily collection, received amount and due balance by company.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 w-full lg:w-auto">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, note or type" className={`rounded-xl border px-4 py-3 font-bold outline-none md:col-span-2 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
              <option value="all">All Company</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}>
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <button type="button" onClick={() => { setSearch(""); setCompanyFilter("all"); setStatusFilter("all"); setStartDate(""); setEndDate(""); }} className="rounded-xl bg-slate-100 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600">Reset</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-blue-50 border-blue-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtered Bill</p><p className="mt-2 text-2xl font-black text-blue-600">{money(summary.amount)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{reportRangeLabel}</p></div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-emerald-50 border-emerald-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collected</p><p className="mt-2 text-2xl font-black text-emerald-600">{money(summary.received)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{filteredHistory.length} record(s)</p></div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-rose-50 border-rose-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding Due</p><p className="mt-2 text-2xl font-black text-rose-500">{money(summary.due)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{companyDueSummary.filter((row) => row.due > 0).length} company(s)</p></div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-amber-50 border-amber-100"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Trips</p><p className="mt-2 text-2xl font-black text-amber-500">{summary.totalTrips.toLocaleString("en-BD")}</p><p className="mt-1 text-[11px] font-bold text-slate-400">G {summary.garbageTrips.toLocaleString("en-BD")} | W {summary.wastageTrips.toLocaleString("en-BD")}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} />
          <div className={`rounded-xl border px-4 py-3 ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-700"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Trips</p><p className="mt-2 text-lg font-black">{summary.totalTrips.toLocaleString("en-BD")}</p></div>
          <div className={`rounded-xl border px-4 py-3 ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-700"}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding Due</p><p className="mt-2 text-lg font-black text-rose-500">{money(summary.due)}</p></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Company-wise Due Summary</p>
              <span className="text-[10px] font-bold text-slate-400">{companyDueSummary.length} company(s)</span>
            </div>
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className={`${isDark ? "bg-slate-800 text-slate-300" : "bg-white text-slate-500"}`}><tr><th className="px-4 py-3 font-black uppercase tracking-widest">Company</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Trips</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Amount</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Received</th><th className="px-4 py-3 font-black uppercase tracking-widest text-right">Due</th></tr></thead>
                <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
                  {companyDueSummary.map((row) => (
                    <tr key={row.companyId} onClick={() => setCompanyFilter(row.companyId)} className={`cursor-pointer ${isDark ? "hover:bg-slate-800/70" : "hover:bg-blue-50"}`}>
                      <td className="px-4 py-3 font-bold">{row.companyName}</td><td className="px-4 py-3 text-right">{row.totalTrips}</td><td className="px-4 py-3 text-right text-blue-600 font-black">{money(row.amount)}</td><td className="px-4 py-3 text-right text-emerald-600 font-black">{money(row.received)}</td><td className="px-4 py-3 text-right text-rose-500 font-black">{money(row.due)}</td>
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
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className={`${isDark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-500"}`}>
              <tr>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Date</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Company</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Car Type</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Garbage</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Wastage</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Trips</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Rate</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Amount</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Received</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Due</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-center">Status</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
              {filteredHistory.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 font-bold">{record.date}</td>
                  <td className="px-4 py-3"><div className="font-bold">{record.companyName}</div>{record.notes ? <div className="mt-1 text-[11px] text-slate-400">{record.notes}</div> : null}</td>
                  <td className="px-4 py-3">{record.carType}</td>
                  <td className="px-4 py-3 text-right">{record.garbageTrips}</td>
                  <td className="px-4 py-3 text-right">{record.wastageTrips}</td>
                  <td className="px-4 py-3 text-right font-black">{record.totalTrips}</td>
                  <td className="px-4 py-3 text-right">{money(record.ratePerTrip)}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-black">{money(record.amount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-black">{money(record.received)}</td>
                  <td className="px-4 py-3 text-right text-rose-500 font-black">{money(record.due)}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${record.status === "Paid" ? "bg-emerald-50 text-emerald-600" : record.status === "Partial" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>{record.status}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => handleRecordEdit(record)} className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600">Edit</button><button type="button" onClick={() => handleRecordDelete(record.id)} className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600">Delete</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WasteManagement;
