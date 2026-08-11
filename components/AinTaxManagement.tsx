import React, { useRef, useState, useMemo, useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { SystemConfig, AinTaxRecord } from "../types";
import {
  insertAinTaxRecord,
  updateAinTaxRecord,
  deleteAinTaxRecord,
  bulkInsertAinTaxRecords,
} from "../utils/supabaseApi";
import { printElement } from "../utils/printTable";
import { useResizableColumns } from "../utils/useResizableColumns";
import ColumnVisibilityToggle from "./ColumnVisibilityToggle";

interface AinTaxManagementProps {
  history: AinTaxRecord[];
  setHistory: React.Dispatch<React.SetStateAction<AinTaxRecord[]>>;
  onVisibleRowsChange?: (rows: AinTaxRecord[]) => void;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
}

const LOCAL_STORAGE_KEY = "ain_tax_records_local";

export const AinTaxManagement: React.FC<AinTaxManagementProps> = ({
  history,
  setHistory,
  onVisibleRowsChange,
  systemConfig,
  supabase,
}) => {
  const isDark = systemConfig.theme === "dark";
  const isBn = systemConfig.language === "bn";

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "Unpaid" | "Paid">("all");

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AinTaxRecord | null>(null);

  // Form Fields
  const [formYear, setFormYear] = useState(new Date().getFullYear().toString());
  const [formAinName, setFormAinName] = useState("");
  const [formAinNo, setFormAinNo] = useState("");
  const [formRef, setFormRef] = useState("");
  const [formRegNo, setFormRegNo] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formType, setFormType] = useState("");
  const [formTotalTax, setFormTotalTax] = useState("");
  const [formANo, setFormANo] = useState("");
  const [formPaymentStatus, setFormPaymentStatus] = useState<"Paid" | "Unpaid">("Unpaid");
  const [formPaymentDate, setFormPaymentDate] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("");

  // Paste / Import Modal State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedRawText, setPastedRawText] = useState("");
  const [parsedPreviewRows, setParsedPreviewRows] = useState<Omit<AinTaxRecord, "id">[]>([]);
  const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<number[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Column Mapping State
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [rawMatrixRows, setRawMatrixRows] = useState<string[][]>([]);
  const [colMapYear, setColMapYear] = useState<number>(0);
  const [colMapAinName, setColMapAinName] = useState<number>(1);
  const [colMapAinNo, setColMapAinNo] = useState<number>(2);
  const [colMapRef, setColMapRef] = useState<number>(3);
  const [colMapRegNo, setColMapRegNo] = useState<number>(4);
  const [colMapDate, setColMapDate] = useState<number>(5);
  const [colMapType, setColMapType] = useState<number>(6);
  const [colMapTotalTax, setColMapTotalTax] = useState<number>(7);
  const [colMapANo, setColMapANo] = useState<number>(8);

  // Status & Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  const tableRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load from local storage if needed on mount
  useEffect(() => {
    if (history.length === 0) {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHistory(parsed);
          }
        }
      } catch (err) {
        console.error("Error reading local AIN tax records", err);
      }
    }
  }, []);

  // Sync state to local storage fallback
  const syncToLocalStorage = (records: AinTaxRecord[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.error("Failed to sync AIN Tax records to local storage", err);
    }
  };

  // Helper for notification messages
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };
  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // Apply Column Mapping to raw matrix rows
  const applyColumnMapping = (
    matrix: string[][],
    mapping: {
      year: number;
      ainName: number;
      ainNo: number;
      ref: number;
      regNo: number;
      date: number;
      type: number;
      totalTax: number;
      aNo: number;
    }
  ) => {
    const rows: Omit<AinTaxRecord, "id">[] = [];

    matrix.forEach((cells, index) => {
      // Header row check
      const col0Lower = (cells[0] || "").toLowerCase();
      const col1Lower = (cells[1] || "").toLowerCase();
      if (
        index === 0 &&
        (col0Lower.includes("year") ||
          col1Lower.includes("ain") ||
          col1Lower.includes("name") ||
          col0Lower.includes("বছর") ||
          col0Lower.includes("sl"))
      ) {
        return; // Skip header
      }

      // 1. Year: User mapped column or fallback
      let year = mapping.year >= 0 && cells[mapping.year] !== undefined ? cells[mapping.year].trim() : "";
      if (!year || !/^(19|20)\d{2}$/.test(year)) {
        const foundYr = cells.find((c) => /^(19|20)\d{2}$/.test((c || "").trim()));
        if (foundYr) year = foundYr.trim();
      }

      // 2. AIN Name: User mapped column or fallback
      let ainName = mapping.ainName >= 0 && cells[mapping.ainName] !== undefined ? cells[mapping.ainName].trim() : "";
      if (!ainName) {
        const foundName = cells.find(
          (c, idx) =>
            idx !== 0 &&
            idx !== mapping.ainNo &&
            /[a-zA-Z]{3,}/.test(c) &&
            !/^\d{4}-\d{2}-\d{2}$/.test(c) &&
            !c.trim().startsWith("#")
        );
        if (foundName) ainName = foundName.trim();
      }

      // 3. AIN No: User mapped column or fallback
      let ainNo = mapping.ainNo >= 0 && cells[mapping.ainNo] !== undefined ? cells[mapping.ainNo].trim() : "";
      if (!ainNo) {
        const foundAinNo = cells.find((c) => /^\d{8,11}$/.test((c || "").trim()));
        if (foundAinNo) ainNo = foundAinNo.trim();
      }

      // 4. Ref: User mapped column or fallback
      let ref = mapping.ref >= 0 && cells[mapping.ref] !== undefined ? cells[mapping.ref].trim() : "";
      if (!ref) {
        const foundRef = cells.find((c) => (c || "").trim().startsWith("#"));
        if (foundRef) ref = foundRef.trim();
      }

      // 5. Reg No: User mapped column or fallback
      let regNo = mapping.regNo >= 0 && cells[mapping.regNo] !== undefined ? cells[mapping.regNo].trim() : "";
      if (!regNo) {
        const foundReg = cells.find(
          (c) =>
            /^\d{4,6}$/.test((c || "").trim()) &&
            (c || "").trim() !== year &&
            (c || "").trim() !== ainNo
        );
        if (foundReg) regNo = foundReg.trim();
      }

      // 6. Date: User mapped column or fallback
      const DATE_REGEX = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})$/;
      let rawDate = mapping.date >= 0 && cells[mapping.date] !== undefined ? cells[mapping.date].trim() : "";
      if (!rawDate || !DATE_REGEX.test(rawDate)) {
        const foundDateCell = cells.find((c) => DATE_REGEX.test((c || "").trim()));
        if (foundDateCell) rawDate = foundDateCell.trim();
      }

      let date = "";
      if (rawDate) {
        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(rawDate)) {
          const parts = rawDate.split(/[-/]/);
          date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(rawDate)) {
          const parts = rawDate.split(/[-/]/);
          date = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        } else {
          date = rawDate;
        }
      }

      // 7. Type: User mapped column or fallback (ONLY EX or IM allowed)
      const VALID_TYPES = ["EX", "IM"];
      let rawType = mapping.type >= 0 && cells[mapping.type] !== undefined ? cells[mapping.type].trim().toUpperCase() : "";
      if (rawType === "EXP") rawType = "EX";
      if (rawType === "IMP") rawType = "IM";

      if (!VALID_TYPES.includes(rawType)) {
        const foundCell = cells.find((c) => {
          const val = (c || "").trim().toUpperCase();
          return val === "EX" || val === "IM" || val === "EXP" || val === "IMP";
        });
        if (foundCell) {
          const matched = foundCell.trim().toUpperCase();
          rawType = matched === "EXP" ? "EX" : matched === "IMP" ? "IM" : matched;
        } else {
          rawType = "";
        }
      }
      const type = rawType;

      // 8. Total Tax: STRICTLY MAPPED COLUMN VALUE ONLY (No Col 28 or secondary column override)
      const parseTaxAmount = (val: string): number => {
        if (!val) return 0;
        let clean = val.trim();
        if (/^0([.,]0+)?\s*(-|\/=)?$/i.test(clean)) return 0;
        if (clean.includes(",") && clean.includes(".")) {
          clean = clean.replace(/,/g, "");
        } else if (clean.includes(",") && !clean.includes(".")) {
          clean = clean.replace(/,/g, "");
        }
        const rawNum = clean.replace(/[^0-9.-]/g, "");
        const num = Number(rawNum);
        return isNaN(num) ? 0 : num;
      };

      let totalTax = 0;
      if (mapping.totalTax >= 0 && cells[mapping.totalTax] !== undefined) {
        totalTax = parseTaxAmount(cells[mapping.totalTax]);
      }

      // 9. Sanitize A No (Assessment No): 4-8 digit numeric assessment number like 12345 or 13479 (MUST NOT be 000437789-0403 ref format)
      let rawANo = mapping.aNo >= 0 ? (cells[mapping.aNo] || "").trim() : "";
      const taxNumStr = totalTax > 0 ? totalTax.toString() : "";
      const rawANoNum = rawANo.replace(/[^0-9.-]/g, "");

      if (
        !rawANo ||
        rawANo.includes("-") || // Reject 000437789-0403 format with hyphen
        rawANo === "Green" ||
        rawANo === "Red" ||
        rawANo === "Yellow" ||
        rawANo === "EX" ||
        rawANo === "C" ||
        rawANo === regNo ||
        rawANo === ainNo ||
        (taxNumStr && rawANoNum === taxNumStr)
      ) {
        const foundANo = cells.find((c, idx) => {
          const val = (c || "").trim();
          const cleanVal = val.replace(/[^0-9.-]/g, "");
          return (
            val !== "Green" &&
            val !== "Red" &&
            val !== "Yellow" &&
            val !== "EX" &&
            val !== "C" &&
            val !== year &&
            val !== ainNo &&
            val !== regNo &&
            !val.includes("-") && // EXCLUDE hyphenated formats like 000437789-0403
            (!taxNumStr || cleanVal !== taxNumStr) &&
            /^\d{4,8}$/.test(val) &&
            idx > 5
          );
        });
        rawANo = foundANo ? foundANo.trim() : "";
      }
      const aNo = rawANo;

      if (year || ainName || ainNo || totalTax > 0 || ref || regNo) {
        rows.push({
          year,
          ainName,
          ainNo,
          ref,
          regNo,
          date,
          type,
          totalTax,
          aNo,
          paymentStatus: "Unpaid",
        });
      }
    });

    return rows;
  };

  const handlePastedTextChange = (text: string) => {
    setPastedRawText(text);
    setPasteError(null);
    if (!text.trim()) {
      setParsedPreviewRows([]);
      setSelectedPreviewIndices([]);
      setRawMatrixRows([]);
      setImportHeaders([]);
      return;
    }

    try {
      // Step 1: Pre-process quotes (join newlines enclosed in quotes)
      let cleanText = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
          cleanText += char;
        } else if ((char === "\n" || char === "\r") && inQuotes) {
          cleanText += " ";
        } else {
          cleanText += char;
        }
      }

      // Step 2: Split into raw lines
      const rawLines = cleanText
        .split(/\r?\n/)
        .map((l) => l.replace(/\u00a0/g, " ").trim())
        .filter(Boolean);

      const lineBlocks: string[] = [];
      let currentBlock: string[] = [];

      // Valid year starts with 19xx or 20xx (e.g. 2023, 2024), NOT address numbers like 1172
      const isRecordStart = (line: string) => {
        if (/^(19|20)\d{2}(\t|\s{2,}|,)/.test(line)) return true;
        if (/^(year|বছর|sl|#|ain\s*no)/i.test(line)) return true;
        return false;
      };

      rawLines.forEach((line) => {
        if (isRecordStart(line)) {
          if (currentBlock.length > 0) {
            lineBlocks.push(currentBlock.join("\t"));
          }
          currentBlock = [line];
        } else {
          if (currentBlock.length > 0) {
            currentBlock.push(line);
          } else {
            currentBlock = [line];
          }
        }
      });
      if (currentBlock.length > 0) {
        lineBlocks.push(currentBlock.join("\t"));
      }

      const matrix: string[][] = [];
      lineBlocks.forEach((block) => {
        let cells: string[];
        if (block.includes("\t")) {
          cells = block.split("\t").map((c) => c.trim());
        } else if (block.includes(",")) {
          cells = block.split(",").map((c) => c.trim());
        } else {
          cells = block.split(/\s{2,}/).map((c) => c.trim());
        }
        if (cells.length > 0) {
          matrix.push(cells);
        }
      });

      if (matrix.length === 0) {
        setParsedPreviewRows([]);
        setSelectedPreviewIndices([]);
        setRawMatrixRows([]);
        return;
      }

      const maxCols = Math.max(...matrix.map((r) => r.length));
      const sampleRow = matrix.find((r) => r.length >= 6) || matrix[0] || [];
      const headers = Array.from({ length: maxCols }, (_, i) => {
        const sampleVal = sampleRow[i] ? `: ${sampleRow[i].slice(0, 15)}` : "";
        return `Col ${i + 1}${sampleVal}`;
      });

      setImportHeaders(headers);
      setRawMatrixRows(matrix);

      // Auto detect defaults based on matrix layout
      let defaultMapping = {
        year: 0,
        ainName: 1,
        ainNo: 2,
        ref: 3,
        regNo: 4,
        date: 5,
        type: 6,
        totalTax: 7,
        aNo: 8,
      };

      if (maxCols >= 20) {
        // Exact User Requested 31-Column Structure:
        // Col 1: Year (2023) -> index 0
        // Col 4: AIN Name (FAIR VENTURE LT) -> index 3
        // Col 6: AIN No (803000265) -> index 5
        // Col 7: Ref (#292) -> index 6
        // Col 9: Reg No (105045) -> index 8
        // Col 10: Date (2023-08-02) -> index 9
        // Col 11: Type (EX) -> index 10
        // Col 26: Total Tax (134.5) -> index 25
        defaultMapping = {
          year: 0,
          ainName: 3,
          ainNo: 5,
          ref: 6,
          regNo: 8,
          date: 9,
          type: 10,
          totalTax: 27,
          aNo: 18,
        };
      } else if (maxCols >= 10) {
        defaultMapping = {
          year: 0,
          ainName: sampleRow[3] && /[a-zA-Z]{3,}/.test(sampleRow[3]) ? 3 : 2,
          ainNo: 4 < maxCols ? 4 : 5,
          ref: 5 < maxCols ? 5 : 6,
          regNo: 7 < maxCols ? 7 : 8,
          date: 8 < maxCols ? 8 : 9,
          type: 9 < maxCols ? 9 : 7,
          totalTax: 16 < maxCols ? 16 : maxCols - 2,
          aNo: 18 < maxCols ? 18 : maxCols - 1,
        };
      }

      setColMapYear(defaultMapping.year);
      setColMapAinName(defaultMapping.ainName);
      setColMapAinNo(defaultMapping.ainNo);
      setColMapRef(defaultMapping.ref);
      setColMapRegNo(defaultMapping.regNo);
      setColMapDate(defaultMapping.date);
      setColMapType(defaultMapping.type);
      setColMapTotalTax(defaultMapping.totalTax);
      setColMapANo(defaultMapping.aNo);

      const rows = applyColumnMapping(matrix, defaultMapping);
      setParsedPreviewRows(rows);
      setSelectedPreviewIndices(rows.map((_, idx) => idx));
    } catch (err: any) {
      console.error("Parse error", err);
      setPasteError(err?.message || "Error parsing pasted text.");
    }
  };

  const updateColumnMapping = (
    partial: Partial<{
      year: number;
      ainName: number;
      ainNo: number;
      ref: number;
      regNo: number;
      date: number;
      type: number;
      totalTax: number;
      aNo: number;
    }>
  ) => {
    const nextMapping = {
      year: partial.year ?? colMapYear,
      ainName: partial.ainName ?? colMapAinName,
      ainNo: partial.ainNo ?? colMapAinNo,
      ref: partial.ref ?? colMapRef,
      regNo: partial.regNo ?? colMapRegNo,
      date: partial.date ?? colMapDate,
      type: partial.type ?? colMapType,
      totalTax: partial.totalTax ?? colMapTotalTax,
      aNo: partial.aNo ?? colMapANo,
    };

    if (partial.year !== undefined) setColMapYear(partial.year);
    if (partial.ainName !== undefined) setColMapAinName(partial.ainName);
    if (partial.ainNo !== undefined) setColMapAinNo(partial.ainNo);
    if (partial.ref !== undefined) setColMapRef(partial.ref);
    if (partial.regNo !== undefined) setColMapRegNo(partial.regNo);
    if (partial.date !== undefined) setColMapDate(partial.date);
    if (partial.type !== undefined) setColMapType(partial.type);
    if (partial.totalTax !== undefined) setColMapTotalTax(partial.totalTax);
    if (partial.aNo !== undefined) setColMapANo(partial.aNo);

    if (rawMatrixRows.length > 0) {
      const rows = applyColumnMapping(rawMatrixRows, nextMapping);
      setParsedPreviewRows(rows);
      setSelectedPreviewIndices(rows.map((_, idx) => idx));
    }
  };

  // Import parsed rows into database & state
  const handleFinalizeImport = async () => {
    const rowsToImport = parsedPreviewRows.filter((_, idx) =>
      selectedPreviewIndices.includes(idx)
    );
    if (rowsToImport.length === 0) {
      showError(
        isBn
          ? "কোন এন্ট্রি সিলেক্ট করা হয়নি।"
          : "No entries selected to import."
      );
      return;
    }

    setIsSaving(true);
    try {
      if (supabase) {
        const created = await bulkInsertAinTaxRecords(
          supabase,
          rowsToImport
        );
        setHistory((prev) => {
          const next = [...created, ...prev];
          syncToLocalStorage(next);
          return next;
        });
      } else {
        const created: AinTaxRecord[] = rowsToImport.map((r, idx) => ({
          ...r,
          id: `local_tax_${Date.now()}_${idx}`,
          createdAt: new Date().toISOString(),
        }));
        setHistory((prev) => {
          const next = [...created, ...prev];
          syncToLocalStorage(next);
          return next;
        });
      }

      showSuccess(
        isBn
          ? `সফলভাবে ${rowsToImport.length} টি এন্ট্রি ইমপোর্ট করা হয়েছে!`
          : `Successfully imported ${rowsToImport.length} records!`
      );
      setIsPasteModalOpen(false);
      setPastedRawText("");
      setParsedPreviewRows([]);
      setSelectedPreviewIndices([]);
    } catch (err: any) {
      console.error("Import error", err);
      showError(
        err?.message ||
          (isBn ? "ইমপোর্ট করতে সমস্যা হয়েছে।" : "Import failed.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  // File Upload (XLSX / CSV)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

        if (!data || data.length === 0) {
          showError(isBn ? "ফাইল খালি।" : "File is empty.");
          return;
        }

        // Convert array rows to text lines
        const lines = data
          .filter(
            (r) =>
              Array.isArray(r) &&
              r.some((c) => c !== undefined && c !== null)
          )
          .map((r) => r.join("\t"));

        const text = lines.join("\n");
        setPastedRawText(text);
        const rows = parseRawExcelText(text);
        setParsedPreviewRows(rows);
        setSelectedPreviewIndices(rows.map((_, idx) => idx));
        setIsPasteModalOpen(true);
      } catch (err: any) {
        console.error("Excel File Read Error:", err);
        showError(isBn ? "ফাইল প্রসেস করতে সমস্যা হয়েছে।" : "Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Form Reset
  const resetForm = () => {
    setEditingRecord(null);
    setFormYear(new Date().getFullYear().toString());
    setFormAinName("");
    setFormAinNo("");
    setFormRef("");
    setFormRegNo("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormType("");
    setFormTotalTax("");
    setFormANo("");
    setFormPaymentStatus("Unpaid");
    setFormPaymentDate("");
    setFormPaymentMethod("");
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rec: AinTaxRecord) => {
    setEditingRecord(rec);
    setFormYear(rec.year);
    setFormAinName(rec.ainName);
    setFormAinNo(rec.ainNo);
    setFormRef(rec.ref);
    setFormRegNo(rec.regNo);
    setFormDate(rec.date);
    setFormType(rec.type);
    setFormTotalTax(rec.totalTax.toString());
    setFormANo(rec.aNo);
    setFormPaymentStatus(rec.paymentStatus || "Unpaid");
    setFormPaymentDate(rec.paymentDate || "");
    setFormPaymentMethod(rec.paymentMethod || "");
    setIsModalOpen(true);
  };

  // Submit Single Form (Add/Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAinName.trim() && !formAinNo.trim()) {
      showError(isBn ? "AIN Name অথবা AIN No প্রদান করুন।" : "Please enter AIN Name or AIN No.");
      return;
    }

    const payload = {
      year: formYear.trim(),
      ainName: formAinName.trim(),
      ainNo: formAinNo.trim(),
      ref: formRef.trim(),
      regNo: formRegNo.trim(),
      date: formDate.trim(),
      type: formType.trim(),
      totalTax: Number(formTotalTax) || 0,
      aNo: formANo.trim(),
      paymentStatus: formPaymentStatus,
      paymentDate: formPaymentStatus === "Paid" ? (formPaymentDate || new Date().toISOString().split("T")[0]) : "",
      paymentMethod: formPaymentStatus === "Paid" ? formPaymentMethod.trim() : "",
    };

    setIsSaving(true);
    try {
      if (editingRecord) {
        if (supabase) {
          const updated = await updateAinTaxRecord(supabase, editingRecord.id, payload);
          if (updated) {
            setHistory((prev) => {
              const next = prev.map((r) => (r.id === updated.id ? updated : r));
              syncToLocalStorage(next);
              return next;
            });
          }
        } else {
          const updated: AinTaxRecord = { ...editingRecord, ...payload };
          setHistory((prev) => {
            const next = prev.map((r) => (r.id === updated.id ? updated : r));
            syncToLocalStorage(next);
            return next;
          });
        }
        showSuccess(isBn ? "ডাটা আপডেট সফল হয়েছে!" : "Record updated successfully!");
      } else {
        if (supabase) {
          const created = await insertAinTaxRecord(supabase, payload);
          if (created) {
            setHistory((prev) => {
              const next = [created, ...prev];
              syncToLocalStorage(next);
              return next;
            });
          }
        } else {
          const created: AinTaxRecord = {
            ...payload,
            id: `local_tax_${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          setHistory((prev) => {
            const next = [created, ...prev];
            syncToLocalStorage(next);
            return next;
          });
        }
        showSuccess(isBn ? "নতুন ডাটা সংরক্ষণ সফল হয়েছে!" : "New record saved successfully!");
      }

      setIsModalOpen(false);
      resetForm();
    } catch (err: any) {
      console.error("Save error", err);
      showError(err?.message || (isBn ? "সংরক্ষণ করতে ব্যর্থ হয়েছে।" : "Save failed."));
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Payment Status for a Single Entry (Pay / Unpaid) - INSTANT OPTIMISTIC UPDATE
  const handleTogglePaymentStatus = (record: AinTaxRecord, newStatus: "Paid" | "Unpaid") => {
    const today = new Date().toISOString().split("T")[0];
    const payload = {
      ...record,
      paymentStatus: newStatus,
      paymentDate: newStatus === "Paid" ? today : "",
    };

    // 1. Instant local state & localStorage update
    setHistory((prev) => {
      const next = prev.map((r) => (r.id === record.id ? payload : r));
      syncToLocalStorage(next);
      return next;
    });

    showSuccess(
      newStatus === "Paid"
        ? (isBn ? "রেকর্ডটি 'Paid' বা পরিশোধিত হিসেবে চিহ্নিত করা হয়েছে!" : "Record marked as Paid!")
        : (isBn ? "রেকর্ডটি 'Unpaid' বা বকেয়া হিসেবে চিহ্নিত করা হয়েছে!" : "Record marked as Unpaid!")
    );

    // 2. Background Supabase persistence
    if (supabase) {
      updateAinTaxRecord(supabase, record.id, payload).catch((err) => {
        console.error("Background payment status update error", err);
      });
    }
  };

  // Bulk Mark Selected Entries as Paid / Unpaid - INSTANT OPTIMISTIC UPDATE
  const handleBulkMarkStatus = (newStatus: "Paid" | "Unpaid") => {
    if (selectedIds.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const targets = [...selectedIds];

    // 1. Instant local state & localStorage update
    setHistory((prev) => {
      const next = prev.map((r) =>
        targets.includes(r.id)
          ? {
              ...r,
              paymentStatus: newStatus,
              paymentDate: newStatus === "Paid" ? today : "",
            }
          : r
      );
      syncToLocalStorage(next);
      return next;
    });

    showSuccess(
      newStatus === "Paid"
        ? (isBn ? `সিলেক্টকৃত ${targets.length} টি এন্ট্রি 'Paid' করা হয়েছে!` : `Marked ${targets.length} records as Paid!`)
        : (isBn ? `সিলেক্টকৃত ${targets.length} টি এন্ট্রি 'Unpaid' করা হয়েছে!` : `Marked ${targets.length} records as Unpaid!`)
    );
    setSelectedIds([]);

    // 2. Background Supabase persistence
    if (supabase) {
      targets.forEach((id) => {
        const rec = history.find((r) => r.id === id);
        if (rec) {
          updateAinTaxRecord(supabase, id, {
            ...rec,
            paymentStatus: newStatus,
            paymentDate: newStatus === "Paid" ? today : "",
          }).catch((err) => {
            console.error("Background bulk status update error", err);
          });
        }
      });
    }
  };

  // Delete Single Entry - INSTANT OPTIMISTIC UPDATE
  const handleDeleteRecord = (id: string) => {
    // 1. Instant local state & localStorage update
    setHistory((prev) => {
      const next = prev.filter((r) => r.id !== id);
      syncToLocalStorage(next);
      return next;
    });
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    showSuccess(isBn ? "এন্ট্রি মুছে ফেলা হয়েছে!" : "Record deleted!");
    setDeleteConfirmId(null);

    // 2. Background Supabase deletion
    if (supabase) {
      deleteAinTaxRecord(supabase, id).catch((err) => {
        console.error("Background delete error", err);
      });
    }
  };

  // Bulk Delete Selected - INSTANT OPTIMISTIC UPDATE
  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const targets = [...selectedIds];

    // 1. Instant local state & localStorage update
    setHistory((prev) => {
      const next = prev.filter((r) => !targets.includes(r.id));
      syncToLocalStorage(next);
      return next;
    });
    showSuccess(
      isBn
        ? `মোট ${targets.length} টি এন্ট্রি মুছে ফেলা হয়েছে!`
        : `Deleted ${targets.length} records!`
    );
    setSelectedIds([]);
    setIsBulkDeleteConfirmOpen(false);

    // 2. Background Supabase deletion
    if (supabase) {
      targets.forEach((id) => {
        deleteAinTaxRecord(supabase, id).catch((err) => {
          console.error("Background bulk delete error", err);
        });
      });
    }
  };

  // Filter & Search Logic
  const yearsList = useMemo(() => {
    const setYears = new Set<string>();
    history.forEach((r) => {
      if (r.year) setYears.add(r.year);
    });
    return Array.from(setYears).sort().reverse();
  }, [history]);

  const typesList = useMemo(() => {
    const setTypes = new Set<string>();
    history.forEach((r) => {
      if (r.type) setTypes.add(r.type);
    });
    return Array.from(setTypes).sort();
  }, [history]);

  const filteredRows = useMemo(() => {
    return history.filter((r) => {
      const matchSearch =
        !searchTerm ||
        r.ainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.ainNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.regNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.aNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.year.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.paymentStatus || "Unpaid").toLowerCase().includes(searchTerm.toLowerCase());

      const matchYear = yearFilter === "all" || r.year === yearFilter;
      const matchType = typeFilter === "all" || r.type === typeFilter;
      const matchStatus = statusFilter === "all" || (r.paymentStatus || "Unpaid") === statusFilter;

      return matchSearch && matchYear && matchType && matchStatus;
    });
  }, [history, searchTerm, yearFilter, typeFilter, statusFilter]);

  // Notify parent component of visible rows change for summary calculation
  useEffect(() => {
    if (onVisibleRowsChange) {
      onVisibleRowsChange(filteredRows);
    }
  }, [filteredRows, onVisibleRowsChange]);

  // Summary Card Statistics
  const totalTaxAmount = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (r.totalTax || 0), 0),
    [filteredRows]
  );

  const unpaidTaxAmount = useMemo(
    () =>
      filteredRows
        .filter((r) => (r.paymentStatus || "Unpaid") !== "Paid")
        .reduce((sum, r) => sum + (r.totalTax || 0), 0),
    [filteredRows]
  );

  const paidTaxAmount = useMemo(
    () =>
      filteredRows
        .filter((r) => r.paymentStatus === "Paid")
        .reduce((sum, r) => sum + (r.totalTax || 0), 0),
    [filteredRows]
  );

  const unpaidCount = useMemo(
    () => filteredRows.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid").length,
    [filteredRows]
  );

  const paidCount = useMemo(
    () => filteredRows.filter((r) => r.paymentStatus === "Paid").length,
    [filteredRows]
  );

  const uniqueAinCount = useMemo(() => {
    const setAin = new Set<string>();
    filteredRows.forEach((r) => {
      if (r.ainNo) setAin.add(r.ainNo);
      else if (r.ainName) setAin.add(r.ainName);
    });
    return setAin.size;
  }, [filteredRows]);

  const topTaxRecord = useMemo(() => {
    if (filteredRows.length === 0) return null;
    return [...filteredRows].sort((a, b) => b.totalTax - a.totalTax)[0];
  }, [filteredRows]);

  // Table Column Resizing & Visibility
  const initialColumnWidths = useMemo(
    () => ({
      select: 45,
      sl: 50,
      year: 90,
      ainName: 200,
      ainNo: 140,
      ref: 130,
      regNo: 130,
      date: 120,
      type: 110,
      status: 120,
      totalTax: 150,
      actions: 140,
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
  } = useResizableColumns(initialColumnWidths, 45, "ain_tax_table");

  const tableColumns = useMemo(
    () => [
      { key: "select", label: "Select" },
      { key: "sl", label: "#" },
      { key: "year", label: isBn ? "Year (বছর)" : "Year" },
      { key: "ainName", label: isBn ? "AIN Name (প্রতিষ্ঠানের নাম)" : "AIN Name" },
      { key: "ainNo", label: isBn ? "AIN No (এআইএন নং)" : "AIN No" },
      { key: "ref", label: isBn ? "Ref (রেফারেন্স)" : "Ref" },
      { key: "regNo", label: isBn ? "Reg No (রেজিঃ নং)" : "Reg No" },
      { key: "date", label: isBn ? "Date (তারিখ)" : "Date" },
      { key: "type", label: isBn ? "Type (ধরন)" : "Type" },
      { key: "status", label: isBn ? "Status (অবস্থা)" : "Status" },
      { key: "totalTax", label: isBn ? "Total Tax (মোট ট্যাক্স)" : "Total Tax" },
      { key: "actions", label: isBn ? "অ্যাকশন" : "Actions" },
    ],
    [isBn]
  );

  // Selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredRows.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Exporting Data to Excel
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      showError(isBn ? "এক্সপোর্ট করার জন্য কোন ডাটা নেই।" : "No data to export.");
      return;
    }

    const exportData = filteredRows.map((r, idx) => ({
      SL: idx + 1,
      Year: r.year,
      "AIN Name": r.ainName,
      "AIN No": r.ainNo,
      Ref: r.ref,
      "Reg No": r.regNo,
      Date: r.date,
      Type: r.type,
      "Total Tax": r.totalTax,
      "A No": r.aNo,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AIN_Tax_Due");
    XLSX.writeFile(wb, `AIN_Tax_Due_Records_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Print Table
  const handlePrint = () => {
    if (tableRef.current) {
      printElement(tableRef.current, isBn ? "AIN ট্যাক্স বকেয়া বিবরণী" : "AIN Tax Due Statement", {
        autoExcludeControls: true,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Messages */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-base"></i>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation text-base"></i>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Summary KPI Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tax Due Card */}
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
              {isBn ? "মোট ট্যাক্স বাকী (Unpaid)" : "Total Tax Due"}
            </span>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
              <i className="fa-solid fa-triangle-exclamation text-lg"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
            {unpaidTaxAmount.toLocaleString("en-BD")}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {isBn ? `${unpaidCount} টি রেকর্ডের মোট বকেয়া` : `${unpaidCount} unpaid records`}
          </p>
        </div>

        {/* Total Paid Tax Card */}
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
              {isBn ? "পরিশোধিত ট্যাক্স (Paid)" : "Total Tax Paid"}
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
              <i className="fa-solid fa-circle-check text-lg"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
            {paidTaxAmount.toLocaleString("en-BD")}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {isBn ? `${paidCount} টি রেকর্ডের পরিশোধিত` : `${paidCount} paid records`}
          </p>
        </div>

        {/* Total Records Card */}
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-500">
              {isBn ? "মোট রেকর্ড সংখ্যা" : "Total Entries"}
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
              <i className="fa-solid fa-file-invoice text-lg"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-blue-600 dark:text-blue-400">
            {filteredRows.length.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {isBn ? `মোট ডাটাবেসে ${history.length} টি এন্ট্রি` : `${history.length} total entries stored`}
          </p>
        </div>

        {/* Unique AIN Count Card */}
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
              {isBn ? "ইউনিক AIN সংখ্যা" : "Unique AIN Count"}
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
              <i className="fa-solid fa-building-user text-lg"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400">
            {uniqueAinCount.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {isBn ? "পৃথক AIN ধারকের সংখ্যা" : "Distinct AIN holders"}
          </p>
        </div>
      </div>

      {/* Main Action Bar & Controls */}
      <div
        className={`p-4 md:p-5 rounded-2xl border backdrop-blur-xl space-y-4 ${
          isDark
            ? "bg-slate-900/60 border-slate-800"
            : "bg-white/80 border-slate-200"
        }`}
      >
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isBn
                  ? "AIN Name, AIN No, Ref, Reg No, A No ইত্যাদি দিয়ে খুঁজুন..."
                  : "Search by AIN Name, AIN No, Ref, Reg No, A No..."
              }
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold border transition-all focus:outline-none focus:ring-2 ${
                isDark
                  ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:ring-blue-500/50"
                  : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-blue-500/30"
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                statusFilter === "Paid"
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : statusFilter === "Unpaid"
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400"
                  : isDark
                  ? "bg-slate-800 border-slate-700 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <option value="all">{isBn ? "সব স্ট্যাটাস (All Status)" : "All Status"}</option>
              <option value="Unpaid">{isBn ? "বকেয়া (Unpaid Only)" : "Unpaid Only"}</option>
              <option value="Paid">{isBn ? "পরিশোধিত (Paid Only)" : "Paid Only"}</option>
            </select>

            {/* Year Filter */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <option value="all">{isBn ? "সব বছর (All Years)" : "All Years"}</option>
              {yearsList.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <option value="all">{isBn ? "সব টাইপ (All Types)" : "All Types"}</option>
              {typesList.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </select>

            {/* Column Visibility Toggle */}
            <ColumnVisibilityToggle
              columns={tableColumns}
              isColumnVisible={isColumnVisible}
              toggleColumnVisibility={toggleColumnVisibility}
              showAllColumns={showAllColumns}
              resetColumns={resetColumns}
              systemConfig={systemConfig}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Paste Raw Excel Data Button */}
            <button
              onClick={() => {
                setPastedRawText("");
                setParsedPreviewRows([]);
                setIsPasteModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
            >
              <i className="fa-solid fa-paste"></i>
              <span>{isBn ? "Excel Paste ইমপোর্ট" : "Paste Raw Data"}</span>
            </button>

            {/* Upload Excel File Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-3.5 py-2.5 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all active:scale-95 ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
              title={isBn ? "Excel ফাইল আপলোড করুন" : "Upload Excel File"}
            >
              <i className="fa-solid fa-file-excel text-emerald-500"></i>
              <span className="hidden sm:inline">{isBn ? "ফাইল আপলোড" : "Upload File"}</span>
            </button>

            {/* Add Manual Record Button */}
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              <i className="fa-solid fa-plus"></i>
              <span>{isBn ? "নতুন যুক্ত করুন" : "Add Record"}</span>
            </button>

            {/* Export & Print */}
            <button
              onClick={handleExportExcel}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
              title={isBn ? "এক্সেল এক্সপোর্ট" : "Export Excel"}
            >
              <i className="fa-solid fa-download"></i>
            </button>

            <button
              onClick={handlePrint}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
              title={isBn ? "প্রিন্ট করুন" : "Print Table"}
            >
              <i className="fa-solid fa-print"></i>
            </button>
          </div>
        </div>

        {/* Selected Rows Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-blue-600 dark:text-blue-400 animate-in fade-in">
            <span className="flex items-center gap-2">
              <i className="fa-solid fa-list-check text-sm"></i>
              {isBn
                ? `${selectedIds.length} টি রো সিলেক্ট করা হয়েছে`
                : `${selectedIds.length} rows selected`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleBulkMarkStatus("Paid")}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-circle-check"></i>
                <span>{isBn ? "সিলেক্টেডগুলো Paid করুন" : "Mark Selected Paid"}</span>
              </button>
              <button
                onClick={() => handleBulkMarkStatus("Unpaid")}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all active:scale-95 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-undo"></i>
                <span>{isBn ? "Unpaid করুন" : "Mark Unpaid"}</span>
              </button>
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold transition-all active:scale-95 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-trash"></i>
                <span>{isBn ? "সিলেক্টেডগুলো মুছুন" : "Delete Selected"}</span>
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 rounded-lg border border-blue-500/40 hover:bg-blue-500/20 text-xs"
              >
                {isBn ? "ক্লিয়ার" : "Clear"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table Container */}
      <div
        ref={tableRef}
        className={`rounded-2xl border overflow-hidden backdrop-blur-xl shadow-xl transition-all ${
          isDark
            ? "bg-slate-900/60 border-slate-800"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="overflow-x-auto min-h-[320px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b text-[11px] font-black uppercase tracking-wider ${
                  isDark
                    ? "bg-slate-800/80 border-slate-700/80 text-slate-300"
                    : "bg-slate-100/80 border-slate-200 text-slate-600"
                }`}
              >
                {isColumnVisible("select") && (
                  <th
                    className="p-3.5 text-center relative"
                    style={{ width: columnWidths["select"] }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        filteredRows.length > 0 &&
                        selectedIds.length === filteredRows.length
                      }
                      onChange={handleSelectAll}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}

                {isColumnVisible("sl") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["sl"] }}
                  >
                    #
                    <div
                      onMouseDown={(e) => startResizing("sl", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("year") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["year"] }}
                  >
                    Year
                    <div
                      onMouseDown={(e) => startResizing("year", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("ainName") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["ainName"] }}
                  >
                    AIN Name
                    <div
                      onMouseDown={(e) => startResizing("ainName", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("ainNo") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["ainNo"] }}
                  >
                    AIN No
                    <div
                      onMouseDown={(e) => startResizing("ainNo", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("ref") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["ref"] }}
                  >
                    Ref
                    <div
                      onMouseDown={(e) => startResizing("ref", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("regNo") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["regNo"] }}
                  >
                    Reg No
                    <div
                      onMouseDown={(e) => startResizing("regNo", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("date") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["date"] }}
                  >
                    Date
                    <div
                      onMouseDown={(e) => startResizing("date", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("type") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["type"] }}
                  >
                    Type
                    <div
                      onMouseDown={(e) => startResizing("type", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("status") && (
                  <th
                    className="p-3.5 relative select-none"
                    style={{ width: columnWidths["status"] }}
                  >
                    Status
                    <div
                      onMouseDown={(e) => startResizing("status", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}

                {isColumnVisible("totalTax") && (
                  <th
                    className="p-3.5 text-right relative select-none"
                    style={{ width: columnWidths["totalTax"] }}
                  >
                    Total Tax
                    <div
                      onMouseDown={(e) => startResizing("totalTax", e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50"
                    ></div>
                  </th>
                )}



                {isColumnVisible("actions") && (
                  <th
                    className="p-3.5 text-center relative select-none"
                    style={{ width: columnWidths["actions"] }}
                  >
                    {isBn ? "অ্যাকশন" : "Actions"}
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="p-8 text-center text-slate-400 font-semibold"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <i className="fa-solid fa-box-open text-3xl opacity-50"></i>
                      <span>
                        {isBn
                          ? "কোন AIN ট্যাক্স বকেয়া ডাটা পাওয়া যায়নি। 'Excel Paste ইমপোর্ট' বা 'নতুন যুক্ত করুন' এ ক্লিক করুন।"
                          : "No AIN Tax Due records found. Click 'Paste Raw Data' or 'Add Record' to start."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => {
                  const isSelected = selectedIds.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        isSelected
                          ? isDark
                            ? "bg-blue-900/30"
                            : "bg-blue-50"
                          : isDark
                          ? "hover:bg-slate-800/40"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {isColumnVisible("select") && (
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(r.id)}
                            className="rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}

                      {isColumnVisible("sl") && (
                        <td className="p-3.5 font-bold text-slate-400">
                          {idx + 1}
                        </td>
                      )}

                      {isColumnVisible("year") && (
                        <td className="p-3.5 font-bold text-blue-600 dark:text-blue-400">
                          {r.year || "-"}
                        </td>
                      )}

                      {isColumnVisible("ainName") && (
                        <td className="p-3.5 font-extrabold text-slate-900 dark:text-slate-100">
                          {r.ainName || "-"}
                        </td>
                      )}

                      {isColumnVisible("ainNo") && (
                        <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300 font-bold">
                          {r.ainNo || "-"}
                        </td>
                      )}

                      {isColumnVisible("ref") && (
                        <td className="p-3.5 text-slate-600 dark:text-slate-300 font-medium">
                          {r.ref || "-"}
                        </td>
                      )}

                      {isColumnVisible("regNo") && (
                        <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300">
                          {r.regNo || "-"}
                        </td>
                      )}

                      {isColumnVisible("date") && (
                        <td className="p-3.5 text-slate-500 dark:text-slate-400">
                          {r.date || "-"}
                        </td>
                      )}

                      {isColumnVisible("type") && (
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isDark
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-amber-100 text-amber-800 border border-amber-200"
                            }`}
                          >
                            {r.type || "Tax"}
                          </span>
                        </td>
                      )}

                      {isColumnVisible("status") && (
                        <td className="p-3.5">
                          {r.paymentStatus === "Paid" ? (
                            <span
                              className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit"
                              title={r.paymentDate ? `Paid on ${r.paymentDate}` : "Paid"}
                            >
                              <i className="fa-solid fa-circle-check text-[11px]"></i>
                              {isBn ? "পরিশোধিত" : "Paid"}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
                              <i className="fa-solid fa-clock text-[11px]"></i>
                              {isBn ? "বকেয়া" : "Unpaid"}
                            </span>
                          )}
                        </td>
                      )}

                      {isColumnVisible("totalTax") && (
                        <td className="p-3.5 text-right font-black text-rose-600 dark:text-rose-400 text-sm">
                          {(r.totalTax || 0).toLocaleString("en-BD")}
                        </td>
                      )}

                      {isColumnVisible("actions") && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {r.paymentStatus !== "Paid" ? (
                              <button
                                onClick={() => handleTogglePaymentStatus(r, "Paid")}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-1"
                                title={isBn ? "পরিশোধিত করুন" : "Mark as Paid"}
                              >
                                <i className="fa-solid fa-credit-card"></i>
                                <span>{isBn ? "Pay" : "Pay"}</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleTogglePaymentStatus(r, "Unpaid")}
                                className="p-1.5 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-all font-bold text-[11px] flex items-center gap-1"
                                title={isBn ? "Unpaid হিসেবে ফেরত নিন" : "Revert to Unpaid"}
                              >
                                <i className="fa-solid fa-rotate-left"></i>
                                <span className="hidden sm:inline">{isBn ? "Paid" : "Paid"}</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenEditModal(r)}
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-all"
                              title={isBn ? "সম্পাদনা করুন" : "Edit"}
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(r.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-all"
                              title={isBn ? "মুছে ফেলুন" : "Delete"}
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Table Footer with Precise Total Tax Sum */}
            {filteredRows.length > 0 && (
              <tfoot>
                {/* Row 1: Total Tax */}
                <tr
                  className={`border-t font-extrabold text-xs ${
                    isDark
                      ? "bg-slate-800/90 text-white"
                      : "bg-slate-100/90 text-slate-900"
                  }`}
                >
                  <td
                    colSpan={[
                      "select",
                      "sl",
                      "year",
                      "ainName",
                      "ainNo",
                      "ref",
                      "regNo",
                      "date",
                      "type",
                      "status",
                    ].filter((k) => isColumnVisible(k)).length}
                    className="p-3.5 text-right uppercase tracking-wider text-slate-500 font-bold"
                  >
                    {isBn ? "সর্বমোট ট্যাক্স (Total Tax):" : "Total Tax Sum:"}
                  </td>
                  {isColumnVisible("totalTax") && (
                    <td className="p-3.5 text-right font-black text-slate-900 dark:text-white text-sm">
                      {totalTaxAmount.toLocaleString("en-BD")}
                    </td>
                  )}
                  {isColumnVisible("actions") && <td></td>}
                </tr>

                {/* Row 2: Unpaid Tax Due */}
                <tr
                  className={`border-t font-black text-xs ${
                    isDark
                      ? "bg-rose-950/40 text-rose-300"
                      : "bg-rose-50 text-rose-900"
                  }`}
                >
                  <td
                    colSpan={[
                      "select",
                      "sl",
                      "year",
                      "ainName",
                      "ainNo",
                      "ref",
                      "regNo",
                      "date",
                      "type",
                      "status",
                    ].filter((k) => isColumnVisible(k)).length}
                    className="p-3.5 text-right uppercase tracking-wider text-rose-600 dark:text-rose-400 font-black"
                  >
                    {isBn ? "মোট বকেয়া শুল্ক (Unpaid Tax Due):" : "Unpaid Tax Due:"}
                  </td>
                  {isColumnVisible("totalTax") && (
                    <td className="p-3.5 text-right font-black text-rose-600 dark:text-rose-400 text-sm">
                      {unpaidTaxAmount.toLocaleString("en-BD")}
                    </td>
                  )}
                  {isColumnVisible("actions") && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* MODAL 1: Paste Raw Excel Data Importer */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div
            className={`relative w-full max-w-5xl h-[90vh] max-h-[850px] rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col ${
              isDark
                ? "bg-slate-900 text-white border border-slate-800"
                : "bg-white text-slate-900 border border-slate-200"
            }`}
          >
            {/* Modal Top Header */}
            <div
              className={`p-6 border-b flex justify-between items-start shrink-0 ${
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-100 bg-slate-50/50"
              }`}
            >
              <div>
                <h3
                  className={`text-xl font-bold ${
                    isDark ? "text-white" : "text-slate-800"
                  }`}
                >
                  {isBn ? "AIN Tax Raw Data Import" : "AIN Tax Raw Data Import"}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isBn
                    ? "Excel file upload অথবা raw data paste, দুটোই এখান থেকে করা যাবে।"
                    : "Upload Excel file or paste raw table data below."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center"
              >
                <i className="fas fa-times text-base"></i>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Upload & Info Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-500">
                  {isBn
                    ? "অন্য source থেকে copied table data paste করুন। Tab, comma, বা multiple space দিয়ে column আলাদা হলে auto capture হবে।"
                    : "Paste copied table data from any source. Tab, comma, or space separated columns will be auto parsed."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                      isDark
                        ? "border-emerald-700 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    <i className="fas fa-file-excel mr-1.5"></i>
                    {isBn ? "Excel ফাইল আপলোড" : "Import Excel (.xlsx)"}
                  </button>
                </div>
              </div>

              {/* Paste Raw Data Box */}
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50/70"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4
                      className={`text-sm font-bold ${
                        isDark ? "text-white" : "text-slate-900"
                      }`}
                    >
                      Paste Raw Data
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isBn
                        ? "Excel থেকে কপি করা ডাটা নিচে পেস্ট (Ctrl+V) করুন।"
                        : "Paste copied Excel text below."}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
                      isDark
                        ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                        : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    Auto Parse Enabled
                  </span>
                </div>
                <textarea
                  value={pastedRawText}
                  onChange={(e) => handlePastedTextChange(e.target.value)}
                  placeholder={
                    isBn
                      ? "এখানে Ctrl+V দিয়ে ডাটা পেস্ট করুন..."
                      : "Paste copied lines here (Tab, comma, or space separated)..."
                  }
                  rows={5}
                  className={`w-full px-4 py-3 rounded-xl border font-mono text-xs outline-none resize-y focus:border-blue-500 transition-all ${
                    isDark
                      ? "bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
                      : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                  }`}
                />
              </div>

              {/* Expected Columns Legend */}
              <div
                className={`rounded-2xl border p-4 ${
                  isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50/70"
                }`}
              >
                <p className="text-xs font-bold text-slate-500 mb-2">
                  {isBn ? "প্রত্যাশিত কলাম অর্ডার (Column Order):" : "Expected Column Order:"}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                  {["Year", "AIN Name", "AIN No", "Ref", "Reg No", "Date", "Type", "Total Tax", "A No"].map(
                    (col) => (
                      <span
                        key={col}
                        className={`px-2.5 py-1 rounded-lg border font-bold ${
                          col === "Total Tax"
                            ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                            : isDark
                            ? "bg-slate-800 text-slate-300 border-slate-700"
                            : "bg-white text-slate-700 border-slate-200"
                        }`}
                      >
                        {col}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Manual Column Mapping Select Option */}
              {rawMatrixRows.length > 0 && importHeaders.length > 0 && (
                <div
                  className={`rounded-2xl border p-4 space-y-3 shadow-sm ${
                    isDark ? "border-slate-700 bg-slate-900/70 text-slate-200" : "border-blue-200 bg-blue-50/40 text-slate-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/30 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-500 flex items-center justify-center font-bold text-xs">
                        <i className="fa-solid fa-sliders"></i>
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider">
                          {isBn ? "ম্যানুয়াল কলাম ম্যাপিং (Manual Column Select):" : "Manual Column Mapping Select:"}
                        </h4>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {isBn
                            ? "আপনার এক্সেল শীটের কলাম সিরিয়াল আলাদা হলে এখান থেকে ম্যানুয়ালি ম্যাপিং সিলেক্ট করুন"
                            : "Select the corresponding column from your raw data for each field"}
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {importHeaders.length} Columns Detected
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3 pt-1">
                    {/* Year Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Year (বছর)
                      </label>
                      <select
                        value={colMapYear}
                        onChange={(e) => updateColumnMapping({ year: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* AIN Name Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        AIN Name (প্রতিষ্ঠানের নাম)
                      </label>
                      <select
                        value={colMapAinName}
                        onChange={(e) => updateColumnMapping({ ainName: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* AIN No Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        AIN No (এআইএন নং)
                      </label>
                      <select
                        value={colMapAinNo}
                        onChange={(e) => updateColumnMapping({ ainNo: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Ref Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Ref (রেফারেন্স)
                      </label>
                      <select
                        value={colMapRef}
                        onChange={(e) => updateColumnMapping({ ref: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Reg No Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Reg No (রেজিঃ নং)
                      </label>
                      <select
                        value={colMapRegNo}
                        onChange={(e) => updateColumnMapping({ regNo: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Date (তারিখ)
                      </label>
                      <select
                        value={colMapDate}
                        onChange={(e) => updateColumnMapping({ date: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Type Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Type (টাইপ)
                      </label>
                      <select
                        value={colMapType}
                        onChange={(e) => updateColumnMapping({ type: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Total Tax Col */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        Total Tax (মোট ট্যাক্স) *
                      </label>
                      <select
                        value={colMapTotalTax}
                        onChange={(e) => updateColumnMapping({ totalTax: Number(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-black transition-all focus:outline-none focus:ring-2 text-rose-600 focus:ring-rose-500 ${
                          isDark ? "bg-slate-800 border-rose-500/50" : "bg-rose-50 border-rose-300"
                        }`}
                      >
                        <option value={-1}>None / Skip</option>
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>


                  </div>
                </div>
              )}

              {/* Excel Preview Section */}
              <div
                className={`rounded-2xl border overflow-hidden ${
                  isDark ? "border-slate-700" : "border-slate-200"
                }`}
              >
                <div
                  className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
                    isDark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-500"
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-widest">
                    Excel Preview
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                        isDark
                          ? "bg-slate-800 text-slate-100"
                          : "bg-white text-slate-700 border border-slate-200"
                      }`}
                    >
                      Total Entries: {parsedPreviewRows.length}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                        isDark
                          ? "bg-blue-900/40 text-blue-200 border border-blue-800/50"
                          : "bg-blue-50 text-blue-700 border border-blue-100"
                      }`}
                    >
                      Selected: {selectedPreviewIndices.length}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                        isDark
                          ? "bg-rose-900/40 text-rose-200 border border-rose-800/50"
                          : "bg-rose-50 text-rose-700 border border-rose-100"
                      }`}
                    >
                      Total Tax:{" "}
                      {parsedPreviewRows
                        .filter((_, idx) => selectedPreviewIndices.includes(idx))
                        .reduce((sum, r) => sum + r.totalTax, 0)
                        .toLocaleString("en-BD")}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto min-h-[160px]">
                  {parsedPreviewRows.length === 0 ? (
                    <div
                      className={`px-4 py-10 text-sm text-center font-medium ${
                        isDark ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      Excel import করুন অথবা উপরের box-এ raw data paste করুন।
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse font-mono text-xs">
                      <thead
                        className={
                          isDark
                            ? "bg-slate-800 text-slate-300 font-bold uppercase text-[10px]"
                            : "bg-slate-100 text-slate-800 font-black uppercase text-[10px] border-b border-slate-300"
                        }
                      >
                        <tr
                          className={`border-b ${
                            isDark ? "border-slate-700" : "border-slate-300"
                          }`}
                        >
                          <th className="px-4 py-3 whitespace-nowrap w-12 text-center">
                            <input
                              type="checkbox"
                              checked={
                                parsedPreviewRows.length > 0 &&
                                selectedPreviewIndices.length === parsedPreviewRows.length
                              }
                              onChange={(e) =>
                                setSelectedPreviewIndices(
                                  e.target.checked
                                    ? parsedPreviewRows.map((_, i) => i)
                                    : []
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </th>
                          <th className="px-4 py-3 whitespace-nowrap">#</th>
                          <th className="px-4 py-3 whitespace-nowrap">Year</th>
                          <th className="px-4 py-3 whitespace-nowrap">AIN Name</th>
                          <th className="px-4 py-3 whitespace-nowrap">AIN No</th>
                          <th className="px-4 py-3 whitespace-nowrap">Ref</th>
                          <th className="px-4 py-3 whitespace-nowrap">Reg No</th>
                          <th className="px-4 py-3 whitespace-nowrap">Date</th>
                          <th className="px-4 py-3 whitespace-nowrap">Type</th>
                          <th className="px-4 py-3 whitespace-nowrap text-right">Total Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {parsedPreviewRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={`border-b ${
                              isDark
                                ? "border-slate-800 hover:bg-slate-800/40"
                                : "border-slate-200 hover:bg-slate-100/70"
                            }`}
                          >
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={selectedPreviewIndices.includes(idx)}
                                onChange={(e) =>
                                  setSelectedPreviewIndices((prev) =>
                                    e.target.checked
                                      ? [...prev, idx]
                                      : prev.filter((i) => i !== idx)
                                  )
                                }
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-400 dark:text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 font-extrabold text-blue-600 dark:text-blue-400">
                              {row.year || "-"}
                            </td>
                            <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-slate-100 max-w-xs truncate" title={row.ainName}>
                              {row.ainName || "-"}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                              {row.ainNo || "-"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                              {row.ref || "-"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                              {row.regNo || "-"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-400">
                              {row.date || "-"}
                            </td>
                            <td className="px-4 py-3 font-black text-amber-700 dark:text-amber-300">
                              {row.type || "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-rose-600 dark:text-rose-400 text-sm">
                              {row.totalTax.toLocaleString("en-BD")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Fixed Bottom Actions Footer */}
            <div
              className={`p-4 px-6 border-t flex items-center justify-between gap-3 shrink-0 ${
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-300"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-slate-400">
                {selectedPreviewIndices.length > 0 ? (
                  <span className="text-emerald-500 font-extrabold flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-check"></i>
                    {isBn
                      ? `${selectedPreviewIndices.length} টি এন্ট্রি ইমপোর্টের জন্য সিলেক্ট করা হয়েছে`
                      : `${selectedPreviewIndices.length} rows selected for import`}
                  </span>
                ) : (
                  <span>
                    {isBn
                      ? "প্রথমে ডাটা পেস্ট করুন বা সিলেক্ট করুন"
                      : "Paste data or select rows to enable import"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(false)}
                  className={`px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                    isDark
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeImport}
                  disabled={selectedPreviewIndices.length === 0 || isSaving}
                  className={`px-5 py-3 rounded-xl text-white text-xs font-bold uppercase tracking-widest transition-all shadow-lg ${
                    selectedPreviewIndices.length === 0 || isSaving
                      ? "bg-blue-300 cursor-not-allowed opacity-50"
                      : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 active:scale-95 cursor-pointer"
                  }`}
                >
                  {isSaving
                    ? "Importing..."
                    : `Import to Batch (${selectedPreviewIndices.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add / Edit Single Record Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl p-6 space-y-5 ${
              isDark
                ? "bg-slate-900 border-slate-800 text-white"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <i className="fa-solid fa-pen-to-square text-blue-500"></i>
                <span>
                  {editingRecord
                    ? isBn
                      ? "রেকর্ড সম্পাদনা করুন"
                      : "Edit AIN Tax Record"
                    : isBn
                    ? "নতুন AIN Tax বকেয়া এন্ট্রি"
                    : "Add New AIN Tax Record"}
                </span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Year */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Year (বছর)
                  </label>
                  <input
                    type="text"
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                    placeholder="2024"
                    className={`w-full p-2.5 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>

                {/* AIN No */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    AIN No (এআইএন নং)
                  </label>
                  <input
                    type="text"
                    value={formAinNo}
                    onChange={(e) => setFormAinNo(e.target.value)}
                    placeholder="301..."
                    className={`w-full p-2.5 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>

                {/* AIN Name */}
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    AIN Name (প্রতিষ্ঠানের নাম)
                  </label>
                  <input
                    type="text"
                    value={formAinName}
                    onChange={(e) => setFormAinName(e.target.value)}
                    placeholder="Company / Client Name"
                    className={`w-full p-2.5 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Ref */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Ref (রেফারেন্স)
                  </label>
                  <input
                    type="text"
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    placeholder="Ref No"
                    className={`w-full p-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>

                {/* Reg No */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Reg No (রেজিঃ নং)
                  </label>
                  <input
                    type="text"
                    value={formRegNo}
                    onChange={(e) => setFormRegNo(e.target.value)}
                    placeholder="Reg No"
                    className={`w-full p-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Date (তারিখ)
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className={`w-full p-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Type (ধরন)
                  </label>
                  <input
                    type="text"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    placeholder="e.g. Duty / Tax"
                    className={`w-full p-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:ring-blue-500/50"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"
                    }`}
                  />
                </div>

                {/* Total Tax */}
                <div>
                  <label className="block text-xs font-bold text-rose-500 mb-1">
                    Total Tax (মোট বাকী ট্যাক্স) *
                  </label>
                  <input
                    type="number"
                    value={formTotalTax}
                    onChange={(e) => setFormTotalTax(e.target.value)}
                    placeholder="0.00"
                    className={`w-full p-2.5 rounded-xl text-xs font-black border text-rose-600 focus:outline-none focus:ring-2 ${
                      isDark
                        ? "bg-slate-800 border-slate-700 focus:ring-rose-500/50"
                        : "bg-slate-50 border-slate-300 focus:ring-rose-500/30"
                    }`}
                  />
                </div>


              </div>

              {/* Payment Status & Details */}
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  isDark ? "bg-slate-800/40 border-slate-700" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {isBn ? "পেমেন্ট স্ট্যাটাস (Payment Status):" : "Payment Status:"}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormPaymentStatus("Unpaid")}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        formPaymentStatus === "Unpaid"
                          ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      {isBn ? "বকেয়া (Unpaid)" : "Unpaid"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPaymentStatus("Paid");
                        if (!formPaymentDate) {
                          setFormPaymentDate(new Date().toISOString().split("T")[0]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        formPaymentStatus === "Paid"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      {isBn ? "পরিশোধিত (Paid)" : "Paid"}
                    </button>
                  </div>
                </div>

                {formPaymentStatus === "Paid" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-700/40 animate-in fade-in">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">
                        {isBn ? "পরিশোধের তারিখ (Payment Date)" : "Payment Date"}
                      </label>
                      <input
                        type="date"
                        value={formPaymentDate}
                        onChange={(e) => setFormPaymentDate(e.target.value)}
                        className={`w-full p-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 ${
                          isDark
                            ? "bg-slate-800 border-slate-700 text-white focus:ring-emerald-500/50"
                            : "bg-white border-slate-300 text-slate-900 focus:ring-emerald-500/30"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">
                        {isBn ? "পেমেন্ট মাধ্যম / রেফারেন্স" : "Payment Method / Ref"}
                      </label>
                      <input
                        type="text"
                        value={formPaymentMethod}
                        onChange={(e) => setFormPaymentMethod(e.target.value)}
                        placeholder="Cash / Bank / Pay Order..."
                        className={`w-full p-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 ${
                          isDark
                            ? "bg-slate-800 border-slate-700 text-white focus:ring-emerald-500/50"
                            : "bg-white border-slate-300 text-slate-900 focus:ring-emerald-500/30"
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs border transition-all ${
                    isDark
                      ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {isBn ? "বাতিল" : "Cancel"}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all active:scale-95"
                >
                  {isSaving ? (
                    <>
                      <i className="fa-solid fa-circle-notch animate-spin"></i>
                      <span>{isBn ? "সংরক্ষণ হচ্ছে..." : "Saving..."}</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i>
                      <span>{editingRecord ? (isBn ? "আপডেট করুন" : "Update") : (isBn ? "সংরক্ষণ করুন" : "Save Record")}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-4 text-center ${
              isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mx-auto text-xl font-bold">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h4 className="font-extrabold text-base">
              {isBn ? "এন্ট্রি টি মুছে ফেলতে নিশ্চিত?" : "Confirm Delete"}
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {isBn
                ? "এই অ্যাকশনটি ফেরানো যাবে না। আপনি কি নিশ্চিত যে এই রেকর্ডটি ডিলিট করতে চান?"
                : "This action cannot be undone. Are you sure you want to delete this record?"}
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className={`px-4 py-2 rounded-xl font-bold text-xs border ${
                  isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {isBn ? "বাতিল" : "Cancel"}
              </button>

              <button
                onClick={() => handleDeleteRecord(deleteConfirmId)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-lg shadow-rose-600/20"
              >
                {isBn ? "হ্যাঁ, মুছুন" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-4 text-center ${
              isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mx-auto text-xl font-bold">
              <i className="fa-solid fa-trash-can"></i>
            </div>
            <h4 className="font-extrabold text-base">
              {isBn
                ? `মোট ${selectedIds.length} টি এন্ট্রি মুছবেন?`
                : `Delete ${selectedIds.length} Selected Records?`}
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {isBn
                ? "সিলেক্ট করা সবকয়টি রেকর্ড ডিলিট হয়ে যাবে।"
                : "All selected records will be permanently removed."}
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className={`px-4 py-2 rounded-xl font-bold text-xs border ${
                  isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {isBn ? "বাতিল" : "Cancel"}
              </button>

              <button
                onClick={handleBulkDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-lg shadow-rose-600/20"
              >
                {isBn ? "হ্যাঁ, সবকয়টি মুছুন" : "Yes, Delete Selected"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AinTaxManagement;
