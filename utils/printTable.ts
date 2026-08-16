import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type PrintOptions = {
  header?: {
    organization?: string;
    subtext?: string;
  };
  excludeColumnIndexes?: number[];
  autoExcludeControls?: boolean;
  grandTotal?: {
    label?: string;
    value: string | number;
  };
  replaceTakaWithBDT?: boolean;
  showCurrencyInHeader?: boolean;
  centerColumnsByHeader?: string[];
  totalRecordCount?: {
    label?: string;
    value: number;
    labelColumnHeader?: string;
    valueColumnHeader?: string;
    additionalValuesByHeader?: Record<string, string | number>;
  };
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
};

function preparePrintTableNode(
  el: HTMLElement,
  options: PrintOptions = {},
) {
  const table = el.cloneNode(true) as HTMLElement;
  const excluded = new Set<number>(options.excludeColumnIndexes || []);
  const getHeaderCells = () => Array.from(table.querySelectorAll("thead th"));
  const normalizeHeader = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .replace(/\(bdt\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return "";
    if (dateStr.includes("/")) return dateStr;
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  table.querySelectorAll("button").forEach((button) => {
    const replacement = document.createElement("span");
    replacement.textContent = (button.textContent || "").trim();
    button.replaceWith(replacement);
  });

  // Remove non-cell elements with no-print, print-hidden, or data-print-exclude
  table.querySelectorAll(".no-print, .print-hidden, [data-print-exclude]").forEach((el) => {
    if (el.tagName !== "TH" && el.tagName !== "TD") {
      el.remove();
    }
  });

  if (options.autoExcludeControls) {
    const headerCells = Array.from(table.querySelectorAll("thead th"));
    headerCells.forEach((th, idx) => {
      const txt = (th.textContent || "").trim().toLowerCase();
      const hasCheckbox = !!th.querySelector('input[type="checkbox"]');
      if (
        hasCheckbox ||
        txt === "controls" ||
        txt === "actions" ||
        txt === "control" ||
        txt === "action" ||
        txt === "select" ||
        txt.includes("অ্যাকশন") ||
        txt === "transfer" ||
        txt === "drilldown" ||
        txt === "duty payment" ||
        txt === "বিবরণ" ||
        th.hasAttribute("data-print-exclude") ||
        th.classList.contains("no-print") ||
        th.classList.contains("print-hidden")
      ) {
        excluded.add(idx);
      }
    });
  }

  if (excluded.size > 0) {
    const sortedExcluded = Array.from(excluded).sort((a, b) => b - a);

    table.querySelectorAll("tr").forEach((tr) => {
      const rawCells = Array.from(
        tr.querySelectorAll<HTMLTableCellElement>("th, td")
      );

      // Build a map of grid column indices to cell objects
      let gridColIdx = 0;
      const cellMap: {
        cell: HTMLTableCellElement;
        colStart: number;
        colEnd: number;
      }[] = [];
      rawCells.forEach((cell) => {
        const span = cell.colSpan || 1;
        cellMap.push({
          cell,
          colStart: gridColIdx,
          colEnd: gridColIdx + span - 1,
        });
        gridColIdx += span;
      });

      // Exclude target columns in descending order
      sortedExcluded.forEach((targetColIdx) => {
        const itemIndex = cellMap.findIndex(
          (item) => item.colStart <= targetColIdx && targetColIdx <= item.colEnd
        );
        if (itemIndex >= 0) {
          const item = cellMap[itemIndex];
          const currentSpan = item.cell.colSpan || 1;
          if (currentSpan > 1) {
            item.cell.colSpan = currentSpan - 1;
            item.colEnd -= 1;
            for (let i = itemIndex + 1; i < cellMap.length; i++) {
              cellMap[i].colStart -= 1;
              cellMap[i].colEnd -= 1;
            }
          } else {
            item.cell.remove();
            cellMap.splice(itemIndex, 1);
            for (let i = itemIndex; i < cellMap.length; i++) {
              cellMap[i].colStart -= 1;
              cellMap[i].colEnd -= 1;
            }
          }
        }
      });
    });
  }

  if (options.replaceTakaWithBDT) {
    table.querySelectorAll("th, td").forEach((cell) => {
      if (
        cell.textContent?.includes("৳") ||
        cell.textContent?.includes("BDT")
      ) {
        cell.textContent = cell.textContent
          .replace(/৳\s*/g, "")
          .replace(/\bBDT\s*/g, "");
      }
    });
  }

  if (options.showCurrencyInHeader) {
    const currencyColIndexes: number[] = [];
    const currencyHeaderKeywords = [
      "amount",
      "net",
      "received",
      "profit",
      "payable",
      "total",
      "value",
    ];
    getHeaderCells().forEach((th, idx) => {
      const text = (th.textContent || "").trim();
      const lower = text.toLowerCase();
      const isCurrencyCol = currencyHeaderKeywords.some((k) =>
        lower.includes(k),
      );
      if (isCurrencyCol && !lower.includes("bdt")) {
        th.textContent = `${text} (BDT)`;
      }
      if (isCurrencyCol) currencyColIndexes.push(idx);
    });

    const formatTwoDecimals = (raw: string) => {
      const cleaned = raw.replace(/[^\d.-]/g, "");
      const num = Number(cleaned);
      if (Number.isNaN(num)) return raw;
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    if (currencyColIndexes.length > 0) {
      table.querySelectorAll("thead th").forEach((th, idx) => {
        if (currencyColIndexes.includes(idx)) {
          (th as HTMLElement).style.textAlign = "right";
        }
      });

      table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        currencyColIndexes.forEach((colIdx) => {
          const td = cells[colIdx];
          if (!td) return;
          td.style.textAlign = "right";
          td.textContent = formatTwoDecimals((td.textContent || "").trim());
        });
      });
    }
  }

  if (options.grandTotal) {
    const headerCount = table.querySelectorAll("thead th").length;
    const colCount = Math.max(headerCount, 2);
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    } else {
      tfoot.innerHTML = "";
    }

    const totalRow = document.createElement("tr");
    for (let i = 0; i < colCount; i += 1) {
      const cell = document.createElement("td");
      if (i === colCount - 2) {
        cell.style.textAlign = "right";
        cell.style.fontWeight = "700";
        cell.textContent = options.grandTotal.label || "Grand Total";
      } else if (i === colCount - 1) {
        cell.style.fontWeight = "800";
        cell.style.textAlign = "right";
        cell.textContent = String(options.grandTotal.value);
      } else {
        cell.textContent = "";
      }
      totalRow.appendChild(cell);
    }
    tfoot.appendChild(totalRow);
  }

  if (options.centerColumnsByHeader && options.centerColumnsByHeader.length > 0) {
    const targetSet = new Set(
      options.centerColumnsByHeader.map((h) => normalizeHeader(h)),
    );
    const centerIdxs = getHeaderCells()
      .map((th, idx) => ({ idx, key: normalizeHeader(th.textContent || "") }))
      .filter((x) => targetSet.has(x.key))
      .map((x) => x.idx);

    if (centerIdxs.length > 0) {
      table.querySelectorAll("thead th").forEach((th, idx) => {
        if (centerIdxs.includes(idx)) {
          (th as HTMLElement).style.textAlign = "center";
        }
      });
      table.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        centerIdxs.forEach((idx) => {
          const td = cells[idx];
          if (!td) return;
          td.style.textAlign = "center";
        });
      });
    }
  }

  if (options.totalRecordCount) {
    const headers = getHeaderCells();
    const headerCount = headers.length;
    const colCount = Math.max(headerCount, 2);
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    }

    const resolveHeaderIndex = (name?: string) => {
      if (!name) return -1;
      const target = normalizeHeader(name);
      return headers.findIndex(
        (th) => normalizeHeader(th.textContent || "") === target,
      );
    };

    const labelIdx = (() => {
      const resolved = resolveHeaderIndex(options.totalRecordCount?.labelColumnHeader);
      return resolved >= 0 ? resolved : Math.max(colCount - 2, 0);
    })();
    const valueIdx = (() => {
      const resolved = resolveHeaderIndex(options.totalRecordCount?.valueColumnHeader);
      return resolved >= 0 ? resolved : colCount - 1;
    })();

    const countRow = document.createElement("tr");
    const additionalMap = options.totalRecordCount.additionalValuesByHeader || {};
    const additionalIndexes = Object.entries(additionalMap)
      .map(([header, value]) => ({ idx: resolveHeaderIndex(header), value }))
      .filter((it) => it.idx >= 0);

    for (let i = 0; i < colCount; i += 1) {
      const cell = document.createElement("td");
      if (i === labelIdx) {
        cell.style.textAlign = "right";
        cell.style.fontWeight = "700";
        cell.textContent = options.totalRecordCount.label || "Total";
      } else if (i === valueIdx) {
        cell.style.fontWeight = "800";
        cell.style.textAlign = "right";
        cell.textContent = String(options.totalRecordCount.value);
      } else {
        const extra = additionalIndexes.find((x) => x.idx === i);
        if (extra) {
          cell.style.fontWeight = "800";
          cell.style.textAlign = "right";
          cell.textContent = String(extra.value);
        } else {
          cell.textContent = "";
        }
      }
      countRow.appendChild(cell);
    }
    tfoot.appendChild(countRow);
  }

  return { table, formatDateDisplay };
}

