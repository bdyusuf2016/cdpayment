import { useState, useCallback, useRef } from "react";

export interface ColumnDefinition<T extends string> {
  key: T;
  label: string;
  defaultWidth?: number;
  hideable?: boolean;
}

export function useResizableColumns<T extends string>(
  initialWidths: Record<T, number>,
  minWidth = 50,
  storageKey?: string
) {
  const [columnWidths, setColumnWidths] = useState<Record<T, number>>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`${storageKey}_column_widths`);
        if (saved) return { ...initialWidths, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to parse saved column widths", e);
      }
    }
    return initialWidths;
  });

  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`${storageKey}_hidden_columns`);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved hidden columns", e);
      }
    }
    return {};
  });

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

        setColumnWidths((prev) => {
          const next = { ...prev, [colKey]: newWidth };
          if (storageKey) {
            try {
              localStorage.setItem(`${storageKey}_column_widths`, JSON.stringify(next));
            } catch (err) {}
          }
          return next;
        });
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
    [columnWidths, initialWidths, minWidth, storageKey]
  );

  const toggleColumnVisibility = useCallback(
    (key: T) => {
      setHiddenColumns((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        if (storageKey) {
          try {
            localStorage.setItem(`${storageKey}_hidden_columns`, JSON.stringify(next));
          } catch (err) {}
        }
        return next;
      });
    },
    [storageKey]
  );

  const isColumnVisible = useCallback(
    (key: T) => {
      return !hiddenColumns[key];
    },
    [hiddenColumns]
  );

  const showAllColumns = useCallback(() => {
    setHiddenColumns({});
    if (storageKey) {
      try {
        localStorage.removeItem(`${storageKey}_hidden_columns`);
      } catch (err) {}
    }
  }, [storageKey]);

  const resetColumns = useCallback(() => {
    setColumnWidths(initialWidths);
    setHiddenColumns({});
    if (storageKey) {
      try {
        localStorage.removeItem(`${storageKey}_column_widths`);
        localStorage.removeItem(`${storageKey}_hidden_columns`);
      } catch (err) {}
    }
  }, [initialWidths, storageKey]);

  return {
    columnWidths,
    startResizing,
    hiddenColumns,
    toggleColumnVisibility,
    isColumnVisible,
    showAllColumns,
    resetColumns,
  };
}

export default useResizableColumns;
