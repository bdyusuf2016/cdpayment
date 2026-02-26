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
          reportDutyRows: "Duty Records",
          reportAssessmentRows: "Assessment Records",
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
          reportDutyRows: "ডিউটি রেকর্ড",
          reportAssessmentRows: "অ্যাসেসমেন্ট রেকর্ড",
          reportEmpty: "এই রেঞ্জে কোনো লেনদেন নেই।",
        };

  const dailyDuty = useMemo(
    () =>
      dutyHistory.filter((rec) => isWithinRange(rec.date, startDate, endDate)),
    [dutyHistory, endDate, startDate],
  );
  const dailyAssessment = useMemo(
    () =>
      assessmentHistory.filter((rec) =>
        isWithinRange(rec.date, startDate, endDate),
      ),
    [assessmentHistory, endDate, startDate],
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
    dailyDuty.forEach((rec) => {
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
    dailyAssessment.forEach((rec) => {
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
    const combinedEntries = [
      ...dailyDuty.map((rec) => ({
        id: rec.id,
        date: rec.date,
        type: "Duty",
        client: rec.clientName,
        ref: rec.beYear,
        amount: rec.duty || 0,
        received: rec.received || 0,
      })),
      ...dailyAssessment.map((rec) => ({
        id: rec.id,
        date: rec.date,
        type: "Assessment",
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
      { key: "date", width: 9, align: "left" as const },
      { key: "type", width: 9, align: "left" as const },
      { key: "client", width: 16, align: "left" as const },
      { key: "ref", width: 9, align: "left" as const },
      { key: "debit", width: 11, align: "right" as const },
      { key: "credit", width: 11, align: "right" as const },
      { key: "balance", width: 11, align: "right" as const },
    ];

    const pad = (value: string, width: number, align: "left" | "right") => {
      const trimmed = value.length > width ? value.slice(0, width) : value;
      return align === "right"
        ? trimmed.padStart(width, " ")
        : trimmed.padEnd(width, " ");
    };

    const makeRow = (cells: string[]) => {
      const padded = cells.map((cell, idx) =>
        pad(cell, colDefs[idx].width, colDefs[idx].align),
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
        "Type",
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
          "OPEN",
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
          "OPEN",
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
        statementLines.push(
          makeRow([
            entry.date,
            entry.type,
            entry.client || "",
            entry.ref || "",
            debit.toFixed(2),
            credit.toFixed(2),
            runningBalance.toFixed(2),
          ]),
        );
        statementLines.push(makeDivider("-"));
      });
    }

    statementLines.push(makeDivider("="));
    statementLines.push(
      makeRow([
        endDate,
        "TOTAL",
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
    const marginX = 24;
    const usableWidth = pageWidth - marginX * 2;
    const autoSize = Math.floor(usableWidth / (0.6 * Math.max(1, maxChars)));
    const fontSize = Math.min(11, Math.max(7, autoSize));

    const pdfBlob = createSimplePdfBlob(
      "TRANSACTION STATEMENT",
      lines,
      "Courier",
      fontSize,
      marginX,
      810,
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
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
          <div className="space-y-2">
            <h4 className="font-black uppercase text-xs tracking-widest text-blue-600 flex items-center gap-2">
              <i className="fas fa-chart-line"></i> {t.report}
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {t.reportRange}
              </label>
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
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
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadDailyCsv}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg transition-all"
            >
              <i className="fas fa-file-csv mr-2"></i>
              {t.reportCsv}
            </button>
            <button
              onClick={downloadDailyPdf}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg transition-all"
            >
              <i className="fas fa-file-pdf mr-2"></i>
              {t.reportPdf}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div
            className={`p-4 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}
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
            className={`p-4 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}
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
            className={`p-4 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
          >
            <div
              className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {t.reportDutyRows}
              </p>
              <span className="text-[10px] font-bold text-slate-400">
                {dailyDuty.length}
              </span>
            </div>
            {dailyDuty.length === 0 ? (
              <p className="px-4 py-6 text-xs font-bold text-slate-400">
                {t.reportEmpty}
              </p>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-xs">
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
                    {dailyDuty.map((rec) => (
                      <tr key={rec.id}>
                        <td className="px-4 py-2">{rec.date}</td>
                        <td className="px-4 py-2">{rec.clientName}</td>
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

          <div
            className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}
          >
            <div
              className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "border-slate-700" : "border-slate-200"}`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {t.reportAssessmentRows}
              </p>
              <span className="text-[10px] font-bold text-slate-400">
                {dailyAssessment.length}
              </span>
            </div>
            {dailyAssessment.length === 0 ? (
              <p className="px-4 py-6 text-xs font-bold text-slate-400">
                {t.reportEmpty}
              </p>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-xs">
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
                        BE
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
                    {dailyAssessment.map((rec) => {
                      const base =
                        rec.net && rec.net > 0 ? rec.net : rec.amount || 0;
                      return (
                        <tr key={rec.id}>
                          <td className="px-4 py-2">{rec.date}</td>
                          <td className="px-4 py-2">{rec.clientName}</td>
                          <td className="px-4 py-2">{rec.nosOfBe}</td>
                          <td className="px-4 py-2 text-right">
                            {formatMoney(base)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {formatMoney(rec.received || 0)}
                          </td>
                          <td className="px-4 py-2 text-center">{rec.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyReport;
