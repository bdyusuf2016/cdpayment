import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  AssessmentItem,
  Client,
  AssessmentRecord,
  SystemConfig,
} from "../types";
import {
  insertAssessment,
  updateAssessment,
  deleteAssessment,
} from "../utils/supabaseApi";
import { printElement } from "../utils/printTable";
import { SupabaseClient } from "@supabase/supabase-js";

interface AssessmentBillingProps {
  clients: Client[];
  systemConfig: SystemConfig;
  history: AssessmentRecord[];
  supabase: SupabaseClient | null;
}

const AssessmentBilling: React.FC<AssessmentBillingProps> = ({
  clients,
  systemConfig,
  history,
  supabase,
}) => {
  const [ain, setAin] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [nosOfBe, setNosOfBe] = useState("");
  const [rate, setRate] = useState(systemConfig.defaultRate.toString());
  // Discount is now handled at batch level in the queue
  const [batchDiscount, setBatchDiscount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [queue, setQueue] = useState<AssessmentItem[]>([]);
  const [insertedRecords, setInsertedRecords] = useState<AssessmentRecord[]>(
    [],
  );
  const [updatedRecords, setUpdatedRecords] = useState<
    Record<string, AssessmentRecord>
  >({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const beCountRef = useRef<HTMLInputElement>(null);

  // Item calculation (discount removed from here, applied later)
  const calculatedAmount = parseFloat(nosOfBe || "0") * parseFloat(rate || "0");

  useEffect(() => {
    if (!editingId) {
      setRate(systemConfig.defaultRate.toString());
    }
  }, [systemConfig.defaultRate, editingId]);

  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date(0);
    if (dateStr.includes("/")) {
      const [day, month, year] = dateStr.split("/");
      const parsed = new Date(`${year}-${month}-${day}`);
      return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  };

  const allHistory = useMemo(() => {
    // Merge local inserted records and apply local updates, dedupe by id
    const combined = [...insertedRecords, ...history].filter(
      (v, i, a) => a.findIndex((x) => x.id === v.id) === i,
    );
    // Apply any local updates
    return combined.map((rec) =>
      updatedRecords[rec.id] ? updatedRecords[rec.id] : rec,
    );
  }, [history, insertedRecords, updatedRecords]);

  const filteredHistory = useMemo(() => {
    const applied = allHistory;
    return applied.filter((rec) => {
      const recDate = parseDate(rec.date);
      const recClientName = (rec.clientName || "").toLowerCase();
      const recAin = rec.ain || "";
      const matchesSearch =
        recClientName.includes(filterSearch.toLowerCase()) ||
        recAin.includes(filterSearch);
      const matchesStatus =
        filterStatus === "All" || rec.status === filterStatus;
      const matchesMethod =
        filterPaymentMethod === "All" ||
        rec.paymentMethod === filterPaymentMethod;

      let matchesDate = true;
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && recDate >= start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && recDate <= end;
      }

      return matchesSearch && matchesStatus && matchesDate && matchesMethod;
    });
  }, [
    allHistory,
    filterSearch,
    filterStatus,
    filterPaymentMethod,
    startDate,
    endDate,
  ]);

  const handleAinChange = (val: string) => {
    setAin(val);
    const client = clients.find((c) => c.ain === val);
    if (client) {
      setClientName(client.name);
      setPhone(client.phone);
    } else {
      setClientName("");
      setPhone("");
    }
  };

  const handleAddOrUpdate = async () => {
    if (!nosOfBe || !ain) return;
    if (editingId) {
      // Editing mode - direct update
      const discountVal = parseFloat(batchDiscount) || 0; // In edit mode, we might use this as item discount
      const netVal = calculatedAmount - discountVal;
      const patched: Partial<AssessmentRecord> = {
        ain,
        clientName,
        phone,
        nosOfBe: parseInt(nosOfBe),
        rate: parseFloat(rate),
        amount: calculatedAmount,
        discount: discountVal,
        net: netVal,
      };
      if (supabase) {
        const res = await updateAssessment(
          supabase,
          editingId as string,
          patched,
        );
        setUpdatedRecords((prev) => ({
          ...prev,
          [editingId as string]:
            (res as AssessmentRecord) ||
            ({ ...(patched as any), id: editingId } as AssessmentRecord),
        }));
      } else {
        setUpdatedRecords((prev) => ({
          ...prev,
          [editingId as string]: {
            ...(patched as any),
            id: editingId,
          } as AssessmentRecord,
        }));
      }
      setEditingId(null);
      setBatchDiscount("");
    } else {
      // Add to queue
      setQueue([
        ...queue,
        {
          id: Math.random().toString(36).substr(2, 9),
          nosOfBe: parseInt(nosOfBe),
          rate: parseFloat(rate),
          amount: calculatedAmount,
          discount: 0,
          net: calculatedAmount,
        },
      ]);
    }
    setNosOfBe("");
    beCountRef.current?.focus();
  };

  const submitQueue = async () => {
    if (queue.length === 0) return;

    const totalAmount = queue.reduce((sum, item) => sum + item.amount, 0);
    const totalDiscount = parseFloat(batchDiscount) || 0;

    // Distribute discount proportionally
    const newRecords: AssessmentRecord[] = queue.map((item) => {
      // Avoid division by zero
      const proportion = totalAmount > 0 ? item.amount / totalAmount : 0;
      const itemDiscount = totalDiscount * proportion;
      const itemNet = item.amount - itemDiscount;

      return {
        id: Math.random().toString(36).substr(2, 9),
        date: new Date().toLocaleDateString("en-GB"),
        ain,
        clientName,
        phone,
        nosOfBe: item.nosOfBe,
        rate: item.rate,
        amount: item.amount,
        discount: itemDiscount,
        net: itemNet,
        received: 0,
        status: "New",
        profit: itemNet,
      };
    });

    const url = systemConfig.supabaseUrl;
    const key = systemConfig.supabaseKey;

    if (supabase) {
      const inserted: AssessmentRecord[] = [];
      for (const rec of newRecords) {
        const res = await insertAssessment(supabase, rec as any);
        console.debug("insertAssessment result:", res, rec);
        if (res) inserted.push(res);
        else {
          console.warn(
            "insertAssessment returned null — rendering local record instead.",
          );
          inserted.push(rec as AssessmentRecord);
        }
      }
      if (inserted.length > 0)
        setInsertedRecords((prev) => [...inserted, ...prev]);
    } else {
      // No supabase client — render locally
      setInsertedRecords((prev) => [...newRecords, ...prev]);
    }
    setQueue([]);
    setAin("");
    setClientName("");
    setPhone("");
    setBatchDiscount("");
  };

  const printAssessmentInvoice = (records: AssessmentRecord[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const client = records[0];
    const totalNet = records.reduce((acc, r) => acc + r.net, 0);
    const itemsHtml = records
      .map(
        (rec, index) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${index + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">Assessment Bill (${rec.nosOfBe} B/E)</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">৳${rec.net.toLocaleString()}</td>
      </tr>`,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Assessment Invoice</title>
          <style>body { font-family: 'Inter', sans-serif; padding: 40px; } .header { border-bottom: 2px solid #333; padding-bottom: 20px; display: flex; justify-content: space-between; } table { width: 100%; border-collapse: collapse; margin-top: 20px; } th { text-align: left; padding: 10px; background: #f4f4f4; border-bottom: 1px solid #333; } td { padding: 10px; border-bottom: 1px solid #eee; }</style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div><h1>${systemConfig.agencyName}</h1><p>${systemConfig.agencyAddress}</p></div>
            <div style="text-align: right"><h2>Service Bill</h2><p>Date: ${new Date().toLocaleDateString("en-GB")}</p></div>
          </div>
          <p><strong>Customer:</strong> ${client.clientName}</p>
          <table><thead><tr><th>#</th><th>Description</th><th style="text-align: right">Amount</th></tr></thead><tbody>${itemsHtml}</tbody></table>
          <h3 style="text-align: right">Total: ৳${totalNet.toLocaleString()}</h3>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const shareWhatsApp = (recs: AssessmentRecord[]) => {
    if (recs.length === 0) return;
    const targetPhone = recs[0].phone;
    if (!targetPhone) {
      alert("No phone number found.");
      return;
    }
    const total = recs.reduce((a, b) => a + b.net, 0);

    let msg = `*ASSESSMENT BILL SUMMARY*\n`;
    msg += `--------------------------------\n`;
    msg += `*Agency:* ${systemConfig.agencyName}\n`;
    msg += `*Client:* ${recs[0].clientName}\n`;
    msg += `*Date:* ${new Date().toLocaleDateString("en-GB")}\n`;
    msg += `--------------------------------\n\n`;

    recs.forEach((r, i) => {
      msg += `${i + 1}. *Qty:* ${r.nosOfBe} B/E\n    *Rate:* ৳${r.rate}\n    *Amount:* ৳${r.net.toLocaleString()}\n\n`;
    });

    msg += `--------------------------------\n`;
    msg += `*TOTAL PAYABLE:* ৳${total.toLocaleString()}\n`;
    msg += `--------------------------------\n`;

    window.open(
      `https://wa.me/${targetPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
      "_blank",
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const initiatePayment = (ids: string[]) => {
    setPaymentIds(ids);
    setPaymentAmount(""); // Received Amount starts blank
    setPaymentMethod(systemConfig.paymentMethods[0] || "Cash");
    setShowPaymentModal(true);
  };

  const processPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount)) return;
    const url = systemConfig.supabaseUrl;
    const key = systemConfig.supabaseKey;

    const apply = async () => {
      for (const rec of allHistory.filter((r) => paymentIds.includes(r.id))) {
        const splitAmount = amount / paymentIds.length;
        const patched: Partial<AssessmentRecord> = {
          status: "Paid",
          received: splitAmount,
          paymentMethod: paymentMethod,
        };
        if (supabase) {
          const res = await updateAssessment(supabase, rec.id, patched);
          setUpdatedRecords((prev) => ({
            ...prev,
            [rec.id]:
              (res as AssessmentRecord) ||
              ({ ...(patched as any), id: rec.id } as AssessmentRecord),
          }));
        } else {
          setUpdatedRecords((prev) => ({
            ...prev,
            [rec.id]: { ...(patched as any), id: rec.id } as AssessmentRecord,
          }));
        }
      }
    };

    apply().then(() => {
      setShowPaymentModal(false);
      setSelectedIds([]);
      setPaymentIds([]);
    });
  };

  const handleDeleteRecord = async (id: string) => {
    const ok = window.confirm("Are you sure you want to delete this record?");
    if (!ok) return;

    setInsertedRecords((prev) => prev.filter((r) => r.id !== id));
    setUpdatedRecords((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
    if (supabase) {
      await deleteAssessment(supabase, id);
    }
  };

  const isDark = systemConfig.theme === "dark";
  const queueTotal = queue.reduce((sum, item) => sum + item.amount, 0);
  const queueDiscount = parseFloat(batchDiscount) || 0;
  const queueNetTotal = Math.max(0, queueTotal - queueDiscount);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Top Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left: Smart Calculator Form */}
        <div
          className={`lg:col-span-2 rounded-[1.5rem] shadow-sm border p-8 relative overflow-hidden transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
        >
          <div className="flex items-center gap-3 mb-6 pb-4 border-b dark:border-slate-700">
            <span className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/30">
              <i className="fas fa-calculator"></i>
            </span>
            <h3
              className={`font-bold text-sm uppercase tracking-widest ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              Assessment Calculator
            </h3>
          </div>

          <div className="space-y-6">
            {/* Client Finder */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  AIN Reference
                </label>
                <div className="relative">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                  <input
                    type="text"
                    placeholder="Search ID..."
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border font-bold text-sm outline-none focus:border-purple-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`}
                    value={ain}
                    onChange={(e) => handleAinChange(e.target.value)}
                  />
                </div>
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Client Name
                </label>
                <input
                  type="text"
                  readOnly
                  className={`w-full px-4 py-3 rounded-xl border font-bold text-sm outline-none ${isDark ? "bg-slate-900/50 border-slate-700 text-slate-500" : "bg-slate-50 border-slate-200 text-slate-500"}`}
                  value={clientName}
                />
              </div>
            </div>

            {/* Calculation Grid */}
            <div
              className={`p-6 rounded-2xl border ${isDark ? "bg-slate-900/40 border-slate-700" : "bg-purple-50/20 border-purple-100"}`}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Total B/E
                  </label>
                  <input
                    ref={beCountRef}
                    type="number"
                    placeholder="0"
                    className={`w-full px-4 py-3 rounded-xl border font-bold text-xl text-center outline-none focus:border-purple-500 transition-all ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-purple-200 text-slate-800"}`}
                    value={nosOfBe}
                    onChange={(e) => setNosOfBe(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Rate/Unit
                  </label>
                  <input
                    type="number"
                    className={`w-full px-4 py-3 rounded-xl border font-bold text-xl text-center outline-none focus:border-purple-500 transition-all ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-purple-200 text-slate-800"}`}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleAddOrUpdate}
                  className="h-[54px] bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl uppercase tracking-widest text-xs shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
                >
                  Add Bill
                </button>
              </div>
              {/* Live Result Display */}
              <div className="mt-4 pt-4 border-t border-dashed border-slate-300 dark:border-slate-700 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Item Amount
                </span>
                <span className="text-2xl font-bold text-purple-600">
                  ৳{calculatedAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Queue Preview - Updated Design */}
        <div
          className={`lg:col-span-1 rounded-[1.5rem] shadow-sm overflow-hidden flex flex-col h-full min-h-[400px] border ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
        >
          <div className="p-6 bg-gradient-to-r from-purple-600 to-purple-700 text-white flex justify-between items-center">
            <div>
              <h4 className="font-bold text-sm uppercase tracking-widest">
                Billing Queue
              </h4>
              <p className="text-[10px] opacity-70 font-bold uppercase mt-1">
                {queue.length} Bills Ready
              </p>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <i className="fas fa-file-invoice-dollar"></i>
            </div>
          </div>

          <div className="flex-grow p-4 space-y-3 overflow-y-auto max-h-[400px]">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 opacity-50 gap-3 min-h-[200px]">
                <i className="fas fa-inbox text-4xl"></i>
                <p className="text-[10px] font-bold uppercase">Queue Empty</p>
              </div>
            ) : (
              queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border flex justify-between items-center relative group ${isDark ? "bg-slate-800 border-slate-700 hover:border-slate-600" : "bg-slate-50 border-slate-300 hover:border-slate-200"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400 w-5">
                      #{idx + 1}
                    </span>
                    <div>
                      <p
                        className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-800"}`}
                      >
                        ৳{item.amount.toLocaleString()}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500">
                        {item.nosOfBe} B/E @ {item.rate}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setQueue(queue.filter((q) => q.id !== item.id))
                    }
                    className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div
            className={`p-6 border-t space-y-4 ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-300"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase">
                Subtotal
              </span>
              <span
                className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}
              >
                ৳{queueTotal.toLocaleString()}
              </span>
            </div>

            {/* Discount Field */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-red-400 uppercase">
                Discount
              </span>
              <input
                type="number"
                placeholder="0"
                className={`w-24 px-3 py-1.5 rounded-lg text-right font-bold border outline-none focus:border-red-500 text-red-500 ${isDark ? "bg-slate-900 border-slate-600" : "bg-white border-slate-200"}`}
                value={batchDiscount}
                onChange={(e) => setBatchDiscount(e.target.value)}
              />
            </div>

            <div
              className={`flex items-center justify-between pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}
            >
              <span className="text-sm font-black text-purple-500 uppercase tracking-widest">
                Total Payable
              </span>
              <span className="text-xl font-black text-purple-600">
                ৳{queueNetTotal.toLocaleString()}
              </span>
            </div>

            <button
              onClick={submitQueue}
              disabled={queue.length === 0}
              className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-black text-white font-bold py-4 rounded-xl uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all active:scale-95"
            >
              Confirm & Post
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div
        className={`rounded-[1.5rem] shadow-sm border overflow-hidden ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
      >
        <div
          className={`px-8 py-6 border-b flex flex-col md:flex-row gap-4 justify-between items-center ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <h3
              className={`font-bold uppercase text-xs tracking-widest flex items-center gap-2 ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              <i className="fas fa-history text-purple-500"></i> Billing History
            </h3>
            {selectedIds.length > 0 && (
              <>
                <button
                  onClick={() => initiatePayment(selectedIds)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-md transition-all animate-in zoom-in"
                >
                  Bulk Pay ({selectedIds.length})
                </button>
                <button
                  onClick={() =>
                    shareWhatsApp(
                      allHistory.filter((h) => selectedIds.includes(h.id)),
                    )
                  }
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-md transition-all animate-in zoom-in flex items-center gap-2"
                >
                  <i className="fab fa-whatsapp"></i> Summary
                </button>
              </>
            )}
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <select
              className={`px-3 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-slate-50 border-slate-200"}`}
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
            >
              <option value="All">All Methods</option>
              {systemConfig.paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setStartDate(new Date().toISOString().split("T")[0]);
                setEndDate(new Date().toISOString().split("T")[0]);
              }}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase shadow-sm hover:bg-purple-700"
            >
              Today
            </button>
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="bg-slate-100 text-slate-900 px-4 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-200"
            >
              Clear
            </button>
            <button
              onClick={() =>
                printElement(
                  document.getElementById("assessment-table"),
                  "Billing History",
                )
              }
              title="Print table"
              className="bg-white/80 text-slate-700 px-3 py-2 rounded-lg border shadow-sm hover:bg-slate-50 text-sm font-bold"
            >
              {" "}
              <i className="fas fa-print"></i> Print
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table id="assessment-table" className="w-full text-left">
            <thead>
              <tr
                className={`${isDark ? "bg-slate-900/50" : "bg-slate-50"} border-b ${isDark ? "border-slate-700" : "border-slate-300"}`}
              >
                <th className="px-6 py-4 w-10 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded cursor-pointer accent-purple-600"
                    checked={
                      selectedIds.length === filteredHistory.length &&
                      filteredHistory.length > 0
                    }
                    onChange={() =>
                      setSelectedIds(
                        selectedIds.length === filteredHistory.length
                          ? []
                          : filteredHistory.map((h) => h.id),
                      )
                    }
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Client & AIN
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Net Value
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  Status
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-300"}`}
            >
              {filteredHistory.map((rec, index) => (
                <tr
                  key={rec.id}
                  className={`group hover:bg-purple-50/30 dark:hover:bg-slate-700/30 transition-all ${index % 2 === 0 && !isDark ? "bg-white" : !isDark ? "bg-slate-50/40" : ""}`}
                >
                  <td className="px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 cursor-pointer"
                      checked={selectedIds.includes(rec.id)}
                      onChange={() =>
                        setSelectedIds((prev) =>
                          prev.includes(rec.id)
                            ? prev.filter((i) => i !== rec.id)
                            : [...prev, rec.id],
                        )
                      }
                    />
                  </td>
                  <td className="px-6 py-4">
                    <p
                      className={`text-base font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}
                    >
                      {rec.clientName}
                    </p>
                    <div className="flex gap-2 mt-1.5">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        AIN: {rec.ain}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                        {rec.nosOfBe} B/E
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 mt-1.5 text-base font-bold text-slate-600 hover:text-blue-600 cursor-pointer w-fit"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(rec.phone);
                      }}
                    >
                      <i className="fas fa-phone-alt text-[10px]"></i>{" "}
                      {rec.phone}{" "}
                      <i className="fas fa-copy ml-1 opacity-50 hover:opacity-100 text-xs"></i>
                    </div>
                  </td>
                  <td
                    className={`px-6 py-4 text-right text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-900"}`}
                  >
                    ৳{rec.net.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${rec.status === "Paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-2 opacity-60 group-hover:opacity-100 transition-all">
                      {(rec.status === "New" || rec.status === "Pending") && (
                        <button
                          onClick={() => initiatePayment([rec.id])}
                          title="Receive Payment"
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white transition-all"
                        >
                          <i className="fas fa-hand-holding-dollar"></i>
                        </button>
                      )}
                      <button
                        onClick={() => shareWhatsApp([rec])}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all"
                      >
                        <i className="fab fa-whatsapp"></i>
                      </button>
                      <button
                        onClick={() => printAssessmentInvoice([rec])}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 hover:bg-slate-600 hover:text-white transition-all"
                      >
                        <i className="fas fa-print"></i>
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(rec.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-all"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Settlement Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            className={`w-full max-w-md rounded-[2rem] shadow-2xl p-8 animate-in zoom-in-95 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3
                  className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}
                >
                  Assessment Payment
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Processing {paymentIds.length} bill(s)
                </p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border flex justify-between items-center ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-300"}`}
              >
                <span className="text-xs font-bold text-slate-500 uppercase">
                  Total Bill Amount
                </span>
                <span
                  className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}
                >
                  ৳
                  {allHistory
                    .filter((r) => paymentIds.includes(r.id))
                    .reduce((a, b) => a + b.net, 0)
                    .toLocaleString()}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Received Amount
                </label>
                <input
                  type="number"
                  className={`w-full px-5 py-3 rounded-xl border-2 font-bold text-lg outline-none focus:border-purple-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"}`}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {systemConfig.paymentMethods.map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`py-3 px-2 rounded-xl text-xs font-bold uppercase border-2 transition-all ${paymentMethod === m ? "border-purple-500 bg-purple-50 text-purple-700" : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={processPayment}
                className="w-full py-4 mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl uppercase tracking-widest text-xs shadow-xl shadow-purple-200 transition-all active:scale-95"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentBilling;
