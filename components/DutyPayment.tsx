import React, { useState, useRef, useMemo, useEffect } from "react";
import { DutyItem, PaymentRecord, Client, SystemConfig } from "../types";
import { insertDuty, updateDuty, deleteDuty } from "../utils/supabaseApi";
import { printElement } from "../utils/printTable";
import { SupabaseClient } from "@supabase/supabase-js";

interface DutyPaymentProps {
  clients: Client[];
  history: PaymentRecord[];
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
}

const DutyPayment: React.FC<DutyPaymentProps> = ({
  clients,
  history,
  systemConfig,
  supabase,
}) => {
  const [ain, setAin] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [beNumber, setBeNumber] = useState("");
  const [beYear, setBeYear] = useState(new Date().getFullYear().toString());
  const [dutyAmount, setDutyAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [queue, setQueue] = useState<DutyItem[]>([]);
  const [insertedRecords, setInsertedRecords] = useState<PaymentRecord[]>([]);
  const [updatedRecords, setUpdatedRecords] = useState<
    Record<string, PaymentRecord>
  >({});
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    ids: string[];
  }>({ show: false, ids: [] });

  const beInputRef = useRef<HTMLInputElement>(null);

  // Focus B/E Number on mount
  useEffect(() => {
    if (beInputRef.current) {
      beInputRef.current.focus();
    }
  }, []);

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
    // Merge local inserted records with parent-provided history and dedupe by id
    const combined = [...insertedRecords, ...history].filter(
      (v, i, a) => a.findIndex((x) => x.id === v.id) === i,
    );
    return combined
      .map((rec) => updatedRecords[rec.id] || rec)
      .filter((rec) => !deletedIds.includes(rec.id));
  }, [insertedRecords, history, updatedRecords, deletedIds]);

  const filteredHistory = useMemo(() => {
    return allHistory.filter((rec) => {
      const recDate = parseDate(rec.date);
      const recClientName = (rec.clientName || "").toLowerCase();
      const recAin = rec.ain || "";
      const recBeYear = rec.beYear || "";
      const matchesSearch =
        recClientName.includes(filterSearch.toLowerCase()) ||
        recAin.includes(filterSearch) ||
        recBeYear.includes(filterSearch);

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
      setPhone(client.phone || "");
    } else {
      setClientName("");
      setPhone("");
    }
  };

  const handleAddOrUpdate = async () => {
    if (!beNumber || !dutyAmount || !beYear || !supabase) return;

    let formattedBe = beNumber.trim().toUpperCase();
    if (!formattedBe.startsWith("C-")) {
      formattedBe = `C-${formattedBe}`;
    }

    if (editingId) {
      const updatedRec: Partial<PaymentRecord> = {
        ain,
        clientName,
        phone,
        beYear: `${formattedBe}(${beYear})`,
        duty: parseFloat(dutyAmount),
      };
      await updateDuty(supabase, editingId, updatedRec);
      setEditingId(null);
    } else {
      setQueue([
        ...queue,
        {
          id: Math.random().toString(36).substr(2, 9),
          beNumber: formattedBe,
          year: beYear,
          duty: parseFloat(dutyAmount),
        },
      ]);
    }
    setBeNumber("");
    setDutyAmount("");
    beInputRef.current?.focus();
  };

  const submitQueue = async () => {
    if (queue.length === 0) return;

    const newRecords: PaymentRecord[] = queue.map((item) => ({
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString("en-GB"),
      ain,
      clientName,
      phone,
      beYear: `${item.beNumber}(${item.year})`,
      duty: item.duty,
      received: 0,
      status: "New",
      profit: 0,
    }));

    if (supabase) {
      for (const record of newRecords) {
        const res = await insertDuty(supabase, {
          date: record.date,
          ain: record.ain,
          clientName: record.clientName,
          phone: record.phone,
          beYear: record.beYear,
          duty: record.duty,
          received: record.received,
          status: record.status,
          profit: record.profit,
        });
        console.debug("insertDuty result:", res, record);
        if (res) setInsertedRecords((prev) => [res, ...prev]);
        else {
          // If insert failed or returned null, still render locally so UX reflects the queue
          console.warn(
            "insertDuty returned null — rendering local record instead.",
          );
          setInsertedRecords((prev) => [record, ...prev]);
        }
      }
    } else {
      // No supabase client — render locally
      setInsertedRecords((prev) => [...newRecords, ...prev]);
    }

    setQueue([]);
    setAin("");
    setClientName("");
    setPhone("");
  };

  const generateWAMessage = (recs: PaymentRecord[]) => {
    const clientName = recs[0].clientName;
    const total = recs.reduce((a, b) => a + b.duty, 0);

    let msg = `*INVOICE SUMMARY*\n`;
    msg += `--------------------------------\n`;
    msg += `*Agency:* ${systemConfig.agencyName}\n`;
    msg += `*Client:* ${clientName}\n`;
    msg += `*Date:* ${new Date().toLocaleDateString("en-GB")}\n`;
    msg += `--------------------------------\n\n`;

    recs.forEach((r, i) => {
      msg += `${i + 1}. *B/E:* ${r.beYear}\n    *Amount:* ৳${r.duty.toLocaleString()}\n\n`;
    });

    msg += `--------------------------------\n`;
    msg += `*TOTAL PAYABLE:* ৳${total.toLocaleString()}\n`;
    msg += `--------------------------------\n`;
    msg += `Thank you for your business.`;

    return msg;
  };

  const shareWhatsApp = (recs: PaymentRecord[]) => {
    if (recs.length === 0) return;
    const targetPhone = recs[0].phone;
    if (!targetPhone) {
      alert("No phone number found for this client.");
      return;
    }
    const msg = generateWAMessage(recs);
    window.open(
      `https://wa.me/${targetPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
      "_blank",
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const printDutyInvoice = (recs: PaymentRecord[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const client = recs[0];
    const totalDuty = recs.reduce((a, b) => a + b.duty, 0);
    const items = recs
      .map(
        (r, i) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${i + 1}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">Duty Payment for B/E: <strong>${r.beYear}</strong></td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">৳${r.duty.toLocaleString()}</td>
      </tr>`,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Duty Invoice</title>
          <style>body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; } .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; } table { width: 100%; border-collapse: collapse; } th { background: #f1f5f9; text-align: left; padding: 12px; font-weight: 600; } .total { text-align: right; margin-top: 30px; font-size: 18px; font-weight: 700; }</style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div><h1 style="margin:0">${systemConfig.agencyName}</h1><p>${systemConfig.agencyAddress}</p></div>
            <div style="text-align: right"><h2>PAYMENT RECEIPT</h2><p>Date: ${new Date().toLocaleDateString("en-GB")}</p></div>
          </div>
          <p><strong>Customer:</strong> ${client.clientName} (AIN: ${client.ain})</p>
          <table><thead><tr><th>SL</th><th>Description</th><th style="text-align: right">Amount</th></tr></thead><tbody>${items}</tbody></table>
          <div class="total">Total Paid: ৳${totalDuty.toLocaleString()}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const initiatePayment = (ids: string[]) => {
    setPaymentIds(ids);
    setPaymentAmount(""); // Received Amount set to blank
    setPaymentMethod(systemConfig.paymentMethods[0] || "Cash");
    setShowPaymentModal(true);
  };

  const processPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount)) return;

    const targetRecords = allHistory.filter((r) => paymentIds.includes(r.id));
    if (targetRecords.length === 0) return;

    const splitAmount = amount / paymentIds.length;

    // Optimistic UI update first
    setUpdatedRecords((prev) => {
      const next = { ...prev };
      for (const rec of targetRecords) {
        const patched: Partial<PaymentRecord> = {
          status: "Paid",
          received: splitAmount,
          profit: splitAmount - rec.duty,
          paymentMethod: paymentMethod,
        };
        next[rec.id] = { ...rec, ...patched } as PaymentRecord;
      }
      return next;
    });

    // Then sync with server in parallel
    if (supabase) {
      const results = await Promise.all(
        targetRecords.map(async (rec) => {
          const patched: Partial<PaymentRecord> = {
            status: "Paid",
            received: splitAmount,
            profit: splitAmount - rec.duty,
            paymentMethod: paymentMethod,
          };
          const res = await updateDuty(supabase, rec.id, patched);
          return { id: rec.id, res };
        }),
      );
      setUpdatedRecords((prev) => {
        const next = { ...prev };
        for (const { id, res } of results) {
          if (res) next[id] = res;
        }
        return next;
      });
    }

    setShowPaymentModal(false);
    setSelectedIds([]);
    setPaymentIds([]);
  };

  // Trigger Delete Confirmation
  const handleDeleteClick = (id?: string) => {
    const idsToDelete = id ? [id] : selectedIds;
    if (idsToDelete.length === 0) return;
    setDeleteConfirm({ show: true, ids: idsToDelete });
  };

  // Execute Delete
  const executeDelete = async (ids = deleteConfirm.ids) => {
    const idsToDelete = [...ids];
    if (idsToDelete.length === 0) return;

    // Optimistic remove for instant UI feedback
    setDeletedIds((prev) => Array.from(new Set([...prev, ...idsToDelete])));
    setInsertedRecords((prev) =>
      prev.filter((r) => !idsToDelete.includes(r.id)),
    );
    setUpdatedRecords((prev) => {
      const next = { ...prev };
      idsToDelete.forEach((id) => delete next[id]);
      return next;
    });
    setSelectedIds([]);
    setDeleteConfirm({ show: false, ids: [] });

    if (!supabase) return;

    const results = await Promise.all(
      idsToDelete.map(async (id) => {
        const res = await deleteDuty(supabase, id);
        return { id, ok: Boolean(res) };
      }),
    );

    const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
    if (failedIds.length > 0) {
      // Roll back only failed deletions
      setDeletedIds((prev) => prev.filter((id) => !failedIds.includes(id)));
      console.error("Failed to delete some duty rows:", failedIds);
    }
  };

  const handleStatusUpdate = async (
    status: "Completed" | "Pending",
    targetId?: string,
  ) => {
    const idsToUpdate = targetId ? [targetId] : selectedIds;
    if (idsToUpdate.length === 0) return;

    const targetRecords = allHistory.filter((r) => idsToUpdate.includes(r.id));

    // Optimistic update first for instant UI response
    setUpdatedRecords((prev) => {
      const next = { ...prev };
      for (const rec of targetRecords) {
        next[rec.id] = { ...rec, status } as PaymentRecord;
      }
      return next;
    });

    // Sync with server in parallel
    if (supabase) {
      const results = await Promise.all(
        idsToUpdate.map(async (id) => {
          const res = await updateDuty(supabase, id, { status });
          return { id, res };
        }),
      );
      setUpdatedRecords((prev) => {
        const next = { ...prev };
        for (const { id, res } of results) {
          if (res) next[id] = res;
        }
        return next;
      });
    }

  };

  const handleEdit = (id: string) => {
    const rec = allHistory.find((r) => r.id === id);
    if (rec) {
      setEditingId(rec.id);
      setAin(rec.ain);
      setClientName(rec.clientName);
      setPhone(rec.phone || "");
      const [num, yearPart] = rec.beYear.split("(");
      setBeNumber(num.replace("C-", ""));
      setBeYear(yearPart?.replace(")", "") || "");
      setDutyAmount(rec.duty.toString());
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => beInputRef.current?.focus(), 50);
    }
  };

  const getRowBackground = (status: string) => {
    if (status === "New")
      return isDark
        ? "bg-indigo-900/30"
        : "bg-indigo-50/70 border-l-4 border-l-indigo-500";
    if (status === "Completed")
      return isDark
        ? "bg-amber-900/30"
        : "bg-amber-50/70 border-l-4 border-l-amber-500";
    // Paid (Normal)
    return isDark
      ? "hover:bg-slate-700/30"
      : "bg-white hover:bg-slate-50 border-l-4 border-l-transparent";
  };

  const isDark = systemConfig.theme === "dark";
  const totalDueForPayment = allHistory
    .filter((r) => paymentIds.includes(r.id))
    .reduce((a, b) => a + b.duty, 0);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Top Section: Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left: Input Form Card */}
        <div
          className={`lg:col-span-2 rounded-[1.5rem] shadow-sm border p-6 flex flex-col gap-4 relative overflow-hidden transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} ${editingId ? "ring-2 ring-red-500 ring-offset-2" : ""}`}
        >
          <div className="flex items-center justify-between pb-4 border-b dark:border-slate-700">
            <h3
              className={`font-bold text-sm uppercase tracking-widest flex items-center gap-3 ${editingId ? "text-red-600" : isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              <span
                className={`w-8 h-8 rounded-lg text-white flex items-center justify-center shadow-lg ${editingId ? "bg-red-600 shadow-red-500/30" : "bg-blue-600 shadow-blue-500/30"}`}
              >
                <i
                  className={`fas ${editingId ? "fa-pen" : "fa-keyboard"}`}
                ></i>
              </span>
              {editingId ? "Update Existing Entry" : "New Duty Entry"}
            </h3>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setBeNumber("");
                  setDutyAmount("");
                }}
                className="text-[10px] uppercase font-bold text-red-500 hover:underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {/* Client Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Client AIN
              </label>
              <div className="relative">
                <i className="fas fa-id-badge absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input
                  type="text"
                  placeholder="Search AIN..."
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`}
                  value={ain}
                  onChange={(e) => handleAinChange(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                WhatsApp Number
              </label>
              <div className="relative">
                <i className="fab fa-whatsapp absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input
                  type="text"
                  placeholder="Mobile No"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Client Name (Auto)
              </label>
              <input
                type="text"
                readOnly
                className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none ${isDark ? "bg-slate-900/50 border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}
                value={clientName}
                placeholder="Client name will appear here..."
              />
            </div>
          </div>

          {/* Duty Info Grid */}
          <div
            className={`p-5 rounded-xl border-2 border-dashed ${isDark ? "border-slate-700 bg-slate-900/30" : "border-slate-200 bg-slate-50/50"}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Swapped Year and BE Number */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  B/E Year
                </label>
                <input
                  type="text"
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-base text-center outline-none focus:border-blue-500 transition-all ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300 text-slate-800"}`}
                  value={beYear}
                  onChange={(e) => setBeYear(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  B/E Number
                </label>
                <input
                  ref={beInputRef}
                  autoFocus
                  type="text"
                  placeholder="XXXXX"
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-base text-center outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all ${isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300 text-slate-800"}`}
                  value={beNumber}
                  onChange={(e) => setBeNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Duty Amount (BDT)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-base text-center outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all ${isDark ? "bg-slate-800 border-slate-600 text-blue-400" : "bg-white border-slate-300 text-blue-600"}`}
                  value={dutyAmount}
                  onChange={(e) => setDutyAmount(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={handleAddOrUpdate}
              className={`w-full mt-4 text-white font-bold py-3 rounded-xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 ${editingId ? "bg-red-600 hover:bg-red-700 shadow-red-600/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"}`}
            >
              {editingId ? (
                <>
                  <i className="fas fa-save"></i> Update Entry
                </>
              ) : (
                <>
                  <i className="fas fa-plus"></i> Add to Batch
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Live Queue Summary (Sticky) */}
        <div
          className={`lg:col-span-1 rounded-[1.5rem] shadow-sm overflow-hidden flex flex-col h-full min-h-[400px] border ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
        >
          <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
            <div>
              <h4 className="font-bold text-sm uppercase tracking-widest">
                Current Batch
              </h4>
              <p className="text-[10px] opacity-70 font-bold uppercase mt-1">
                {queue.length} Items Pending
              </p>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <i className="fas fa-receipt"></i>
            </div>
          </div>

          <div className="flex-grow p-4 overflow-y-auto max-h-[400px] space-y-3">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 gap-3 min-h-[200px]">
                <i className="fas fa-basket-shopping text-4xl"></i>
                <p className="text-xs font-bold uppercase">Queue Empty</p>
              </div>
            ) : (
              queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl flex justify-between items-center group relative border ${isDark ? "bg-slate-800 border-slate-700 hover:border-slate-600" : "bg-slate-50 border-slate-100 hover:border-slate-200"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400 w-5">
                      #{idx + 1}
                    </span>
                    <div>
                      <p
                        className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-800"}`}
                      >
                        {item.beNumber}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500">
                        Year: {item.year}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">
                      ৳{item.duty.toLocaleString()}
                    </p>
                    <button
                      onClick={() =>
                        setQueue(queue.filter((q) => q.id !== item.id))
                      }
                      className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            className={`p-6 border-t ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-100"}`}
          >
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase">
                Total Payable
              </span>
              <span
                className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}
              >
                ৳{queue.reduce((a, b) => a + b.duty, 0).toLocaleString()}
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
              <i className="fas fa-list text-blue-500"></i> Transaction History
            </h3>
            {selectedIds.length > 0 && (
              <>
                <button
                  onClick={() => initiatePayment(selectedIds)}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-md transition-all animate-in zoom-in"
                >
                  Bulk Settle ({selectedIds.length})
                </button>
                <button
                  onClick={() => handleDeleteClick()}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase shadow-md transition-all animate-in zoom-in flex items-center gap-2"
                >
                  <i className="fas fa-trash-alt"></i> Delete (
                  {selectedIds.length})
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

          <div className="flex gap-3 items-center flex-wrap">
            {/* Search Box */}
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input
                type="text"
                placeholder="Search..."
                className={`pl-9 pr-4 py-2 rounded-lg border text-xs font-bold outline-none w-32 focus:w-48 transition-all ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>

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

            <div
              className={`flex items-center gap-2 px-2 rounded-lg border ${isDark ? "border-slate-600" : "border-slate-200"}`}
            >
              <input
                type="date"
                className={`py-1.5 bg-transparent text-xs font-bold outline-none ${isDark ? "text-white" : "text-slate-700"}`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-slate-400 text-[10px]">TO</span>
              <input
                type="date"
                className={`py-1.5 bg-transparent text-xs font-bold outline-none ${isDark ? "text-white" : "text-slate-700"}`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <button
              onClick={() => {
                setStartDate(new Date().toISOString().split("T")[0]);
                setEndDate(new Date().toISOString().split("T")[0]);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase shadow-sm hover:bg-blue-700"
            >
              Today
            </button>
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setFilterSearch("");
              }}
              className="bg-slate-100 text-slate-900 px-4 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-200"
            >
              Clear
            </button>
            <button
              onClick={() =>
                printElement(
                  document.getElementById("duty-table"),
                  "Transaction History",
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
          <table id="duty-table" className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`${isDark ? "bg-slate-900/50" : "bg-slate-50"} border-b ${isDark ? "border-slate-700" : "border-slate-300"}`}
              >
                <th className="px-6 py-3 w-12 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded cursor-pointer accent-blue-600"
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
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Date
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Client Information
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  B/E Reference
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Amount
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Received
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  Status
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Profit
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  Controls
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-300"}`}
            >
              {filteredHistory.map((rec, index) => (
                <tr
                  key={rec.id}
                  className={`group transition-all ${getRowBackground(rec.status)} ${selectedIds.includes(rec.id) ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                >
                  <td className="px-6 py-3 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded cursor-pointer accent-blue-600"
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
                  <td
                    className={`px-6 py-3 text-sm font-bold ${isDark ? "text-slate-400" : "text-slate-900"}`}
                  >
                    {rec.date}
                  </td>
                  <td className="px-6 py-3">
                    <p
                      className={`text-base font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}
                    >
                      {rec.clientName}
                    </p>
                    <div className="flex gap-2 mt-1.5">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        AIN: {rec.ain}
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
                    className={`px-6 py-3 text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}
                  >
                    {rec.beYear}
                  </td>
                  <td
                    className={`px-6 py-3 text-sm font-bold text-right ${isDark ? "text-slate-200" : "text-slate-700"}`}
                  >
                    ৳{rec.duty.toLocaleString()}
                  </td>
                  <td
                    className={`px-6 py-3 text-sm font-bold text-right ${rec.received > 0 ? "text-green-600" : "text-slate-400"}`}
                  >
                    {rec.received > 0
                      ? `৳${rec.received.toLocaleString()}`
                      : "-"}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        rec.status === "Paid"
                          ? "bg-green-100 text-green-700"
                          : rec.status === "Completed"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm font-bold text-right text-blue-600">
                    {rec.status === "Paid"
                      ? `৳${rec.profit.toLocaleString()}`
                      : "-"}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Workflow Action Buttons */}
                      {rec.status === "New" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusUpdate("Completed", rec.id)
                          }
                          title="Mark as Completed"
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md animate-in zoom-in"
                        >
                          <i className="fas fa-check pointer-events-none"></i>
                        </button>
                      )}

                      {rec.status === "Completed" && (
                        <button
                          type="button"
                          onClick={() => initiatePayment([rec.id])}
                          title="Settle Payment"
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500 text-white hover:bg-amber-600 transition-all shadow-md animate-in zoom-in"
                        >
                          <i className="fas fa-hand-holding-dollar pointer-events-none"></i>
                        </button>
                      )}

                      {/* Standard Actions */}
                      <button
                        type="button"
                        onClick={() => shareWhatsApp([rec])}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                      >
                        <i className="fab fa-whatsapp pointer-events-none"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => printDutyInvoice([rec])}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 hover:bg-slate-600 hover:text-white transition-all shadow-sm"
                      >
                        <i className="fas fa-print pointer-events-none"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(rec.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-800 hover:text-white transition-all shadow-sm"
                      >
                        <i className="fas fa-pen pointer-events-none"></i>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(rec.id);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                      >
                        <i className="fas fa-trash pointer-events-none"></i>
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
                  Settle Payment
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Processing {paymentIds.length} invoice(s)
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
                className={`p-4 rounded-xl border flex justify-between items-center ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-100"}`}
              >
                <span className="text-xs font-bold text-slate-500 uppercase">
                  Total Duty Due
                </span>
                <span
                  className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}
                >
                  ৳{totalDueForPayment.toLocaleString()}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Received Amount
                </label>
                <input
                  type="number"
                  placeholder="Enter Amount"
                  className={`w-full px-5 py-3 rounded-xl border-2 font-bold text-lg outline-none focus:border-green-500 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"}`}
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
                      className={`py-3 px-2 rounded-xl text-xs font-bold uppercase border-2 transition-all ${paymentMethod === m ? "border-green-500 bg-green-50 text-green-700" : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={processPayment}
                className="w-full py-4 mt-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl uppercase tracking-widest text-xs shadow-xl shadow-green-200 transition-all active:scale-95"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (NEW) */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div
            className={`rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center animate-in zoom-in-95 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-red-100">
              <i className="fas fa-trash-alt text-2xl"></i>
            </div>
            <h3
              className={`text-xl font-black leading-tight mb-2 ${isDark ? "text-white" : "text-slate-900"}`}
            >
              Delete Record?
            </h3>
            <p
              className={`font-medium text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              You are about to permanently delete {deleteConfirm.ids.length}{" "}
              selected item(s). This action cannot be reversed.
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <button
                onClick={() => executeDelete()}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-xl shadow-red-100 transition-all active:scale-95 uppercase text-[10px] tracking-widest"
              >
                Yes, Delete Permanently
              </button>
              <button
                onClick={() => setDeleteConfirm({ show: false, ids: [] })}
                className={`w-full py-3.5 font-black rounded-xl transition-all uppercase text-[10px] tracking-widest ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DutyPayment;