export function printElement(
  el: HTMLElement | null,
  title = "",
  options: PrintOptions = {},
) {
  if (!el) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const { table, formatDateDisplay } = preparePrintTableNode(el, options);

  const orgHeader =
    options.header?.organization ||
    "Customs Bond Commissionerate, Dhaka (South), DEPZ Division";

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title || "Print"}</title>
        <style>
          .no-print, .print-hidden, [data-print-exclude] {
            display: none !important;
          }
          @page { 
            margin: 10mm 10mm 18mm 10mm; 
            size: auto;
            @bottom-right {
              content: "Page " counter(page) " of " counter(pages);
              font-family: 'Segoe UI', Arial, sans-serif;
              font-size: 10px;
              font-weight: 700;
              color: #475569;
            }
            @bottom-left {
              content: "${orgHeader.replace(/"/g, '\\"').replace(/'/g, "\\'")}";
              font-family: 'Segoe UI', Arial, sans-serif;
              font-size: 10px;
              font-weight: 700;
              color: #475569;
            }
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding-bottom: 40px;
            color: #0f172a;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .sheet {
            width: 100%;
          }
          .title {
            font-size: 18px;
            font-weight: 800;
            margin: 0 0 4px;
            letter-spacing: 0.02em;
            color: #0f172a;
          }
          .brand {
            margin: 0 0 2px;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #1d4ed8;
          }
          .subtext {
            margin: 0 0 10px;
            color: #334155;
            font-size: 11px;
          }
          .meta {
            margin: 0 0 14px;
            color: #475569;
            font-size: 11px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            background: #ffffff !important;
          }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; page-break-inside: avoid; }
          tr { page-break-inside: avoid; background: transparent !important; }
          th, td {
            padding: 7px 9px;
            border: 1px solid #475569; /* Darker border for print clarity */
            vertical-align: middle;
            line-height: 1.3;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          th {
            background: #ffffff !important;
            color: #0f172a !important;
            font-weight: 800;
            text-align: left;
            white-space: normal; /* Enables wrapping */
            word-wrap: break-word;
          }
          th.text-right, td.text-right, .text-right {
            text-align: right !important;
          }
          th.text-center, td.text-center, .text-center {
            text-align: center !important;
          }
          .flex-col, td div.flex-col, th div.flex-col {
            display: flex !important;
            flex-direction: column !important;
          }
          th span.block, th .block, td span.block, td .block, .block {
            display: block !important;
            margin-top: 2px !important;
          }
          th div, td div {
            line-height: 1.25 !important;
          }
          tbody tr td {
            background: #ffffff !important;
          }
          tbody tr:nth-child(even) td {
            background: #ffffff !important;
          }
          tfoot td {
            background: #ffffff !important;
            color: #0f172a !important;
            font-weight: 800;
            border-top: 2px solid #0f172a;
          }
          span, div, label, p {
            background: transparent !important;
            background-color: transparent !important;
            font: inherit;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="brand">${orgHeader}</div>
          ${title ? `<div class="title">${title}</div>` : ""}
          ${options.header?.subtext ? `<div class="subtext">${options.header.subtext}</div>` : ""}
          ${options.dateRange && (options.dateRange.startDate || options.dateRange.endDate) ? `
            <div style="margin: 4px 0 10px; font-size: 11px; font-weight: 700; color: #1d4ed8; font-family: 'Segoe UI', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.05em;">
              Date Filter: ${options.dateRange.startDate ? formatDateDisplay(options.dateRange.startDate) : "Beginning"} to ${options.dateRange.endDate ? formatDateDisplay(options.dateRange.endDate) : "End"}
            </div>
          ` : ""}
          <div class="meta">Printed on ${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
          ${table.outerHTML}
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  // Give the print window a moment to render
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (e) {
      // ignore
    }
  }, 300);
}

