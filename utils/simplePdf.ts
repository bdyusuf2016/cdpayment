const toAscii = (value: string) =>
  value.replace(/[^\x20-\x7E]/g, "?").replace(/\r?\n/g, " ");

const escapePdfText = (value: string) =>
  toAscii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export const createSimplePdfBlob = (
  title: string,
  lines: string[],
  fontName: "Helvetica" | "Courier" = "Helvetica",
): Blob => {
  const maxLines = 56;
  const merged = [title, "", ...lines];
  const clipped = merged.slice(0, maxLines);

  if (merged.length > maxLines) {
    clipped[maxLines - 1] = `... (${merged.length - maxLines + 1} more lines)`;
  }

  const streamLines = ["BT", "/F1 11 Tf", "40 810 Td"];
  clipped.forEach((line, idx) => {
    if (idx > 0) {
      streamLines.push("0 -14 Td");
    }
    streamLines.push(`(${escapePdfText(line)}) Tj`);
  });
  streamLines.push("ET");

  const stream = streamLines.join("\n");
  const streamLen = new TextEncoder().encode(stream).length;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`,
  ];

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
