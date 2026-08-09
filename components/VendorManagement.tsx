import React, { useRef, useState, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { SystemConfig, Vendor } from "../types";
import { insertVendor, updateVendor, deleteVendor } from "../utils/supabaseApi";
import { printElement } from "../utils/printTable";
import { useResizableColumns } from "../utils/useResizableColumns";
import ColumnVisibilityToggle from "./ColumnVisibilityToggle";

interface VendorManagementProps {
  vendors: Vendor[];
  setVendors: React.Dispatch<React.SetStateAction<Vendor[]>>;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
}

export const VendorManagement: React.FC<VendorManagementProps> = ({
  vendors,
  setVendors,
  systemConfig,
  supabase,
}) => {
  const isDark = systemConfig.theme === "dark";
  const isBn = systemConfig.language === "bn";

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deleteVendorId, setDeleteVendorId] = useState<string | null>(null);

  // Form Fields
  const [vendorName, setVendorName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [binNo, setBinNo] = useState("");
  const [eTinNo, setETinNo] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    const key = `${label}_${text}`;
    setCopiedText(key);
    setTimeout(() => {
      setCopiedText((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  // Table Column Resizing
  const initialColumnWidths = useMemo(
    () => ({
      sl: 50,
      vendorName: 220,
      ownerName: 160,
      phone: 160,
      binNo: 160,
      eTinNo: 160,
      address: 220,
      status: 110,
      actions: 110,
    }),
    []
  );
  const {
    columnWidths,
    startResizing,
    toggleColumnVisibility,
    isColumnVisible,
    showAllColumns,
    resetColumns,
  } = useResizableColumns(initialColumnWidths, 50, "vendor_table");

  const tableColumns = useMemo(
    () => [
      { key: "sl", label: "#" },
      { key: "vendorName", label: isBn ? "ভেন্ডার নাম" : "Vendor Name" },
      { key: "ownerName", label: isBn ? "ওনারের নাম" : "Owner Name" },
      { key: "phone", label: isBn ? "ফোন নম্বর" : "Phone No" },
      { key: "binNo", label: isBn ? "বিআইএন নম্বর" : "BIN No" },
      { key: "eTinNo", label: isBn ? "ই-টিন নম্বর" : "E-TIN No" },
      { key: "address", label: isBn ? "ঠিকানা" : "Address" },
      { key: "status", label: isBn ? "স্ট্যাটাস" : "Status" },
      { key: "actions", label: isBn ? "অ্যাকশন" : "Actions" },
    ],
    [isBn]
  );

  const tableRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Labels dictionary
  const t = {
    title: isBn ? "ভেন্ডার ম্যানেজমেন্ট" : "Vendor Management",
    subtitle: isBn
      ? "ভেন্ডার তথ্য, ওনারের নাম, ফোন, বিআইএন এবং ই-টিন নম্বর ব্যবস্থাপনা করুন"
      : "Manage vendor details, owner names, contact phones, BIN & E-TIN numbers",
    addVendor: isBn ? "নতুন ভেন্ডার যোগ করুন" : "Add New Vendor",
    editVendor: isBn ? "ভেন্ডার তথ্য এডিট করুন" : "Edit Vendor",
    searchPlaceholder: isBn
      ? "ভেন্ডার নাম, ওনারের নাম, ফোন, বিআইএন বা ই-টিন দিয়ে খুঁজুন..."
      : "Search by vendor name, owner, phone, BIN, or E-TIN...",
    all: isBn ? "সব ভেন্ডার" : "All Vendors",
    active: isBn ? "সক্রিয়" : "Active",
    inactive: isBn ? "নিষ্ক্রিয়" : "Inactive",
    totalVendors: isBn ? "মোট ভেন্ডার" : "Total Vendors",
    activeVendors: isBn ? "সক্রিয় ভেন্ডার" : "Active Vendors",
    binRegistered: isBn ? "বিআইএন নিবন্ধিত" : "BIN Registered",
    tinRegistered: isBn ? "ই-টিন নিবন্ধিত" : "E-TIN Registered",
    vendorName: isBn ? "ভেন্ডার নাম" : "Vendor Name",
    ownerName: isBn ? "মালিকের নাম" : "Owner Name",
    phone: isBn ? "ফোন নম্বর" : "Phone No",
    binNo: isBn ? "বিআইএন নম্বর" : "BIN No",
    eTinNo: isBn ? "ই-টিন নম্বর" : "E-TIN No",
    address: isBn ? "ঠিকানা" : "Address",
    notes: isBn ? "মন্তব্য" : "Notes",
    status: isBn ? "স্ট্যাটাস" : "Status",
    actions: isBn ? "অ্যাকশন" : "Actions",
    save: isBn ? "সংরক্ষণ করুন" : "Save Vendor",
    updating: isBn ? "সংরক্ষণ হচ্ছে..." : "Saving...",
    cancel: isBn ? "বাতিল" : "Cancel",
    confirmDelete: isBn ? "আপনি কি নিশ্চিত যে এই ভেন্ডারটি মুছে ফেলতে চান?" : "Are you sure you want to delete this vendor?",
    delete: isBn ? "মুছে ফেলুন" : "Delete",
    exportExcel: isBn ? "এক্সেল এক্সপোর্ট" : "Export Excel",
    importExcel: isBn ? "এক্সেল ইমপোর্ট" : "Import Excel",
    print: isBn ? "প্রিন্ট" : "Print",
    noData: isBn ? "কোনো ভেন্ডার পাওয়া যায়নি" : "No vendors found",
  };

  const openAddModal = () => {
    setEditingVendor(null);
    setVendorName("");
    setOwnerName("");
    setPhone("");
    setBinNo("");
    setETinNo("");
    setAddress("");
    setNotes("");
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setVendorName(vendor.vendorName);
    setOwnerName(vendor.ownerName || "");
    setPhone(vendor.phone || "");
    setBinNo(vendor.binNo || "");
    setETinNo(vendor.eTinNo || "");
    setAddress(vendor.address || "");
    setNotes(vendor.notes || "");
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingVendor(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      setErrorMsg(isBn ? "ভেন্ডার নাম অবশ্যই দিতে হবে।" : "Vendor Name is required.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const payload = {
      vendorName: vendorName.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      binNo: binNo.trim(),
      eTinNo: eTinNo.trim(),
      address: address.trim(),
      notes: notes.trim(),
      active: editingVendor ? editingVendor.active : true,
    };

    try {
      if (supabase) {
        if (editingVendor) {
          const updated = await updateVendor(supabase, editingVendor.id, payload);
          if (updated) {
            setVendors((prev) =>
              prev.map((v) => (v.id === updated.id ? updated : v))
            );
          }
        } else {
          const created = await insertVendor(supabase, payload);
          if (created) {
            setVendors((prev) => [created, ...prev]);
          }
        }
      } else {
        // Local state fallback
        if (editingVendor) {
          setVendors((prev) =>
            prev.map((v) =>
              v.id === editingVendor.id ? { ...v, ...payload } : v
            )
          );
        } else {
          const newVendor: Vendor = {
            id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            ...payload,
            createdAt: new Date().toISOString(),
          };
          setVendors((prev) => [newVendor, ...prev]);
        }
      }

      setSuccessMsg(
        editingVendor
          ? isBn
            ? "ভেন্ডার সফলভাবে আপডেট করা হয়েছে!"
            : "Vendor updated successfully!"
          : isBn
          ? "নতুন ভেন্ডার সফলভাবে যোগ করা হয়েছে!"
          : "Vendor created successfully!"
      );
      setTimeout(() => setSuccessMsg(null), 3000);
      closeModal();
    } catch (err: any) {
      setErrorMsg(err?.message || (isBn ? "সংরক্ষণে সমস্যা হয়েছে।" : "Failed to save vendor."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (vendor: Vendor) => {
    const updatedStatus = !vendor.active;
    try {
      if (supabase) {
        const updated = await updateVendor(supabase, vendor.id, {
          active: updatedStatus,
        });
        if (updated) {
          setVendors((prev) =>
            prev.map((v) => (v.id === updated.id ? updated : v))
          );
        }
      } else {
        setVendors((prev) =>
          prev.map((v) => (v.id === vendor.id ? { ...v, active: updatedStatus } : v))
        );
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update vendor status");
    }
  };

  const handleDeleteVendor = async () => {
    if (!deleteVendorId) return;
    try {
      if (supabase) {
        await deleteVendor(supabase, deleteVendorId);
      }
      setVendors((prev) => prev.filter((v) => v.id !== deleteVendorId));
      setDeleteVendorId(null);
      setSuccessMsg(isBn ? "ভেন্ডার মুছে ফেলা হয়েছে।" : "Vendor deleted.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err?.message || "Failed to delete vendor");
    }
  };

  // Filtered Vendors
  const filteredVendors = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return vendors.filter((v) => {
      // Status Filter
      if (statusFilter === "active" && !v.active) return false;
      if (statusFilter === "inactive" && v.active) return false;

      // Text Search
      if (!term) return true;
      return (
        (v.vendorName && v.vendorName.toLowerCase().includes(term)) ||
        (v.ownerName && v.ownerName.toLowerCase().includes(term)) ||
        (v.phone && v.phone.toLowerCase().includes(term)) ||
        (v.binNo && v.binNo.toLowerCase().includes(term)) ||
        (v.eTinNo && v.eTinNo.toLowerCase().includes(term)) ||
        (v.address && v.address.toLowerCase().includes(term))
      );
    });
  }, [vendors, searchTerm, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = vendors.length;
    const activeCount = vendors.filter((v) => v.active).length;
    const binCount = vendors.filter((v) => Boolean(v.binNo && v.binNo.trim())).length;
    const tinCount = vendors.filter((v) => Boolean(v.eTinNo && v.eTinNo.trim())).length;
    return { total, activeCount, binCount, tinCount };
  }, [vendors]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredVendors.map((v, index) => ({
      "SL": index + 1,
      [t.vendorName]: v.vendorName,
      [t.ownerName]: v.ownerName || "",
      [t.phone]: v.phone || "",
      [t.binNo]: v.binNo || "",
      [t.eTinNo]: v.eTinNo || "",
      [t.address]: v.address || "",
      [t.notes]: v.notes || "",
      [t.status]: v.active ? (isBn ? "সক্রিয়" : "Active") : (isBn ? "নিষ্ক্রিয়" : "Inactive"),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendors");
    XLSX.writeFile(workbook, `Vendors_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Excel Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          alert(isBn ? "ফাইলে কোনো তথ্য পাওয়া যায়নি।" : "No data found in Excel file.");
          return;
        }

        const newEntries: Omit<Vendor, "id">[] = [];

        data.forEach((row) => {
          const vName =
            row["Vendor Name"] ||
            row["vendorName"] ||
            row["ভেন্ডার নাম"] ||
            row["Name"] ||
            row["name"] ||
            "";
          if (vName && String(vName).trim()) {
            newEntries.push({
              vendorName: String(vName).trim(),
              ownerName: String(
                row["Owner Name"] || row["ownerName"] || row["মালিকের নাম"] || row["Owner"] || ""
              ).trim(),
              phone: String(
                row["Phone No"] || row["phone"] || row["ফোন নম্বর"] || row["Phone"] || ""
              ).trim(),
              binNo: String(
                row["BIN No"] || row["binNo"] || row["বিআইএন নম্বর"] || row["BIN"] || ""
              ).trim(),
              eTinNo: String(
                row["E-TIN No"] || row["eTinNo"] || row["ই-টিন নম্বর"] || row["TIN"] || ""
              ).trim(),
              address: String(
                row["Address"] || row["address"] || row["ঠিকানা"] || ""
              ).trim(),
              notes: String(
                row["Notes"] || row["notes"] || row["মন্তব্য"] || ""
              ).trim(),
              active: true,
            });
          }
        });

        if (newEntries.length === 0) {
          alert(isBn ? "সঠিক ভেন্ডার নাম পাওয়া যায়নি।" : "No valid vendor names found in file.");
          return;
        }

        const addedVendors: Vendor[] = [];
        for (const entry of newEntries) {
          if (supabase) {
            try {
              const res = await insertVendor(supabase, entry);
              if (res) addedVendors.push(res);
            } catch (err) {
              console.error("Import item failed", err);
            }
          } else {
            addedVendors.push({
              id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              ...entry,
              createdAt: new Date().toISOString(),
            });
          }
        }

        if (addedVendors.length > 0) {
          setVendors((prev) => [...addedVendors, ...prev]);
          alert(
            isBn
              ? `${addedVendors.length} টি ভেন্ডার সফলভাবে ইমপোর্ট হয়েছে!`
              : `Successfully imported ${addedVendors.length} vendors!`
          );
        }
      } catch (err) {
        console.error(err);
        alert(isBn ? "ফাইল পড়তে সমস্যা হয়েছে।" : "Error parsing Excel file.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePrint = () => {
    printElement(tableRef.current, t.title, {
      header: {
        organization: systemConfig.agencyName || "Vendor Management Directory",
        subtext: t.subtitle,
      },
      excludeColumnIndexes: [8], // Exclude Actions column
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div
        className={`p-6 rounded-2xl shadow-xl backdrop-blur-md border transition-all ${
          isDark
            ? "bg-slate-900/80 border-slate-800 text-white"
            : "bg-white/80 border-slate-200 text-slate-900"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                <i className="fa-solid fa-store text-xl"></i>
              </span>
              {t.title}
            </h2>
            <p className="text-sm opacity-70 mt-1">{t.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openAddModal}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              <i className="fa-solid fa-plus"></i>
              {t.addVendor}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all flex items-center gap-2 ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
              }`}
            >
              <i className="fa-solid fa-file-import text-indigo-500"></i>
              {t.importExcel}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />

            <ColumnVisibilityToggle
              columns={tableColumns}
              isColumnVisible={isColumnVisible}
              toggleColumnVisibility={toggleColumnVisibility}
              showAllColumns={showAllColumns}
              resetColumns={resetColumns}
              isDark={isDark}
              isBn={isBn}
            />

            <button
              onClick={handleExportExcel}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all flex items-center gap-2 ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-400"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-emerald-700"
              }`}
            >
              <i className="fa-solid fa-file-excel"></i>
              {t.exportExcel}
            </button>

            <button
              onClick={handlePrint}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all flex items-center gap-2 ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
              }`}
            >
              <i className="fa-solid fa-print"></i>
              {t.print}
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm flex items-center gap-2">
            <i className="fa-solid fa-circle-check"></i>
            {successMsg}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-md transition-all ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              {t.totalVendors}
            </p>
            <h3 className="text-2xl font-bold mt-1">{stats.total}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-xl">
            <i className="fa-solid fa-store"></i>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-md transition-all ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              {t.activeVendors}
            </p>
            <h3 className="text-2xl font-bold mt-1 text-emerald-500">{stats.activeCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl">
            <i className="fa-solid fa-circle-check"></i>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-md transition-all ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              {t.binRegistered}
            </p>
            <h3 className="text-2xl font-bold mt-1 text-indigo-500">{stats.binCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xl">
            <i className="fa-solid fa-id-card"></i>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between shadow-md transition-all ${
            isDark
              ? "bg-slate-900/60 border-slate-800 text-white"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
        >
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              {t.tinRegistered}
            </p>
            <h3 className="text-2xl font-bold mt-1 text-purple-500">{stats.tinCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center text-xl">
            <i className="fa-solid fa-file-invoice-dollar"></i>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className={`p-4 rounded-2xl border backdrop-blur-md shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 ${
          isDark
            ? "bg-slate-900/70 border-slate-800"
            : "bg-white/80 border-slate-200"
        }`}
      >
        <div className="relative w-full md:w-96">
          <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border outline-none transition-all ${
              isDark
                ? "bg-slate-800/80 border-slate-700 text-white focus:border-indigo-500"
                : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
            }`}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {t.status}:
          </span>
          <div
            className={`p-1 rounded-xl border flex gap-1 ${
              isDark
                ? "bg-slate-800 border-slate-700"
                : "bg-slate-100 border-slate-200"
            }`}
          >
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.all}
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === "active"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.active}
            </button>
            <button
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === "inactive"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.inactive}
            </button>
          </div>
        </div>
      </div>

      {/* Vendors Table */}
      <div
        ref={tableRef}
        className={`rounded-2xl border backdrop-blur-md shadow-xl overflow-hidden ${
          isDark
            ? "bg-slate-900/80 border-slate-800"
            : "bg-white/80 border-slate-200"
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr
                className={`border-b text-xs font-semibold uppercase tracking-wider relative select-none ${
                  isDark
                    ? "bg-slate-800/60 border-slate-800 text-slate-400"
                    : "bg-slate-100 border-slate-200 text-slate-600"
                }`}
              >
                {isColumnVisible("sl") && (
                  <th
                    style={{ width: columnWidths.sl, minWidth: columnWidths.sl }}
                    className="py-3.5 px-4 text-center relative group"
                  >
                    #
                    <div
                      onMouseDown={(e) => startResizing("sl", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("vendorName") && (
                  <th
                    style={{ width: columnWidths.vendorName, minWidth: columnWidths.vendorName }}
                    className="py-3.5 px-4 relative group"
                  >
                    <span className="truncate block">{t.vendorName}</span>
                    <div
                      onMouseDown={(e) => startResizing("vendorName", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("ownerName") && (
                  <th
                    style={{ width: columnWidths.ownerName, minWidth: columnWidths.ownerName }}
                    className="py-3.5 px-4 relative group"
                  >
                    <span className="truncate block">{t.ownerName}</span>
                    <div
                      onMouseDown={(e) => startResizing("ownerName", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("phone") && (
                  <th
                    style={{ width: columnWidths.phone, minWidth: columnWidths.phone }}
                    className="py-3.5 px-4 relative group"
                  >
                    <span className="truncate block">{t.phone}</span>
                    <div
                      onMouseDown={(e) => startResizing("phone", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("binNo") && (
                  <th
                    style={{ width: columnWidths.binNo, minWidth: columnWidths.binNo }}
                    className="py-3.5 px-4 relative group"
                  >
                    <span className="truncate block">{t.binNo}</span>
                    <div
                      onMouseDown={(e) => startResizing("binNo", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("eTinNo") && (
                  <th
                    style={{ width: columnWidths.eTinNo, minWidth: columnWidths.eTinNo }}
                    className="py-3.5 px-4 relative group"
                  >
                    <span className="truncate block">{t.eTinNo}</span>
                    <div
                      onMouseDown={(e) => startResizing("eTinNo", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("address") && (
                  <th
                    style={{ width: columnWidths.address, minWidth: columnWidths.address }}
                    className="py-3.5 px-4 relative group"
                  >
                    <span className="truncate block">{t.address}</span>
                    <div
                      onMouseDown={(e) => startResizing("address", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("status") && (
                  <th
                    style={{ width: columnWidths.status, minWidth: columnWidths.status }}
                    className="py-3.5 px-4 text-center relative group"
                  >
                    <span className="truncate block">{t.status}</span>
                    <div
                      onMouseDown={(e) => startResizing("status", e)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    ></div>
                  </th>
                )}

                {isColumnVisible("actions") && (
                  <th
                    style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}
                    className="py-3.5 px-4 text-right pr-6"
                  >
                    {t.actions}
                  </th>
                )}
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isDark ? "divide-slate-800 text-slate-300" : "divide-slate-200 text-slate-700"
              }`}
            >
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <i className="fa-solid fa-store-slash text-4xl mb-3 block opacity-40"></i>
                    {t.noData}
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor, index) => (
                  <tr
                    key={vendor.id}
                    className={`transition-colors ${
                      isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"
                    }`}
                  >
                    {isColumnVisible("sl") && (
                      <td className="py-3.5 px-4 text-center font-mono text-xs opacity-60">
                        {index + 1}
                      </td>
                    )}
                    {isColumnVisible("vendorName") && (
                      <td className="py-3.5 px-4 font-semibold text-indigo-500">
                        {vendor.vendorName}
                        {vendor.notes && (
                          <span className="block text-xs font-normal opacity-60 truncate max-w-xs">
                            {vendor.notes}
                          </span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("ownerName") && (
                      <td className="py-3.5 px-4">
                        {vendor.ownerName || <span className="opacity-40">-</span>}
                      </td>
                    )}
                    {isColumnVisible("phone") && (
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {vendor.phone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${vendor.phone}`}
                              className="hover:underline text-blue-500 flex items-center gap-1.5"
                            >
                              <i className="fa-solid fa-phone text-[10px]"></i>
                              {vendor.phone}
                            </a>
                            <button
                              onClick={() => copyToClipboard(vendor.phone!, "Phone")}
                              className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-blue-500/10 text-blue-500 transition-all"
                              title={isBn ? "ফোন নম্বর কপি করুন" : "Copy Phone No"}
                            >
                              <i
                                className={`fa-solid ${
                                  copiedText === `Phone_${vendor.phone}`
                                    ? "fa-check text-emerald-500"
                                    : "fa-copy text-[11px]"
                                }`}
                              ></i>
                            </button>
                          </div>
                        ) : (
                          <span className="opacity-40">-</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("binNo") && (
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {vendor.binNo ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-semibold border border-indigo-500/20">
                              {vendor.binNo}
                            </span>
                            <button
                              onClick={() => copyToClipboard(vendor.binNo!, "BIN")}
                              className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-indigo-500/10 text-indigo-500 transition-all"
                              title={isBn ? "বিআইএন নম্বর কপি করুন" : "Copy BIN No"}
                            >
                              <i
                                className={`fa-solid ${
                                  copiedText === `BIN_${vendor.binNo}`
                                    ? "fa-check text-emerald-500"
                                    : "fa-copy text-[11px]"
                                }`}
                              ></i>
                            </button>
                          </div>
                        ) : (
                          <span className="opacity-40">-</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("eTinNo") && (
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {vendor.eTinNo ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 font-semibold border border-purple-500/20">
                              {vendor.eTinNo}
                            </span>
                            <button
                              onClick={() => copyToClipboard(vendor.eTinNo!, "E-TIN")}
                              className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-purple-500/10 text-purple-500 transition-all"
                              title={isBn ? "ই-টিন নম্বর কপি করুন" : "Copy E-TIN No"}
                            >
                              <i
                                className={`fa-solid ${
                                  copiedText === `E-TIN_${vendor.eTinNo}`
                                    ? "fa-check text-emerald-500"
                                    : "fa-copy text-[11px]"
                                }`}
                              ></i>
                            </button>
                          </div>
                        ) : (
                          <span className="opacity-40">-</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("address") && (
                      <td className="py-3.5 px-4 max-w-xs truncate">
                        {vendor.address || <span className="opacity-40">-</span>}
                      </td>
                    )}
                    {isColumnVisible("status") && (
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(vendor)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                            vendor.active
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20"
                          }`}
                        >
                          {vendor.active
                            ? isBn
                              ? "সক্রিয়"
                              : "Active"
                            : isBn
                            ? "নিষ্ক্রিয়"
                            : "Inactive"}
                        </button>
                      </td>
                    )}
                    {isColumnVisible("actions") && (
                      <td className="py-3.5 px-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(vendor)}
                            className="p-1.5 rounded-lg border border-slate-700/50 hover:bg-indigo-500/10 text-indigo-500 transition-all"
                            title={isBn ? "সম্পাদনা করুন" : "Edit"}
                          >
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => setDeleteVendorId(vendor.id)}
                            className="p-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 transition-all"
                            title={isBn ? "মুছে ফেলুন" : "Delete"}
                          >
                            <i className="fa-solid fa-trash text-xs"></i>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            className={`w-full max-w-lg rounded-2xl shadow-2xl border p-6 transition-all ${
              isDark
                ? "bg-slate-900 border-slate-800 text-white"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between border-b pb-4 mb-4 border-slate-700/50">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <i className="fa-solid fa-store text-indigo-500"></i>
                {editingVendor ? t.editVendor : t.addVendor}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-all"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  {t.vendorName} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder={isBn ? "প্রতিষ্ঠানের নাম লিখুন" : "Enter vendor company name"}
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    {t.ownerName}
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder={isBn ? "মালিকের নাম" : "Owner Name"}
                    className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    {t.phone}
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={isBn ? "ফোন নম্বর" : "01xxxxxxxxx"}
                    className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    {t.binNo}
                  </label>
                  <input
                    type="text"
                    value={binNo}
                    onChange={(e) => setBinNo(e.target.value)}
                    placeholder={isBn ? "বিআইএন (BIN) নম্বর" : "Business ID No"}
                    className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    {t.eTinNo}
                  </label>
                  <input
                    type="text"
                    value={eTinNo}
                    onChange={(e) => setETinNo(e.target.value)}
                    placeholder={isBn ? "ই-টিন (E-TIN) নম্বর" : "Tax ID No"}
                    className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                      isDark
                        ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  {t.address}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={isBn ? "ঠিকানা লিখুন" : "Address"}
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  {t.notes}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isBn ? "অতিরিক্ত কোনো বিবরণ..." : "Additional notes..."}
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-500"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                  }`}
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
                >
                  {isSaving && <i className="fa-solid fa-spinner animate-spin"></i>}
                  {isSaving ? t.updating : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteVendorId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 text-center ${
              isDark
                ? "bg-slate-900 border-slate-800 text-white"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-xl mx-auto mb-4">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h4 className="text-lg font-bold mb-2">{t.delete}</h4>
            <p className="text-sm opacity-70 mb-6">{t.confirmDelete}</p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteVendorId(null)}
                className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                    : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleDeleteVendor}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-all"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;
