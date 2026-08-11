import React, { useState, useRef, useEffect } from "react";

export interface ColumnItem {
  key: string;
  label: string;
}

interface ColumnVisibilityToggleProps {
  columns: ColumnItem[];
  isColumnVisible: (key: any) => boolean;
  toggleColumnVisibility: (key: any) => void;
  showAllColumns: () => void;
  resetColumns: () => void;
  systemConfig?: any;
  isDark?: boolean;
  isBn?: boolean;
}

export const ColumnVisibilityToggle: React.FC<ColumnVisibilityToggleProps> = ({
  columns,
  isColumnVisible,
  toggleColumnVisibility,
  showAllColumns,
  resetColumns,
  systemConfig,
  isDark = false,
  isBn = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hiddenCount = columns.filter((col) => !isColumnVisible(col.key)).length;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all flex items-center gap-2 ${
          hiddenCount > 0
            ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
            : isDark
            ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
            : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
        }`}
        title={isBn ? "কলাম ফিল্টার / হাইড-শো" : "Columns Hide / Show"}
      >
        <i className="fa-solid fa-table-columns"></i>
        <span>{isBn ? "কলামসমূহ" : "Columns"}</span>
        {hiddenCount > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-white text-indigo-700">
            {hiddenCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl border backdrop-blur-md p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${
            isDark
              ? "bg-slate-900/95 border-slate-700 text-white"
              : "bg-white/95 border-slate-200 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/40">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {isBn ? "কলাম হাইড/শো" : "Hide/Show Columns"}
            </span>
            <button
              onClick={showAllColumns}
              className="text-[10px] font-bold text-indigo-500 hover:underline"
            >
              {isBn ? "সব দেখান" : "Show All"}
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
            {columns.map((col) => {
              const visible = isColumnVisible(col.key);
              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleColumnVisibility(col.key)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                  />
                  <span className={visible ? "font-semibold" : "opacity-50 line-through"}>
                    {col.label}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="pt-2 mt-2 border-t border-slate-700/40 flex justify-between items-center text-[10px]">
            <button
              onClick={resetColumns}
              className="text-slate-400 hover:text-rose-500 font-medium transition-colors"
            >
              {isBn ? "রিসেট" : "Reset Default"}
            </button>
            <span className="text-slate-400">
              {columns.length - hiddenCount}/{columns.length} {isBn ? "দৃশ্যমান" : "visible"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnVisibilityToggle;
