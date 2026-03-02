import React, { useMemo, useState } from "react";
import { PaymentRecord, AssessmentRecord, SystemConfig } from "../types";
import { createSimplePdfBlob } from "../utils/simplePdf";

interface DailyReportProps {
  dutyHistory: PaymentRecord[];
  assessmentHistory: AssessmentRecord[];
  systemConfig: SystemConfig;
}

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

const isWithinRange = (
  dateStr: string,
  startDate: string,
  endDate: string,
): boolean => {
  if (!dateStr || !startDate || !endDate) return false;
  const parsed = parseDate(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return parsed >= start && parsed <= end;
};

const DailyReport: React.FC<DailyReportProps> = ({
  dutyHistory,
  assessmentHistory,
  systemConfig,
}) => {
  const [startDate, setStartDate] = useState(getTodayDateInputValue);
  const [endDate, setEndDate] = useState(getTodayDateInputValue);
  const [ainFilter, setAinFilter] = useState("");
  const [groupByStatus, setGroupByStatus] = useState<"all" | "paid" | "due">("all");
  const [activeView, setActiveView] = useState<
    "combined" | "duty" | "assessment"
  >("combined");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid">("all");
  const [dutyClientFilter, setDutyClientFilter] = useState("all");
  const [showDutyClientGroups, setShowDutyClientGroups] = useState(true);
  const isDark = systemConfig.theme === "dark";

  const t =
    systemConfig.language === "en"
      ? {
          report: "Daily Transaction Report",
          reportRange: "Report Range",
          reportFrom: "From",
          reportTo: "To",
          reportCsv: "Download CSV",
          reportPdf: "Download PDF",
          reportDuty: "Duty Summary",
          reportAssessment: "Assessment Summary",
          reportCombined: "Combined Summary",
          reportCollection: "Collection",
          reportDutyRows: "Duty Records",
          reportAssessmentRows: "Assessment Records",
          reportDutySection: "Duty Report",
          reportAssessmentSection: "Assessment Report",
          reportCombinedSection: "Combined",
          reportEmpty: "No transactions for this date range.",
        }
      : {
          report: "দৈনিক লেনদেন রিপোর্ট",
          reportRange: "রিপোর্ট রেঞ্জ",
          reportFrom: "থেকে",
          reportTo: "পর্যন্ত",
          reportCsv: "CSV ডাউনলোড",
          reportPdf: "PDF ডাউনলোড",
          reportDuty: "ডিউটি সামারি",
          reportAssessment: "অ্যাসেসমেন্ট সামারি",
          reportCombined: "কম্বাইন্ড সামারি",
          reportCollection: "কালেকশন",
          reportDutyRows: "ডিউটি রেকর্ড",
          reportAssessmentRows: "অ্যাসেসমেন্ট রেকর্ড",
          reportDutySection: "ডিউটি রিপোর্ট",
          reportAssessmentSection: "অ্যাসেসমেন্ট রিপোর্ট",
          reportCombinedSection: "কম্বাইন্ড",
          reportEmpty: "এই রেঞ্জে কোনো লেনদেন নেই।",
        };

  const normalizedAinFilter = ainFilter.trim().toLowerCase();
  const isPaidStatus = (status: string | null | undefined) =>
    String(status || "").trim().toLowerCase() === "paid";
  const applyStatusGroup = <T extends { status?: string | null }>(rows: T[]) => {
    if (groupByStatus === "paid") {
      return rows.filter((rec) => isPaidStatus(rec.status));
    }
    if (groupByStatus === "due") {
      return rows.filter((rec) => !isPaidStatus(rec.status));
    }
    return rows;
  };

  const dailyDuty = useMemo(
    () =>
      dutyHistory.filter((rec) => {
        const inRange = isWithinRange(rec.date, startDate, endDate);
        if (!inRange) return false;
        if (!normalizedAinFilter) return true;
        return String(rec.ain || "").toLowerCase().includes(normalizedAinFilter);
      }),
    [dutyHistory, endDate, normalizedAinFilter, startDate],
  );
  const dailyAssessment = useMemo(
    () =>
      assessmentHistory.filter((rec) => {
        const inRange = isWithinRange(rec.date, startDate, endDate);
        if (!inRange) return false;
        if (!normalizedAinFilter) return true;
        return String(rec.ain || "").toLowerCase().includes(normalizedAinFilter);
      }),
    [assessmentHistory, endDate, normalizedAinFilter, startDate],
  );

  const paidDuty = useMemo(
    () =>
      dailyDuty.filter(
        (rec) => String(rec.status || "").trim().toLowerCase() === "paid",
      ),
    [dailyDuty],
  );
  const paidAssessment = useMemo(
    () =>
      dailyAssessment.filter(
        (rec) => String(rec.status || "").trim().toLowerCase() === "paid",
      ),
    [dailyAssessment],
  );

  const dutyBase = statusFilter === "paid" ? paidDuty : dailyDuty;
  const dutyByClient = dutyClientFilter === "all"
    ? dutyBase
    : dutyBase.filter((rec) => rec.clientName === dutyClientFilter);
  const visibleDuty = applyStatusGroup(dutyByClient);

  const dutyClientOptions = useMemo(() => {
    const names = dailyDuty
      .map((rec) => rec.clientName)
      .filter((name) => Boolean(name && name.trim().length > 0));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [dailyDuty]);

  const dutyClientGroups = useMemo(() => {
    const groups = new Map<string, typeof visibleDuty>();
    visibleDuty.forEach((rec) => {
      const key = rec.clientName || "Unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rec);
    });
    return Array.from(groups.entries()).map(([client, rows]) => ({
      client,
      rows,
    }));
  }, [visibleDuty]);

  const exportDutyRows = useMemo(
    () => applyStatusGroup(dailyDuty),
    [dailyDuty, groupByStatus],
  );
  const exportAssessmentRows = useMemo(
    () => applyStatusGroup(dailyAssessment),
    [dailyAssessment, groupByStatus],
  );

  const dutySummary = useMemo(() => {
    const totalAmount = dailyDuty.reduce((sum, rec) => sum + (rec.duty || 0), 0);
    const totalReceived = dailyDuty.reduce(
      (sum, rec) => sum + (rec.received || 0),
      0,
    );
    const totalDue = dailyDuty.reduce(
      (sum, rec) =>
        sum + Math.max(0, (rec.duty || 0) - (rec.received || 0)),
      0,
    );
    const totalProfit = dailyDuty.reduce(
      (sum, rec) => sum + (rec.profit || 0),
      0,
    );
    return {
      count: dailyDuty.length,
      amount: totalAmount,
      received: totalReceived,
      due: totalDue,
      profit: totalProfit,
    };
  }, [dailyDuty]);

  const dutyPaidSubtotal = useMemo(
    () =>
      visibleDuty
        .filter((rec) => isPaidStatus(rec.status))
        .reduce((sum, rec) => sum + (rec.duty || 0), 0),
    [visibleDuty],
  );

  const clientNameByAin = useMemo(() => {
    const map = new Map<string, string>();
    const writeName = (ainValue: string | null | undefined, rawName: string | null | undefined) => {
      const ain = String(ainValue || "").trim();
      const name = String(rawName || "").trim();
      if (!ain || !name) return;
      if (!map.has(ain)) {
        map.set(ain, name);
      }
    };

    dutyHistory.forEach((rec) => writeName(rec.ain, rec.clientName));
    assessmentHistory.forEach((rec) => writeName(rec.ain, rec.clientName));
    return map;
  }, [assessmentHistory, dutyHistory]);

  const allTimeDueByAin = useMemo(() => {
    const grouped = new Map<
      string,
      {
        ain: string;
        client: string;
        totalBe: number;
        duty: number;
      }
    >();

    dutyHistory.forEach((rec) => {
      const ain = String(rec.ain || "").trim() || "N/A";
      const fallbackClient = clientNameByAin.get(ain) || "-";
      const current = grouped.get(ain) || {
        ain,
        client: String(rec.clientName || "").trim() || fallbackClient,
        totalBe: 0,
        duty: 0,
      };

      const due = Math.max(0, (rec.duty || 0) - (rec.received || 0));
      if (due > 0) {
        current.totalBe += 1;
        current.duty += due;
        if (
          current.client === "-" &&
          rec.clientName &&
          rec.clientName.trim().length > 0
        ) {
          current.client = rec.clientName;
        }
      }
      grouped.set(ain, current);
    });

    return Array.from(grouped.values())
      .filter((row) => row.duty > 0)
      .sort((a, b) => b.duty - a.duty);
  }, [clientNameByAin, dutyHistory]);

  const assessmentSummary = useMemo(() => {
    const totalAmount = dailyAssessment.reduce((sum, rec) => {
      const base = rec.net && rec.net > 0 ? rec.net : rec.amount || 0;
      return sum + base;
    }, 0);
    const totalReceived = dailyAssessment.reduce(
      (sum, rec) => sum + (rec.received || 0),
      0,
    );
    const totalDue = dailyAssessment.reduce((sum, rec) => {
      const base = rec.net && rec.net > 0 ? rec.net : rec.amount || 0;
      return sum + Math.max(0, base - (rec.received || 0));
    }, 0);
    const totalProfit = dailyAssessment.reduce(
      (sum, rec) => sum + (rec.profit || 0),
      0,
    );
    return {
      count: dailyAssessment.length,
      amount: totalAmount,
      received: totalReceived,
      due: totalDue,
      profit: totalProfit,
    };
  }, [dailyAssessment]);

  const combinedSummary = useMemo(
    () => ({
      count: dutySummary.count + assessmentSummary.count,
      amount: dutySummary.amount + assessmentSummary.amount,
      received: dutySummary.received + assessmentSummary.received,
      due: dutySummary.due + assessmentSummary.due,
      profit: dutySummary.profit + assessmentSummary.profit,
    }),
    [assessmentSummary, dutySummary],
  );

  const formatMoney = (value: number) => `Tk ${value.toLocaleString("en-BD")}`;

  const clearFilters = () => {
    const today = getTodayDateInputValue();
    setStartDate(today);
    setEndDate(today);
    setAinFilter("");
    setGroupByStatus("all");
  };

  const toCsvValue = (value: string | number | null | undefined) => {
    const str = String(value ?? "");
    if (str.includes("\"") || str.includes(",") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  };

  const downloadDailyCsv = () => {
    const lines: string[] = [];
    lines.push(`Report Range,${startDate} to ${endDate}`);
    if (ainFilter.trim()) {
      lines.push(`AIN Filter,${ainFilter.trim()}`);
    }
    if (groupByStatus !== "all") {
      lines.push(`Status Group,${groupByStatus.toUpperCase()}`);
    }
    lines.push("");
    lines.push("Summary,Transactions,Amount,Received,Due,Profit");
    lines.push(
      `Duty,${dutySummary.count},${dutySummary.amount},${dutySummary.received},${dutySummary.due},${dutySummary.profit}`,
    );
    lines.push(
      `Assessment,${assessmentSummary.count},${assessmentSummary.amount},${assessmentSummary.received},${assessmentSummary.due},${assessmentSummary.profit}`,
    );
    lines.push(
      `Combined,${combinedSummary.count},${combinedSummary.amount},${combinedSummary.received},${combinedSummary.due},${combinedSummary.profit}`,
    );
    lines.push("");

    if (activeView === "duty") {
      dutyClientGroups.forEach((group) => {
        lines.push(`Client,${group.client}`);
        lines.push(
          [
            "Date",
            "AIN",
            "Phone",
            "B/E",
            "Duty",
            "Received",
            "Status",
            "Profit",
            "Payment Method",
          ].join(","),
        );
        group.rows.forEach((rec) => {
          lines.push(
            [
              rec.date,
              rec.ain,
              rec.phone,
              rec.beYear,
              rec.duty ?? 0,
              rec.received ?? 0,
              rec.status ?? "",
              rec.profit ?? 0,
              rec.paymentMethod ?? "",
            ]
              .map(toCsvValue)
              .join(","),
          );
        });
        lines.push("");
      });
    } else {
      lines.push("Duty Payments");
      lines.push(
        [
          "Date",
          "AIN",
          "Client",
          "Phone",
          "B/E",
          "Duty",
          "Received",
          "Status",
          "Profit",
          "Payment Method",
        ].join(","),
      );
      exportDutyRows.forEach((rec) => {
        lines.push(
          [
            rec.date,
            rec.ain,
            rec.clientName,
            rec.phone,
            rec.beYear,
            rec.duty ?? 0,
            rec.received ?? 0,
            rec.status ?? "",
            rec.profit ?? 0,
            rec.paymentMethod ?? "",
          ]
            .map(toCsvValue)
            .join(","),
        );
      });
      lines.push("");
      lines.push("Assessments");
      lines.push(
        [
          "Date",
          "AIN",
          "Client",
          "Phone",
          "No of BE",
          "Rate",
          "Amount",
          "Discount",
          "Net",
          "Received",
          "Status",
          "Profit",
          "Payment Method",
        ].join(","),
      );
      exportAssessmentRows.forEach((rec) => {
        lines.push(
          [
            rec.date,
            rec.ain,
            rec.clientName,
            rec.phone,
            rec.nosOfBe ?? 0,
            rec.rate ?? 0,
            rec.amount ?? 0,
            rec.discount ?? 0,
            rec.net ?? 0,
            rec.received ?? 0,
            rec.status ?? "",
            rec.profit ?? 0,
            rec.paymentMethod ?? "",
          ]
            .map(toCsvValue)
            .join(","),
        );
      });
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transaction-report-${startDate}_to_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadDailyPdf = () => {
    if (activeView === "duty") {
      const lines: string[] = [];
      lines.push(`Report Range: ${startDate} to ${endDate}`);
      if (ainFilter.trim()) {
        lines.push(`AIN Filter: ${ainFilter.trim()}`);
      }
      if (groupByStatus !== "all") {
        lines.push(`Status Group: ${groupByStatus.toUpperCase()}`);
      }
      lines.push("Module: Duty");
      lines.push("");
      lines.push("CLIENT-WISE DUTY REPORT");
      const colDefs = [
        { key: "date", width: 10, align: "left" as const },
        { key: "ain", width: 10, align: "left" as const },
        { key: "be", width: 12, align: "left" as const },
        { key: "duty", width: 10, align: "right" as const },
        { key: "received", width: 10, align: "right" as const },
        { key: "status", width: 10, align: "left" as const },
      ];

      const pad = (value: string, width: number, align: "left" | "right") => {
        const trimmed = value.length > width ? value.slice(0, width) : value;
        return align === "right"
          ? trimmed.padStart(width, " ")
          : trimmed.padEnd(width, " ");
      };
      const clamp = (value: string, width: number) => {
        if (value.length <= width) return value;
        if (width <= 3) return value.slice(0, width);
        return `${value.slice(0, width - 3)}...`;
      };
      const makeRow = (cells: string[]) => {
        const padded = cells.map((cell, idx) =>
          pad(clamp(cell, colDefs[idx].width), colDefs[idx].width, colDefs[idx].align),
        );
        return `| ${padded.join(" | ")} |`;
      };
      const makeDivider = (char: string) =>
        `+${colDefs.map((col) => char.repeat(col.width + 2)).join("+")}+`;

      dutyClientGroups.forEach((group, idx) => {
        lines.push(`Client: ${group.client}`);
        lines.push(makeDivider("-"));
        lines.push(
          makeRow(["Date", "AIN", "B/E", "Amount", "Received", "Status"]),
        );
        lines.push(makeDivider("="));
        group.rows.forEach((rec) => {
          lines.push(
            makeRow([
              rec.date,
              rec.ain || "",
              rec.beYear || "",
              (rec.duty || 0).toFixed(2),
              (rec.received || 0).toFixed(2),
              rec.status || "",
            ]),
          );
          lines.push(makeDivider("-"));
        });
        if (idx < dutyClientGroups.length - 1) {
          lines.push("");
        }
      });

      const maxChars = lines.reduce(
        (max, line) => Math.max(max, line.length),
        0,
      );
      const pageWidth = 595;
      const baseMargin = 12;
      const usableWidth = pageWidth - baseMargin * 2;
      const autoSize = Math.floor(usableWidth / (0.6 * Math.max(1, maxChars)));
      const fontSize = Math.min(12, Math.max(8, autoSize));
      const tableWidth = Math.ceil(maxChars * fontSize * 0.6);
      const marginX = Math.max(
        8,
        Math.floor((pageWidth - tableWidth) / 2),
      );

      const pdfBlob = createSimplePdfBlob(
        "DUTY CLIENT REPORT",
        lines,
        "Courier",
        fontSize,
        marginX,
        820,
        { showPageNumbers: true, bottomMargin: 20, lineHeight: Math.max(10, Math.round(fontSize * 1.1)) },
      );
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `duty-client-report-${startDate}_to_${endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }
    const combinedEntries = [
      ...exportDutyRows.map((rec) => ({
        id: rec.id,
        date: rec.date,
        type: "Duty",
        ain: rec.ain,
        client: rec.clientName,
        ref: rec.beYear,
        amount: rec.duty || 0,
        received: rec.received || 0,
      })),
      ...exportAssessmentRows.map((rec) => ({
        id: rec.id,
        date: rec.date,
        type: "Assessment",
        ain: rec.ain,
        client: rec.clientName,
        ref: String(rec.nosOfBe ?? ""),
        amount: rec.net && rec.net > 0 ? rec.net : rec.amount || 0,
        received: rec.received || 0,
      })),
    ].sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

    const startBoundary = new Date(startDate);
    startBoundary.setHours(0, 0, 0, 0);

    const openingBalance =
      dutyHistory.reduce((sum, rec) => {
        const parsed = parseDate(rec.date);
        if (parsed < startBoundary) {
          return sum + (rec.received || 0) - (rec.duty || 0);
        }
        return sum;
      }, 0) +
      assessmentHistory.reduce((sum, rec) => {
        const parsed = parseDate(rec.date);
        if (parsed < startBoundary) {
          const amount = rec.net && rec.net > 0 ? rec.net : rec.amount || 0;
          return sum + (rec.received || 0) - amount;
        }
        return sum;
      }, 0);

    const lines: string[] = [];
    lines.push(`Report Range: ${startDate} to ${endDate}`);
    if (ainFilter.trim()) {
      lines.push(`AIN Filter: ${ainFilter.trim()}`);
    }
    if (groupByStatus !== "all") {
      lines.push(`Status Group: ${groupByStatus.toUpperCase()}`);
    }
    lines.push(`Statement Style: Bank Statement`);
    lines.push("");
    lines.push("SUMMARY");
    lines.push(
      `Duty: ${dutySummary.count} | Amount ${formatMoney(dutySummary.amount)} | Received ${formatMoney(dutySummary.received)} | Due ${formatMoney(dutySummary.due)} | Profit ${formatMoney(dutySummary.profit)}`,
    );
    lines.push(
      `Assessment: ${assessmentSummary.count} | Amount ${formatMoney(assessmentSummary.amount)} | Received ${formatMoney(assessmentSummary.received)} | Due ${formatMoney(assessmentSummary.due)} | Profit ${formatMoney(assessmentSummary.profit)}`,
    );
    lines.push(
      `Combined: ${combinedSummary.count} | Amount ${formatMoney(combinedSummary.amount)} | Received ${formatMoney(combinedSummary.received)} | Due ${formatMoney(combinedSummary.due)} | Profit ${formatMoney(combinedSummary.profit)}`,
    );
    lines.push("");
    lines.push("STATEMENT");
    const colDefs = [
      { key: "date", width: 10, align: "left" as const },
      { key: "ain", width: 10, align: "left" as const },
      { key: "client", width: 17, align: "left" as const },
      { key: "ref", width: 8, align: "left" as const },
      { key: "debit", width: 9, align: "right" as const },
      { key: "credit", width: 9, align: "right" as const },
      { key: "balance", width: 9, align: "right" as const },
    ];

    const pad = (value: string, width: number, align: "left" | "right") => {
      const trimmed = value.length > width ? value.slice(0, width) : value;
      return align === "right"
        ? trimmed.padStart(width, " ")
        : trimmed.padEnd(width, " ");
    };
    const clamp = (value: string, width: number) => {
      if (value.length <= width) return value;
      if (width <= 3) return value.slice(0, width);
      return `${value.slice(0, width - 3)}...`;
    };
    const wrapText = (value: string, width: number) => {
      if (!value) return [""];
      const parts: string[] = [];
      let cursor = value;
      while (cursor.length > 0) {
        parts.push(cursor.slice(0, width));
        cursor = cursor.slice(width);
      }
      return parts.length === 0 ? [""] : parts;
    };

    const makeRow = (cells: string[]) => {
      const padded = cells.map((cell, idx) =>
        pad(clamp(cell, colDefs[idx].width), colDefs[idx].width, colDefs[idx].align),
      );
      return `| ${padded.join(" | ")} |`;
    };
    const makeDivider = (char: string) =>
      `+${colDefs.map((col) => char.repeat(col.width + 2)).join("+")}+`;

    const statementLines: string[] = [];
    statementLines.push(makeDivider("-"));
    statementLines.push(
      makeRow([
        "Date",
        "AIN",
        "Client",
        "Ref",
        "Debit",
        "Credit",
        "Balance",
      ]),
    );
    statementLines.push(makeDivider("="));

    let runningBalance = openingBalance;
    const totalDebit = combinedEntries.reduce(
      (sum, entry) => sum + (entry.amount || 0),
      0,
    );
    const totalCredit = combinedEntries.reduce(
      (sum, entry) => sum + (entry.received || 0),
      0,
    );

    if (combinedEntries.length === 0) {
      statementLines.push(
        makeRow([
          startDate,
          "-",
          "Opening Balance",
          "-",
          "-",
          "-",
          runningBalance.toFixed(2),
        ]),
      );
      statementLines.push(makeDivider("-"));
      statementLines.push(
        makeRow(["-", "-", "No transactions", "-", "-", "-", "-"]),
      );
      statementLines.push(makeDivider("-"));
    } else {
      statementLines.push(
        makeRow([
          startDate,
          "-",
          "Opening Balance",
          "-",
          "-",
          "-",
          runningBalance.toFixed(2),
        ]),
      );
      statementLines.push(makeDivider("-"));
      combinedEntries.forEach((entry) => {
        const debit = entry.amount || 0;
        const credit = entry.received || 0;
        runningBalance += credit - debit;
        const clientLines = wrapText(entry.client || "", colDefs[2].width);
        const refLines = wrapText(entry.ref || "", colDefs[3].width);
        const lineCount = Math.max(clientLines.length, refLines.length);
        for (let i = 0; i < lineCount; i += 1) {
          const isFirst = i === 0;
          statementLines.push(
            makeRow([
              isFirst ? entry.date : "",
              isFirst ? entry.ain || "" : "",
              clientLines[i] || "",
              refLines[i] || "",
              isFirst ? debit.toFixed(2) : "",
              isFirst ? credit.toFixed(2) : "",
              isFirst ? runningBalance.toFixed(2) : "",
            ]),
          );
        }
        statementLines.push(makeDivider("-"));
      });
    }

    statementLines.push(makeDivider("="));
    statementLines.push(
      makeRow([
        endDate,
        "-",
        "Totals",
        "-",
        totalDebit.toFixed(2),
        totalCredit.toFixed(2),
        runningBalance.toFixed(2),
      ]),
    );
    statementLines.push(makeDivider("="));

    lines.push(...statementLines);

    const maxChars = statementLines.reduce(
      (max, line) => Math.max(max, line.length),
      0,
    );
    const pageWidth = 595;
    const baseMargin = 12;
    const usableWidth = pageWidth - baseMargin * 2;
    const autoSize = Math.floor(usableWidth / (0.6 * Math.max(1, maxChars)));
    const fontSize = Math.min(12, Math.max(8, autoSize));
    const tableWidth = Math.ceil(maxChars * fontSize * 0.6);
    const marginX = Math.max(
      8,
      Math.floor((pageWidth - tableWidth) / 2),
    );

    const pdfBlob = createSimplePdfBlob(
      "TRANSACTION STATEMENT",
      lines,
      "Courier",
      fontSize,
      marginX,
      820,
      { showPageNumbers: true, bottomMargin: 20, lineHeight: Math.max(10, Math.round(fontSize * 1.1)) },
    );
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transaction-report-${startDate}_to_${endDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className={`p-8 rounded-[2rem] border shadow-xl transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
      >
        <div className="mb-6">
          <h4 className="font-black uppercase text-xs tracking-widest text-blue-600 flex items-center gap-2 mb-3">
            <i className="fas fa-chart-line"></i> {t.report}
          </h4>
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {t.reportRange}
              </label>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {t.reportFrom}
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStartDate(next);
                    if (endDate && next > endDate) {
                      setEndDate(next);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {t.reportTo}
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEndDate(next);
                    if (startDate && next < startDate) {
                      setStartDate(next);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  AIN
                </span>
                <input
                  type="text"
                  value={ainFilter}
                  onChange={(e) => setAinFilter(e.target.value)}
                  placeholder="Search by AIN"
                  className={`px-4 py-2 rounded-lg border text-xs font-bold outline-none w-44 ${isDark ? "bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500" : "bg-white border-slate-300 text-slate-800 placeholder-slate-400"}`}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Group by Status
                </span>
                <select
                  value={groupByStatus}
                  onChange={(e) =>
                    setGroupByStatus(e.target.value as "all" | "paid" | "due")
                  }
                  className={`px-4 py-2 rounded-lg border text-xs font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
                >
                  <option value="all">All</option>
                  <option value="paid">Paid</option>
                  <option value="due">Due</option>
                </select>
              </div>
            <button
              onClick={clearFilters}
              className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                isDark
                  ? "bg-slate-900 border-slate-600 text-slate-200 hover:bg-slate-800"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <i className="fas fa-eraser mr-1"></i>
              Clear
            </button>
            <button
              onClick={downloadDailyCsv}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest shadow transition-all shrink-0"
            >
              <i className="fas fa-file-csv mr-1"></i>
              {t.reportCsv}
            </button>
            <button
              onClick={downloadDailyPdf}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest shadow transition-all shrink-0"
            >
              <i className="fas fa-file-pdf mr-1"></i>
              {t.reportPdf}
            </button>
          </div>
        </div>

        <div className="space-y-6 mb-6">
          <div>
            <h5
              className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              {t.reportDutySection}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveView("duty");
                  setStatusFilter("all");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveView("duty");
                    setStatusFilter("all");
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeView === "duty" && statusFilter === "all"
                    ? isDark
                      ? "bg-emerald-900/40 border-emerald-500/60"
                      : "bg-emerald-50 border-emerald-300"
                    : isDark
                      ? "bg-slate-900 border-slate-700 hover:border-emerald-500/50"
                      : "bg-slate-50 border-slate-200 hover:border-emerald-300"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  {t.reportDuty}
                </p>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span>Transactions</span>
                    <span>{dutySummary.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Amount</span>
                    <span>{formatMoney(dutySummary.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Received</span>
                    <span>{formatMoney(dutySummary.received)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Due</span>
                    <span>{formatMoney(dutySummary.due)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Profit</span>
                    <span>{formatMoney(dutySummary.profit)}</span>
                  </div>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveView("duty");
                  setStatusFilter("paid");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveView("duty");
                    setStatusFilter("paid");
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeView === "duty" && statusFilter === "paid"
                    ? isDark
                      ? "bg-green-900/30 border-green-500/60"
                      : "bg-green-50 border-green-300"
                    : isDark
                      ? "bg-slate-900 border-slate-700 hover:border-green-500/50"
                      : "bg-slate-50 border-slate-200 hover:border-green-300"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  {t.reportCollection}
                </p>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span>Paid</span>
                    <span>{paidDuty.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Received</span>
                    <span>
                      {formatMoney(
                        paidDuty.reduce(
                          (sum, rec) => sum + (rec.received || 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {activeView === "duty" && (
              <div
                className={`mt-4 p-4 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                  isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Client Filter
                  </span>
                  <select
                    className={`px-3 py-2 rounded-lg border text-xs font-bold outline-none ${
                      isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-700"
                    }`}
                    value={dutyClientFilter}
                    onChange={(e) => setDutyClientFilter(e.target.value)}
                  >
                    <option value="all">All Clients</option>
                    {dutyClientOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <input
                    type="checkbox"
                    checked={showDutyClientGroups}
                    onChange={(e) => setShowDutyClientGroups(e.target.checked)}
                  />
                  Client-wise Sections
                </label>
              </div>
            )}
          </div>

          <div>
            <h5
              className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              {t.reportAssessmentSection}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveView("assessment");
                  setStatusFilter("all");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveView("assessment");
                    setStatusFilter("all");
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeView === "assessment" && statusFilter === "all"
                    ? isDark
                      ? "bg-amber-900/30 border-amber-500/60"
                      : "bg-amber-50 border-amber-300"
                    : isDark
                      ? "bg-slate-900 border-slate-700 hover:border-amber-500/50"
                      : "bg-slate-50 border-slate-200 hover:border-amber-300"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  {t.reportAssessment}
                </p>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span>Transactions</span>
                    <span>{assessmentSummary.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Amount</span>
                    <span>{formatMoney(assessmentSummary.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Received</span>
                    <span>{formatMoney(assessmentSummary.received)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Due</span>
                    <span>{formatMoney(assessmentSummary.due)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Profit</span>
                    <span>{formatMoney(assessmentSummary.profit)}</span>
                  </div>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveView("assessment");
                  setStatusFilter("paid");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveView("assessment");
                    setStatusFilter("paid");
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeView === "assessment" && statusFilter === "paid"
                    ? isDark
                      ? "bg-green-900/30 border-green-500/60"
                      : "bg-green-50 border-green-300"
                    : isDark
                      ? "bg-slate-900 border-slate-700 hover:border-green-500/50"
                      : "bg-slate-50 border-slate-200 hover:border-green-300"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  {t.reportCollection}
                </p>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span>Paid</span>
                    <span>{paidAssessment.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Received</span>
                    <span>
                      {formatMoney(
                        paidAssessment.reduce(
                          (sum, rec) => sum + (rec.received || 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h5
              className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              {t.reportCombinedSection}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveView("combined");
                  setStatusFilter("all");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveView("combined");
                    setStatusFilter("all");
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeView === "combined" && statusFilter === "all"
                    ? isDark
                      ? "bg-blue-900/30 border-blue-500/60"
                      : "bg-blue-50 border-blue-300"
                    : isDark
                      ? "bg-slate-900 border-slate-700 hover:border-blue-500/50"
                      : "bg-slate-50 border-slate-200 hover:border-blue-300"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  {t.reportCombined}
                </p>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span>Transactions</span>
                    <span>{combinedSummary.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Amount</span>
                    <span>{formatMoney(combinedSummary.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Received</span>
                    <span>{formatMoney(combinedSummary.received)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Due</span>
                    <span>{formatMoney(combinedSummary.due)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Profit</span>
                    <span>{formatMoney(combinedSummary.profit)}</span>
                  </div>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveView("combined");
                  setStatusFilter("paid");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveView("combined");
                    setStatusFilter("paid");
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  activeView === "combined" && statusFilter === "paid"
                    ? isDark
                      ? "bg-green-900/30 border-green-500/60"
                      : "bg-green-50 border-green-300"
                    : isDark
                      ? "bg-slate-900 border-slate-700 hover:border-green-500/50"
                      : "bg-slate-50 border-slate-200 hover:border-green-300"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  {t.reportCollection}
                </p>
                <div className="space-y-2 text-xs font-bold">
                  <div className="flex items-center justify-between">
                    <span>Paid</span>
                    <span>{paidDuty.length + paidAssessment.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Duty Received</span>
                    <span>
                      {formatMoney(
                        paidDuty.reduce(
                          (sum, rec) => sum + (rec.received || 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Assessment Received</span>
                    <span>
                      {formatMoney(
                        paidAssessment.reduce(
                          (sum, rec) => sum + (rec.received || 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total Received</span>
                    <span>
                      {formatMoney(
                        paidDuty.reduce(
                          (sum, rec) => sum + (rec.received || 0),
                          0,
                        ) +
                          paidAssessment.reduce(
                            (sum, rec) => sum + (rec.received || 0),
                            0,
                          ),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`grid gap-4 ${
            activeView === "combined" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {(activeView === "combined" || activeView === "duty") && (
            <div
              className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
            >
              <div
                className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t.reportDutyRows}
                </p>
                <div className="text-right space-y-1">
                  <span className="block text-[10px] font-bold text-slate-400">
                    {visibleDuty.length}
                  </span>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-emerald-500">
                    Paid Subtotal: {formatMoney(dutyPaidSubtotal)}
                  </span>
                </div>
              </div>
              {visibleDuty.length === 0 ? (
                <p className="px-4 py-6 text-xs font-bold text-slate-400">
                  {t.reportEmpty}
                </p>
              ) : (
                <div className="max-h-[24rem] overflow-y-auto overflow-x-auto overscroll-contain">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead
                      className={`${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-500"}`}
                    >
                      <tr>
                        <th className="px-4 py-2 font-black uppercase tracking-widest">
                          Date
                        </th>
                        <th className="px-4 py-2 font-black uppercase tracking-widest">
                          Client
                        </th>
                        <th className="px-4 py-2 font-black uppercase tracking-widest">
                          AIN
                        </th>
                        <th className="px-4 py-2 font-black uppercase tracking-widest">
                          B/E
                        </th>
                        <th className="px-4 py-2 font-black uppercase tracking-widest text-right">
                          Amount
                        </th>
                        <th className="px-4 py-2 font-black uppercase tracking-widest text-right">
                          Received
                        </th>
                        <th className="px-4 py-2 font-black uppercase tracking-widest text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
                      {visibleDuty.map((rec) => (
                        <tr key={rec.id}>
                          <td className="px-4 py-2">{rec.date}</td>
                        <td className="px-4 py-2">{rec.clientName}</td>
                        <td className="px-4 py-2">{rec.ain}</td>
                        <td className="px-4 py-2">{rec.beYear}</td>
                          <td className="px-4 py-2 text-right">
                            {formatMoney(rec.duty || 0)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {formatMoney(rec.received || 0)}
                          </td>
                          <td className="px-4 py-2 text-center">{rec.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeView === "duty" && showDutyClientGroups && (
            <div className="space-y-4">
              {dutyClientGroups.map((group) => (
                <div
                  key={group.client}
                  className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
                >
                  <div
                    className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {group.client}
                    </p>
                    <span className="text-[10px] font-bold text-slate-400">
                      {group.rows.length}
                    </span>
                  </div>
                  {group.rows.length === 0 ? (
                    <p className="px-4 py-6 text-xs font-bold text-slate-400">
                      {t.reportEmpty}
                    </p>
                  ) : (
                    <div className="max-h-[24rem] overflow-y-auto overflow-x-auto overscroll-contain">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead
                          className={`${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-500"}`}
                        >
                          <tr>
                            <th className="px-4 py-2 font-black uppercase tracking-widest">
                              Date
                            </th>
                            <th className="px-4 py-2 font-black uppercase tracking-widest">
                              AIN
                            </th>
                            <th className="px-4 py-2 font-black uppercase tracking-widest">
                              B/E
                            </th>
                            <th className="px-4 py-2 font-black uppercase tracking-widest text-right">
                              Amount
                            </th>
                            <th className="px-4 py-2 font-black uppercase tracking-widest text-right">
                              Received
                            </th>
                            <th className="px-4 py-2 font-black uppercase tracking-widest text-center">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
                          {group.rows.map((rec) => (
                            <tr key={rec.id}>
                              <td className="px-4 py-2">{rec.date}</td>
                              <td className="px-4 py-2">{rec.ain}</td>
                              <td className="px-4 py-2">{rec.beYear}</td>
                              <td className="px-4 py-2 text-right">
                                {formatMoney(rec.duty || 0)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {formatMoney(rec.received || 0)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {rec.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(activeView === "combined" || activeView === "assessment") && (
            <div
              className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
            >
              <div
                className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  AIN-wise Due Summary
                </p>
                <span className="text-[10px] font-bold text-slate-400">
                  {allTimeDueByAin.length} AIN
                </span>
              </div>
              {allTimeDueByAin.length === 0 ? (
                <p className="px-4 py-6 text-xs font-bold text-slate-400">
                  No due balance found.
                </p>
              ) : (
                <div className="max-h-[24rem] overflow-y-auto overflow-x-auto overscroll-contain">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead
                      className={`${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-500"}`}
                    >
                      <tr>
                    <th className="px-4 py-2 font-black uppercase tracking-widest">
                      AIN
                    </th>
                    <th className="px-4 py-2 font-black uppercase tracking-widest">
                      Client
                    </th>
                    <th className="px-4 py-2 font-black uppercase tracking-widest text-right">
                      Total B/E
                    </th>
                    <th className="px-4 py-2 font-black uppercase tracking-widest text-right">
                      Duty
                    </th>
                  </tr>
                </thead>
                <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
                  {allTimeDueByAin.map((row) => (
                    <tr key={row.ain}>
                      <td className="px-4 py-2 font-bold">{row.ain}</td>
                      <td className="px-4 py-2">{row.client}</td>
                      <td className="px-4 py-2 text-right">
                        {row.totalBe}
                      </td>
                      <td className="px-4 py-2 text-right font-black text-rose-500">
                        {formatMoney(row.duty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyReport;
