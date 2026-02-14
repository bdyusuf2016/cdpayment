type PrintOptions = {
  excludeColumnIndexes?: number[];
  autoExcludeControls?: boolean;
  grandTotal?: {
    label?: string;
    value: string | number;
  };
  replaceTakaWithBDT?: boolean;
  showCurrencyInHeader?: boolean;
  totalRecordCount?: {
    label?: string;
    value: number;
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

  if (options.autoExcludeControls) {
    const headerCells = Array.from(table.querySelectorAll("thead th"));
    headerCells.forEach((th, idx) => {
      const txt = (th.textContent || "").trim().toLowerCase();
      const hasCheckbox = !!th.querySelector('input[type="checkbox"]');
      if (
        hasCheckbox ||
        txt === "controls" ||
        txt === "actions" ||
        txt === "control"
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
    const currencyHeaderKeywords = [
      "amount",
      "net",
      "received",
      "profit",
      "payable",
      "total",
      "value",
    ];
    table.querySelectorAll("thead th").forEach((th) => {
      const text = (th.textContent || "").trim();
      const lower = text.toLowerCase();
      const isCurrencyCol = currencyHeaderKeywords.some((k) =>
        lower.includes(k),
      );
      if (isCurrencyCol && !lower.includes("bdt")) {
        th.textContent = `${text} (BDT)`;
      }
    });
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

  if (options.totalRecordCount) {
    const headerCount = table.querySelectorAll("thead th").length;
    const colCount = Math.max(headerCount, 2);
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    }

    const countRow = document.createElement("tr");
    for (let i = 0; i < colCount; i += 1) {
      const cell = document.createElement("td");
      if (i === colCount - 2) {
        cell.style.textAlign = "right";
        cell.style.fontWeight = "700";
        cell.textContent = options.totalRecordCount.label || "Total Records";
      } else if (i === colCount - 1) {
        cell.style.fontWeight = "800";
        cell.style.textAlign = "right";
        cell.textContent = String(options.totalRecordCount.value);
      } else {
        cell.textContent = "";
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
          body { font-family: Inter, 'Segoe UI', Arial, sans-serif; padding: 20px; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { padding: 10px; border: 1px solid #cbd5e1; }
          th { background: #f8fafc; font-weight: 700; text-align: left; }
          thead tr { background: #f1f5f9; }
          .title { font-size: 16px; font-weight: 800; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        ${title ? `<div class="title">${title}</div>` : ""}
        ${table.outerHTML}
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
