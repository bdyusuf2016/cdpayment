const toAscii = (value: string) =>
  value.replace(/[^\x20-\x7E]/g, "?").replace(/\r?\n/g, " ");

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
  },
): Blob => {
  const repeatTitle = Boolean(options?.repeatTitle);
  const bottomMargin = options?.bottomMargin ?? 40;
  const lineHeight =
    options?.lineHeight ?? Math.max(12, Math.round(fontSize * 1.3));
  const availableHeight = startY - bottomMargin;
  const computedLinesPerPage = Math.max(
    1,
    Math.floor(availableHeight / lineHeight),
  );
  const linesPerPage = options?.linesPerPage ?? computedLinesPerPage;

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
      `/F1 ${fontSize} Tf`,
      `${startX} ${startY} Td`,
    ];
    pageLines.forEach((line, idx) => {
      if (idx > 0) {
        streamLines.push(`0 -${lineHeight} Td`);
      }
      streamLines.push(`(${escapePdfText(line)}) Tj`);
    });
    streamLines.push("ET");

    if (options?.showPageNumbers) {
      const pageLabel = `Page ${pageIndex + 1} of ${pageCount}`;
      const footerY = Math.max(20, bottomMargin - 14);
      const labelWidth = pageLabel.length * Math.max(5, fontSize * 0.6);
      const centerX = Math.max(40, Math.floor((595 - labelWidth) / 2));
      streamLines.push("BT");
      streamLines.push(`/F1 ${Math.max(8, fontSize - 1)} Tf`);
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
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
