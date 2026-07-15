import React, { useEffect, useMemo, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { ClearanceRecord, SystemConfig } from "../types";
import {
  deleteClearanceRecord,
  insertClearanceRecord,
  updateClearanceRecord,
} from "../utils/supabaseApi";

interface ClearanceTrackerProps {
  history: ClearanceRecord[];
  setHistory: React.Dispatch<React.SetStateAction<ClearanceRecord[]>>;
  onVisibleRowsChange: (rows: ClearanceRecord[]) => void;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
}

const getTodayDateInputValue = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().split("T")[0];
};

const formatDisplayDate = (value: string): string => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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

const ClearanceTracker: React.FC<ClearanceTrackerProps> = ({
  history,
  setHistory,
  onVisibleRowsChange,
  systemConfig,
  supabase,
}) => {
  const isDark = systemConfig.theme === "dark";
  const [entryDate, setEntryDate] = useState(getTodayDateInputValue);
  const [totalClearance, setTotalClearance] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredHistory = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...history]
      .filter((row) => {
        const rowDate = parseDate(row.date);
        const matchesSearch =
          !normalizedSearch ||
          String(row.notes || "").toLowerCase().includes(normalizedSearch) ||
          String(row.totalClearance || "").includes(normalizedSearch);
        let matchesDate = true;
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          matchesDate = matchesDate && rowDate >= start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && rowDate <= end;
        }
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [endDate, history, search, startDate]);

  useEffect(() => {
    onVisibleRowsChange(filteredHistory);
  }, [filteredHistory, onVisibleRowsChange]);

  const summary = useMemo(
    () =>
      filteredHistory.reduce(
        (acc, row) => {
          acc.total += row.totalClearance || 0;
          acc.days += 1;
          return acc;
        },
        { total: 0, days: 0 },
      ),
    [filteredHistory],
  );

  const resetForm = () => {
    setEditingId(null);
    setEntryDate(getTodayDateInputValue());
    setTotalClearance("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const count = Math.max(0, Number(totalClearance) || 0);
    if (count <= 0) {
      setActionError("Total clearance count is required.");
      return;
    }

    const payload = {
      date: formatDisplayDate(entryDate),
      totalClearance: count,
      notes: notes.trim(),
    } satisfies Omit<ClearanceRecord, "id">;

    setActionError(null);
    try {
      if (editingId) {
        const updated = await updateClearanceRecord(supabase, editingId, payload);
        if (updated) {
          setHistory((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          );
        }
      } else {
        const created = await insertClearanceRecord(supabase, payload);
        if (created) {
          setHistory((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        }
      }
      resetForm();
    } catch (error: any) {
      setActionError(error?.message || "Failed to save clearance record.");
    }
  };

  const handleEdit = (record: ClearanceRecord) => {
    setEditingId(record.id);
    const parsed = parseDate(record.date);
    if (parsed.getTime() > 0) {
      const offset = parsed.getTimezoneOffset();
      const local = new Date(parsed.getTime() - offset * 60000);
      setEntryDate(local.toISOString().split("T")[0]);
    }
    setTotalClearance(String(record.totalClearance || 0));
    setNotes(record.notes || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Delete this clearance record?")) return;
    setActionError(null);
    try {
      await deleteClearanceRecord(supabase, id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) resetForm();
    } catch (error: any) {
      setActionError(error?.message || "Failed to delete clearance record.");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {actionError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              Daily Clearance Tracker
            </h3>
            <p className="text-xs font-medium text-slate-400 mt-1">
              Save how many shulkayon were completed each day.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
          <input
            type="number"
            min="0"
            value={totalClearance}
            onChange={(e) => setTotalClearance(e.target.value)}
            placeholder="Total clearance"
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700"
          >
            {editingId ? "Update Clearance" : "Save Clearance"}
          </button>
        </div>
      </form>

      <div className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes or count"
            className={`rounded-xl border px-4 py-3 font-bold outline-none md:col-span-2 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-blue-50 border-blue-100"}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Clearance</p>
            <p className="mt-2 text-2xl font-black text-blue-600">{summary.total.toLocaleString("en-BD")}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-emerald-50 border-emerald-100"}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Working Days</p>
            <p className="mt-2 text-2xl font-black text-emerald-600">{summary.days.toLocaleString("en-BD")}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDark ? "bg-slate-900 border-slate-700" : "bg-amber-50 border-amber-100"}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Average Per Day</p>
            <p className="mt-2 text-2xl font-black text-amber-500">
              {summary.days > 0
                ? Math.round(summary.total / summary.days).toLocaleString("en-BD")
                : "0"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className={`${isDark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-500"}`}>
              <tr>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Date</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Total Clearance</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Notes</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
              {filteredHistory.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 font-bold">{record.date}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-black">
                    {record.totalClearance.toLocaleString("en-BD")}
                  </td>
                  <td className="px-4 py-3">{record.notes || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(record)}
                        className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    No clearance records found for the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClearanceTracker;
