import React, { useRef, useState, useMemo, useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { SystemConfig, AinTaxRecord, Client } from "../types";
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
  clients: Client[];
  onTransferToDutyPayment?: (records: AinTaxRecord[]) => void;
}

const LOCAL_STORAGE_KEY = "ain_tax_records_local";

export const AinTaxManagement: React.FC<AinTaxManagementProps> = ({
  history,
  setHistory,
  onVisibleRowsChange,
  systemConfig,
  supabase,
  clients,
  onTransferToDutyPayment,
}) => {
  const isDark = systemConfig.theme === "dark";
  const isBn = systemConfig.language === "bn";

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "Unpaid" | "Paid">("all");
  const [duplicateFilter, setDuplicateFilter] = useState<"all" | "duplicates" | "unique">("all");
  const [activeDuplicateViewPair, setActiveDuplicateViewPair] = useState<{ year: string; regNo: string } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [jumpPageInput, setJumpPageInput] = useState("");

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

  // Pivot Table & Summary Report State
  const [isPivotModalOpen, setIsPivotModalOpen] = useState(false);
  const [pivotRowDim, setPivotRowDim] = useState<
    "ainName" | "ainNo" | "year" | "yearType" | "ref" | "regNo" | "type" | "paymentStatus" | "month" | "date"
  >("ainName");
  const [pivotColDim, setPivotColDim] = useState<
    "none" | "paymentStatus" | "type" | "year" | "yearType" | "month" | "ainNo" | "ainName"
  >("none");
  const [pivotMetric, setPivotMetric] = useState<
    "financialBreakdown" | "totalTax" | "count" | "average" | "minmax" | "custom"
  >("financialBreakdown");
  const [pivotSortBy, setPivotSortBy] = useState<
    "tax_desc" | "tax_asc" | "count_desc" | "label_asc" | "label_desc"
  >("tax_desc");
  const [pivotSearch, setPivotSearch] = useState("");
  const [pivotStartDate, setPivotStartDate] = useState("");
  const [pivotEndDate, setPivotEndDate] = useState("");
  const [pivotExpandedGroups, setPivotExpandedGroups] = useState<string[]>([]);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [pivotHiddenColKeys, setPivotHiddenColKeys] = useState<string[]>([]);
  const [selectedDrilldownIds, setSelectedDrilldownIds] = useState<string[]>([]);
  const [pivotVisibleCols, setPivotVisibleCols] = useState<{
    count: boolean;
    totalTax: boolean;
    unpaidTax: boolean;
    paidTax: boolean;
    unpaidCount: boolean;
    paidCount: boolean;
    avgTax: boolean;
    minTax: boolean;
    maxTax: boolean;
    sharePercent: boolean;
  }>({
    count: true,
    totalTax: true,
    unpaidTax: true,
    paidTax: true,
    unpaidCount: true,
    paidCount: true,
    avgTax: false,
    minTax: false,
    maxTax: false,
    sharePercent: true,
  });
  const pivotTableRef = useRef<HTMLDivElement | null>(null);

  // Status & Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  const tableRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clientNameByAin = useMemo(() => {
    const next = new Map<string, string>();
    clients.forEach((client) => {
      const ain = (client.ain || "").trim();
      const name = (client.name || "").trim();
      if (ain && name) next.set(ain, name);
    });
    return next;
  }, [clients]);

  const shouldUseAinDatabaseName = (value: string) => {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.length > 60) return true;
    if (normalized.includes("tin:")) return true;
    const addressHints = [
      "processing zone",
      "export processing zone",
      "industrial park",
      "plot #",
      "plot no",
      "extension area",
      "gazipur",
      "sadar ps",
      "nayapaltan",
      "road",
      "house",
      "floor",
    ];
    return addressHints.some((hint) => normalized.includes(hint));
  };
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

      const ainDatabaseName = ainNo ? clientNameByAin.get(ainNo) || "" : "";
      if (ainDatabaseName && shouldUseAinDatabaseName(ainName)) {
        ainName = ainDatabaseName;
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

      // 8. Total Tax: Exact formula from DutyPayment.tsx (parseImportedDutyAmount)
      const parseDutyPaymentAmount = (value: unknown): number => {
        if (typeof value === "number") {
          return Number.isFinite(value) ? value : 0;
        }
        const cleaned = String(value ?? "")
          .replace(/,/g, "")
          .trim();
        if (!cleaned) return 0;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      let totalTax = 0;
      if (mapping.totalTax >= 0 && cells[mapping.totalTax] !== undefined) {
        totalTax = parseDutyPaymentAmount(cells[mapping.totalTax]);
      }

      const mappedTaxCell = mapping.totalTax >= 0 && cells[mapping.totalTax] !== undefined
        ? String(cells[mapping.totalTax] ?? "").trim()
        : "";

      const taxLooksZeroOnly =
        mappedTaxCell !== "" &&
        ["0", "0.00", "0.0", "0,00", "0.000", "0,000"].includes(mappedTaxCell.toLowerCase().replace(/\s/g, ""));

      if (taxLooksZeroOnly) {
        return;
      }

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

      const recordBlocks: string[][] = [];
      let currentBlock: string[] = [];

      // Valid record starts with year (e.g. 2023, 2024) or header row keywords
      const isRecordStart = (line: string) => {
        if (/^(19|20)\d{2}(\t|\s{2,}|,)/.test(line)) return true;
        if (/^(year|বছর|sl|#|ain\s*no|office)/i.test(line)) return true;
        return false;
      };

      rawLines.forEach((line) => {
        if (isRecordStart(line)) {
          if (currentBlock.length > 0) {
            recordBlocks.push(currentBlock);
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
        recordBlocks.push(currentBlock);
      }

      // Convert each block of lines to a single unified row of cells without column shifting
      const matrix: string[][] = [];
      recordBlocks.forEach((blockLines) => {
        const hasTabs = blockLines.some((l) => l.includes("\t"));
        const hasCommas = !hasTabs && blockLines.some((l) => l.includes(","));

        if (hasTabs) {
          const cells: string[] = [];
          blockLines.forEach((line) => {
            const parts = line.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
            if (cells.length === 0) {
              cells.push(...parts);
            } else {
              // The first part of continuation line merges into the last cell of previous line
              cells[cells.length - 1] = [cells[cells.length - 1], parts[0]].filter(Boolean).join(" ");
              // Any subsequent parts are new cells
              if (parts.length > 1) {
                cells.push(...parts.slice(1));
              }
            }
          });
          if (cells.some((c) => c !== "")) {
            matrix.push(cells);
          }
        } else if (hasCommas) {
          const cells: string[] = [];
          blockLines.forEach((line) => {
            const parts = line.split(",").map((c) => c.replace(/\s+/g, " ").trim());
            if (cells.length === 0) {
              cells.push(...parts);
            } else {
              cells[cells.length - 1] = [cells[cells.length - 1], parts[0]].filter(Boolean).join(" ");
              if (parts.length > 1) {
                cells.push(...parts.slice(1));
              }
            }
          });
          if (cells.some((c) => c !== "")) {
            matrix.push(cells);
          }
        } else {
          const singleLine = blockLines.map((l) => l.trim()).join(" ");
          const cells = singleLine.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
          if (cells.length > 0) {
            matrix.push(cells);
          }
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
      };

      // Auto detect totalTax column by matching decimal currency format patterns across columns
      let matched00TaxCol = -1;
      const colScores: Record<number, number> = {};
      const sampleCheckRows = matrix.slice(0, Math.min(matrix.length, 15));

      sampleCheckRows.forEach((row) => {
        row.forEach((cell, colIdx) => {
          if (colIdx < 4) return; // Skip metadata columns (0..3)
          const val = (cell || "").trim();
          // Check if formatted like 828.48, 2055.42, 105,158.00, 134.50, 0.00
          const isDecimalAmount =
            /^\d{1,3}(,\d{3})*\.\d{2}$/.test(val) ||
            /^\d+\.\d{2}$/.test(val) ||
            /^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(val);

          const rawNum = Number(val.replace(/[^0-9.-]/g, ""));
          const isPositiveNum = Number.isFinite(rawNum) && rawNum > 0;

          if (isDecimalAmount) {
            colScores[colIdx] = (colScores[colIdx] || 0) + 10;
          } else if (isPositiveNum && !/^\d{4}-\d{2}-\d{2}$/.test(val) && !/^\d{4,6}$/.test(val)) {
            colScores[colIdx] = (colScores[colIdx] || 0) + 1;
          }
        });
      });

      let maxScore = 0;
      Object.entries(colScores).forEach(([colStr, score]) => {
        const cIdx = Number(colStr);
        if (score > maxScore) {
          maxScore = score;
          matched00TaxCol = cIdx;
        }
      });

      const firstRowLower = matrix[0].map((c) => (c || "").trim().toLowerCase());
      const headerTotalTax = firstRowLower.findIndex(
        (c) => c.includes("total tax") || c.includes("total taxes")
      );
      const headerAinName = firstRowLower.findIndex(
        (c) =>
          c.includes("declarant name") ||
          c.includes("ain name") ||
          c.includes("importer name") ||
          c.includes("exporter name")
      );
      const headerAinNo = firstRowLower.findIndex(
        (c) =>
          c.includes("ain no") ||
          c.includes("ain number") ||
          c.includes("declarant no") ||
          c === "declarant"
      );
      const headerRef = firstRowLower.findIndex(
        (c) => c === "ref" || c.includes("ref no") || c.includes("reference")
      );
      const headerRegNo = firstRowLower.findIndex(
        (c) =>
          (c.includes("reg") || c.includes("registration")) &&
          (c.includes("no") || c.endsWith("no")) &&
          !c.includes("date")
      );
      const headerDate = firstRowLower.findIndex(
        (c) =>
          c.includes("reg date") ||
          c.includes("registration date") ||
          c === "date" ||
          c.endsWith(" date")
      );
      const headerType = firstRowLower.findIndex(
        (c) => c === "ty" || c === "type" || c.startsWith("ty ") || c.includes(" type")
      );

      if (headerTotalTax >= 0) {
        defaultMapping = {
          year: 0,
          ainName: headerAinName >= 0 ? headerAinName : (maxCols >= 20 ? 3 : 2),
          ainNo: headerAinNo >= 0 ? headerAinNo : (maxCols >= 20 ? 4 : 3),
          ref: headerRef >= 0 ? headerRef : (maxCols >= 20 ? 5 : 4),
          regNo: headerRegNo >= 0 ? headerRegNo : (maxCols >= 20 ? 7 : 6),
          date: headerDate >= 0 ? headerDate : (maxCols >= 20 ? 8 : 7),
          type: headerType >= 0 ? headerType : (maxCols >= 20 ? 9 : 8),
          totalTax: headerTotalTax,
        };
      } else if (maxCols >= 20 && maxCols <= 25) {
        // ASYCUDA 22-Column Format (Year, Office Code, Office Name, Declarant Name, Declarant AIN, Ref, Model, Reg No, Date, Type, ..., Total Tax [col 16])
        defaultMapping = {
          year: 0,
          ainName: 3,
          ainNo: 4,
          ref: 5,
          regNo: 7,
          date: 8,
          type: 9,
          totalTax: matched00TaxCol >= 0 ? matched00TaxCol : 16,
        };
      } else if (maxCols >= 15 && maxCols < 20) {
        // ASYCUDA 18-Column Format
        defaultMapping = {
          year: 0,
          ainName: 2,
          ainNo: 3,
          ref: 4,
          regNo: 6,
          date: 7,
          type: 8,
          totalTax: matched00TaxCol >= 0 ? matched00TaxCol : 15,
        };
      } else if (maxCols >= 26) {
        // Extended 31-Column Structure
        defaultMapping = {
          year: 0,
          ainName: 3,
          ainNo: 5,
          ref: 6,
          regNo: 8,
          date: 9,
          type: 10,
          totalTax: matched00TaxCol >= 0 ? matched00TaxCol : 25,
        };
      } else if (maxCols >= 10) {
        defaultMapping = {
          year: 0,
          ainName: sampleRow[3] && /[a-zA-Z]{3,}/.test(sampleRow[3]) ? 3 : 2,
          ainNo: 4 < maxCols ? 4 : 3,
          ref: 5 < maxCols ? 5 : 4,
          regNo: 7 < maxCols ? 7 : 6,
          date: 8 < maxCols ? 8 : 7,
          type: 9 < maxCols ? 9 : 8,
          totalTax: matched00TaxCol >= 0 ? matched00TaxCol : (16 < maxCols ? 16 : maxCols - 2),
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
    };

    if (partial.year !== undefined) setColMapYear(partial.year);
    if (partial.ainName !== undefined) setColMapAinName(partial.ainName);
    if (partial.ainNo !== undefined) setColMapAinNo(partial.ainNo);
    if (partial.ref !== undefined) setColMapRef(partial.ref);
    if (partial.regNo !== undefined) setColMapRegNo(partial.regNo);
    if (partial.date !== undefined) setColMapDate(partial.date);
    if (partial.type !== undefined) setColMapType(partial.type);
    if (partial.totalTax !== undefined) setColMapTotalTax(partial.totalTax);

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

        // Convert array rows to text lines and feed them through the
        // same parsing pipeline as raw paste so preview state is populated.
        const lines = data
          .filter(
            (r) =>
              Array.isArray(r) &&
              r.some((c) => c !== undefined && c !== null)
          )
          .map((r) => r.join("\t"));

        const text = lines.join("\n");
        setPastedRawText(text);
        handlePastedTextChange(text);
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

  // Helper to normalize duplicate key based on Year and Reg No
  const getDuplicateKey = (year?: string, regNo?: string) => {
    const yr = (year || "").trim().toLowerCase();
    const reg = (regNo || "").trim().toLowerCase();
    if (!yr || !reg) return "";
    return `${yr}__${reg}`;
  };

  // Find all duplicates based on Year and Reg No across all records in history
  const duplicateMap = useMemo(() => {
    const keyToRecords = new Map<string, AinTaxRecord[]>();
    history.forEach((rec) => {
      const key = getDuplicateKey(rec.year, rec.regNo);
      if (!key) return;
      const list = keyToRecords.get(key) || [];
      list.push(rec);
      keyToRecords.set(key, list);
    });

    const duplicates = new Map<string, AinTaxRecord[]>();
    keyToRecords.forEach((records, key) => {
      if (records.length > 1) {
        duplicates.set(key, records);
      }
    });
    return duplicates;
  }, [history]);

  const totalDuplicateGroupCount = duplicateMap.size;
  const totalDuplicateRecordCount = useMemo(() => {
    let total = 0;
    duplicateMap.forEach((recs) => {
      total += recs.length;
    });
    return total;
  }, [duplicateMap]);

  // Helper to get duplicate sibling records for a given record
  const getRecordDuplicates = (rec: AinTaxRecord) => {
    const key = getDuplicateKey(rec.year, rec.regNo);
    if (!key) return [];
    const list = duplicateMap.get(key) || [];
    return list.filter((m) => m.id !== rec.id);
  };

  // Real-time duplicate matches for Add/Edit Modal form
  const formDuplicateMatches = useMemo(() => {
    const key = getDuplicateKey(formYear, formRegNo);
    if (!key) return [];
    return history.filter((h) => {
      if (editingRecord && h.id === editingRecord.id) return false;
      return getDuplicateKey(h.year, h.regNo) === key;
    });
  }, [formYear, formRegNo, history, editingRecord]);

  // Check duplicates within parsed preview rows and against history
  const previewDuplicateInfo = useMemo(() => {
    const historyKeys = new Set<string>();
    history.forEach((h) => {
      const k = getDuplicateKey(h.year, h.regNo);
      if (k) historyKeys.add(k);
    });

    const fileKeyCounts = new Map<string, number>();
    parsedPreviewRows.forEach((row) => {
      const k = getDuplicateKey(row.year, row.regNo);
      if (k) {
        fileKeyCounts.set(k, (fileKeyCounts.get(k) || 0) + 1);
      }
    });

    const rowStatuses = parsedPreviewRows.map((row) => {
      const k = getDuplicateKey(row.year, row.regNo);
      if (!k) return { isDuplicate: false, reason: "" };
      const existsInDb = historyKeys.has(k);
      const isMultipleInFile = (fileKeyCounts.get(k) || 0) > 1;
      if (existsInDb && isMultipleInFile) {
        return { isDuplicate: true, reason: isBn ? "ডাটাবেস ও ফাইলে ডুপ্লিকেট" : "DB & File Dup" };
      }
      if (existsInDb) {
        return { isDuplicate: true, reason: isBn ? "ডাটাবেসে বিদ্যমান" : "In Database" };
      }
      if (isMultipleInFile) {
        return { isDuplicate: true, reason: isBn ? "ফাইলে ডুপ্লিকেট" : "File Duplicate" };
      }
      return { isDuplicate: false, reason: "" };
    });

    const duplicateCount = rowStatuses.filter((s) => s.isDuplicate).length;
    return { rowStatuses, duplicateCount };
  }, [parsedPreviewRows, history, isBn]);

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
        String(r.ainName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.ainNo || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.ref || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.regNo || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.year || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.type || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.paymentStatus || "Unpaid").toLowerCase().includes(searchTerm.toLowerCase());

      const matchYear = yearFilter === "all" || r.year === yearFilter;
      const matchType = typeFilter === "all" || r.type === typeFilter;
      const matchStatus = statusFilter === "all" || (r.paymentStatus || "Unpaid") === statusFilter;

      const recKey = getDuplicateKey(r.year, r.regNo);
      const isDuplicateRow = recKey ? duplicateMap.has(recKey) : false;
      const matchDuplicate =
        duplicateFilter === "all" ||
        (duplicateFilter === "duplicates" && isDuplicateRow) ||
        (duplicateFilter === "unique" && !isDuplicateRow);

      return matchSearch && matchYear && matchType && matchStatus && matchDuplicate;
    });
  }, [history, searchTerm, yearFilter, typeFilter, statusFilter, duplicateFilter, duplicateMap]);

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

  // Sorting State
  const [sortKey, setSortKey] = useState<
    "year" | "ainName" | "ainNo" | "ref" | "regNo" | "date" | "type" | "status" | "totalTax"
  >("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      let left: any = "";
      let right: any = "";

      if (sortKey === "date") {
        left = a.date || "";
        right = b.date || "";
      } else if (sortKey === "year") {
        left = Number(a.year) || a.year || "";
        right = Number(b.year) || b.year || "";
      } else if (sortKey === "ainName") {
        left = (a.ainName || "").toLowerCase();
        right = (b.ainName || "").toLowerCase();
      } else if (sortKey === "ainNo") {
        left = (a.ainNo || "").toLowerCase();
        right = (b.ainNo || "").toLowerCase();
      } else if (sortKey === "ref") {
        left = (a.ref || "").toLowerCase();
        right = (b.ref || "").toLowerCase();
      } else if (sortKey === "regNo") {
        const numA = Number(a.regNo);
        const numB = Number(b.regNo);
        if (!isNaN(numA) && !isNaN(numB)) {
          left = numA;
          right = numB;
        } else {
          left = (a.regNo || "").toLowerCase();
          right = (b.regNo || "").toLowerCase();
        }
      } else if (sortKey === "type") {
        left = (a.type || "").toLowerCase();
        right = (b.type || "").toLowerCase();
      } else if (sortKey === "status") {
        left = (a.paymentStatus || "Unpaid").toLowerCase();
        right = (b.paymentStatus || "Unpaid").toLowerCase();
      } else if (sortKey === "totalTax") {
        left = a.totalTax || 0;
        right = b.totalTax || 0;
      }

      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filteredRows, sortKey, sortDir]);

  const toggleSort = (
    key: "year" | "ainName" | "ainNo" | "ref" | "regNo" | "date" | "type" | "status" | "totalTax"
  ) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "date" || key === "year" || key === "totalTax" ? "desc" : "asc");
  };

  const getSortIcon = (
    key: "year" | "ainName" | "ainNo" | "ref" | "regNo" | "date" | "type" | "status" | "totalTax"
  ) => {
    if (sortKey !== key) return "fa-sort text-slate-400 opacity-60";
    return sortDir === "asc"
      ? "fa-sort-up text-blue-600 dark:text-blue-400"
      : "fa-sort-down text-blue-600 dark:text-blue-400";
  };

  // Reset page to 1 whenever search, filters, or pageSize change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, yearFilter, typeFilter, statusFilter, pageSize, sortKey, sortDir]);

  // Pagination Calculations
  const totalFilteredCount = sortedRows.length;
  const numericPageSize = pageSize === "all" ? totalFilteredCount || 1 : pageSize;
  const totalPages = pageSize === "all" ? 1 : Math.ceil(totalFilteredCount / numericPageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const startIndex = pageSize === "all" ? 0 : (safeCurrentPage - 1) * numericPageSize;
  const endIndex =
    pageSize === "all"
      ? totalFilteredCount
      : Math.min(startIndex + numericPageSize, totalFilteredCount);

  const paginatedRows = useMemo(() => {
    if (pageSize === "all") return sortedRows;
    return sortedRows.slice(startIndex, endIndex);
  }, [sortedRows, startIndex, endIndex, pageSize]);

  const isCurrentPageAllSelected =
    paginatedRows.length > 0 && paginatedRows.every((r) => selectedIds.includes(r.id));
  const isCurrentPagePartiallySelected =
    paginatedRows.some((r) => selectedIds.includes(r.id)) && !isCurrentPageAllSelected;

  // Selection handlers
  const handleSelectCurrentPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const pageIds = paginatedRows.map((r) => r.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = new Set(paginatedRows.map((r) => r.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(filteredRows.map((r) => r.id));
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (safeCurrentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (safeCurrentPage >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, "...", totalPages);
      }
    }
    return pages;
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!Number.isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setJumpPageInput("");
    }
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

  // Distinct Column Keys when Pivot Column Dimension is selected
  const pivotColKeys = useMemo(() => {
    if (pivotColDim === "none") return [];
    const keys = new Set<string>();
    history.forEach((r) => {
      if (pivotColDim === "paymentStatus") keys.add(String(r.paymentStatus || "Unpaid").trim());
      else if (pivotColDim === "type") keys.add(String(r.type || "N/A").trim().toUpperCase() || "N/A");
      else if (pivotColDim === "year") keys.add(String(r.year || "N/A").trim() || "N/A");
      else if (pivotColDim === "yearType") {
        const y = String(r.year ?? "").trim() || "N/A";
        const t = String(r.type ?? "").trim().toUpperCase() || "N/A";
        keys.add(`${y}-${t}`);
      }
      else if (pivotColDim === "month") keys.add(r.date ? String(r.date).substring(0, 7) : "N/A");
      else if (pivotColDim === "ainNo") keys.add(String(r.ainNo || "N/A").trim() || "N/A");
      else if (pivotColDim === "ainName") keys.add(String(r.ainName || "").trim() || "N/A");
    });
    return Array.from(keys).sort();
  }, [history, pivotColDim]);

  // Pivot Table Computed Rows & Aggregates
  const pivotData = useMemo(() => {
    // 1. Date range filter
    const records = history.filter((r) => {
      if (pivotStartDate && r.date && r.date < pivotStartDate) return false;
      if (pivotEndDate && r.date && r.date > pivotEndDate) return false;
      return true;
    });

    const grandTotal = {
      count: records.length,
      totalTax: records.reduce((s, r) => s + (r.totalTax || 0), 0),
      paidTax: records
        .filter((r) => r.paymentStatus === "Paid")
        .reduce((s, r) => s + (r.totalTax || 0), 0),
      unpaidTax: records
        .filter((r) => (r.paymentStatus || "Unpaid") !== "Paid")
        .reduce((s, r) => s + (r.totalTax || 0), 0),
      paidCount: records.filter((r) => r.paymentStatus === "Paid").length,
      unpaidCount: records.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid").length,
      colBreakdown: {} as Record<
        string,
        { count: number; totalTax: number; paidTax: number; unpaidTax: number }
      >,
    };

    if (pivotColDim !== "none") {
      pivotColKeys.forEach((k) => {
        grandTotal.colBreakdown[k] = { count: 0, totalTax: 0, paidTax: 0, unpaidTax: 0 };
      });
      records.forEach((r) => {
        let ck = "N/A";
        if (pivotColDim === "paymentStatus") ck = String(r.paymentStatus || "Unpaid").trim();
        else if (pivotColDim === "type") ck = String(r.type || "N/A").trim().toUpperCase() || "N/A";
        else if (pivotColDim === "year") ck = String(r.year || "N/A").trim() || "N/A";
        else if (pivotColDim === "yearType") {
        const y = String(r.year ?? "").trim() || "N/A";
        const t = String(r.type ?? "").trim().toUpperCase() || "N/A";
          ck = `${y}-${t}`;
        }
        else if (pivotColDim === "month") ck = r.date ? String(r.date).substring(0, 7) : "N/A";
        else if (pivotColDim === "ainNo") ck = String(r.ainNo || "N/A").trim() || "N/A";
        else if (pivotColDim === "ainName") ck = String(r.ainName || "").trim() || "N/A";

        if (!grandTotal.colBreakdown[ck]) {
          grandTotal.colBreakdown[ck] = { count: 0, totalTax: 0, paidTax: 0, unpaidTax: 0 };
        }
        grandTotal.colBreakdown[ck].count += 1;
        grandTotal.colBreakdown[ck].totalTax += r.totalTax || 0;
        if (r.paymentStatus === "Paid") {
          grandTotal.colBreakdown[ck].paidTax += r.totalTax || 0;
        } else {
          grandTotal.colBreakdown[ck].unpaidTax += r.totalTax || 0;
        }
      });
    }

    // 2. Group records by row dimension
    const groupMap = new Map<string, { label: string; records: AinTaxRecord[] }>();

    records.forEach((r) => {
      let key = "";
      let label = "";

      if (pivotRowDim === "ainName") {
        key = String(r.ainName || "").trim() || (isBn ? "অজ্ঞাত প্রতিষ্ঠান" : "Unknown Client");
        label = key;
      } else if (pivotRowDim === "ainNo") {
        key = String(r.ainNo || "").trim() || "N/A";
        label = key;
      } else if (pivotRowDim === "year") {
        key = String(r.year || "").trim() || "N/A";
        label = key;
      } else if (pivotRowDim === "yearType") {
        const y = String(r.year ?? "").trim() || "N/A";
        const t = String(r.type ?? "").trim().toUpperCase() || "N/A";
        key = `${y}-${t}`;
        label = key;
      } else if (pivotRowDim === "ref") {
        key = String(r.ref || "").trim() || "N/A";
        label = key;
      } else if (pivotRowDim === "regNo") {
        key = String(r.regNo || "").trim() || "N/A";
        label = key;
      } else if (pivotRowDim === "type") {
        key = String(r.type || "").trim().toUpperCase() || "N/A";
        label = key;
      } else if (pivotRowDim === "paymentStatus") {
        key = String(r.paymentStatus || "Unpaid").trim();
        label = key;
      } else if (pivotRowDim === "month") {
        key = r.date ? String(r.date).substring(0, 7) : (isBn ? "তারিখবিহীন" : "No Date");
        label = key;
      } else if (pivotRowDim === "date") {
        key = r.date || (isBn ? "তারিখবিহীন" : "No Date");
        label = key;
      }

      if (!groupMap.has(key)) {
        groupMap.set(key, { label, records: [] });
      }
      groupMap.get(key)!.records.push(r);
    });

    // 3. Compute group statistics
    const rows: {
      key: string;
      label: string;
      subLabel?: string;
      count: number;
      totalTax: number;
      paidTax: number;
      unpaidTax: number;
      paidCount: number;
      unpaidCount: number;
      minTax: number;
      maxTax: number;
      avgTax: number;
      sharePercent: number;
      colBreakdown: Record<
        string,
        { count: number; totalTax: number; paidTax: number; unpaidTax: number }
      >;
      records: AinTaxRecord[];
    }[] = [];

    groupMap.forEach((val, key) => {
      const recs = val.records;
      const count = recs.length;
      const totalTax = recs.reduce((s, r) => s + (r.totalTax || 0), 0);
      const paidTax = recs
        .filter((r) => r.paymentStatus === "Paid")
        .reduce((s, r) => s + (r.totalTax || 0), 0);
      const unpaidTax = recs
        .filter((r) => (r.paymentStatus || "Unpaid") !== "Paid")
        .reduce((s, r) => s + (r.totalTax || 0), 0);
      const paidCount = recs.filter((r) => r.paymentStatus === "Paid").length;
      const unpaidCount = recs.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid").length;
      const minTax = count > 0 ? Math.min(...recs.map((r) => r.totalTax || 0)) : 0;
      const maxTax = count > 0 ? Math.max(...recs.map((r) => r.totalTax || 0)) : 0;
      const avgTax = count > 0 ? totalTax / count : 0;
      const sharePercent = grandTotal.totalTax > 0 ? (totalTax / grandTotal.totalTax) * 100 : 0;

      let subLabel = "";
      if (pivotRowDim === "ainName") {
        subLabel = Array.from(
          new Set(recs.map((r) => (r.ainNo || "").trim()).filter(Boolean))
        ).join(", ");
      } else if (pivotRowDim === "ainNo") {
        subLabel = Array.from(
          new Set(recs.map((r) => (r.ainName || "").trim()).filter(Boolean))
        ).join(", ");
      } else if (pivotRowDim === "ref" || pivotRowDim === "regNo") {
        const clients = Array.from(
          new Set(recs.map((r) => (r.ainName || "").trim()).filter(Boolean))
        ).join(", ");
        subLabel = clients;
      }

      const colBreakdown: Record<
        string,
        { count: number; totalTax: number; paidTax: number; unpaidTax: number }
      > = {};
      if (pivotColDim !== "none") {
        pivotColKeys.forEach((k) => {
          colBreakdown[k] = { count: 0, totalTax: 0, paidTax: 0, unpaidTax: 0 };
        });
        recs.forEach((r) => {
          let ck = "N/A";
        if (pivotColDim === "paymentStatus") ck = String(r.paymentStatus || "Unpaid").trim();
        else if (pivotColDim === "type") ck = String(r.type || "N/A").trim().toUpperCase() || "N/A";
        else if (pivotColDim === "year") ck = String(r.year || "N/A").trim() || "N/A";
          else if (pivotColDim === "yearType") {
        const y = String(r.year ?? "").trim() || "N/A";
        const t = String(r.type ?? "").trim().toUpperCase() || "N/A";
          ck = `${y}-${t}`;
          }
        else if (pivotColDim === "month") ck = r.date ? String(r.date).substring(0, 7) : "N/A";
        else if (pivotColDim === "ainNo") ck = String(r.ainNo || "N/A").trim() || "N/A";
        else if (pivotColDim === "ainName") ck = String(r.ainName || "").trim() || "N/A";

          if (!colBreakdown[ck]) {
            colBreakdown[ck] = { count: 0, totalTax: 0, paidTax: 0, unpaidTax: 0 };
          }
          colBreakdown[ck].count += 1;
          colBreakdown[ck].totalTax += r.totalTax || 0;
          if (r.paymentStatus === "Paid") {
            colBreakdown[ck].paidTax += r.totalTax || 0;
          } else {
            colBreakdown[ck].unpaidTax += r.totalTax || 0;
          }
        });
      }

      rows.push({
        key,
        label: val.label,
        subLabel: subLabel || undefined,
        count,
        totalTax,
        paidTax,
        unpaidTax,
        paidCount,
        unpaidCount,
        minTax,
        maxTax,
        avgTax,
        sharePercent,
        colBreakdown,
        records: recs,
      });
    });

    // 4. Search Filter
    const filtered = rows.filter((r) => {
      if (!pivotSearch) return true;
      const q = pivotSearch.toLowerCase();
      return (
        r.label.toLowerCase().includes(q) ||
        (r.subLabel && r.subLabel.toLowerCase().includes(q))
      );
    });

    // 5. Sort
    filtered.sort((a, b) => {
      if (pivotSortBy === "tax_desc") return b.totalTax - a.totalTax;
      if (pivotSortBy === "tax_asc") return a.totalTax - b.totalTax;
      if (pivotSortBy === "count_desc") return b.count - a.count;
      if (pivotSortBy === "label_asc") return a.label.localeCompare(b.label);
      if (pivotSortBy === "label_desc") return b.label.localeCompare(a.label);
      return 0;
    });

    return { rows: filtered, grandTotal };
  }, [
    history,
    pivotStartDate,
    pivotEndDate,
    pivotRowDim,
    pivotColDim,
    pivotColKeys,
    pivotSearch,
    pivotSortBy,
    isBn,
  ]);

  const handleTogglePivotGroup = (key: string) => {
    setPivotExpandedGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleExportPivotExcel = () => {
    if (pivotData.rows.length === 0) {
      showError(isBn ? "এক্সপোর্ট করার জন্য কোন ডাটা নেই।" : "No pivot data to export.");
      return;
    }

    const rowDimLabel =
      pivotRowDim === "ainName"
        ? isBn ? "প্রতিষ্ঠান / AIN নাম" : "Client / AIN Name"
        : pivotRowDim === "ainNo"
        ? isBn ? "AIN নং" : "AIN No"
        : pivotRowDim === "year"
        ? isBn ? "বছর" : "Year"
        : pivotRowDim === "yearType"
        ? isBn ? "বছর ও টাইপ (Year-Type)" : "Year-Type"
        : pivotRowDim === "ref"
        ? isBn ? "রেফারেন্স" : "Reference"
        : pivotRowDim === "regNo"
        ? isBn ? "রেজিঃ নং" : "Reg No"
        : pivotRowDim === "type"
        ? isBn ? "টাইপ" : "Type"
        : pivotRowDim === "paymentStatus"
        ? isBn ? "স্ট্যাটাস" : "Payment Status"
        : pivotRowDim === "month"
        ? isBn ? "মাস" : "Month"
        : isBn ? "তারিখ" : "Date";

    let headers: string[] = [];
    let aoaRows: (string | number)[][] = [];

    if (pivotColDim === "none") {
      headers = [rowDimLabel];
      if (pivotVisibleCols.count) headers.push("Total Records");
      if (pivotVisibleCols.totalTax) headers.push("Total Tax (BDT)");
      if (pivotVisibleCols.unpaidTax) headers.push("Unpaid Tax (BDT)");
      if (pivotVisibleCols.paidTax) headers.push("Paid Tax (BDT)");
      if (pivotVisibleCols.unpaidCount) headers.push("Unpaid Count");
      if (pivotVisibleCols.paidCount) headers.push("Paid Count");
      if (pivotVisibleCols.avgTax) headers.push("Average Tax (BDT)");
      if (pivotVisibleCols.minTax) headers.push("Min Tax (BDT)");
      if (pivotVisibleCols.maxTax) headers.push("Max Tax (BDT)");
      if (pivotVisibleCols.sharePercent) headers.push("% Share of Tax");

      aoaRows = pivotData.rows.map((r) => {
        const labelText = r.subLabel
          ? pivotRowDim === "ainName"
            ? `${r.label} (AIN: ${r.subLabel})`
            : `${r.label} (${r.subLabel})`
          : r.label;
        const rowArr: (string | number)[] = [labelText];
        if (pivotVisibleCols.count) rowArr.push(r.count);
        if (pivotVisibleCols.totalTax) rowArr.push(r.totalTax);
        if (pivotVisibleCols.unpaidTax) rowArr.push(r.unpaidTax);
        if (pivotVisibleCols.paidTax) rowArr.push(r.paidTax);
        if (pivotVisibleCols.unpaidCount) rowArr.push(r.unpaidCount);
        if (pivotVisibleCols.paidCount) rowArr.push(r.paidCount);
        if (pivotVisibleCols.avgTax) rowArr.push(Math.round(r.avgTax * 100) / 100);
        if (pivotVisibleCols.minTax) rowArr.push(r.minTax);
        if (pivotVisibleCols.maxTax) rowArr.push(r.maxTax);
        if (pivotVisibleCols.sharePercent) rowArr.push(`${r.sharePercent.toFixed(2)}%`);
        return rowArr;
      });

      // Add Grand Total row
      const grandArr: (string | number)[] = ["GRAND TOTAL"];
      if (pivotVisibleCols.count) grandArr.push(pivotData.grandTotal.count);
      if (pivotVisibleCols.totalTax) grandArr.push(pivotData.grandTotal.totalTax);
      if (pivotVisibleCols.unpaidTax) grandArr.push(pivotData.grandTotal.unpaidTax);
      if (pivotVisibleCols.paidTax) grandArr.push(pivotData.grandTotal.paidTax);
      if (pivotVisibleCols.unpaidCount) grandArr.push(pivotData.grandTotal.unpaidCount);
      if (pivotVisibleCols.paidCount) grandArr.push(pivotData.grandTotal.paidCount);
      if (pivotVisibleCols.avgTax) {
        grandArr.push(
          pivotData.grandTotal.count > 0
            ? Math.round((pivotData.grandTotal.totalTax / pivotData.grandTotal.count) * 100) / 100
            : 0
        );
      }
      if (pivotVisibleCols.minTax) grandArr.push("-");
      if (pivotVisibleCols.maxTax) grandArr.push("-");
      if (pivotVisibleCols.sharePercent) grandArr.push("100.00%");
      aoaRows.push(grandArr);
    } else {
      headers = [rowDimLabel, "Total Records", "Total Tax (BDT)"];
      pivotColKeys.forEach((ck) => {
        headers.push(`${ck} (Count)`);
        headers.push(`${ck} (Tax BDT)`);
      });

      aoaRows = pivotData.rows.map((r) => {
        const labelText = r.subLabel
          ? pivotRowDim === "ainName"
            ? `${r.label} (AIN: ${r.subLabel})`
            : `${r.label} (${r.subLabel})`
          : r.label;
        const rowArr: (string | number)[] = [labelText, r.count, r.totalTax];
        pivotColKeys.forEach((ck) => {
          const colData = r.colBreakdown[ck] || { count: 0, totalTax: 0 };
          rowArr.push(colData.count);
          rowArr.push(colData.totalTax);
        });
        return rowArr;
      });

      // Add Grand Total row
      const grandArr: (string | number)[] = [
        "GRAND TOTAL",
        pivotData.grandTotal.count,
        pivotData.grandTotal.totalTax,
      ];
      pivotColKeys.forEach((ck) => {
        const colData = pivotData.grandTotal.colBreakdown[ck] || { count: 0, totalTax: 0 };
        grandArr.push(colData.count);
        grandArr.push(colData.totalTax);
      });
      aoaRows.push(grandArr);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...aoaRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pivot_Summary");
    XLSX.writeFile(
      wb,
      `AIN_Tax_Pivot_${pivotRowDim}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    showSuccess(isBn ? "পিভট এক্সেল ফাইল তৈরি হয়েছে!" : "Pivot Excel generated successfully!");
  };

  const handleCopyPivotClipboard = () => {
    if (pivotData.rows.length === 0) return;
    const rowDimLabel =
      pivotRowDim === "ainName"
        ? "Client / AIN Name"
        : pivotRowDim === "ainNo"
        ? "AIN No"
        : pivotRowDim === "year"
        ? "Year"
        : pivotRowDim === "yearType"
        ? "Year-Type"
        : pivotRowDim === "ref"
        ? "Reference"
        : pivotRowDim === "regNo"
        ? "Reg No"
        : pivotRowDim === "type"
        ? "Type"
        : pivotRowDim === "paymentStatus"
        ? "Payment Status"
        : pivotRowDim === "month"
        ? "Month"
        : "Date";

    let tsv = "";
    if (pivotColDim === "none") {
      const headerParts = [rowDimLabel];
      if (pivotVisibleCols.count) headerParts.push("Total Records");
      if (pivotVisibleCols.totalTax) headerParts.push("Total Tax");
      if (pivotVisibleCols.unpaidTax) headerParts.push("Unpaid Tax");
      if (pivotVisibleCols.paidTax) headerParts.push("Paid Tax");
      if (pivotVisibleCols.unpaidCount) headerParts.push("Unpaid Count");
      if (pivotVisibleCols.paidCount) headerParts.push("Paid Count");
      if (pivotVisibleCols.avgTax) headerParts.push("Average Tax");
      if (pivotVisibleCols.minTax) headerParts.push("Min Tax");
      if (pivotVisibleCols.maxTax) headerParts.push("Max Tax");
      if (pivotVisibleCols.sharePercent) headerParts.push("% Share");
      tsv = headerParts.join("\t") + "\n";

      pivotData.rows.forEach((r) => {
        const labelText = r.subLabel
          ? pivotRowDim === "ainName"
            ? `${r.label} (AIN: ${r.subLabel})`
            : `${r.label} (${r.subLabel})`
          : r.label;
        const rowParts: (string | number)[] = [labelText];
        if (pivotVisibleCols.count) rowParts.push(r.count);
        if (pivotVisibleCols.totalTax) rowParts.push(r.totalTax);
        if (pivotVisibleCols.unpaidTax) rowParts.push(r.unpaidTax);
        if (pivotVisibleCols.paidTax) rowParts.push(r.paidTax);
        if (pivotVisibleCols.unpaidCount) rowParts.push(r.unpaidCount);
        if (pivotVisibleCols.paidCount) rowParts.push(r.paidCount);
        if (pivotVisibleCols.avgTax) rowParts.push(Math.round(r.avgTax * 100) / 100);
        if (pivotVisibleCols.minTax) rowParts.push(r.minTax);
        if (pivotVisibleCols.maxTax) rowParts.push(r.maxTax);
        if (pivotVisibleCols.sharePercent) rowParts.push(`${r.sharePercent.toFixed(2)}%`);
        tsv += rowParts.join("\t") + "\n";
      });

      const grandParts: (string | number)[] = ["GRAND TOTAL"];
      if (pivotVisibleCols.count) grandParts.push(pivotData.grandTotal.count);
      if (pivotVisibleCols.totalTax) grandParts.push(pivotData.grandTotal.totalTax);
      if (pivotVisibleCols.unpaidTax) grandParts.push(pivotData.grandTotal.unpaidTax);
      if (pivotVisibleCols.paidTax) grandParts.push(pivotData.grandTotal.paidTax);
      if (pivotVisibleCols.unpaidCount) grandParts.push(pivotData.grandTotal.unpaidCount);
      if (pivotVisibleCols.paidCount) grandParts.push(pivotData.grandTotal.paidCount);
      if (pivotVisibleCols.avgTax) {
        grandParts.push(
          pivotData.grandTotal.count > 0
            ? Math.round((pivotData.grandTotal.totalTax / pivotData.grandTotal.count) * 100) / 100
            : 0
        );
      }
      if (pivotVisibleCols.minTax) grandParts.push("-");
      if (pivotVisibleCols.maxTax) grandParts.push("-");
      if (pivotVisibleCols.sharePercent) grandParts.push("100%");
      tsv += grandParts.join("\t") + "\n";
    } else {
      tsv =
        `${rowDimLabel}\tTotal Records\tTotal Tax\t` +
        pivotColKeys.map((k) => `${k} Count\t${k} Tax`).join("\t") +
        "\n";
      pivotData.rows.forEach((r) => {
        tsv +=
          `${r.label}\t${r.count}\t${r.totalTax}\t` +
          pivotColKeys
            .map((k) => `${r.colBreakdown[k]?.count || 0}\t${r.colBreakdown[k]?.totalTax || 0}`)
            .join("\t") +
          "\n";
      });
    }
    navigator.clipboard.writeText(tsv);
    showSuccess(isBn ? "পিভট ডাটা ক্লিপবোর্ডে কপি করা হয়েছে!" : "Pivot copied to clipboard!");
  };

  const handlePrintPivot = () => {
    if (pivotTableRef.current) {
      printElement(
        pivotTableRef.current,
        isBn ? "কলাম ভিত্তিক পিভট ও সামারি রিপোর্ট" : "Pivot & Summary Report",
        {
          header: {
            organization: systemConfig.agencyName || "Customs Clearance & Tax Management",
            subtext: `Grouped by: ${pivotRowDim.toUpperCase()} ${
              pivotColDim !== "none" ? `| Sub-column: ${pivotColDim.toUpperCase()}` : ""
            }`,
          },
          autoExcludeControls: true,
        }
      );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Tax Due Card (Click to View Due List & Send to Duty Payment) */}
        <div
          onClick={() => setStatusFilter((prev) => (prev === "Unpaid" ? "all" : "Unpaid"))}
          className={`p-5 rounded-2xl border transition-all shadow-sm cursor-pointer hover:border-rose-400 dark:hover:border-rose-600 group relative overflow-hidden ${
            statusFilter === "Unpaid"
              ? "bg-rose-50/80 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-400/40"
              : isDark
              ? "bg-slate-900/70 border-slate-800 text-slate-100"
              : "bg-white border-slate-200 text-slate-900"
          }`}
          title={isBn ? "ক্লিক করে শুধু বকেয়া তালিকা (Due List) ফিল্টার করুন" : "Click to filter Due List"}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <span>{isBn ? "মোট ট্যাক্স বাকী (Due List)" : "Total Tax Due"}</span>
              {statusFilter === "Unpaid" && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-600 text-white">
                  Active
                </span>
              )}
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold group-hover:scale-110 transition-transform">
              <i className="fa-solid fa-triangle-exclamation text-base"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
            ৳ {unpaidTaxAmount.toLocaleString("en-BD")}
          </div>
          <div className="flex items-center justify-between mt-1 pt-1">
            <p className="text-[11px] font-medium text-slate-400">
              {isBn ? `${unpaidCount} টি বকেয়া রেকর্ড` : `${unpaidCount} unpaid records`}
            </p>
            {onTransferToDutyPayment && unpaidCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const dueRecords = history.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid");
                  if (dueRecords.length > 0) {
                    onTransferToDutyPayment(dueRecords);
                    showSuccess(
                      isBn
                        ? `সব বকেয়া (${dueRecords.length} টি) রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                        : `Transferred all ${dueRecords.length} due records to Duty Payment!`
                    );
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold transition-all shadow-xs active:scale-95 flex items-center gap-1 z-10"
                title={isBn ? "সব বকেয়া রেকর্ড Duty Payment এ পাঠান" : "Send all Due records to Duty Payment"}
              >
                <i className="fa-solid fa-paper-plane text-[9px]"></i>
                <span>{isBn ? "সব পাঠান" : "Send All"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Total Paid Tax Card */}
        <div
          className={`p-5 rounded-2xl border transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/70 border-slate-800 text-slate-100"
              : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {isBn ? "পরিশোধিত ট্যাক্স (Paid)" : "Total Tax Paid"}
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <i className="fa-solid fa-circle-check text-base"></i>
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
          className={`p-5 rounded-2xl border transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/70 border-slate-800 text-slate-100"
              : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {isBn ? "মোট রেকর্ড সংখ্যা" : "Total Entries"}
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <i className="fa-solid fa-file-invoice text-base"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
            {filteredRows.length.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {isBn ? `মোট ডাটাবেসে ${history.length} টি এন্ট্রি` : `${history.length} total entries stored`}
          </p>
        </div>

        {/* Unique AIN Count Card */}
        <div
          className={`p-5 rounded-2xl border transition-all shadow-sm ${
            isDark
              ? "bg-slate-900/70 border-slate-800 text-slate-100"
              : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {isBn ? "ইউনিক AIN সংখ্যা" : "Unique AIN Count"}
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <i className="fa-solid fa-building-user text-base"></i>
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
            {uniqueAinCount.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {isBn ? "পৃথক AIN ধারকের সংখ্যা" : "Distinct AIN holders"}
          </p>
        </div>

        {/* Duplicate Records Card */}
        <div
          onClick={() => setDuplicateFilter((prev) => (prev === "duplicates" ? "all" : "duplicates"))}
          className={`p-5 rounded-2xl border transition-all shadow-sm cursor-pointer group hover:border-slate-400 dark:hover:border-slate-600 ${
            duplicateFilter === "duplicates"
              ? "ring-2 ring-rose-500/60 bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800"
              : isDark
              ? "bg-slate-900/70 border-slate-800 text-slate-100"
              : "bg-white border-slate-200 text-slate-900"
          }`}
          title={isBn ? "ক্লিক করে শুধু ডুপ্লিকেট রেকর্ড ফিল্টার করুন" : "Click to toggle duplicate records view"}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <span>{isBn ? "ডুপ্লিকেট রেকর্ড" : "Duplicate Records"}</span>
              {totalDuplicateRecordCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              )}
            </span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all ${
              totalDuplicateRecordCount > 0
                ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
            }`}>
              <i className="fa-solid fa-clone text-base"></i>
            </div>
          </div>
          <div className={`text-2xl font-black tracking-tight ${
            totalDuplicateRecordCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"
          }`}>
            {totalDuplicateRecordCount.toLocaleString()}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1 flex items-center justify-between">
            <span>
              {isBn
                ? `${totalDuplicateGroupCount} টি গ্রুপে বিদ্যমান`
                : `${totalDuplicateGroupCount} duplicate group(s)`}
            </span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold group-hover:underline">
              {duplicateFilter === "duplicates" ? (isBn ? "রিসেট" : "Reset") : (isBn ? "ফিল্টার" : "Filter")}
            </span>
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
                  ? "AIN Name, AIN No, Ref, Reg No ইত্যাদি দিয়ে খুঁজুন..."
                  : "Search by AIN Name, AIN No, Ref, Reg No..."
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

            {/* Duplicate Filter */}
            <select
              value={duplicateFilter}
              onChange={(e) => setDuplicateFilter(e.target.value as any)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                duplicateFilter === "duplicates"
                  ? "bg-rose-500/15 border-rose-500/50 text-rose-600 dark:text-rose-400 font-black"
                  : duplicateFilter === "unique"
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400"
                  : isDark
                  ? "bg-slate-800 border-slate-700 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <option value="all">{isBn ? "সব রেকর্ড (All)" : "All Records"}</option>
              <option value="duplicates">
                {isBn ? `⚠️ শুধু ডুপ্লিকেট (${totalDuplicateRecordCount})` : `⚠️ Duplicates (${totalDuplicateRecordCount})`}
              </option>
              <option value="unique">{isBn ? "ইউনিক রেকর্ড (Unique Only)" : "Unique Only"}</option>
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

            {/* Quick Button to Send Current Filtered Due Records to Duty Payment */}
            {onTransferToDutyPayment && (statusFilter === "Unpaid" || filteredRows.some((r) => r.paymentStatus !== "Paid")) && (
              <button
                type="button"
                onClick={() => {
                  const dueToTransfer = filteredRows.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid");
                  if (dueToTransfer.length > 0) {
                    onTransferToDutyPayment(dueToTransfer);
                    showSuccess(
                      isBn
                        ? `ফিল্টার করা ${dueToTransfer.length} টি বকেয়া রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                        : `Transferred ${dueToTransfer.length} due records to Duty Payment!`
                    );
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all active:scale-95"
                title={isBn ? "ফিল্টার করা বকেয়া রেকর্ডগুলো Duty Payment এ পাঠান" : "Send filtered Due records to Duty Payment"}
              >
                <i className="fa-solid fa-paper-plane"></i>
                <span>
                  {isBn
                    ? `বকেয়া তালিকা পাঠান (${filteredRows.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid").length})`
                    : `Send Due List (${filteredRows.filter((r) => (r.paymentStatus || "Unpaid") !== "Paid").length})`}
                </span>
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Pivot Table & Summary Report Button */}
            <button
              onClick={() => setIsPivotModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all active:scale-95 border border-indigo-500/30"
            >
              <i className="fa-solid fa-table-cells-large text-sm"></i>
              <span>{isBn ? "পিভট ও সামারি রিপোর্ট" : "Pivot & Summary Report"}</span>
            </button>

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
          <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-blue-700 dark:text-blue-300 animate-in fade-in shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 font-black">
                <i className="fa-solid fa-list-check text-base text-blue-600"></i>
                {isBn
                  ? `${selectedIds.length} টি রেকর্ড সিলেক্ট করা হয়েছে`
                  : `${selectedIds.length} records selected`}
              </span>
              {selectedIds.length < filteredRows.length && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(filteredRows.map((r) => r.id || "").filter(Boolean))}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isBn
                    ? `(ফিল্টার করা সব ${filteredRows.length} টি সিলেক্ট করুন)`
                    : `(Select all ${filteredRows.length} filtered)`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Prominent Send Selected to Duty Button */}
              {onTransferToDutyPayment && (
                <button
                  type="button"
                  onClick={() => {
                    const recsToTransfer = history.filter((r) => selectedIds.includes(r.id || ""));
                    if (recsToTransfer.length > 0) {
                      onTransferToDutyPayment(recsToTransfer);
                      setSelectedIds([]);
                      showSuccess(
                        isBn
                          ? `সিলেক্টেড ${recsToTransfer.length} টি রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                          : `Transferred ${recsToTransfer.length} selected records to Duty Payment!`
                      );
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs transition-all shadow-md active:scale-95 flex items-center gap-2"
                  title={isBn ? "সিলেক্টেড রেকর্ডগুলো Duty Payment এ পাঠান" : "Send Selected Records to Duty Payment"}
                >
                  <i className="fa-solid fa-paper-plane"></i>
                  <span>{isBn ? `সিলেক্টেড তালিকা Duty Payment এ পাঠান (${selectedIds.length})` : `Send Selected to Duty (${selectedIds.length})`}</span>
                </button>
              )}
              <button
                onClick={() => handleBulkMarkStatus("Paid")}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-circle-check"></i>
                <span>{isBn ? "Paid করুন" : "Mark Paid"}</span>
              </button>
              <button
                onClick={() => handleBulkMarkStatus("Unpaid")}
                className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all active:scale-95 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-undo"></i>
                <span>{isBn ? "Unpaid করুন" : "Mark Unpaid"}</span>
              </button>
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(true)}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold transition-all active:scale-95 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-trash"></i>
                <span>{isBn ? "মুছুন" : "Delete"}</span>
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all"
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
                      checked={isCurrentPageAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isCurrentPagePartiallySelected;
                      }}
                      onChange={handleSelectCurrentPage}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title={
                        isCurrentPageAllSelected
                          ? isBn ? "বর্তমান পেজের সবগুলো আনচেক করুন" : "Unselect all on this page"
                          : isBn ? "বর্তমান পেজের সবগুলো সিলেক্ট করুন" : "Select all on this page"
                      }
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
                    <button
                      type="button"
                      onClick={() => toggleSort("year")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "Year (বছর)" : "Year"}</span>
                      <i className={`fas ${getSortIcon("year")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("ainName")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "AIN Name (নাম)" : "AIN Name"}</span>
                      <i className={`fas ${getSortIcon("ainName")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("ainNo")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "AIN No (নং)" : "AIN No"}</span>
                      <i className={`fas ${getSortIcon("ainNo")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("ref")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "Ref (রেফ)" : "Ref"}</span>
                      <i className={`fas ${getSortIcon("ref")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("regNo")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "Reg No (রেজিঃ)" : "Reg No"}</span>
                      <i className={`fas ${getSortIcon("regNo")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("date")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "Date (তারিখ)" : "Date"}</span>
                      <i className={`fas ${getSortIcon("date")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("type")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "Type (ধরন)" : "Type"}</span>
                      <i className={`fas ${getSortIcon("type")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("status")}
                      className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      <span>{isBn ? "Status (অবস্থা)" : "Status"}</span>
                      <i className={`fas ${getSortIcon("status")}`}></i>
                    </button>
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
                    <button
                      type="button"
                      onClick={() => toggleSort("totalTax")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer w-full text-right"
                    >
                      <span>{isBn ? "Total Tax (ট্যাক্স)" : "Total Tax"}</span>
                      <i className={`fas ${getSortIcon("totalTax")}`}></i>
                    </button>
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
              {paginatedRows.length === 0 ? (
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
                paginatedRows.map((r, idx) => {
                  const isSelected = selectedIds.includes(r.id);
                  const displayIndex = startIndex + idx + 1;
                  const dups = getRecordDuplicates(r);
                  const isDup = dups.length > 0;
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        isDup ? "border-l-4 border-l-rose-500" : ""
                      } ${
                        isSelected
                          ? isDark
                            ? "bg-blue-900/30"
                            : "bg-blue-50"
                          : isDup
                          ? isDark
                            ? "bg-rose-950/15 hover:bg-rose-900/25"
                            : "bg-rose-50/60 hover:bg-rose-100/70"
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
                            className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}

                      {isColumnVisible("sl") && (
                        <td className="p-3.5 font-bold text-slate-400">
                          {displayIndex}
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
                          <div className="flex flex-col items-start gap-1">
                            <span className={isDup ? "font-bold text-rose-600 dark:text-rose-400" : ""}>
                              {r.regNo || "-"}
                            </span>
                            {isDup && (
                              <button
                                type="button"
                                onClick={() => setActiveDuplicateViewPair({ year: r.year, regNo: r.regNo })}
                                className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                title={isBn ? `Year ${r.year} ও Reg No ${r.regNo} দিয়ে আরও ${dups.length} টি ডুপ্লিকেট এন্ট্রি আছে (ক্লিক করে বিস্তারিত দেখুন)` : `${dups.length} duplicate record(s) found for Year ${r.year} & Reg No ${r.regNo} (Click to inspect)`}
                              >
                                <i className="fa-solid fa-clone text-[9px]"></i>
                                <span>{isBn ? `ডুপ্লিকেট (${dups.length + 1})` : `Dup (${dups.length + 1})`}</span>
                              </button>
                            )}
                          </div>
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
                            {r.paymentStatus !== "Paid" && onTransferToDutyPayment && (
                              <button
                                onClick={() => {
                                  onTransferToDutyPayment([r]);
                                  showSuccess(
                                    isBn
                                      ? "রেকর্ডটি Duty Payment এ পাঠানো হয়েছে!"
                                      : "Record transferred to Duty Payment!"
                                  );
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-1"
                                title={isBn ? "এই বকেয়া বিলটি Duty Payment এ পাঠান" : "Send this Due record to Duty Payment"}
                              >
                                <i className="fa-solid fa-paper-plane"></i>
                                <span>{isBn ? "Duty" : "Duty"}</span>
                              </button>
                            )}
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
                    ].filter((k) => isColumnVisible(k as any)).length}
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
                    ].filter((k) => isColumnVisible(k as any)).length}
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

        {/* Modern Pagination & Rows-Per-Page Control Bar */}
        <div
          className={`px-4 py-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold ${
            isDark
              ? "bg-slate-900/90 border-slate-800 text-slate-300"
              : "bg-slate-50/90 border-slate-200 text-slate-700"
          }`}
        >
          {/* Left: Rows Per Page & Record Info */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">
                {isBn ? "প্রতি পেজে:" : "Rows per page:"}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value;
                  setPageSize(val === "all" ? "all" : Number(val));
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all outline-none ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "bg-white border-slate-300 text-slate-800 shadow-sm"
                }`}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value="all">{isBn ? "সবগুলো (All)" : "All"}</option>
              </select>
            </div>

            <span className="text-[11px] font-bold text-slate-400 border-l pl-3 border-slate-700/40">
              {totalFilteredCount === 0
                ? isBn
                  ? "০ টি রেকর্ড"
                  : "0 records"
                : isBn
                ? `মোট ${totalFilteredCount} টির মধ্যে ${startIndex + 1}–${endIndex} টি দেখানো হচ্ছে`
                : `Showing ${startIndex + 1}–${endIndex} of ${totalFilteredCount} records`}
            </span>
          </div>

          {/* Right: Page Navigation & Jump to Page */}
          {pageSize !== "all" && totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* First Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${
                  safeCurrentPage <= 1
                    ? "opacity-30 cursor-not-allowed border-transparent text-slate-500"
                    : isDark
                    ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                }`}
                title={isBn ? "প্রথম পেজ" : "First Page"}
              >
                <i className="fa-solid fa-angles-left"></i>
              </button>

              {/* Prev Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={safeCurrentPage <= 1}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${
                  safeCurrentPage <= 1
                    ? "opacity-30 cursor-not-allowed border-transparent text-slate-500"
                    : isDark
                    ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                }`}
                title={isBn ? "পূর্ববর্তী পেজ" : "Previous Page"}
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>

              {/* Numbered Page Buttons */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((num, pIdx) => {
                  if (num === "...") {
                    return (
                      <span
                        key={`ellipsis_${pIdx}`}
                        className="px-2 text-slate-400 font-bold text-xs"
                      >
                        ...
                      </span>
                    );
                  }
                  const isActive = num === safeCurrentPage;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCurrentPage(num)}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-black transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 scale-105"
                          : isDark
                          ? "bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-700"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              {/* Next Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={safeCurrentPage >= totalPages}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${
                  safeCurrentPage >= totalPages
                    ? "opacity-30 cursor-not-allowed border-transparent text-slate-500"
                    : isDark
                    ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                }`}
                title={isBn ? "পরবর্তী পেজ" : "Next Page"}
              >
                <i className="fa-solid fa-chevron-right"></i>
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${
                  safeCurrentPage >= totalPages
                    ? "opacity-30 cursor-not-allowed border-transparent text-slate-500"
                    : isDark
                    ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                }`}
                title={isBn ? "সর্বশেষ পেজ" : "Last Page"}
              >
                <i className="fa-solid fa-angles-right"></i>
              </button>

              {/* Quick Jump Input */}
              {totalPages > 5 && (
                <form
                  onSubmit={handleJumpToPage}
                  className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-700/40"
                >
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(safeCurrentPage)}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    className={`w-12 h-8 px-1.5 text-center text-xs font-black rounded-lg border outline-none ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white"
                        : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                  <button
                    type="submit"
                    className="h-8 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold"
                  >
                    Go
                  </button>
                </form>
              )}
            </div>
          )}
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
                  {["Year", "AIN Name", "AIN No", "Ref", "Reg No", "Date", "Type", "Total Tax"].map(
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
                    {previewDuplicateInfo.duplicateCount > 0 && (
                      <span className="rounded-full px-3 py-1 text-[11px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        {isBn ? `ডুপ্লিকেট: ${previewDuplicateInfo.duplicateCount}` : `Duplicates: ${previewDuplicateInfo.duplicateCount}`}
                      </span>
                    )}
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
                    {parsedPreviewRows.length > 0 && previewDuplicateInfo.duplicateCount > 0 && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => {
                            const uniqueIndices = parsedPreviewRows
                              .map((_, i) => i)
                              .filter((i) => !previewDuplicateInfo.rowStatuses[i]?.isDuplicate);
                            setSelectedPreviewIndices(uniqueIndices);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/40 flex items-center gap-1 transition-all cursor-pointer"
                          title={isBn ? "সব ডুপ্লিকেট আনচেক করে শুধু ইউনিক রেকর্ডগুলো রাখুন" : "Deselect all duplicates and keep unique records"}
                        >
                          <i className="fa-solid fa-filter-circle-xmark"></i>
                          <span>{isBn ? "ডুপ্লিকেট বাদ দিন" : "Deselect Duplicates"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const dupIndices = parsedPreviewRows
                              .map((_, i) => i)
                              .filter((i) => previewDuplicateInfo.rowStatuses[i]?.isDuplicate);
                            setSelectedPreviewIndices(dupIndices);
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            isDark ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          <span>{isBn ? "শুধু ডুপ্লিকেট" : "Select Dups"}</span>
                        </button>
                      </div>
                    )}
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
                          <th className="px-4 py-3 whitespace-nowrap">Status</th>
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
                        {parsedPreviewRows.map((row, idx) => {
                          const status = previewDuplicateInfo.rowStatuses[idx];
                          const isDup = status?.isDuplicate;
                          return (
                            <tr
                              key={idx}
                              className={`border-b transition-colors ${
                                isDup ? "border-l-4 border-l-rose-500" : ""
                              } ${
                                isDup
                                  ? isDark
                                    ? "bg-rose-950/20 hover:bg-rose-900/30"
                                    : "bg-rose-50/70 hover:bg-rose-100/80"
                                  : isDark
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
                              <td className="px-4 py-3 whitespace-nowrap">
                                {isDup ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
                                    <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                                    <span>{status.reason}</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                                    <i className="fa-solid fa-check text-[9px]"></i>
                                    <span>{isBn ? "ইউনিক" : "Unique"}</span>
                                  </span>
                                )}
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
                                <span className={isDup ? "font-bold text-rose-600 dark:text-rose-400" : ""}>
                                  {row.regNo || "-"}
                                </span>
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
                          );
                        })}
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

              {/* Real-time Duplicate Warning Box */}
              {formDuplicateMatches.length > 0 && (
                <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 font-extrabold">
                    <i className="fa-solid fa-triangle-exclamation text-rose-500 text-sm"></i>
                    <span>
                      {isBn
                        ? `সতর্কতা: Year "${formYear}" ও Reg No "${formRegNo}" দিয়ে ইতিমধ্যে ${formDuplicateMatches.length} টি রেকর্ড ডাটাবেসে রয়েছে!`
                        : `Duplicate Alert: ${formDuplicateMatches.length} record(s) already exist with Year "${formYear}" and Reg No "${formRegNo}"!`}
                    </span>
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-rose-500/20 text-[11px]">
                    {formDuplicateMatches.map((dup) => (
                      <div key={dup.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="truncate">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{dup.ainName || dup.ainNo}</span>
                          <span className="ml-2 text-slate-500 font-mono">({dup.ainNo})</span>
                          <span className="ml-2 text-slate-500">{dup.date || "No date"}</span>
                        </div>
                        <div className="shrink-0 font-black text-rose-600 dark:text-rose-400">
                          ৳ {(dup.totalTax || 0).toLocaleString("en-BD")} ({dup.paymentStatus || "Unpaid"})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

      {/* Pivot Table & Summary Report Modal */}
      {isPivotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div
            className={`w-full max-w-7xl max-h-[94vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all ${
              isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            {/* Modal Header */}
            <div
              className={`px-6 py-4 border-b flex items-center justify-between gap-4 shrink-0 ${
                isDark
                  ? "bg-slate-900 border-slate-800"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base font-bold shadow-xs">
                  <i className="fa-solid fa-table-cells-large"></i>
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight flex items-center gap-2">
                    <span>{isBn ? "কলাম ভিত্তিক পিভট ও সামারি রিপোর্ট" : "Pivot Table & Summary Report"}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      Analytics & Transfer
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {isBn
                      ? "কলাম অনুযায়ী ডাটা গ্রুপিং, কলাম Hide/Unhide এবং সিলেক্টেড রেকর্ড Duty Payment এ পাঠানোর ব্যবস্থা।"
                      : "Group tax data, show/hide columns, and seamlessly transfer selected records to Duty Payment."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPivotClipboard}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                  }`}
                  title={isBn ? "ক্লিপবোর্ডে কপি করুন" : "Copy to Clipboard"}
                >
                  <i className="fa-regular fa-copy text-slate-400"></i>
                  <span className="hidden sm:inline">{isBn ? "কপি" : "Copy"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPivotExcel}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-file-excel"></i>
                  <span>{isBn ? "এক্সেল ডাউনলোড" : "Export Excel"}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPivot}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-print"></i>
                  <span>{isBn ? "প্রিন্ট" : "Print"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPivotModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-all flex items-center justify-center ml-2"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>
            </div>

            {/* Pivot Controls & Configuration Toolbar */}
            <div
              className={`p-4 border-b space-y-3 shrink-0 ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50/70 border-slate-200"
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Row Group Dimension */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    <i className="fa-solid fa-arrows-up-down mr-1 text-blue-500"></i>
                    {isBn ? "রো গ্রুপিং কলাম" : "Row Dimension"}
                  </label>
                  <select
                    value={pivotRowDim}
                    onChange={(e) => setPivotRowDim(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all outline-none ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100"
                        : "bg-white border-slate-300 text-slate-900 shadow-sm"
                    }`}
                  >
                    <option value="ainName">{isBn ? "প্রতিষ্ঠান / AIN Name" : "Client / AIN Name"}</option>
                    <option value="ainNo">{isBn ? "AIN নম্বর (AIN No)" : "AIN Number"}</option>
                    <option value="year">{isBn ? "বছর (Year)" : "Year"}</option>
                    <option value="yearType">{isBn ? "বছর ও টাইপ (Year-Type: 2022-EX, 2022-IM...)" : "Year-Type (e.g. 2022-EX, 2022-IM...)"}</option>
                    <option value="ref">{isBn ? "রেফারেন্স নং (Ref No)" : "Reference (Ref)"}</option>
                    <option value="regNo">{isBn ? "রেজিঃ নং (Reg No)" : "Registration (Reg No)"}</option>
                    <option value="type">{isBn ? "ধরন (Type: EX / IM)" : "Type (EX / IM)"}</option>
                    <option value="paymentStatus">{isBn ? "পেমেন্ট স্ট্যাটাস (Paid/Unpaid)" : "Payment Status"}</option>
                    <option value="month">{isBn ? "মাসিক (Month YYYY-MM)" : "Monthly (YYYY-MM)"}</option>
                    <option value="date">{isBn ? "তারিখ (Exact Date)" : "Exact Date"}</option>
                  </select>
                </div>

                {/* Column Pivot Dimension */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    <i className="fa-solid fa-arrows-left-right mr-1 text-purple-500"></i>
                    {isBn ? "কলাম বিভাজন (ক্রস-ট্যাব)" : "Column Dimension"}
                  </label>
                  <select
                    value={pivotColDim}
                    onChange={(e) => setPivotColDim(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all outline-none ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100"
                        : "bg-white border-slate-300 text-slate-900 shadow-sm"
                    }`}
                  >
                    <option value="none">{isBn ? "কোনটি নয় (Single Dimension)" : "None (Single Dimension)"}</option>
                    <option value="paymentStatus">{isBn ? "পেমেন্ট স্ট্যাটাস (Paid vs Unpaid)" : "Payment Status"}</option>
                    <option value="type">{isBn ? "টাইপ (EX vs IM)" : "Type (EX vs IM)"}</option>
                    <option value="year">{isBn ? "বছর (Year-wise)" : "Year-wise"}</option>
                    <option value="yearType">{isBn ? "বছর ও টাইপ (Year-Type: 2022-EX, 2022-IM...)" : "Year-Type (e.g. 2022-EX, 2022-IM...)"}</option>
                    <option value="month">{isBn ? "মাস (Month-wise)" : "Month-wise"}</option>
                    <option value="ainNo">{isBn ? "AIN নম্বর (AIN No-wise)" : "AIN No-wise"}</option>
                    <option value="ainName">{isBn ? "প্রতিষ্ঠান (Client-wise)" : "Client-wise"}</option>
                  </select>
                </div>

                {/* Metric Calculation / Columns */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    <i className="fa-solid fa-calculator mr-1 text-amber-500"></i>
                    {isBn ? "হিসাবের ধরন / প্রিসেট" : "Metric Preset"}
                  </label>
                  <select
                    value={pivotMetric}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setPivotMetric(val);
                      if (val === "financialBreakdown") {
                        setPivotVisibleCols({
                          count: true,
                          totalTax: true,
                          unpaidTax: true,
                          paidTax: true,
                          unpaidCount: true,
                          paidCount: true,
                          avgTax: false,
                          minTax: false,
                          maxTax: false,
                          sharePercent: true,
                        });
                      } else if (val === "totalTax") {
                        setPivotVisibleCols({
                          count: true,
                          totalTax: true,
                          unpaidTax: false,
                          paidTax: false,
                          unpaidCount: false,
                          paidCount: false,
                          avgTax: false,
                          minTax: false,
                          maxTax: false,
                          sharePercent: true,
                        });
                      } else if (val === "count") {
                        setPivotVisibleCols({
                          count: true,
                          totalTax: false,
                          unpaidTax: false,
                          paidTax: false,
                          unpaidCount: true,
                          paidCount: true,
                          avgTax: false,
                          minTax: false,
                          maxTax: false,
                          sharePercent: false,
                        });
                      } else if (val === "average") {
                        setPivotVisibleCols({
                          count: true,
                          totalTax: true,
                          unpaidTax: false,
                          paidTax: false,
                          unpaidCount: false,
                          paidCount: false,
                          avgTax: true,
                          minTax: false,
                          maxTax: false,
                          sharePercent: true,
                        });
                      } else if (val === "minmax") {
                        setPivotVisibleCols({
                          count: true,
                          totalTax: true,
                          unpaidTax: false,
                          paidTax: false,
                          unpaidCount: false,
                          paidCount: false,
                          avgTax: false,
                          minTax: true,
                          maxTax: true,
                          sharePercent: true,
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all outline-none ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100"
                        : "bg-white border-slate-300 text-slate-900 shadow-sm"
                    }`}
                  >
                    <option value="financialBreakdown">{isBn ? "পূর্ণ আর্থিক বিবরণী (Full Detail)" : "Full Financial Summary"}</option>
                    <option value="custom">{isBn ? "⚙️ কাস্টম কলাম সিলেক্টর (Pick Columns)" : "⚙️ Custom Columns Selection"}</option>
                    <option value="totalTax">{isBn ? "মোট ট্যাক্স (Sum of Tax)" : "Total Tax Only"}</option>
                    <option value="count">{isBn ? "বিল সংখ্যা (Count Only)" : "Bill Count Only"}</option>
                    <option value="average">{isBn ? "গড় ট্যাক্স (Average Tax)" : "Average Tax"}</option>
                    <option value="minmax">{isBn ? "সর্বনিম্ন ও সর্বোচ্চ (Min & Max)" : "Min & Max Tax"}</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    <i className="fa-solid fa-arrow-down-short-wide mr-1 text-emerald-500"></i>
                    {isBn ? "সাজানোর ক্রম" : "Sort By"}
                  </label>
                  <select
                    value={pivotSortBy}
                    onChange={(e) => setPivotSortBy(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-all outline-none ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100"
                        : "bg-white border-slate-300 text-slate-900 shadow-sm"
                    }`}
                  >
                    <option value="tax_desc">{isBn ? "ট্যাক্স: বেশি থেকে কম" : "Tax: High to Low"}</option>
                    <option value="tax_asc">{isBn ? "ট্যাক্স: কম থেকে বেশি" : "Tax: Low to High"}</option>
                    <option value="count_desc">{isBn ? "বিল সংখ্যা: বেশি থেকে কম" : "Count: High to Low"}</option>
                    <option value="label_asc">{isBn ? "নাম: A থেকে Z" : "Label: A to Z"}</option>
                    <option value="label_desc">{isBn ? "নাম: Z থেকে A" : "Label: Z to A"}</option>
                  </select>
                </div>

                {/* Search Filter */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    <i className="fa-solid fa-magnifying-glass mr-1 text-slate-400"></i>
                    {isBn ? "ফিল্টার খুঁজুন" : "Filter Group"}
                  </label>
                  <input
                    type="text"
                    value={pivotSearch}
                    onChange={(e) => setPivotSearch(e.target.value)}
                    placeholder={isBn ? "গ্রুপ খুঁজুন..." : "Filter groups..."}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border transition-all outline-none ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                        : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-sm"
                    }`}
                  />
                </div>
              </div>

              {/* Date Filter & Column Customizer Trigger Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <i className="fa-regular fa-calendar mr-1"></i>
                    {isBn ? "তারিখ সীমা:" : "Date Range:"}
                  </span>
                  <input
                    type="date"
                    value={pivotStartDate}
                    onChange={(e) => setPivotStartDate(e.target.value)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                    }`}
                  />
                  <span className="text-slate-400 font-bold">-</span>
                  <input
                    type="date"
                    value={pivotEndDate}
                    onChange={(e) => setPivotEndDate(e.target.value)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                    }`}
                  />
                  {(pivotStartDate || pivotEndDate) && (
                    <button
                      onClick={() => {
                        setPivotStartDate("");
                        setPivotEndDate("");
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-rose-500"
                    >
                      {isBn ? "ক্লিয়ার" : "Clear"}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Dedicated Column Hide / Unhide Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setIsColumnConfigOpen((prev) => !prev)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 shadow-xs active:scale-95 ${
                      isColumnConfigOpen
                        ? "bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/40"
                        : isDark
                        ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm"
                    }`}
                    title={isBn ? "কলাম প্রদর্শন বা লুকান (Hide / Unhide Columns)" : "Show / Hide Table Columns"}
                  >
                    <i className="fa-solid fa-table-columns text-blue-500"></i>
                    <span>{isBn ? "কলাম অপশন (Hide/Unhide)" : "Columns (Hide/Unhide)"}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isColumnConfigOpen
                        ? "bg-white text-blue-700"
                        : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800"
                    }`}>
                      {pivotColDim === "none"
                        ? Object.values(pivotVisibleCols).filter(Boolean).length
                        : activePivotColKeys.length}
                    </span>
                    <i className={`fa-solid ${isColumnConfigOpen ? "fa-chevron-up" : "fa-chevron-down"} text-[10px]`}></i>
                  </button>

                  <span className="text-[11px] font-bold text-slate-400 ml-1">
                    {isBn
                      ? `(${pivotData.rows.length} টি গ্রুপ)`
                      : `(${pivotData.rows.length} groups)`}
                  </span>
                </div>
              </div>

              {/* Expandable Column Chooser Drawer / Hide & Unhide Controls */}
              {isColumnConfigOpen && (
                <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-slate-900/90 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/70 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px]">
                        <i className="fa-solid fa-sliders"></i>
                      </div>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        {isBn
                          ? "পিভট টেবিল কলাম প্রদর্শন ও লুকানোর অপশন (Column Visibility):"
                          : "Pivot Table Column Visibility (Hide / Show Columns):"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {pivotColDim === "none" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPivotMetric("custom");
                              setPivotVisibleCols({
                                count: true,
                                totalTax: true,
                                unpaidTax: true,
                                paidTax: true,
                                unpaidCount: true,
                                paidCount: true,
                                avgTax: true,
                                minTax: true,
                                maxTax: true,
                                sharePercent: true,
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 transition-all hover:bg-blue-50 shadow-xs"
                          >
                            {isBn ? "সব কলাম দেখাও (Select All)" : "Select All"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPivotMetric("financialBreakdown");
                              setPivotVisibleCols({
                                count: true,
                                totalTax: true,
                                unpaidTax: true,
                                paidTax: true,
                                unpaidCount: true,
                                paidCount: true,
                                avgTax: false,
                                minTax: false,
                                maxTax: false,
                                sharePercent: true,
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-all hover:bg-slate-100 shadow-xs"
                          >
                            {isBn ? "ডিফল্ট (Default)" : "Default"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPivotHiddenColKeys([]);
                              setPivotVisibleCols((prev) => ({ ...prev, count: true, totalTax: true, sharePercent: true }));
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-700 transition-all hover:bg-blue-50 shadow-xs"
                          >
                            {isBn ? "সব কলাম দেখাও (Show All)" : "Show All"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setPivotHiddenColKeys([...pivotColKeys])}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-slate-700 transition-all hover:bg-rose-50 shadow-xs"
                          >
                            {isBn ? "সব লুকান (Hide All)" : "Hide All"}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsColumnConfigOpen(false)}
                        className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 text-xs flex items-center justify-center ml-1"
                      >
                        <i className="fa-solid fa-times"></i>
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Checkbox list based on Dimension Mode */}
                  {pivotColDim !== "none" ? (
                    <div className="space-y-3">
                      <div>
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-2">
                          <i className="fa-solid fa-table-columns mr-1.5"></i>
                          {isBn ? "ডাইমেনশন কলামসমূহ (Dimension Column Keys - টিক দিয়ে চালু/বন্ধ করুন):" : "Dimension Column Keys (Check to Show / Uncheck to Hide):"}
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 bg-white/70 dark:bg-slate-800/50 rounded-xl border border-blue-100 dark:border-slate-800">
                          {pivotColKeys.map((ck) => {
                            const isVisible = !pivotHiddenColKeys.includes(ck);
                            return (
                              <label
                                key={ck}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                                  isVisible
                                    ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-2xs"
                                    : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 opacity-60 line-through"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isVisible}
                                  onChange={() => {
                                    setPivotHiddenColKeys((prev) =>
                                      prev.includes(ck) ? prev.filter((k) => k !== ck) : [...prev, ck]
                                    );
                                  }}
                                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                />
                                <span className="truncate">{ck}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Summary Columns */}
                      <div className="border-t border-blue-200/60 dark:border-slate-800 pt-2.5">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                          {isBn ? "সামারি ও মোট কলাম (Summary & Total Columns):" : "Summary & Total Columns:"}
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                            pivotVisibleCols.count
                              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200"
                              : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 opacity-60"
                          }`}>
                            <input
                              type="checkbox"
                              checked={pivotVisibleCols.count}
                              onChange={() => setPivotVisibleCols((prev) => ({ ...prev, count: !prev.count }))}
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            />
                            <span>{isBn ? "চালান সংখ্যা (Records)" : "Records Count"}</span>
                          </label>

                          <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                            pivotVisibleCols.totalTax
                              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200"
                              : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 opacity-60"
                          }`}>
                            <input
                              type="checkbox"
                              checked={pivotVisibleCols.totalTax}
                              onChange={() => setPivotVisibleCols((prev) => ({ ...prev, totalTax: !prev.totalTax }))}
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            />
                            <span>{isBn ? "মোট ট্যাক্স (Total Tax)" : "Total Tax Sum"}</span>
                          </label>

                          <label className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                            pivotVisibleCols.sharePercent
                              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200"
                              : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 opacity-60"
                          }`}>
                            <input
                              type="checkbox"
                              checked={pivotVisibleCols.sharePercent}
                              onChange={() => setPivotVisibleCols((prev) => ({ ...prev, sharePercent: !prev.sharePercent }))}
                              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                            />
                            <span>{isBn ? "ট্যাক্স শেয়ার (% Share)" : "% Share of Tax"}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1">
                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.count
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.count}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, count: !prev.count }));
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                        <span>{isBn ? "চালান সংখ্যা (Count)" : "Bill Count"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.totalTax
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.totalTax}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, totalTax: !prev.totalTax }));
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                        <span>{isBn ? "মোট ট্যাক্স (Total Tax)" : "Total Tax"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.unpaidTax
                            ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.unpaidTax}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, unpaidTax: !prev.unpaidTax }));
                          }}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <span>{isBn ? "বকেয়া ট্যাক্স (Unpaid)" : "Unpaid Tax"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.paidTax
                            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.paidTax}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, paidTax: !prev.paidTax }));
                          }}
                          className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                        />
                        <span>{isBn ? "পরিশোধিত ট্যাক্স (Paid)" : "Paid Tax"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.unpaidCount
                            ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.unpaidCount}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, unpaidCount: !prev.unpaidCount }));
                          }}
                          className="w-4 h-4 rounded accent-rose-600 cursor-pointer"
                        />
                        <span>{isBn ? "বকেয়া বিল সংখ্যা" : "Unpaid Count"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.paidCount
                            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.paidCount}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, paidCount: !prev.paidCount }));
                          }}
                          className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                        />
                        <span>{isBn ? "পরিশোধিত বিল সংখ্যা" : "Paid Count"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.avgTax
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.avgTax}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, avgTax: !prev.avgTax }));
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                        <span>{isBn ? "গড় ট্যাক্স (Avg Tax)" : "Average Tax"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.minTax
                            ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.minTax}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, minTax: !prev.minTax }));
                          }}
                          className="w-4 h-4 rounded accent-slate-600 cursor-pointer"
                        />
                        <span>{isBn ? "সর্বনিম্ন ট্যাক্স (Min)" : "Min Tax"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.maxTax
                            ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.maxTax}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, maxTax: !prev.maxTax }));
                          }}
                          className="w-4 h-4 rounded accent-slate-600 cursor-pointer"
                        />
                        <span>{isBn ? "সর্বোচ্চ ট্যাক্স (Max)" : "Max Tax"}</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          pivotVisibleCols.sharePercent
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={pivotVisibleCols.sharePercent}
                          onChange={() => {
                            setPivotMetric("custom");
                            setPivotVisibleCols((prev) => ({ ...prev, sharePercent: !prev.sharePercent }));
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                        <span>{isBn ? "ট্যাক্স শেয়ার (% Share)" : "% Share"}</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick KPI Stats Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {isBn ? "মোট ট্যাক্স (Grand Total)" : "Grand Total Tax"}
                </span>
                <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">
                  ৳ {pivotData.grandTotal.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {isBn ? "মোট বকেয়া (Unpaid)" : "Total Unpaid Due"}
                </span>
                <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  ৳ {pivotData.grandTotal.unpaidTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                  <span className="text-[10px] font-bold text-rose-500/80 dark:text-rose-400/80 ml-1.5 font-normal">
                    ({pivotData.grandTotal.unpaidCount} bills)
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {isBn ? "মোট পরিশোধিত (Paid)" : "Total Paid"}
                </span>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ৳ {pivotData.grandTotal.paidTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                  <span className="text-[10px] font-bold text-emerald-500/80 dark:text-emerald-400/80 ml-1.5 font-normal">
                    ({pivotData.grandTotal.paidCount} bills)
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {isBn ? "মোট চালান / বিল সংখ্যা" : "Total Bills"}
                </span>
                <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">
                  {pivotData.grandTotal.count.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Scrollable Pivot Table View */}
            <div ref={pivotTableRef} className="flex-1 overflow-auto p-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr
                    className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                      isDark
                        ? "bg-slate-800 text-slate-200 border-slate-700 shadow-sm"
                        : "bg-slate-100 text-slate-700 border-slate-200 shadow-sm"
                    }`}
                  >
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-4 min-w-[200px]">
                      {pivotRowDim === "ainName"
                        ? isBn ? "প্রতিষ্ঠান / AIN Name" : "Client / AIN Name"
                        : pivotRowDim === "ainNo"
                        ? isBn ? "AIN নম্বর" : "AIN No"
                        : pivotRowDim === "year"
                        ? isBn ? "বছর" : "Year"
                        : pivotRowDim === "yearType"
                        ? isBn ? "বছর ও টাইপ (Year-Type)" : "Year-Type"
                        : pivotRowDim === "ref"
                        ? isBn ? "রেফারেন্স নং" : "Ref No"
                        : pivotRowDim === "regNo"
                        ? isBn ? "রেজিঃ নং" : "Reg No"
                        : pivotRowDim === "type"
                        ? isBn ? "টাইপ (EX/IM)" : "Type"
                        : pivotRowDim === "paymentStatus"
                        ? isBn ? "পেমেন্ট অবস্থা" : "Payment Status"
                        : pivotRowDim === "month"
                        ? isBn ? "মাস" : "Month"
                        : isBn ? "তারিখ" : "Date"}
                    </th>

                    {/* Dynamic Headers based on Pivot Column Dimension */}
                    {pivotColDim === "none" ? (
                      <>
                        {pivotVisibleCols.count && (
                          <th className="py-3 px-3 text-center w-24">
                            {isBn ? "চালান সংখ্যা" : "Records"}
                          </th>
                        )}
                        {pivotVisibleCols.totalTax && (
                          <th className="py-3 px-4 text-right">
                            {isBn ? "মোট ট্যাক্স" : "Total Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.unpaidTax && (
                          <th className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">
                            {isBn ? "বকেয়া (Unpaid)" : "Unpaid Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.paidTax && (
                          <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                            {isBn ? "পরিশোধিত (Paid)" : "Paid Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.unpaidCount && (
                          <th className="py-3 px-3 text-center text-rose-600 dark:text-rose-400">
                            {isBn ? "বকেয়া বিল" : "Unpaid Count"}
                          </th>
                        )}
                        {pivotVisibleCols.paidCount && (
                          <th className="py-3 px-3 text-center text-emerald-600 dark:text-emerald-400">
                            {isBn ? "পরিশোধিত বিল" : "Paid Count"}
                          </th>
                        )}
                        {pivotVisibleCols.avgTax && (
                          <th className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">
                            {isBn ? "গড় ট্যাক্স" : "Average Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.minTax && (
                          <th className="py-3 px-4 text-right">
                            {isBn ? "সর্বনিম্ন" : "Min Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.maxTax && (
                          <th className="py-3 px-4 text-right">
                            {isBn ? "সর্বোচ্চ" : "Max Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.sharePercent && (
                          <th className="py-3 px-4 min-w-[140px]">
                            {isBn ? "ট্যাক্স শেয়ার (% Share)" : "% Share"}
                          </th>
                        )}
                      </>
                    ) : (
                      <>
                        {pivotVisibleCols.count && (
                          <th className="py-3 px-3 text-center w-24">
                            {isBn ? "চালান সংখ্যা" : "Records"}
                          </th>
                        )}
                        {activePivotColKeys.map((ck) => (
                          <th key={ck} className="py-3 px-3 text-right border-l border-slate-200 dark:border-slate-700">
                            <span className="font-bold">{ck}</span>
                            <span className="block text-[9px] text-slate-400 font-normal">
                              Tax (BDT)
                            </span>
                          </th>
                        ))}
                        {pivotVisibleCols.totalTax && (
                          <th className="py-3 px-4 text-right border-l border-slate-200 dark:border-slate-700">
                            {isBn ? "মোট ট্যাক্স" : "Total Tax"}
                          </th>
                        )}
                        {pivotVisibleCols.sharePercent && (
                          <th className="py-3 px-4 min-w-[120px]">
                            {isBn ? "শেয়ার (%)" : "% Share"}
                          </th>
                        )}
                      </>
                    )}

                    {onTransferToDutyPayment && (
                      <th className="py-3 px-2 text-center w-28">
                        {isBn ? "Duty Payment" : "Transfer"}
                      </th>
                    )}

                    <th className="py-3 px-3 text-center w-20">
                      {isBn ? "বিবরণ" : "Drilldown"}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pivotData.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={16}
                        className="py-12 text-center text-slate-400 font-semibold"
                      >
                        <i className="fa-solid fa-inbox text-3xl mb-2 block opacity-40"></i>
                        {isBn ? "কোন ডাটা পাওয়া যায়নি।" : "No data matching criteria."}
                      </td>
                    </tr>
                  ) : (
                    pivotData.rows.map((row, idx) => {
                      const isExpanded = pivotExpandedGroups.includes(row.key);
                      const groupRecordIds = row.records.map((r) => r.id || "").filter(Boolean);
                      const allGroupSelected = groupRecordIds.length > 0 && groupRecordIds.every((id) => selectedDrilldownIds.includes(id));
                      const someGroupSelected = groupRecordIds.some((id) => selectedDrilldownIds.includes(id));

                      return (
                        <React.Fragment key={row.key}>
                          <tr
                            className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                              idx % 2 === 0
                                ? isDark
                                  ? "bg-slate-900/30"
                                  : "bg-slate-50/40"
                                : ""
                            }`}
                          >
                            <td className="py-3 px-3 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
                                <span
                                  onClick={() => handleTogglePivotGroup(row.key)}
                                  className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  {row.label}
                                </span>
                                {row.subLabel && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700">
                                    {pivotRowDim === "ainName" ? `AIN: ${row.subLabel}` : row.subLabel}
                                  </span>
                                )}
                              </div>
                            </td>

                            {pivotColDim === "none" ? (
                              <>
                                {pivotVisibleCols.count && (
                                  <td className="py-3 px-3 text-center font-bold">
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px]">
                                      {row.count}
                                    </span>
                                  </td>
                                )}

                                {pivotVisibleCols.totalTax && (
                                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                                    ৳ {row.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.unpaidTax && (
                                  <td className="py-3 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                                    ৳ {row.unpaidTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.paidTax && (
                                  <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                    ৳ {row.paidTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.unpaidCount && (
                                  <td className="py-3 px-3 text-center font-bold">
                                    <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-[10px]">
                                      {row.unpaidCount}
                                    </span>
                                  </td>
                                )}

                                {pivotVisibleCols.paidCount && (
                                  <td className="py-3 px-3 text-center font-bold">
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 text-[10px]">
                                      {row.paidCount}
                                    </span>
                                  </td>
                                )}

                                {pivotVisibleCols.avgTax && (
                                  <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-blue-400">
                                    ৳ {row.avgTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.minTax && (
                                  <td className="py-3 px-4 text-right font-medium text-slate-500 dark:text-slate-400">
                                    ৳ {row.minTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.maxTax && (
                                  <td className="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300">
                                    ৳ {row.maxTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.sharePercent && (
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div
                                          className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500"
                                          style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-12 text-right">
                                        {row.sharePercent.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
                                )}
                              </>
                            ) : (
                              <>
                                {pivotVisibleCols.count && (
                                  <td className="py-3 px-3 text-center font-bold">
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px]">
                                      {row.count}
                                    </span>
                                  </td>
                                )}

                                {activePivotColKeys.map((ck) => {
                                  const colData = row.colBreakdown[ck] || { count: 0, totalTax: 0 };
                                  return (
                                    <td key={ck} className="py-3 px-3 text-right font-bold border-l border-slate-200 dark:border-slate-800">
                                      <div>
                                        ৳ {colData.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                      </div>
                                      <span className="text-[10px] text-slate-400">
                                        ({colData.count})
                                      </span>
                                    </td>
                                  );
                                })}

                                {pivotVisibleCols.totalTax && (
                                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100 border-l border-slate-200 dark:border-slate-800">
                                    ৳ {row.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </td>
                                )}

                                {pivotVisibleCols.sharePercent && (
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div
                                          className="bg-blue-600 dark:bg-blue-500 h-full rounded-full"
                                          style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-12 text-right">
                                        {row.sharePercent.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
                                )}
                              </>
                            )}

                            {/* Direct Group Transfer to Duty Payment */}
                            {onTransferToDutyPayment && (
                              <td className="py-3 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onTransferToDutyPayment(row.records);
                                    setIsPivotModalOpen(false);
                                    showSuccess(
                                      isBn
                                        ? `${row.label} এর ${row.records.length} টি রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                                        : `Transferred ${row.records.length} records of ${row.label} to Duty Payment!`
                                    );
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white border border-blue-200 dark:border-blue-800 text-[11px] font-bold transition-all shadow-2xs active:scale-95 flex items-center justify-center gap-1 mx-auto"
                                  title={isBn ? `${row.label} এর সব (${row.records.length} টি) বিল Duty Payment এ পাঠান` : `Send all ${row.records.length} bills of this group to Duty Payment`}
                                >
                                  <i className="fa-solid fa-paper-plane text-[10px]"></i>
                                  <span>{isBn ? "পাঠান" : "Send"}</span>
                                </button>
                              </td>
                            )}

                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleTogglePivotGroup(row.key)}
                                className={`p-1.5 rounded-lg border text-xs font-bold transition-all ${
                                  isExpanded
                                    ? "bg-slate-800 text-white dark:bg-slate-700 border-slate-700 shadow-xs"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200"
                                }`}
                                title={isExpanded ? "Collapse" : "Expand Drilldown"}
                              >
                                <i className={`fa-solid ${isExpanded ? "fa-chevron-up" : "fa-chevron-down"}`}></i>
                              </button>
                            </td>
                          </tr>

                          {/* Nested Drilldown Table with Selection & Duty Transfer */}
                          {isExpanded && (
                            <tr className="bg-slate-50 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800 animate-in fade-in">
                              <td colSpan={16} className="p-4">
                                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3.5 shadow-md">
                                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                                        <i className="fa-solid fa-list-ol"></i>
                                      </div>
                                      <div>
                                        <h5 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                                          <span>{row.label}</span>
                                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold font-mono">
                                            {row.records.length} {isBn ? "টি বিল" : "bills"}
                                          </span>
                                        </h5>
                                      </div>
                                    </div>

                                    {/* Action Bar inside Drilldown */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      {onTransferToDutyPayment && (
                                        <>
                                          {/* Send Checked Items in this group */}
                                          {someGroupSelected && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const checkedInGroup = row.records.filter((r) =>
                                                  selectedDrilldownIds.includes(r.id || "")
                                                );
                                                if (checkedInGroup.length > 0) {
                                                  onTransferToDutyPayment(checkedInGroup);
                                                  setIsPivotModalOpen(false);
                                                  setSelectedDrilldownIds((prev) =>
                                                    prev.filter((id) => !checkedInGroup.some((g) => g.id === id))
                                                  );
                                                  showSuccess(
                                                    isBn
                                                      ? `সিলেক্টেড ${checkedInGroup.length} টি রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                                                      : `Transferred ${checkedInGroup.length} selected records to Duty Payment!`
                                                  );
                                                }
                                              }}
                                              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                                            >
                                              <i className="fa-solid fa-paper-plane text-xs"></i>
                                              <span>
                                                {isBn
                                                  ? `সিলেক্টেড (${row.records.filter((r) => selectedDrilldownIds.includes(r.id || "")).length}) Duty Payment এ পাঠান`
                                                  : `Send Selected (${row.records.filter((r) => selectedDrilldownIds.includes(r.id || "")).length}) to Duty Payment`}
                                              </span>
                                            </button>
                                          )}

                                          {/* Send All Records in this group */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              onTransferToDutyPayment(row.records);
                                              setIsPivotModalOpen(false);
                                              showSuccess(
                                                isBn
                                                  ? `এই গ্রুপের সব (${row.records.length} টি) রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                                                  : `Transferred all ${row.records.length} records to Duty Payment!`
                                              );
                                            }}
                                            className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-300 hover:text-white border border-indigo-200 dark:border-indigo-800 font-bold text-xs transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
                                            title={isBn ? "গ্রুপের সব রেকর্ড Duty Payment এ পাঠান" : "Send All Group Records to Duty Payment"}
                                          >
                                            <i className="fa-solid fa-arrow-right-to-bracket text-xs"></i>
                                            <span>{isBn ? "গ্রুপের সব বিল পাঠান" : "Send All Bills"}</span>
                                          </button>
                                        </>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleTogglePivotGroup(row.key)}
                                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded-lg"
                                      >
                                        {isBn ? "লুকান" : "Close"}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto max-h-72 rounded-xl border border-slate-200 dark:border-slate-800">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold sticky top-0 shadow-2xs">
                                        <tr>
                                          <th className="p-2.5 w-8 text-center">
                                            <input
                                              type="checkbox"
                                              checked={allGroupSelected}
                                              onChange={() => {
                                                if (allGroupSelected) {
                                                  setSelectedDrilldownIds((prev) =>
                                                    prev.filter((id) => !groupRecordIds.includes(id))
                                                  );
                                                } else {
                                                  setSelectedDrilldownIds((prev) => [
                                                    ...prev,
                                                    ...groupRecordIds.filter((id) => !prev.includes(id)),
                                                  ]);
                                                }
                                              }}
                                              className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                                              title={isBn ? "এই গ্রুপের সব সিলেক্ট করুন" : "Select all in this group"}
                                            />
                                          </th>
                                          <th className="p-2.5 w-8 text-center">#</th>
                                          <th className="p-2.5">Ref</th>
                                          <th className="p-2.5">Reg No</th>
                                          <th className="p-2.5">Date</th>
                                          <th className="p-2.5">Type</th>
                                          <th className="p-2.5">Status</th>
                                          <th className="p-2.5 text-right">Tax (BDT)</th>
                                          {onTransferToDutyPayment && (
                                            <th className="p-2.5 text-center w-24">Duty Payment</th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                                        {row.records.map((sub, sIdx) => {
                                          const isSelected = selectedDrilldownIds.includes(sub.id || "");
                                          return (
                                            <tr
                                              key={sub.id || sIdx}
                                              className={`transition-colors ${
                                                isSelected
                                                  ? "bg-blue-50/80 dark:bg-blue-950/30"
                                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                              }`}
                                            >
                                              <td className="p-2.5 text-center">
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => {
                                                    const recId = sub.id || "";
                                                    if (!recId) return;
                                                    setSelectedDrilldownIds((prev) =>
                                                      prev.includes(recId)
                                                        ? prev.filter((id) => id !== recId)
                                                        : [...prev, recId]
                                                    );
                                                  }}
                                                  className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                                                />
                                              </td>
                                              <td className="p-2.5 text-slate-400 font-bold text-center">{sIdx + 1}</td>
                                              <td className="p-2.5 font-mono text-slate-700 dark:text-slate-300">{sub.ref || "-"}</td>
                                              <td className="p-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">{sub.regNo || "-"}</td>
                                              <td className="p-2.5 text-slate-500 dark:text-slate-400">{sub.date || "-"}</td>
                                              <td className="p-2.5">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[10px] text-slate-700 dark:text-slate-300">
                                                  {sub.type || "N/A"}
                                                </span>
                                              </td>
                                              <td className="p-2.5">
                                                <span
                                                  className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                                    sub.paymentStatus === "Paid"
                                                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40"
                                                      : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40"
                                                  }`}
                                                >
                                                  {sub.paymentStatus || "Unpaid"}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100">
                                                ৳ {sub.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                              </td>
                                              {onTransferToDutyPayment && (
                                                <td className="p-2.5 text-center">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      onTransferToDutyPayment([sub]);
                                                      setIsPivotModalOpen(false);
                                                      showSuccess(
                                                        isBn
                                                          ? "রেকর্ডটি Duty Payment এ পাঠানো হয়েছে!"
                                                          : "Transferred record to Duty Payment!"
                                                      );
                                                    }}
                                                    className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white border border-blue-200 dark:border-blue-800 text-[10px] font-bold transition-all shadow-2xs active:scale-95 flex items-center justify-center gap-1 mx-auto"
                                                    title={isBn ? "এই বিলটি Duty Payment এ পাঠান" : "Send this bill to Duty Payment"}
                                                  >
                                                    <i className="fa-solid fa-paper-plane"></i>
                                                    <span>{isBn ? "পাঠান" : "Send"}</span>
                                                  </button>
                                                </td>
                                              )}
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>

                {/* Grand Total Sticky Footer */}
                {pivotData.rows.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr
                      className={`border-t-2 text-xs font-bold uppercase ${
                        isDark
                          ? "bg-slate-800 text-slate-100 border-slate-700 shadow-md"
                          : "bg-slate-100 text-slate-900 border-slate-300 shadow-sm"
                      }`}
                    >
                      <td className="py-3 px-3 text-center">∑</td>
                      <td className="py-3 px-4 font-bold tracking-wider text-slate-800 dark:text-slate-100">
                        {isBn ? "সর্বমোট (GRAND TOTAL)" : "GRAND TOTAL"}
                      </td>

                      {pivotColDim === "none" ? (
                        <>
                          {pivotVisibleCols.count && (
                            <td className="py-3 px-3 text-center font-bold">
                              {pivotData.grandTotal.count.toLocaleString()}
                            </td>
                          )}

                          {pivotVisibleCols.totalTax && (
                            <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100 text-sm">
                              ৳ {pivotData.grandTotal.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                            </td>
                          )}

                          {pivotVisibleCols.unpaidTax && (
                            <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 font-bold">
                              ৳ {pivotData.grandTotal.unpaidTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                            </td>
                          )}

                          {pivotVisibleCols.paidTax && (
                            <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                              ৳ {pivotData.grandTotal.paidTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                            </td>
                          )}

                          {pivotVisibleCols.unpaidCount && (
                            <td className="py-3 px-3 text-center text-rose-600 dark:text-rose-400 font-bold">
                              {pivotData.grandTotal.unpaidCount.toLocaleString()}
                            </td>
                          )}

                          {pivotVisibleCols.paidCount && (
                            <td className="py-3 px-3 text-center text-emerald-600 dark:text-emerald-400 font-bold">
                              {pivotData.grandTotal.paidCount.toLocaleString()}
                            </td>
                          )}

                          {pivotVisibleCols.avgTax && (
                            <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400 font-bold">
                              ৳{" "}
                              {(pivotData.grandTotal.count > 0
                                ? pivotData.grandTotal.totalTax / pivotData.grandTotal.count
                                : 0
                              ).toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                            </td>
                          )}

                          {pivotVisibleCols.minTax && (
                            <td className="py-3 px-4 text-right text-slate-400">-</td>
                          )}

                          {pivotVisibleCols.maxTax && (
                            <td className="py-3 px-4 text-right text-slate-400">-</td>
                          )}

                          {pivotVisibleCols.sharePercent && (
                            <td className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400">100.0%</td>
                          )}
                        </>
                      ) : (
                        <>
                          {pivotVisibleCols.count && (
                            <td className="py-3 px-3 text-center font-bold">
                              {pivotData.grandTotal.count.toLocaleString()}
                            </td>
                          )}

                          {activePivotColKeys.map((ck) => {
                            const colData = pivotData.grandTotal.colBreakdown[ck] || { count: 0, totalTax: 0 };
                            return (
                              <td key={ck} className="py-3 px-3 text-right font-bold border-l border-slate-200 dark:border-slate-700">
                                ৳ {colData.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                              </td>
                            );
                          })}

                          {pivotVisibleCols.totalTax && (
                            <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100 text-sm border-l border-slate-200 dark:border-slate-700">
                              ৳ {pivotData.grandTotal.totalTax.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                            </td>
                          )}

                          {pivotVisibleCols.sharePercent && (
                            <td className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400">100.0%</td>
                          )}
                        </>
                      )}

                      {onTransferToDutyPayment && (
                        <td className="py-3 px-2 text-center">-</td>
                      )}

                      <td className="py-3 px-3 text-center">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Sticky Floating Selection Action Bar (when records are selected across drilldowns) */}
            {selectedDrilldownIds.length > 0 && onTransferToDutyPayment && (
              <div className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2.5 font-extrabold text-xs">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
                    <i className="fa-solid fa-list-check"></i>
                  </div>
                  <span>
                    {isBn
                      ? `${selectedDrilldownIds.length} টি রেকর্ড সিলেক্ট করা হয়েছে`
                      : `${selectedDrilldownIds.length} records selected`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const recs = history.filter((r) => selectedDrilldownIds.includes(r.id || ""));
                      if (recs.length > 0) {
                        onTransferToDutyPayment(recs);
                        setIsPivotModalOpen(false);
                        setSelectedDrilldownIds([]);
                        showSuccess(
                          isBn
                            ? `সিলেক্টেড ${recs.length} টি রেকর্ড Duty Payment এ পাঠানো হয়েছে!`
                            : `Transferred ${recs.length} records to Duty Payment!`
                        );
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-black text-xs transition-all shadow-md active:scale-95 flex items-center gap-2"
                  >
                    <i className="fa-solid fa-paper-plane"></i>
                    <span>{isBn ? "Duty Payment এ পাঠান" : "Transfer to Duty Payment"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDrilldownIds([])}
                    className="px-3 py-2 rounded-xl bg-blue-800/60 hover:bg-blue-800 text-white font-bold text-xs transition-all"
                  >
                    {isBn ? "সিলেকশন মুছুন" : "Clear"}
                  </button>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div
              className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 shrink-0 ${
                isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <i className="fa-solid fa-circle-info text-blue-500"></i>
                <span>
                  {isBn
                    ? "টিপস: Drilldown এ গিয়ে নির্দিষ্ট রেকর্ড সিলেক্ট করে বা সরাসরি গ্রুপ রো থেকে Duty Payment এ পাঠাতে পারবেন।"
                    : "Tip: Select specific records in drilldown or send entire groups directly to Duty Payment."}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPivotModalOpen(false)}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs border ${
                    isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {isBn ? "বন্ধ করুন" : "Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Duplicate Records Inspector Modal */}
      {activeDuplicateViewPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div
            className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
              isDark
                ? "bg-slate-900 border-slate-700 text-white"
                : "bg-white border-slate-300 text-slate-900"
            }`}
          >
            {/* Modal Header */}
            <div
              className={`p-5 border-b flex items-center justify-between shrink-0 ${
                isDark ? "bg-slate-800/80 border-slate-700" : "bg-rose-50/70 border-rose-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center font-bold text-lg">
                  <i className="fa-solid fa-clone"></i>
                </div>
                <div>
                  <h3 className="text-base font-black flex items-center gap-2">
                    <span>{isBn ? "ডুপ্লিকেট রেকর্ড পর্যবেক্ষণ" : "Duplicate Records Inspector"}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white font-mono">
                      Year: {activeDuplicateViewPair.year} | Reg No: {activeDuplicateViewPair.regNo}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isBn
                      ? "একই Year এবং Reg No বিশিষ্ট ডাটাবেসে সংরক্ষিত সব এন্ট্রি নিচে তালিকাভুক্ত রয়েছে।"
                      : "All records sharing this identical Year and Reg No are listed below for comparison and management."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveDuplicateViewPair(null)}
                className={`p-2.5 rounded-xl transition-all ${
                  isDark ? "hover:bg-slate-700 text-slate-400 hover:text-white" : "hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                }`}
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {(() => {
                const pairKey = getDuplicateKey(activeDuplicateViewPair.year, activeDuplicateViewPair.regNo);
                const matchingRecords = history.filter(
                  (h) => getDuplicateKey(h.year, h.regNo) === pairKey
                );
                const unpaidTax = matchingRecords
                  .filter((r) => (r.paymentStatus || "Unpaid") !== "Paid")
                  .reduce((sum, r) => sum + (r.totalTax || 0), 0);
                const paidTax = matchingRecords
                  .filter((r) => r.paymentStatus === "Paid")
                  .reduce((sum, r) => sum + (r.totalTax || 0), 0);

                return (
                  <>
                    {/* Summary KPI for this duplicate group */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                        <div className="text-[11px] font-bold text-slate-400 uppercase">
                          {isBn ? "মোট রেকর্ড" : "Matching Entries"}
                        </div>
                        <div className="text-xl font-black text-rose-500 mt-0.5">
                          {matchingRecords.length}
                        </div>
                      </div>
                      <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                        <div className="text-[11px] font-bold text-slate-400 uppercase">
                          {isBn ? "মোট বাকী ট্যাক্স" : "Total Unpaid Tax"}
                        </div>
                        <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
                          ৳ {unpaidTax.toLocaleString("en-BD")}
                        </div>
                      </div>
                      <div className={`p-3.5 rounded-xl border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                        <div className="text-[11px] font-bold text-slate-400 uppercase">
                          {isBn ? "মোট পরিশোধিত" : "Total Paid Tax"}
                        </div>
                        <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          ৳ {paidTax.toLocaleString("en-BD")}
                        </div>
                      </div>
                    </div>

                    {/* Table of duplicates */}
                    <div className={`rounded-2xl border overflow-hidden ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                      <table className="w-full text-left text-xs border-collapse font-mono">
                        <thead className={isDark ? "bg-slate-800 text-slate-300 uppercase text-[10px] font-bold" : "bg-slate-100 text-slate-700 uppercase text-[10px] font-black"}>
                          <tr className={`border-b ${isDark ? "border-slate-700" : "border-slate-300"}`}>
                            <th className="p-3">#</th>
                            <th className="p-3">AIN Name</th>
                            <th className="p-3">AIN No</th>
                            <th className="p-3">Ref</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Total Tax</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {matchingRecords.map((item, i) => (
                            <tr
                              key={item.id}
                              className={isDark ? "hover:bg-slate-800/50" : "hover:bg-slate-50"}
                            >
                              <td className="p-3 font-bold text-slate-400">{i + 1}</td>
                              <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{item.ainName || "-"}</td>
                              <td className="p-3 font-mono text-slate-600 dark:text-slate-300">{item.ainNo || "-"}</td>
                              <td className="p-3 text-slate-500">{item.ref || "-"}</td>
                              <td className="p-3 text-slate-500">{item.date || "-"}</td>
                              <td className="p-3 font-bold text-amber-500">{item.type || "-"}</td>
                              <td className="p-3">
                                {item.paymentStatus === "Paid" ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">Paid</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400">Unpaid</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-black text-rose-600 dark:text-rose-400">
                                {(item.totalTax || 0).toLocaleString("en-BD")}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDuplicateViewPair(null);
                                      handleOpenEditModal(item);
                                    }}
                                    className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                    title="Edit"
                                  >
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteRecord(item.id);
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                                    title="Delete"
                                  >
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div
              className={`p-4 px-6 border-t flex items-center justify-end shrink-0 ${
                isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveDuplicateViewPair(null)}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs border ${
                  isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {isBn ? "বন্ধ করুন" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AinTaxManagement;
