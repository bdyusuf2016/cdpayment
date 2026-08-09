import { useState, useCallback, useRef } from "react";

export function useResizableColumns<T extends string>(
  initialWidths: Record<T, number>,
  minWidth = 60
) {
  const [columnWidths, setColumnWidths] = useState<Record<T, number>>(initialWidths);
  const resizingRef = useRef<{ key: T; startX: number; startWidth: number } | null>(null);

  const startResizing = useCallback(
    (key: T, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = columnWidths[key] || initialWidths[key] || 120;
      resizingRef.current = { key, startX, startWidth };

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;
        const deltaX = moveEvent.clientX - resizingRef.current.startX;
        const newWidth = Math.max(minWidth, resizingRef.current.startWidth + deltaX);
        const colKey = resizingRef.current.key;

        setColumnWidths((prev) => ({
          ...prev,
          [colKey]: newWidth,
        }));
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [columnWidths, initialWidths, minWidth]
  );

  return { columnWidths, startResizing };
}

export default useResizableColumns;
