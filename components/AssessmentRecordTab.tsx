import React, { useEffect, useMemo, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { ClearanceRecord, SystemConfig, WasteCompany } from "../types";
import {
  deleteClearanceRecord,
  insertClearanceRecord,
  updateClearanceRecord,
} from "../utils/supabaseApi";

interface AssessmentRecordTabProps {
  history: ClearanceRecord[];
  setHistory: React.Dispatch<React.SetStateAction<ClearanceRecord[]>>;
  onVisibleRowsChange: (rows: ClearanceRecord[]) => void;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
  companies: WasteCompany[];
  dashboardFilter?: "all" | "collected" | "due";
}

const bnNumbers = [
  "", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়", "দশ",
  "এগারো", "বারো", "তেরো", "চোদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ", "বিশ",
  "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "উনত্রিশ", "ত্রিশ",
  "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ", "চল্লিশ",
  "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চৌয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ", "পঞ্চাশ",
  "একান্ন", "বায়ান্ন", "তেপান্ন", "চৌয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট", "ষাট",
  "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর", "সত্তর",
  "একাত্তর", "বাহাত্তর", "তেহাত্তর", "চৌহাত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি", "আশি",
  "একাশি", "বিয়াশি", "তিরাশি", "চৌরাশি", "পঁচাশী", "ছিয়াশি", "সাতাশি", "অষ্টাশি", "ঊননব্বই", "নব্বই",
  "একানব্বই", "বানব্বই", "তিরাব্বই", "চৌরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই"
];

const bnAnsiNumbers = [
  "", "GK", "`yB", "wZb", "Pvi", "cuP", "Qq", "mvZ", "AvU", "bq", "`k",
  "GMv‡iv", "ev‡iv", "†Z‡iv", "†PvÏ", "c‡b‡iv", "†lv‡jv", "m‡Z‡iv", "AvVv‡iv", "Dwbk", "wek",
  "GKzk", "evBk", "†ZBk", "PweŸk", "cuwPk", "QvweŸk", "mvZvk", "AvUvk", "DbwÎk", "wÎk",
  "GKwÎk", "ewÎk", "†ZwÎk", "†PŠwÎk", "cuqwÎk", "QwÎk", "mvuBwÎk", "AvUwÎk", "EbPwjøk", "Pwjøk",
  "GKPwjøk", "weqvwjøk", "†ZZvwjøk", "†PŠqvwjøk", "cuqZvwjøk", "†QPwjøk", "mvZPwjøk", "AvUPwjøk", "EbcÂvk", "cÂvk",
  "GKvbœ", "evqvbœ", "†Zcvbœ", "†PŠqvbœ", "cÂvbœ", "Qvàvbœ", "mvZvbœ", "AvUvbœ", "EblvU", "lvU",
  "GKlwÆ", "evlwÆ", "†ZlwÆ", "†PŠlwÆ", "cuqlwÆ", "†QlwÆ", "mvZlwÆ", "AvUlwÆ", "EbmËi", "mËi",
  "GKvËi", "evnvËi", "†ZnvËi", "†PŠnvËi", "cuPvËi", "wQqvËi", "mvZvËi", "AvUvËi", "EbAvwk", "Avwk",
  "GKvwk", "weqvwk", "wZivwk", "†PŠivwk", "cuPvkx", "wQqvwk", "mvZvwk", "Aóvwk", "EbbeŸB", "beŸB",
  "GKvbeŸB", "evbeŸB", "wZieŸB", "†PŠivbeŸB", "cuPvbeŸB", "wQqvbeŸB", "mvZvbeŸB", "AvUvbeŸB", "wbivbeŸB"
];

function numberToBengaliWords(num: number): string {
  if (num === 0) return "শূন্য";
  if (num < 0) return "ঋণাত্মক " + numberToBengaliWords(Math.abs(num));
  
  let words = "";
  
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  
  const hundred = Math.floor(num / 100);
  num %= 100;
  
  const rest = num;
  
  if (crore > 0) {
    words += numberToBengaliWords(crore) + " কোটি ";
  }
  if (lakh > 0) {
    words += bnNumbers[lakh] + " লক্ষ ";
  }
  if (thousand > 0) {
    words += bnNumbers[thousand] + " হাজার ";
  }
  if (hundred > 0) {
    words += bnNumbers[hundred] + "শত ";
  }
  if (rest > 0) {
    words += bnNumbers[rest];
  }
  
  return words.trim();
}

function numberToBengaliAnsiWords(num: number): string {
  if (num === 0) return "k~b¨";
  if (num < 0) return "FYvZ¥K " + numberToBengaliAnsiWords(Math.abs(num));
  
  let words = "";
  
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  
  const hundred = Math.floor(num / 100);
  num %= 100;
  
  const rest = num;
  
  if (crore > 0) {
    words += numberToBengaliAnsiWords(crore) + " †KvwU ";
  }
  if (lakh > 0) {
    words += bnAnsiNumbers[lakh] + " jÿ ";
  }
  if (thousand > 0) {
    words += bnAnsiNumbers[thousand] + " nvRvi ";
  }
  if (hundred > 0) {
    words += bnAnsiNumbers[hundred] + "kZ ";
  }
  if (rest > 0) {
    words += bnAnsiNumbers[rest];
  }
  
  return words.trim();
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

const AssessmentRecordTab: React.FC<AssessmentRecordTabProps> = ({
  history,
  setHistory,
  onVisibleRowsChange,
  systemConfig,
  supabase,
  companies,
  dashboardFilter = "all",
}) => {
  const isDark = systemConfig.theme === "dark";
  
  // State variables for form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slNo, setSlNo] = useState("");
  const [entryDate, setEntryDate] = useState(getTodayDateInputValue);
  const [clientName, setClientName] = useState("");
  const [assessableValue, setAssessableValue] = useState("");
  const [cd, setCd] = useState("");
  const [rd, setRd] = useState("");
  const [vat, setVat] = useState("");
  const [ait, setAit] = useState("");
  const [atvAt, setAtvAt] = useState("");
  const [dutyTax, setDutyTax] = useState("");
  const [trnxId, setTrnxId] = useState(""); // Storing Challan No.
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Unpaid">("Unpaid");
  const [circle, setCircle] = useState("East");
  const [inWord, setInWord] = useState("");
  const [excelPasteInput, setExcelPasteInput] = useState("");
  const [inWordEncoding, setInWordEncoding] = useState<"Unicode" | "ANSI">("ANSI");

  // Pay Modal States
  const [showPayModal, setShowPayModal] = useState(false);
  const [payRecord, setPayRecord] = useState<ClearanceRecord | null>(null);
  const [payChallanNo, setPayChallanNo] = useState("");
  const [payDate, setPayPayDate] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // PDF Report Modal States
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("Monthly Revenue Report");
  const [pdfSubtitle1, setPdfSubtitle1] = useState("");
  const [pdfSubtitle2, setPdfSubtitle2] = useState("");

  // Filters State
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterMonth, setFilterMonth] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Paid" | "Unpaid">("All");
  const [filterCircle, setFilterCircle] = useState<"All" | "East" | "West">("All");
  const [actionError, setActionError] = useState<string | null>(null);

  // Suggested Serial (slNo) auto-incrementing
  useEffect(() => {
    if (!editingId) {
      const sls = history.map((h) => Number(h.slNo) || 0).filter((n) => n > 0);
      const maxSl = sls.length > 0 ? Math.max(...sls) : 0;
      setSlNo(String(maxSl + 1));
    }
  }, [history, editingId]);

  // Recalculate total dutyTax and inWord when CD, RD, VAT, AIT, ATV/AT change
  useEffect(() => {
    const cdVal = Math.max(0, Number(cd) || 0);
    const rdVal = Math.max(0, Number(rd) || 0);
    const vatVal = Math.max(0, Number(vat) || 0);
    const aitVal = Math.max(0, Number(ait) || 0);
    const atvAtVal = Math.max(0, Number(atvAt) || 0);
    const total = cdVal + rdVal + vatVal + aitVal + atvAtVal;
    
    setDutyTax(String(total));
    if (inWordEncoding === "ANSI") {
      setInWord(numberToBengaliAnsiWords(total) + " UvKv gvÎ");
    } else {
      setInWord(numberToBengaliWords(total) + " টাকা মাত্র");
    }
  }, [cd, rd, vat, ait, atvAt, inWordEncoding]);

  // Auto transition paymentStatus when both Challan No (trnxId) and Payment Date are entered
  useEffect(() => {
    if (trnxId.trim() !== "" && paymentDate.trim() !== "") {
      setPaymentStatus("Paid");
    } else {
      setPaymentStatus("Unpaid");
    }
  }, [trnxId, paymentDate]);

  // Auto-fill circle when clientName matches a company from the companies list
  useEffect(() => {
    if (clientName.trim() !== "") {
      const matchedCompany = companies.find(
        (c) => c.name.trim().toLowerCase() === clientName.trim().toLowerCase()
      );
      if (matchedCompany && matchedCompany.address) {
        setCircle(matchedCompany.address);
      }
    }
  }, [clientName, companies]);

  // Parse Excel raw text input
  const handleExcelPaste = (text: string) => {
    if (!text) return;
    
    let parts = text.trim().split(/\t/);
    if (parts.length < 6) {
      parts = text.trim().split(/\s+/);
    }
    
    const numbers = parts
      .map((p) => p.replace(/[^\d.-]/g, "").trim())
      .filter((p) => p !== "");
      
    if (numbers.length >= 6) {
      const assessable = Math.round(parseFloat(numbers[0]) || 0);
      const cdVal = Math.round(parseFloat(numbers[1]) || 0);
      const rdVal = Math.round(parseFloat(numbers[2]) || 0);
      const vatVal = Math.round(parseFloat(numbers[3]) || 0);
      const aitVal = Math.round(parseFloat(numbers[4]) || 0);
      const atvAtVal = Math.round(parseFloat(numbers[5]) || 0);
      
      setAssessableValue(String(assessable));
      setCd(String(cdVal));
      setRd(String(rdVal));
      setVat(String(vatVal));
      setAit(String(aitVal));
      setAtvAt(String(atvAtVal));
      
      setExcelPasteInput(""); // Reset paste box
    }
  };

  const handleOpenPayModal = (record: ClearanceRecord) => {
    setPayRecord(record);
    setPayChallanNo(record.trnxId || "");
    
    let initialDate = "";
    if (record.paymentDate) {
      const parsedPayDate = parseDate(record.paymentDate);
      if (parsedPayDate.getTime() > 0) {
        const offset = parsedPayDate.getTimezoneOffset();
        const local = new Date(parsedPayDate.getTime() - offset * 60000);
        initialDate = local.toISOString().split("T")[0];
      }
    }
    if (!initialDate) {
      initialDate = getTodayDateInputValue();
    }
    setPayPayDate(initialDate);
    setShowPayModal(true);
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !payRecord) return;
    
    setActionError(null);
    try {
      const isPaid = payChallanNo.trim() !== "" && payDate.trim() !== "";
      const updatedRecord = {
        ...payRecord,
        trnxId: payChallanNo.trim(),
        paymentDate: payDate ? formatDisplayDate(payDate) : "",
        paymentStatus: (isPaid ? "Paid" : "Unpaid") as "Paid" | "Unpaid",
      };
      
      const { id, ...payload } = updatedRecord;
      
      const updated = await updateClearanceRecord(supabase, payRecord.id, payload);
      if (updated) {
        setHistory((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      setShowPayModal(false);
      setPayRecord(null);
    } catch (error: any) {
      setActionError(error?.message || "Failed to update payment details.");
    }
  };

  // Pre-defined Month Filter Lists
  const monthFilterOptions = useMemo(() => {
    const months = new Set<string>();
    history.forEach((h) => {
      const parsed = parseDate(h.date);
      if (parsed.getTime() > 0) {
        const key = parsed.toLocaleString("en-US", { month: "long", year: "numeric" });
        months.add(key);
      }
    });
    return Array.from(months).sort((a, b) => {
      const aDate = new Date(a);
      const bDate = new Date(b);
      return bDate.getTime() - aDate.getTime();
    });
  }, [history]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...history]
      .filter((row) => {
        const rowDate = parseDate(row.date);
        
        // Search Filter
        const matchesSearch =
          !normalizedSearch ||
          String(row.clientName || "").toLowerCase().includes(normalizedSearch) ||
          String(row.trnxId || "").toLowerCase().includes(normalizedSearch) ||
          String(row.circle || "").toLowerCase().includes(normalizedSearch) ||
          String(row.slNo || "").includes(normalizedSearch);

        // Date Picker Range Filter
        let matchesDateRange = true;
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          matchesDateRange = matchesDateRange && rowDate >= start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchesDateRange = matchesDateRange && rowDate <= end;
        }

        // Dropdown Month Filter
        let matchesMonth = true;
        if (filterMonth !== "All" && rowDate.getTime() > 0) {
          const rowMonthKey = rowDate.toLocaleString("en-US", { month: "long", year: "numeric" });
          matchesMonth = rowMonthKey === filterMonth;
        }

        // Status Filter
        let matchesStatus = true;
        if (statusFilter !== "All") {
          matchesStatus = row.paymentStatus === statusFilter;
        }

        // Circle Filter
        let matchesCircle = true;
        if (filterCircle !== "All") {
          matchesCircle = row.circle === filterCircle;
        }

        // Dashboard Filter
        let matchesDashboard = true;
        if (dashboardFilter === "collected") {
          matchesDashboard = row.paymentStatus === "Paid";
        } else if (dashboardFilter === "due") {
          matchesDashboard = row.paymentStatus !== "Paid";
        }

        return matchesSearch && matchesDateRange && matchesMonth && matchesStatus && matchesCircle && matchesDashboard;
      })
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [history, search, startDate, endDate, filterMonth, statusFilter, filterCircle, dashboardFilter]);

  useEffect(() => {
    onVisibleRowsChange(filteredHistory);
  }, [filteredHistory, onVisibleRowsChange]);

  useEffect(() => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setFilterMonth("All");
    setFilterCircle("All");
    if (dashboardFilter === "due") {
      setStatusFilter("Unpaid");
    } else if (dashboardFilter === "collected") {
      setStatusFilter("Paid");
    } else {
      setStatusFilter("All");
    }
  }, [dashboardFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    return filteredHistory.reduce(
      (acc, row) => {
        const duty = Number(row.dutyTax || 0);
        const val = Number(row.assessableValue || 0);
        if (row.paymentStatus === "Paid") {
          acc.collected += duty;
        } else {
          acc.pending += duty;
          acc.unpaidCount += 1;
        }
        acc.totalAssessable += val;
        acc.totalRows += 1;
        return acc;
      },
      { collected: 0, pending: 0, unpaidCount: 0, totalAssessable: 0, totalRows: 0 },
    );
  }, [filteredHistory]);

  const resetForm = () => {
    setEditingId(null);
    setSlNo("");
    setEntryDate(getTodayDateInputValue());
    setClientName("");
    setAssessableValue("");
    setCd("");
    setRd("");
    setVat("");
    setAit("");
    setAtvAt("");
    setDutyTax("");
    setTrnxId("");
    setPaymentDate("");
    setPaymentStatus("Unpaid");
    setCircle("East");
    setInWord("");
    setExcelPasteInput("");
    setInWordEncoding("ANSI");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    if (!clientName.trim()) {
      setActionError("Client Name (প্রতিষ্ঠানের নাম) is required.");
      return;
    }

    const payload = {
      date: formatDisplayDate(entryDate),
      slNo: slNo.trim(),
      clientName: clientName.trim(),
      assessableValue: Number(assessableValue) || 0,
      cd: Number(cd) || 0,
      rd: Number(rd) || 0,
      vat: Number(vat) || 0,
      ait: Number(ait) || 0,
      atvAt: Number(atvAt) || 0,
      dutyTax: Number(dutyTax) || 0,
      trnxId: trnxId.trim(),
      paymentDate: paymentDate ? formatDisplayDate(paymentDate) : "",
      paymentStatus: paymentStatus,
      circle: circle.trim(),
      inWord: inWord.trim(),
      totalClearance: 0, // Fallback/Compat
      notes: trnxId.trim(), // Storing Challan No as notes for fallback compatibility
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
      setActionError(error?.message || "Failed to save assessment record.");
    }
  };

  const handleEdit = (record: ClearanceRecord) => {
    setEditingId(record.id);
    setSlNo(record.slNo || "");
    
    const parsed = parseDate(record.date);
    if (parsed.getTime() > 0) {
      const offset = parsed.getTimezoneOffset();
      const local = new Date(parsed.getTime() - offset * 60000);
      setEntryDate(local.toISOString().split("T")[0]);
    }
    
    setClientName(record.clientName || "");
    setAssessableValue(record.assessableValue ? String(record.assessableValue) : "");
    setCd(record.cd ? String(record.cd) : "");
    setRd(record.rd ? String(record.rd) : "");
    setVat(record.vat ? String(record.vat) : "");
    setAit(record.ait ? String(record.ait) : "");
    setAtvAt(record.atvAt ? String(record.atvAt) : "");
    setDutyTax(record.dutyTax ? String(record.dutyTax) : "");
    setTrnxId(record.trnxId || "");
    
    if (record.paymentDate) {
      const parsedPayDate = parseDate(record.paymentDate);
      if (parsedPayDate.getTime() > 0) {
        const offset = parsedPayDate.getTimezoneOffset();
        const local = new Date(parsedPayDate.getTime() - offset * 60000);
        setPaymentDate(local.toISOString().split("T")[0]);
      } else {
        setPaymentDate("");
      }
    } else {
      setPaymentDate("");
    }
    
    setPaymentStatus(record.paymentStatus || "Unpaid");
    setCircle(record.circle || "East");
    setInWord(record.inWord || "");
    const isAnsi = /[a-zA-Z]/.test(record.inWord || "");
    setInWordEncoding(isAnsi ? "ANSI" : "Unicode");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Delete this assessment record?")) return;
    setActionError(null);
    try {
      await deleteClearanceRecord(supabase, id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) resetForm();
    } catch (error: any) {
      setActionError(error?.message || "Failed to delete assessment record.");
    }
  };

  const handleCopyForWord = (record: ClearanceRecord) => {
    let formattedPayDate = record.paymentDate || "";
    if (formattedPayDate.includes("-")) {
      formattedPayDate = formatDisplayDate(formattedPayDate);
    }
    
    const t = (record.trnxId || "").trim();
    const d = formattedPayDate.trim();
    const w = (record.inWord || "").trim();
    
    // Plain text format (TSV with trailing newline)
    const textToCopy = `${t}\t${d}\t${w}\r\n`;
    
    // HTML format represents a table row. MS Word uses this to overwrite cells natively instead of treating it as plain text.
    const htmlToCopy = `<table><tr><td>${t}</td><td>${d}</td><td>${w}</td></tr></table>`;
    
    try {
      // Create Blobs for text and html types
      const textBlob = new Blob([textToCopy], { type: "text/plain" });
      const htmlBlob = new Blob([htmlToCopy], { type: "text/html" });
      
      const clipboardItem = new ClipboardItem({
        "text/plain": textBlob,
        "text/html": htmlBlob
      });
      
      navigator.clipboard.write([clipboardItem])
        .then(() => {
          setCopiedId(record.id);
          setTimeout(() => setCopiedId(null), 2000);
        })
        .catch((err) => {
          console.error("ClipboardItem write failed, fallback to plain text:", err);
          navigator.clipboard.writeText(textToCopy)
            .then(() => {
              setCopiedId(record.id);
              setTimeout(() => setCopiedId(null), 2000);
            });
        });
    } catch (err) {
      console.error("ClipboardItem API not fully supported, fallback to plain text:", err);
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setCopiedId(record.id);
          setTimeout(() => setCopiedId(null), 2000);
        });
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredHistory.map((row, idx) => ({
      "ক্রম": row.slNo || (idx + 1).toString(),
      "তারিখ": row.date,
      "প্রতিষ্ঠানের নাম": row.clientName || "",
      "শুল্কায়নযোগ্য মূল্য": row.assessableValue || 0,
      "CD": row.cd || 0,
      "RD": row.rd || 0,
      "VAT": row.vat || 0,
      "AIT": row.ait || 0,
      "ATV/AT": row.atvAt || 0,
      "শুল্ক কর": row.dutyTax || 0,
      "Challan No. (চালান নং)": row.trnxId || "",
      "Payment Date (তারিখ)": row.paymentDate || "",
      "Payment Status (অবস্থা)": row.paymentStatus || "Unpaid",
      "Circle (সার্কেল)": row.circle || "",
      "In Word (কথায়)": row.inWord || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assesment List");
    XLSX.writeFile(
      workbook,
      `Assessment_Records_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const handleOpenPdfModal = () => {
    setPdfTitle("Monthly Revenue Report");
    setPdfSubtitle1("Customs Bond Commissionerate Dhaka (South), DEPZ, Savar, Dhaka.");

    // Determine circle dynamically from filters or filtered history
    const activeCircle = (() => {
      if (filterCircle !== "All") return filterCircle;
      if (filteredHistory.length > 0) {
        const firstCircle = filteredHistory[0].circle;
        const allSame = filteredHistory.every((r) => r.circle === firstCircle);
        if (allSame && firstCircle) return firstCircle;
      }
      return "";
    })();

    const currentMonthStr =
      filterMonth === "All"
        ? new Date().toLocaleString("en-US", { month: "long", year: "numeric" })
        : filterMonth;

    const circleSuffix = activeCircle ? ` (${activeCircle})` : "";
    setPdfSubtitle2(`Month Name : ${currentMonthStr}${circleSuffix}`);
    setShowPdfModal(true);
  };

  const handlePrintPdf = () => {
    setShowPdfModal(false);

    // Sort in ascending order chronologically
    const sortedRecordsForPrint = [...filteredHistory].sort((a, b) => {
      return parseDate(a.date).getTime() - parseDate(b.date).getTime();
    });

    const formatBDNumber = (num: number): string => {
      if (num === 0) return "-";
      return num.toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    const formatReportDate = (dateStr: string): string => {
      if (!dateStr) return "-";
      let parts = dateStr.split("/");
      if (parts.length !== 3) {
        parts = dateStr.split("-");
        if (parts.length === 3) {
          parts = [parts[2], parts[1], parts[0]];
        } else {
          return dateStr;
        }
      }
      const day = parseInt(parts[0], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[2];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day}-${months[monthIdx]}-${year}`;
      }
      return dateStr;
    };

    let totalAssessable = 0;
    let totalCd = 0;
    let totalRd = 0;
    let totalVat = 0;
    let totalAt = 0;
    let totalIt = 0;
    let totalDutyTax = 0;

    const rowsHtml = sortedRecordsForPrint.map((record, index) => {
      const cdVal = Number(record.cd || 0);
      const rdVal = Number(record.rd || 0);
      const vatVal = Number(record.vat || 0);
      const atVal = Number(record.atvAt || 0);
      const itVal = Number(record.ait || 0);
      const assessableVal = Number(record.assessableValue || 0);
      const totalVal = Number(record.dutyTax || 0);

      totalAssessable += assessableVal;
      totalCd += cdVal;
      totalRd += rdVal;
      totalVat += vatVal;
      totalAt += atVal;
      totalIt += itVal;
      totalDutyTax += totalVal;

      return `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td class="text-center nowrap">${formatReportDate(record.date)}</td>
          <td class="text-left font-bold uppercase">${record.clientName || "-"}</td>
          <td class="text-right nowrap">${formatBDNumber(assessableVal)}</td>
          <td class="text-right nowrap">${formatBDNumber(totalVal)}</td>
          <td class="text-right nowrap">${formatBDNumber(cdVal)}</td>
          <td class="text-right nowrap">${formatBDNumber(rdVal)}</td>
          <td class="text-right nowrap">${formatBDNumber(vatVal)}</td>
          <td class="text-right nowrap">${formatBDNumber(atVal)}</td>
          <td class="text-right nowrap">${formatBDNumber(itVal)}</td>
          <td class="text-center">-</td>
          <td class="text-right nowrap font-bold">${formatBDNumber(totalVal)}</td>
        </tr>
      `;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Popup blocked! Please allow popups for this site to print.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${pdfTitle}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 8mm 12mm 12mm 12mm;
          }
          body {
            font-family: 'Arial', 'Helvetica', 'Kalpurush', 'SolaimanLipi', sans-serif;
            margin: 0;
            padding: 0;
            color: #000;
            background: #fff;
            font-size: 10px;
          }
          .header-container {
            text-align: center;
            margin-bottom: 12px;
          }
          .report-title {
            font-size: 15px;
            font-weight: bold;
            margin: 0 0 2px 0;
            text-transform: uppercase;
          }
          .report-subtitle1 {
            font-size: 12px;
            font-weight: bold;
            margin: 0 0 2px 0;
          }
          .report-subtitle2 {
            font-size: 11px;
            font-weight: bold;
            margin: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 5px;
          }
          th, td {
            border: 1px solid #000;
            padding: 4px 5px;
            vertical-align: middle;
            font-size: 9.5px;
          }
          th {
            font-weight: bold;
            text-align: center;
            background-color: #f5f5f5;
          }
          .text-center {
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .text-left {
            text-align: left;
          }
          .nowrap {
            white-space: nowrap;
          }
          .font-mono {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9px;
          }
          .font-bold {
            font-weight: bold;
          }
          .uppercase {
            text-transform: uppercase;
          }
          .total-row {
            font-weight: bold;
          }
          .total-row td {
            border-top: 1px solid #000;
            border-bottom: 3px double #000;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="report-title">${pdfTitle}</div>
          <div class="report-subtitle1">${pdfSubtitle1}</div>
          <div class="report-subtitle2">${pdfSubtitle2}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 4%;">ক্রমিক</th>
              <th style="width: 9%;">তারিখ</th>
              <th style="width: 25%;">প্রতিষ্ঠানের নাম</th>
              <th style="width: 10%;">শুল্কযোগ্য মূল্য</th>
              <th style="width: 10%;">শুল্কায়িত মূল্য</th>
              <th style="width: 8%;">CD</th>
              <th style="width: 7%;">RD</th>
              <th style="width: 8%;">VAT</th>
              <th style="width: 7%;">AT</th>
              <th style="width: 7%;">IT</th>
              <th style="width: 5%;">Fine</th>
              <th style="width: 10%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="3" class="text-right">Total =</td>
              <td class="text-right nowrap">${formatBDNumber(totalAssessable)}</td>
              <td class="text-right nowrap">${formatBDNumber(totalDutyTax)}</td>
              <td class="text-right nowrap">${formatBDNumber(totalCd)}</td>
              <td class="text-right nowrap">${formatBDNumber(totalRd)}</td>
              <td class="text-right nowrap">${formatBDNumber(totalVat)}</td>
              <td class="text-right nowrap">${formatBDNumber(totalAt)}</td>
              <td class="text-right nowrap">${formatBDNumber(totalIt)}</td>
              <td class="text-center">-</td>
              <td class="text-right nowrap">${formatBDNumber(totalDutyTax)}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Trigger printing
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {actionError}
        </div>
      )}

      {/* Input / Editing Form */}
      <form
        onSubmit={handleSubmit}
        className={`rounded-[2rem] border shadow-xl p-8 transition-all ${
          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-6 border-b pb-4 border-slate-200 dark:border-slate-700">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              {editingId ? "Edit Assesment Record" : "Add Assesment Record (অ্যাসেসমেন্ট এন্ট্রি)"}
            </h3>
            <p className="text-xs font-medium text-slate-400 mt-1">
              Fill out custom duties, assessable values, and challan payments.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Quick Paste Area */}
        <div className="mb-6 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
          <label className="block text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1.5">
            Quick Paste Excel Row (এক্সেল থেকে দ্রুত পেস্ট করুন)
          </label>
          <input
            type="text"
            value={excelPasteInput}
            onChange={(e) => {
              setExcelPasteInput(e.target.value);
              handleExcelPaste(e.target.value);
            }}
            placeholder="Excel থেকে কপি করা লাইন এখানে পেস্ট করুন (যেমন: শুল্কায়নযোগ্য মূল্য	CD	RD	VAT	AIT	ATV/AT)"
            className={`w-full px-4 py-3 rounded-xl border text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
              isDark ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400"
            }`}
          />
          <p className="text-[10px] text-slate-400 font-bold mt-1.5">
            * পেস্ট করলে ৬টি সংখ্যা সনাক্ত করে যথাক্রমে শুল্কায়নযোগ্য মূল্য, CD, RD, VAT, AIT এবং ATV/AT ফিল্ডগুলো পূরণ করবে।
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              তারিখ (Date)
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* Client Name (Searchable via Datalist) */}
          <div className="space-y-1.5 md:col-span-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              প্রতিষ্ঠানের নাম (Client Name)
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="প্রতিষ্ঠানের নাম খুঁজুন বা লিখুন..."
              list="client-options-list"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
            <datalist id="client-options-list">
              {companies.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>

          {/* Assessable Value */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              শুল্কায়নযোগ্য মূল্য (Assessable Value)
            </label>
            <input
              type="number"
              min="0"
              value={assessableValue}
              onChange={(e) => setAssessableValue(e.target.value)}
              placeholder="মূল্য"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* CD */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">CD</label>
            <input
              type="number"
              min="0"
              value={cd}
              onChange={(e) => setCd(e.target.value)}
              placeholder="CD"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* RD */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">RD</label>
            <input
              type="number"
              min="0"
              value={rd}
              onChange={(e) => setRd(e.target.value)}
              placeholder="RD"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* VAT */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">VAT</label>
            <input
              type="number"
              min="0"
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              placeholder="VAT"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* AIT */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">AIT</label>
            <input
              type="number"
              min="0"
              value={ait}
              onChange={(e) => setAit(e.target.value)}
              placeholder="AIT"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* ATV/AT */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">ATV/AT</label>
            <input
              type="number"
              min="0"
              value={atvAt}
              onChange={(e) => setAtvAt(e.target.value)}
              placeholder="ATV/AT"
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* Duty Tax (Auto Calculated) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-blue-500 dark:text-blue-400">
              শুল্ক কর (Duty Tax - Auto)
            </label>
            <input
              type="text"
              readOnly
              value={Number(dutyTax || 0).toLocaleString("en-BD")}
              className={`w-full px-4 py-2.5 rounded-xl border font-extrabold text-sm outline-none ${
                isDark ? "bg-slate-900/60 border-slate-700 text-blue-400" : "bg-slate-100 border-slate-200 text-blue-600"
              }`}
            />
          </div>

          {/* Circle */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              সার্কেল (Circle)
            </label>
            <select
              value={circle}
              onChange={(e) => setCircle(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <option value="East">East</option>
              <option value="West">West</option>
            </select>
          </div>



          {/* In Word (Auto generated but editable) */}
          <div className="space-y-1.5 md:col-span-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              কথায় (In Word - Auto/Editable)
            </label>
            <input
              type="text"
              value={inWord}
              onChange={(e) => setInWord(e.target.value)}
              placeholder="টাকা কথায়..."
              style={inWordEncoding === "ANSI" ? { fontFamily: "SutonnyMJ, 'Sutonny MJ'" } : {}}
              className={`w-full px-4 py-2.5 rounded-xl border font-bold outline-none focus:border-blue-500 transition-all ${
                inWordEncoding === "ANSI" ? "text-lg" : "text-sm"
              } ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {/* In Word Encoding Selector */}
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              কোড (Encoding)
            </label>
            <select
              value={inWordEncoding}
              onChange={(e) => setInWordEncoding(e.target.value as "Unicode" | "ANSI")}
              className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <option value="Unicode">Unicode (ইউনিকোড)</option>
              <option value="ANSI">ANSI (SutonnyMJ)</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700 transition-all transform hover:scale-102"
          >
            {editingId ? "Update Record" : "Save Record (এন্ট্রি সংরক্ষণ)"}
          </button>
        </div>
      </form>

      {/* Filters & History List */}
      <div
        className={`rounded-[2rem] border shadow-xl p-8 ${
          isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
        }`}
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 border-b pb-4 border-slate-200 dark:border-slate-700">
          <div>
            <h4 className={`text-base font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              Assesment List (অ্যাসেসমেন্ট তালিকা)
            </h4>
            <p className="text-[11px] font-medium text-slate-400 mt-0.5">
              Filtered records: {filteredHistory.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white shadow-md hover:bg-emerald-700 transition-all"
            >
              <i className="fas fa-file-excel"></i>
              Export to Excel
            </button>
            <button
              type="button"
              onClick={handleOpenPdfModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-all"
            >
              <i className="fas fa-file-pdf"></i>
              Monthly PDF
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          <div className="md:col-span-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ক্রম, প্রতিষ্ঠানের নাম, চালান নম্বর খুঁজুন..."
              className={`w-full rounded-xl border px-4 py-2.5 font-bold text-xs outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            />
          </div>
          <div>
            <select
              value={filterCircle}
              onChange={(e) => setFilterCircle(e.target.value as "All" | "East" | "West")}
              className={`w-full rounded-xl border px-4 py-2.5 font-bold text-xs outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            >
              <option value="All">All Circles (সব সার্কেল)</option>
              <option value="East">East (ইস্ট)</option>
              <option value="West">West (ওয়েস্ট)</option>
            </select>
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "All" | "Paid" | "Unpaid")}
              className={`w-full rounded-xl border px-4 py-2.5 font-bold text-xs outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            >
              <option value="All">All Status (সব অবস্থা)</option>
              <option value="Paid">Paid (পরিশোধিত)</option>
              <option value="Unpaid">Unpaid (অ-পরিশোধিত)</option>
            </select>
          </div>
          <div>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className={`w-full rounded-xl border px-4 py-2.5 font-bold text-xs outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            >
              <option value="All">All Months (সব মাস)</option>
              {monthFilterOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full rounded-xl border px-2 py-2.5 font-bold text-[10px] outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`w-full rounded-xl border px-2 py-2.5 font-bold text-[10px] outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              }`}
            />
          </div>
        </div>

        {/* Dashboard Top Total Stats matching the screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div
            className={`rounded-2xl border p-4 flex flex-col justify-between ${
              isDark ? "bg-slate-900 border-slate-700" : "bg-emerald-50 border-emerald-100 text-emerald-800"
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Revenue Collected (আদায়কৃত শুল্ক)
            </p>
            <p className="mt-2 text-xl font-black text-emerald-600">
              ৳ {summary.collected.toLocaleString("en-BD")}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 flex flex-col justify-between ${
              isDark ? "bg-slate-900 border-slate-700" : "bg-rose-50 border-rose-100 text-rose-800"
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Pending Revenue (বকেয়া শুল্ক)
            </p>
            <p className="mt-2 text-xl font-black text-rose-600">
              ৳ {summary.pending.toLocaleString("en-BD")}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 flex flex-col justify-between bg-red-600 text-white border-red-700`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-red-200">
              Unpaid Records (বকেয়া এন্ট্রি)
            </p>
            <p className="mt-2 text-3xl font-black">
              Unpaid : {summary.unpaidCount.toString().padStart(2, "0")}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 flex flex-col justify-between ${
              isDark ? "bg-slate-900 border-slate-700" : "bg-blue-50 border-blue-100 text-blue-800"
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Total Assessable (মোট শুল্কায়নযোগ্য)
            </p>
            <p className="mt-2 text-xl font-black text-blue-600">
              ৳ {summary.totalAssessable.toLocaleString("en-BD")}
            </p>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[1300px] text-left text-xs">
            <thead
              className={`font-black uppercase tracking-widest ${
                isDark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-500"
              }`}
            >
              <tr>
                <th className="px-4 py-3 text-center w-12">ক্রম</th>
                <th className="px-4 py-3 w-28">তাং</th>
                <th className="px-4 py-3 min-w-[200px]">প্রতিষ্ঠানের নাম</th>
                <th className="px-4 py-3 text-right">শুল্কায়নযোগ্য মূল্য</th>
                <th className="px-3 py-3 text-right">CD</th>
                <th className="px-3 py-3 text-right">RD</th>
                <th className="px-3 py-3 text-right">VAT</th>
                <th className="px-3 py-3 text-right">AIT</th>
                <th className="px-3 py-3 text-right">ATV/AT</th>
                <th className="px-4 py-3 text-right">শুল্ক কর</th>
                <th className="px-4 py-3 min-w-[160px]">চালান নং</th>
                <th className="px-4 py-3">Payment_Date</th>
                <th className="px-4 py-3 min-w-[250px]">In_Word</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Circle</th>
                <th className="px-4 py-3 text-center w-24 sticky right-0 bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">Action</th>
              </tr>
            </thead>
            <tbody
              className={`${
                isDark ? "divide-slate-700" : "divide-slate-200"
              } divide-y`}
            >
              {filteredHistory.map((record) => (
                <tr
                  key={record.id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button") || target.closest("a") || target.closest("input")) {
                      return;
                    }
                    handleEdit(record);
                  }}
                  className={`group hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer transition-colors font-medium ${
                    record.paymentStatus === "Paid" ? "" : "bg-rose-50/20 dark:bg-rose-950/5"
                  }`}
                >
                  <td className="px-4 py-3 text-center font-bold text-slate-500 dark:text-slate-400">
                    {record.slNo || "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{record.date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {record.clientName || "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {record.assessableValue ? record.assessableValue.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">
                    {record.cd ? record.cd.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">
                    {record.rd ? record.rd.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">
                    {record.vat ? record.vat.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">
                    {record.ait ? record.ait.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-500 dark:text-slate-400">
                    {record.atvAt ? record.atvAt.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-extrabold text-sm">
                    {record.dutyTax ? record.dutyTax.toLocaleString("en-BD") : "-"}
                  </td>
                  <td className="px-4 py-3 break-all font-mono text-[10px] text-slate-600 dark:text-slate-300">
                    {record.trnxId || "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {record.paymentDate || "-"}
                  </td>
                  <td
                    className="px-4 py-3 text-slate-600 dark:text-slate-300 italic text-sm"
                    style={/[a-zA-Z]/.test(record.inWord || "") ? { fontFamily: "SutonnyMJ, 'Sutonny MJ'" } : {}}
                  >
                    {record.inWord || "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        record.paymentStatus === "Paid"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400"
                      }`}
                    >
                      {record.paymentStatus || "Unpaid"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-500 dark:text-slate-400">
                    {record.circle || "-"}
                  </td>
                  <td className={`px-4 py-3 text-center sticky right-0 border-l border-slate-200 dark:border-slate-700 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] ${
                    record.paymentStatus === "Paid"
                      ? "bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-900/40"
                      : "bg-rose-50/40 dark:bg-rose-950/20 group-hover:bg-slate-50 dark:group-hover:bg-slate-900/40"
                  }`}>
                    <div className="flex justify-center items-center gap-1.5">
                      {record.paymentStatus !== "Paid" ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(record)}
                          className="rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 shadow-md transition-all active:scale-95"
                        >
                          Pay
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(record)}
                          className="rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all"
                          title={`Challan: ${record.trnxId || "-"} | Date: ${record.paymentDate || "-"}`}
                        >
                          Details
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyForWord(record)}
                        className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          copiedId === record.id
                            ? "bg-emerald-600 text-white animate-pulse"
                            : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100"
                        }`}
                        title="Copy চালান নং, Payment Date, In Word for Word Table"
                      >
                        {copiedId === record.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(record)}
                        className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 hover:bg-amber-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        className="rounded-lg bg-rose-50 dark:bg-rose-950/30 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 hover:bg-rose-100"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-12 text-center text-sm font-bold text-slate-400">
                    No assessment records found. (কোন অ্যাসেসমেন্ট ডাটা পাওয়া যায়নি)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settle Payment Modal */}
      {showPayModal && payRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            className={`w-full max-w-md rounded-[2rem] shadow-2xl p-8 animate-in zoom-in-95 transition-all border ${
              isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  Settle Challan Payment (চালান পরিশোধ)
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-1">
                  Importer: {payRecord.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPayModal(false);
                  setPayRecord(null);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500"
                }`}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleConfirmPay} className="space-y-5">
              <div
                className={`p-4 rounded-xl border flex justify-between items-center ${
                  isDark ? "bg-slate-900 border-slate-700" : "bg-blue-50 border-blue-100"
                }`}
              >
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Total Duty (শুল্ক কর)
                </span>
                <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                  ৳ {(payRecord.dutyTax || 0).toLocaleString("en-BD")}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  চালান নং (Challan No. / multiple)
                </label>
                <input
                  type="text"
                  required
                  value={payChallanNo}
                  onChange={(e) => setPayChallanNo(e.target.value)}
                  placeholder="e.g. 2627-00050184431, 2627-00050211371"
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Payment Date (পরিশোধের তারিখ)
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayPayDate(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPayModal(false);
                    setPayRecord(null);
                  }}
                  className={`flex-grow py-3 rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${
                    isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="flex-grow py-3 rounded-xl font-black text-white uppercase text-[11px] tracking-widest bg-emerald-600 hover:bg-emerald-700 shadow-lg transition-all active:scale-95"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Configuration Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            className={`w-full max-w-md rounded-[2rem] shadow-2xl p-8 animate-in zoom-in-95 transition-all border ${
              isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  Generate Monthly Report PDF
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-1">
                  Configure the headers for the printable report
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500"
                }`}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Report Title (রিপোর্ট শিরোনাম)
                </label>
                <input
                  type="text"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Subtitle 1 (উপশিরোনাম ১ - Agency/Branch)
                </label>
                <input
                  type="text"
                  value={pdfSubtitle1}
                  onChange={(e) => setPdfSubtitle1(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Subtitle 2 (উপশিরোনাম ২ - Month & Circle)
                </label>
                <input
                  type="text"
                  value={pdfSubtitle2}
                  onChange={(e) => setPdfSubtitle2(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border font-bold text-sm outline-none focus:border-blue-500 transition-all ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className={`flex-grow py-3 rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${
                    isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="flex-grow py-3 rounded-xl font-black text-white uppercase text-[11px] tracking-widest bg-blue-600 hover:bg-blue-700 shadow-lg transition-all active:scale-95"
                >
                  Generate & Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentRecordTab;
