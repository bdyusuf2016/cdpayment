export function printElement(el: HTMLElement | null, title = "") {
  if (!el) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

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
        ${el.outerHTML}
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
