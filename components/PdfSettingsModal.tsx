import React, { useState, useEffect } from "react";

export interface PdfSettings {
  pageSize: "A4" | "Letter" | "Legal" | "A3";
  orientation: "Portrait" | "Landscape";
  scale: number;
  fontName: "Helvetica" | "Courier";
  showPageNumbers: boolean;
}

interface PdfSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (settings: PdfSettings) => void;
  isDark: boolean;
  title?: string;
}

const PAGE_SIZE_LABELS = {
  A4: { label: "A4", desc: "210 × 297 mm", ratio: 0.707 },
  Letter: { label: "Letter", desc: "8.5 × 11.0 in", ratio: 0.773 },
  Legal: { label: "Legal", desc: "8.5 × 14.0 in", ratio: 0.607 },
  A3: { label: "A3", desc: "297 × 420 mm", ratio: 0.707 },
};

export const PdfSettingsModal: React.FC<PdfSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDark,
  title = "PDF Export Layout Settings",
}) => {
  const [pageSize, setPageSize] = useState<PdfSettings["pageSize"]>("A4");
  const [orientation, setOrientation] = useState<PdfSettings["orientation"]>("Portrait");
  const [scale, setScale] = useState<number>(1.0);
  const [fontName, setFontName] = useState<PdfSettings["fontName"]>("Helvetica");
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(true);

  // Load defaults from localStorage on mount
  useEffect(() => {
    const savedSize = localStorage.getItem("pdf_pref_pageSize") as PdfSettings["pageSize"];
    const savedOrient = localStorage.getItem("pdf_pref_orientation") as PdfSettings["orientation"];
    const savedScale = localStorage.getItem("pdf_pref_scale");
    const savedFont = localStorage.getItem("pdf_pref_fontName") as PdfSettings["fontName"];
    const savedPgNum = localStorage.getItem("pdf_pref_showPageNumbers");

    if (savedSize) setPageSize(savedSize);
    if (savedOrient) setOrientation(savedOrient);
    if (savedScale) setScale(parseFloat(savedScale));
    if (savedFont) setFontName(savedFont);
    if (savedPgNum) setShowPageNumbers(savedPgNum === "true");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Save to localStorage for persistence
    localStorage.setItem("pdf_pref_pageSize", pageSize);
    localStorage.setItem("pdf_pref_orientation", orientation);
    localStorage.setItem("pdf_pref_scale", scale.toString());
    localStorage.setItem("pdf_pref_fontName", fontName);
    localStorage.setItem("pdf_pref_showPageNumbers", showPageNumbers.toString());

    onConfirm({
      pageSize,
      orientation,
      scale,
      fontName,
      showPageNumbers,
    });
  };

  // Preview Box dimensions calculation
  const selectedInfo = PAGE_SIZE_LABELS[pageSize];
  const isLandscape = orientation === "Landscape";
  
  // Calculate aspect ratio for visual preview
  const w = isLandscape ? 120 : 120 * selectedInfo.ratio;
  const h = isLandscape ? 120 * selectedInfo.ratio : 120;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className={`w-full max-w-xl rounded-[2rem] shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 border transition-all ${
          isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className={`text-lg font-black uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
              <i className="fas fa-print mr-2 text-blue-600"></i>
              {title}
            </h3>
            <p className="text-xs font-semibold text-slate-400 mt-1">
              Configure and scale the PDF page dimensions to fit your requirements.
            </p>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isDark
                ? "bg-slate-700 text-slate-200 hover:bg-red-900/40 hover:text-red-300"
                : "bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500"
            }`}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Visual Preview */}
          <div className={`col-span-1 rounded-2xl p-4 flex flex-col items-center justify-center border border-dashed ${
            isDark ? "bg-slate-900/40 border-slate-700" : "bg-slate-50 border-slate-300"
          }`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Layout Preview</span>
            <div className="h-32 flex items-center justify-center w-full">
              <div
                style={{ width: `${w}px`, height: `${h}px` }}
                className={`rounded-md shadow-lg border-2 flex flex-col justify-between p-2 transition-all duration-300 relative ${
                  isDark ? "bg-slate-800 border-blue-500" : "bg-white border-blue-500"
                }`}
              >
                {/* Simulated Text Lines */}
                <div className="space-y-1.5 w-full">
                  <div className="h-2 w-2/3 bg-slate-300 dark:bg-slate-600 rounded"></div>
                  <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                  <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
                  <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded w-11/12"></div>
                </div>
                
                {/* Page Number indicator */}
                {showPageNumbers && (
                  <div className="w-full flex justify-center">
                    <div className="h-1 w-6 bg-slate-300 dark:bg-slate-600 rounded"></div>
                  </div>
                )}

                {/* Scale Badge */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-sm opacity-90">
                    {Math.round(scale * 100)}%
                  </span>
                </div>
              </div>
            </div>
            <span className="text-[10px] font-black text-slate-500 mt-4 uppercase">
              {pageSize} - {orientation}
            </span>
          </div>

          {/* Configuration Form Controls */}
          <div className="col-span-2 space-y-4">
            
            {/* Page Size Selection */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Page Size (পৃষ্ঠার সাইজ)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PAGE_SIZE_LABELS) as Array<keyof typeof PAGE_SIZE_LABELS>).map((sizeKey) => (
                  <button
                    key={sizeKey}
                    type="button"
                    onClick={() => setPageSize(sizeKey)}
                    className={`px-3 py-2 rounded-xl border-2 text-left transition-all ${
                      pageSize === sizeKey
                        ? "border-blue-500 bg-blue-500/10 text-blue-500"
                        : isDark
                        ? "border-slate-700 hover:border-slate-600 text-slate-300 bg-slate-900/20"
                        : "border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50"
                    }`}
                  >
                    <p className="text-xs font-black">{sizeKey}</p>
                    <p className="text-[9px] opacity-65">{PAGE_SIZE_LABELS[sizeKey].desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Page Orientation */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Orientation (পৃষ্ঠার দিক)
              </label>
              <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                {(["Portrait", "Landscape"] as const).map((orient) => (
                  <button
                    key={orient}
                    type="button"
                    onClick={() => setOrientation(orient)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                      orientation === orient
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    }`}
                  >
                    <i className={`fas ${orient === "Portrait" ? "fa-file" : "fa-file-alt rotate-90"} mr-1.5`}></i>
                    {orient}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family Selection */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Font Family (ফন্ট স্টাইল)
              </label>
              <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                {(["Helvetica", "Courier"] as const).map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => setFontName(font)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                      fontName === font
                        ? "bg-blue-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    }`}
                  >
                    {font === "Helvetica" ? "Helvetica (Proportional)" : "Courier (Monospace)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Font / Layout Scale Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Content Scale (লেখা স্কেলিং)
                </label>
                <span className="text-xs font-black text-blue-600">{Math.round(scale * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setScale(1.0)}
                  className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all ${
                    scale === 1.0
                      ? "border-slate-400 text-slate-400 bg-transparent"
                      : "border-blue-600 text-blue-600 hover:bg-blue-500/10"
                  }`}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Show Page Numbers Option */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Show Page Numbers (পৃষ্ঠা নম্বর দেখান)
              </span>
              <button
                type="button"
                onClick={() => setShowPageNumbers(!showPageNumbers)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showPageNumbers ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showPageNumbers ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all"
          >
            Generate PDF
          </button>
        </div>

      </div>
    </div>
  );
};
