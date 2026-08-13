const toAscii = (value: string) =>
  value
    .replace(/৳\s*/g, "Tk ")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\r?\n/g, " ");

const escapePdfText = (value: string) =>
  toAscii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export const createSimplePdfBlob = (
  title: string,
  lines: string[],
  fontName: "Helvetica" | "Courier" = "Helvetica",
  fontSize = 11,
  startX = 40,
  startY = 810,
  options?: {
    repeatTitle?: boolean;
    lineHeight?: number;
    bottomMargin?: number;
    linesPerPage?: number;
    showPageNumbers?: boolean;
    pageSize?: 'A4' | 'Letter' | 'Legal' | 'A3';
    orientation?: 'Portrait' | 'Landscape';
    scale?: number;
  },
): Blob => {
  const repeatTitle = Boolean(options?.repeatTitle);
  const bottomMargin = options?.bottomMargin ?? 40;
  
  const size = options?.pageSize ?? 'A4';
  const orientation = options?.orientation ?? 'Portrait';
  const scale = options?.scale ?? 1;

  let baseWidth = 595;
  let baseHeight = 842;

  if (size === 'Letter') {
    baseWidth = 612;
    baseHeight = 792;
  } else if (size === 'Legal') {
    baseWidth = 612;
    baseHeight = 1008;
  } else if (size === 'A3') {
    baseWidth = 842;
    baseHeight = 1191;
  }

  const pageWidth = orientation === 'Landscape' ? baseHeight : baseWidth;
  const pageHeight = orientation === 'Landscape' ? baseWidth : baseHeight;

  // A4 standard height is 842. Top margin is 842 - startY.
  // We keep the top margin consistent relative to the new page height.
  const topMargin = 842 - startY;
  const adjustedStartY = pageHeight - topMargin;

  const scaledFontSize = fontSize * scale;
  const rawLineHeight = options?.lineHeight ?? Math.max(12, Math.round(fontSize * 1.3));
  const scaledLineHeight = rawLineHeight * scale;

  const availableHeight = adjustedStartY - bottomMargin;
  const computedLinesPerPage = Math.max(
    1,
    Math.floor(availableHeight / scaledLineHeight),
  );
  
  let linesPerPage = options?.linesPerPage ?? computedLinesPerPage;
  if (options?.linesPerPage !== undefined) {
    // Caller set linesPerPage based on A4 height (842) and standard scaling.
    // Adjust by available height ratio and scale.
    const standardAvailableHeight = startY - bottomMargin;
    const heightRatio = availableHeight / standardAvailableHeight;
    linesPerPage = Math.max(1, Math.round((options.linesPerPage * heightRatio) / scale));
  }

  const baseLines = [title, "", ...lines];
  const pages: string[][] = [];

  if (repeatTitle) {
    const payload = [...lines];
    while (payload.length > 0) {
      const pageLines = [title, ""];
      pageLines.push(...payload.splice(0, linesPerPage - 2));
      pages.push(pageLines);
    }
  } else {
    const payload = [...baseLines];
    while (payload.length > 0) {
      pages.push(payload.splice(0, linesPerPage));
    }
  }

  const pageCount = pages.length;

  const buildStream = (pageLines: string[], pageIndex: number) => {
    const streamLines = [
      "BT",
      `/F1 ${scaledFontSize} Tf`,
      `${startX} ${adjustedStartY} Td`,
    ];
    pageLines.forEach((line, idx) => {
      if (idx > 0) {
        streamLines.push(`0 -${scaledLineHeight} Td`);
      }
      streamLines.push(`(${escapePdfText(line)}) Tj`);
    });
    streamLines.push("ET");

    if (options?.showPageNumbers) {
      const pageLabel = `Page ${pageIndex + 1} of ${pageCount}`;
      const footerY = Math.max(20, bottomMargin - 14);
      const labelWidth = pageLabel.length * Math.max(5, scaledFontSize * 0.6);
      const centerX = Math.max(40, Math.floor((pageWidth - labelWidth) / 2));
      streamLines.push("BT");
      streamLines.push(`/F1 ${Math.max(8, scaledFontSize - 1)} Tf`);
      streamLines.push(`${centerX} ${footerY} Td`);
      streamLines.push(`(${escapePdfText(pageLabel)}) Tj`);
      streamLines.push("ET");
    }
    return streamLines.join("\n");
  };

  const fontId = 3 + pageCount * 2;
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kidRefs = Array.from({ length: pageCount }, (_, idx) => {
    const pageId = 3 + idx * 2;
    return `${pageId} 0 R`;
  }).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kidRefs}] /Count ${pageCount} >>`);

  pages.forEach((pageLines, idx) => {
    const pageId = 3 + idx * 2;
    const streamId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    const stream = buildStream(pageLines, idx);
    const streamLen = new TextEncoder().encode(stream).length;
    objects.push(`<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`);
  });

  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

export interface TableColumnSpec {
  header: string;
  width?: number;
  align?: "left" | "center" | "right";
}

export interface CreateTablePdfOptions {
  title: string;
  subtitle?: string;
  metaLines?: string[];
  summaryItems?: Array<{ label: string; value: string }>;
  columns: TableColumnSpec[];
  rows: Array<Array<string | number>>;
  totalsRow?: Array<string | number>;
  pageSize?: "A4" | "Letter" | "Legal" | "A3";
  orientation?: "Portrait" | "Landscape";
  fontName?: "Helvetica" | "Courier";
  showPageNumbers?: boolean;
}

export const createTablePdfBlob = (options: CreateTablePdfOptions): Blob => {
  const size = options.pageSize ?? "A4";
  const orientation = options.orientation ?? "Portrait";
  const fontName = options.fontName ?? "Helvetica";
  const showPageNumbers = options.showPageNumbers ?? true;

  let baseWidth = 595;
  let baseHeight = 842;
  if (size === "Letter") {
    baseWidth = 612;
    baseHeight = 792;
  } else if (size === "Legal") {
    baseWidth = 612;
    baseHeight = 1008;
  } else if (size === "A3") {
    baseWidth = 842;
    baseHeight = 1191;
  }

  const pageWidth = orientation === "Landscape" ? baseHeight : baseWidth;
  const pageHeight = orientation === "Landscape" ? baseWidth : baseHeight;

  const marginLeft = 30;
  const marginRight = 30;
  const marginTop = 35;
  const marginBottom = 35;
  const printableWidth = pageWidth - marginLeft - marginRight;

  // Calculate actual column widths
  const rawWeights = options.columns.map((c) => c.width || 1);
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);
  const colWidths = rawWeights.map((w) =>
    Math.floor((w / totalWeight) * printableWidth),
  );
  // Give remaining pixels to last column
  const sumWidths = colWidths.reduce((a, b) => a + b, 0);
  if (sumWidths < printableWidth) {
    colWidths[colWidths.length - 1] += printableWidth - sumWidths;
  }

  const wrapHeaderText = (
    headerText: string,
    width: number,
    fontSize: number,
  ): string[] => {
    const ascii = toAscii(headerText);
    if (ascii.includes("\n")) {
      return ascii.split("\n").map((s) => s.trim());
    }

    const charW = fontName === "Courier" ? fontSize * 0.6 : fontSize * 0.52;
    const maxCharsPerLine = Math.max(1, Math.floor((width - 6) / charW));

    if (ascii.length <= maxCharsPerLine) return [ascii];

    const words = ascii.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + " " + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });

    if (currentLine) lines.push(currentLine);
    return lines.slice(0, 2);
  };

  const parsedHeaders = options.columns.map((col, idx) =>
    wrapHeaderText(col.header, colWidths[idx], 8.5),
  );
  const maxHeaderLines = Math.max(
    1,
    ...parsedHeaders.map((lines) => lines.length),
  );
  const headerRowHeight = maxHeaderLines > 1 ? 28 : 20;
  const bodyRowHeight = 18;
  const totalsRowHeight = 20;

  const wrapCellText = (
    str: string,
    width: number,
    fontSize = 8,
    maxLines = 2,
  ): string[] => {
    if (str.includes("\n")) {
      const explicitLines = str.split("\n").map((s) => toAscii(s.trim()));
      return explicitLines.slice(0, maxLines);
    }

    const ascii = toAscii(str);
    const charRatio = fontName === "Courier" ? 0.6 : 0.51;
    const maxCharsPerLine = Math.max(1, Math.floor((width - 6) / (fontSize * charRatio)));

    if (ascii.length <= maxCharsPerLine) return [ascii];

    const words = ascii.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + " " + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });

    if (currentLine) lines.push(currentLine);
    return lines.slice(0, maxLines);
  };

  const getFitCellText = (str: string, width: number, defaultFontSize = 8) => {
    const ascii = toAscii(str);
    const charRatio = fontName === "Courier" ? 0.6 : 0.51;
    let fontSize = defaultFontSize;
    let textWidth = ascii.length * (fontSize * charRatio);
    const availWidth = Math.max(10, width - 4);

    while (textWidth > availWidth && fontSize > 5.5) {
      fontSize -= 0.4;
      textWidth = ascii.length * (fontSize * charRatio);
    }

    return { text: ascii, fontSize, textWidth };
  };

  const pagesCommands: string[][] = [];
  let currentCmds: string[] = [];

  const startNewPage = () => {
    if (currentCmds.length > 0) {
      pagesCommands.push(currentCmds);
    }
    currentCmds = [];
  };

  startNewPage();

  let y = pageHeight - marginTop;
  let isFirstPage = true;

  // Draw Page Header & Summary (Page 1) - Printer Friendly (Monochrome)
  const drawFirstPageHeader = () => {
    // Title
    currentCmds.push("BT");
    currentCmds.push(`/F1 15 Tf`);
    currentCmds.push(`0 0 0 rg`); // Pure black
    currentCmds.push(`${marginLeft} ${y - 12} Td`);
    currentCmds.push(`(${escapePdfText(options.title)}) Tj`);
    currentCmds.push("ET");
    y -= 22;

    // Subtitle / Agency Name
    if (options.subtitle) {
      currentCmds.push("BT");
      currentCmds.push(`/F1 10 Tf`);
      currentCmds.push(`0.15 0.15 0.15 rg`);
      currentCmds.push(`${marginLeft} ${y - 8} Td`);
      currentCmds.push(`(${escapePdfText(options.subtitle)}) Tj`);
      currentCmds.push("ET");
      y -= 16;
    }

    // Meta Lines
    if (options.metaLines && options.metaLines.length > 0) {
      options.metaLines.forEach((meta) => {
        currentCmds.push("BT");
        currentCmds.push(`/F1 8.5 Tf`);
        currentCmds.push(`0.2 0.2 0.2 rg`);
        currentCmds.push(`${marginLeft} ${y - 7} Td`);
        currentCmds.push(`(${escapePdfText(meta)}) Tj`);
        currentCmds.push("ET");
        y -= 13;
      });
    }

    y -= 4;

    // Summary Card Box (Monochrome Printer Friendly)
    if (options.summaryItems && options.summaryItems.length > 0) {
      const summaryBoxHeight = 26;
      // White box with thin black border
      currentCmds.push(`1 1 1 rg`);
      currentCmds.push(
        `${marginLeft} ${y - summaryBoxHeight} ${printableWidth} ${summaryBoxHeight} re f`,
      );
      currentCmds.push(`0 0 0 RG`);
      currentCmds.push(`0.6 w`);
      currentCmds.push(
        `${marginLeft} ${y - summaryBoxHeight} ${printableWidth} ${summaryBoxHeight} re S`,
      );

      // Draw items in inline columns
      const itemWidth = Math.floor(printableWidth / options.summaryItems.length);
      options.summaryItems.forEach((item, idx) => {
        const itemX = marginLeft + idx * itemWidth + 8;
        const itemY = y - 17;
        currentCmds.push("BT");
        currentCmds.push(`/F1 8 Tf`);
        currentCmds.push(`0 0 0 rg`);
        currentCmds.push(`${itemX} ${itemY} Td`);
        currentCmds.push(
          `(${escapePdfText(`${item.label}: ${item.value}`)}) Tj`,
        );
        currentCmds.push("ET");
      });

      y -= summaryBoxHeight + 10;
    }
  };

  const drawSubHeader = () => {
    currentCmds.push("BT");
    currentCmds.push(`/F1 11 Tf`);
    currentCmds.push(`0 0 0 rg`);
    currentCmds.push(`${marginLeft} ${y - 9} Td`);
    currentCmds.push(`(${escapePdfText(`${options.title} (Continued)`)}) Tj`);
    currentCmds.push("ET");
    y -= 18;
  };

  const drawTableHeaderRow = () => {
    // Light gray printer background
    currentCmds.push(`0.92 0.92 0.92 rg`);
    currentCmds.push(
      `${marginLeft} ${y - headerRowHeight} ${printableWidth} ${headerRowHeight} re f`,
    );

    // Top & Bottom Solid Borders for Header
    currentCmds.push(`0 0 0 RG`);
    currentCmds.push(`1 w`);
    currentCmds.push(
      `${marginLeft} ${y} m ${marginLeft + printableWidth} ${y} l S`,
    );
    currentCmds.push(
      `${marginLeft} ${y - headerRowHeight} m ${marginLeft + printableWidth} ${y - headerRowHeight} l S`,
    );

    let x = marginLeft;
    options.columns.forEach((col, idx) => {
      const w = colWidths[idx];
      const align = col.align || "left";
      const fontSz = 8.5;
      const lines = parsedHeaders[idx];

      const lineSpacing = 11;
      const startTextY =
        lines.length === 1
          ? y - Math.floor((headerRowHeight + fontSz) / 2) + 2
          : y - 10;

      lines.forEach((lineText, lineIdx) => {
        const charW = fontName === "Courier" ? fontSz * 0.6 : fontSz * 0.52;
        const textW = lineText.length * charW;

        let textX = x + 4;
        if (align === "right") textX = Math.max(x + 2, x + w - textW - 4);
        if (align === "center") textX = Math.max(x + 2, x + (w - textW) / 2);

        const currentLineY = startTextY - lineIdx * lineSpacing;

        currentCmds.push("BT");
        currentCmds.push(`/F1 ${fontSz} Tf`);
        currentCmds.push(`0 0 0 rg`); // Black text
        currentCmds.push(`${textX} ${currentLineY} Td`);
        currentCmds.push(`(${escapePdfText(lineText)}) Tj`);
        currentCmds.push("ET");
      });

      // Vertical border line
      if (idx > 0) {
        currentCmds.push(`0.4 0.4 0.4 RG`);
        currentCmds.push(`0.5 w`);
        currentCmds.push(`${x} ${y - headerRowHeight} m ${x} ${y} l S`);
      }

      x += w;
    });

    y -= headerRowHeight;
  };

  drawFirstPageHeader();
  drawTableHeaderRow();

  // Draw Table Rows (Printer Friendly White Background with Multi-Line Cell Wrapping)
  options.rows.forEach((row, rowIndex) => {
    const parsedCells = options.columns.map((col, colIdx) => {
      const w = colWidths[colIdx];
      const align = col.align || "left";
      const rawVal =
        row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : "";

      if (align === "left" && rawVal.length > 18) {
        const lines = wrapCellText(rawVal, w, 8, 2);
        return { lines, isMultiLine: lines.length > 1, align, rawVal, w, fontSize: 8, textWidth: 0 };
      } else {
        const { text: cleanVal, fontSize: dynamicFontSz, textWidth } = getFitCellText(
          rawVal,
          w,
          8,
        );
        return {
          lines: [cleanVal],
          isMultiLine: false,
          align,
          rawVal,
          w,
          fontSize: dynamicFontSz,
          textWidth,
        };
      }
    });

    const maxRowLines = Math.max(
      1,
      ...parsedCells.map((c) => (c.isMultiLine ? c.lines.length : 1)),
    );
    const currentRowHeight = maxRowLines > 1 ? 25 : 18;

    if (y - currentRowHeight < marginBottom + 20) {
      startNewPage();
      y = pageHeight - marginTop;
      isFirstPage = false;
      drawSubHeader();
      drawTableHeaderRow();
    }

    // Pure White Background
    currentCmds.push(`1 1 1 rg`);
    currentCmds.push(
      `${marginLeft} ${y - currentRowHeight} ${printableWidth} ${currentRowHeight} re f`,
    );

    // Bottom Border Line
    currentCmds.push(`0.7 0.7 0.7 RG`);
    currentCmds.push(`0.5 w`);
    currentCmds.push(
      `${marginLeft} ${y - currentRowHeight} m ${marginLeft + printableWidth} ${y - currentRowHeight} l S`,
    );

    let x = marginLeft;
    parsedCells.forEach((cell, colIdx) => {
      const w = cell.w;
      const align = cell.align;
      const fontSz = cell.fontSize || 8;
      const lineSpacing = 10.5;

      if (cell.isMultiLine) {
        const startTextY = y - 9;
        cell.lines.forEach((lineText, lineIdx) => {
          const charW = fontName === "Courier" ? fontSz * 0.6 : fontSz * 0.51;
          const textW = lineText.length * charW;

          let textX = x + 4;
          if (align === "right") textX = Math.max(x + 2, x + w - textW - 4);
          if (align === "center") textX = Math.max(x + 2, x + (w - textW) / 2);

          const currentLineY = startTextY - lineIdx * lineSpacing;

          currentCmds.push("BT");
          currentCmds.push(`/F1 ${fontSz} Tf`);
          currentCmds.push(`0 0 0 rg`);
          currentCmds.push(`${textX} ${currentLineY} Td`);
          currentCmds.push(`(${escapePdfText(lineText)}) Tj`);
          currentCmds.push("ET");
        });
      } else {
        const lineText = cell.lines[0] || "";
        const textW = cell.textWidth || lineText.length * (fontSz * 0.51);

        let textX = x + 4;
        if (align === "right") textX = Math.max(x + 2, x + w - textW - 4);
        if (align === "center") textX = Math.max(x + 2, x + (w - textW) / 2);

        const textY = y - Math.floor((currentRowHeight + fontSz) / 2) + 2;

        currentCmds.push("BT");
        currentCmds.push(`/F1 ${fontSz.toFixed(1)} Tf`);
        currentCmds.push(`0 0 0 rg`);
        currentCmds.push(`${textX} ${textY} Td`);
        currentCmds.push(`(${escapePdfText(lineText)}) Tj`);
        currentCmds.push("ET");
      }

      // Vertical line separator
      if (colIdx > 0) {
        currentCmds.push(`0.75 0.75 0.75 RG`);
        currentCmds.push(`0.4 w`);
        currentCmds.push(`${x} ${y - currentRowHeight} m ${x} ${y} l S`);
      }

      x += w;
    });

    y -= currentRowHeight;
  });

  // Draw Totals Row if provided (Printer Friendly)
  if (options.totalsRow && options.totalsRow.length > 0) {
    if (y - totalsRowHeight < marginBottom + 20) {
      startNewPage();
      y = pageHeight - marginTop;
      drawSubHeader();
      drawTableHeaderRow();
    }

    // Totals Background (Light Gray)
    currentCmds.push(`0.9 0.9 0.9 rg`);
    currentCmds.push(
      `${marginLeft} ${y - totalsRowHeight} ${printableWidth} ${totalsRowHeight} re f`,
    );

    // Solid Black Top & Bottom Border
    currentCmds.push(`0 0 0 RG`);
    currentCmds.push(`1.2 w`);
    currentCmds.push(
      `${marginLeft} ${y} m ${marginLeft + printableWidth} ${y} l S`,
    );
    currentCmds.push(
      `${marginLeft} ${y - totalsRowHeight} m ${marginLeft + printableWidth} ${y - totalsRowHeight} l S`,
    );

    let x = marginLeft;
    options.columns.forEach((col, colIdx) => {
      const w = colWidths[colIdx];
      const align = col.align || "left";
      const rawVal =
        options.totalsRow![colIdx] !== undefined && options.totalsRow![colIdx] !== null
          ? String(options.totalsRow![colIdx])
          : "";

      const { text: cleanVal, fontSize: dynamicFontSz, textWidth } = getFitCellText(rawVal, w, 8.5);

      let textX = x + 4;
      if (align === "right") textX = Math.max(x + 2, x + w - textWidth - 4);
      if (align === "center") textX = Math.max(x + 2, x + (w - textWidth) / 2);

      const textY = y - Math.floor((totalsRowHeight + dynamicFontSz) / 2) + 2;

      currentCmds.push("BT");
      currentCmds.push(`/F1 ${dynamicFontSz.toFixed(1)} Tf`);
      currentCmds.push(`0 0 0 rg`); // Pure black
      currentCmds.push(`${textX} ${textY} Td`);
      currentCmds.push(`(${escapePdfText(cleanVal)}) Tj`);
      currentCmds.push("ET");

      if (colIdx > 0) {
        currentCmds.push(`0.5 0.5 0.5 RG`);
        currentCmds.push(`0.5 w`);
        currentCmds.push(`${x} ${y - totalsRowHeight} m ${x} ${y} l S`);
      }

      x += w;
    });

    y -= totalsRowHeight;
  }

  // Push final page commands
  if (currentCmds.length > 0) {
    pagesCommands.push(currentCmds);
  }

  const pageCount = pagesCommands.length;

  // Build PDF Objects
  const fontId = 3 + pageCount * 2;
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kidRefs = Array.from({ length: pageCount }, (_, idx) => `${3 + idx * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kidRefs}] /Count ${pageCount} >>`);

  pagesCommands.forEach((cmds, idx) => {
    if (showPageNumbers) {
      const pageLabel = `Page ${idx + 1} of ${pageCount}`;
      const footerY = Math.max(15, marginBottom - 15);
      const labelW = pageLabel.length * 5;
      const centerX = Math.max(30, Math.floor((pageWidth - labelW) / 2));
      cmds.push("BT");
      cmds.push(`/F1 8 Tf`);
      cmds.push(`0.4 0.45 0.5 rg`);
      cmds.push(`${centerX} ${footerY} Td`);
      cmds.push(`(${escapePdfText(pageLabel)}) Tj`);
      cmds.push("ET");
    }

    const pageId = 3 + idx * 2;
    const streamId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );

    const streamText = cmds.join("\n");
    const streamLen = new TextEncoder().encode(streamText).length;
    objects.push(`<< /Length ${streamLen} >>\nstream\n${streamText}\nendstream`);
  });

  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

