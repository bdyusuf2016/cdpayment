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

export function printElement(
  el: HTMLElement | null,
  title = "",
  options: PrintOptions = {},
) {
  if (!el) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

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
    const removeByIndex = (cells: Element[]) => {
      Array.from(excluded)
        .sort((a, b) => b - a)
        .forEach((idx) => {
          const cell = cells[idx];
          if (cell) cell.remove();
        });
    };

    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th, td"));
      removeByIndex(cells);
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

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title || "Print"}</title>
        <style>
          @page { margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            color: #0f172a;
            background: #ffffff;
          }
          .sheet {
            width: 100%;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            margin: 0 0 4px;
            letter-spacing: 0.02em;
          }
          .brand {
            margin: 0 0 2px;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.08em;
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
            font-size: 12px;
          }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          th, td {
            padding: 9px 10px;
            border: 1px solid #cbd5e1;
            vertical-align: top;
          }
          th {
            background: #e2e8f0;
            color: #0f172a;
            font-weight: 800;
            text-align: left;
            white-space: nowrap;
          }
          tbody tr:nth-child(even) td {
            background: #f8fafc;
          }
          tfoot td {
            background: #eef2ff;
            font-weight: 800;
          }
          span {
            font: inherit;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${options.header?.organization ? `<div class="brand">${options.header.organization}</div>` : ""}
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
      // Optionally close after printing
      // printWindow.close();
    } catch (e) {
      // ignore
    }
  }, 300);
}