export async function exportPrintLayoutToPdfBlob(
  el: HTMLElement | null,
  title = "",
  options: PrintOptions = {},
): Promise<Blob | null> {
  if (!el) return null;

  const { table, formatDateDisplay } = preparePrintTableNode(el, options);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = "1150px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
  container.style.padding = "24px";
  container.style.boxSizing = "border-box";

  const printDate = new Date();
  const dateStr = printDate.toLocaleDateString("en-GB");
  const timeStr = printDate.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const headerHtml = `
    <style>
      .no-print, .print-hidden, [data-print-exclude] { display: none !important; }
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; color: #0f172a; background: #ffffff; }
      .sheet { width: 100%; }
      .title { font-size: 20px; font-weight: 800; margin: 0 0 4px; letter-spacing: 0.02em; color: #0f172a; }
      .brand { margin: 0 0 2px; font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #1d4ed8; }
      .subtext { margin: 0 0 10px; color: #334155; font-size: 11px; }
      .meta { margin: 0 0 14px; color: #475569; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; background: #ffffff !important; }
      tr { page-break-inside: avoid; background: transparent !important; }
      th, td { padding: 8px 10px; border: 1px solid #475569; vertical-align: middle; line-height: 1.3; background: #ffffff !important; color: #0f172a !important; }
      th { background: #ffffff !important; color: #0f172a !important; font-weight: 800; text-align: left; white-space: normal; word-wrap: break-word; }
      th span.block, th .block, td span.block, td .block, .block { display: block !important; margin-top: 2px !important; }
      th div, td div { line-height: 1.25 !important; }
      tbody tr td { background: #ffffff !important; }
      tbody tr:nth-child(even) td { background: #ffffff !important; }
      tfoot td { background: #ffffff !important; color: #0f172a !important; font-weight: 800; border-top: 2px solid #0f172a; }
      span, div, label, p { background: transparent !important; background-color: transparent !important; }
    </style>
    <div class="sheet">
      ${options.header?.organization ? `<div class="brand">${options.header.organization}</div>` : ""}
      ${title ? `<div class="title">${title}</div>` : ""}
      ${options.header?.subtext ? `<div class="subtext">${options.header.subtext}</div>` : ""}
      ${
        options.dateRange && (options.dateRange.startDate || options.dateRange.endDate)
          ? `<div style="margin: 4px 0 10px; font-size: 11px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.05em;">
              Date Filter: ${options.dateRange.startDate ? formatDateDisplay(options.dateRange.startDate) : "Beginning"} to ${options.dateRange.endDate ? formatDateDisplay(options.dateRange.endDate) : "End"}
            </div>`
          : ""
      }
      <div class="meta">Printed on ${dateStr} ${timeStr}</div>
      ${table.outerHTML}
    </div>
  `;

  container.innerHTML = headerHtml;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    const isLandscape = imgWidth > imgHeight * 1.1;
    const pdf = new jsPDF({
      orientation: isLandscape ? "l" : "p",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgScaledHeight = (imgHeight * pdfWidth) / imgWidth;

    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgScaledHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgScaledHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 5) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgScaledHeight);
      heightLeft -= pdfHeight;
    }

    return pdf.output("blob");
  } catch (err) {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    console.error("Error generating print layout PDF:", err);
    return null;
  }
}

