import React, { useRef, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { SystemConfig, WasteCompany } from "../types";
import { insertWasteCompany, updateWasteCompany } from "../utils/supabaseApi";

interface WasteCompanySetupProps {
  companies: WasteCompany[];
  setCompanies: React.Dispatch<React.SetStateAction<WasteCompany[]>>;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
}

const normalizeBool = (value: unknown): boolean => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return true;
  return !["false", "0", "no", "inactive", "disabled"].includes(text);
};

const WasteCompanySetup: React.FC<WasteCompanySetupProps> = ({
  companies,
  setCompanies,
  systemConfig,
  supabase,
}) => {
  const isDark = systemConfig.theme === "dark";
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetCompanyForm = () => {
    setEditingCompanyId(null);
    setCompanyName("");
    setCompanyPhone("");
    setCompanyAddress("");
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const name = companyName.trim();
    if (!name) {
      setActionError("Company name is required.");
      return;
    }

    setActionError(null);
    try {
      if (editingCompanyId) {
        const updated = await updateWasteCompany(supabase, editingCompanyId, {
          name,
          phone: companyPhone.trim(),
          address: companyAddress.trim(),
        });
        if (updated) {
          setCompanies((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          );
        }
      } else {
        const created = await insertWasteCompany(supabase, {
          name,
          phone: companyPhone.trim(),
          address: companyAddress.trim(),
          active: true,
        });
        if (created) {
          setCompanies((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        }
      }
      resetCompanyForm();
    } catch (error: any) {
      setActionError(error?.message || "Failed to save company.");
    }
  };

  const handleCompanyEdit = (company: WasteCompany) => {
    setEditingCompanyId(company.id);
    setCompanyName(company.name);
    setCompanyPhone(company.phone || "");
    setCompanyAddress(company.address || "");
  };

  const handleCompanyToggle = async (company: WasteCompany) => {
    if (!supabase) return;
    setActionError(null);
    try {
      const updated = await updateWasteCompany(supabase, company.id, {
        active: !company.active,
      });
      if (updated) {
        setCompanies((prev) =>
          prev.map((item) => (item.id === company.id ? updated : item)),
        );
      }
    } catch (error: any) {
      setActionError(error?.message || "Failed to update company status.");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      if (rows.length === 0) {
        setActionError("No company rows found in the selected Excel file.");
        return;
      }

      const existingNames = new Set(
        companies.map((company) => company.name.trim().toLowerCase()),
      );
      const createdRows: WasteCompany[] = [];
      let skipped = 0;

      for (const row of rows) {
        const name = String(
          row["Company Name"] ??
            row["company_name"] ??
            row["Name"] ??
            row["name"] ??
            "",
        ).trim();
        if (!name) {
          skipped += 1;
          continue;
        }
        const key = name.toLowerCase();
        if (existingNames.has(key)) {
          skipped += 1;
          continue;
        }

        const created = await insertWasteCompany(supabase, {
          name,
          phone: String(row["Phone"] ?? row["phone"] ?? "").trim(),
          address: String(row["Address"] ?? row["address"] ?? "").trim(),
          active: normalizeBool(row["Active"] ?? row["active"] ?? true),
        });
        if (created) {
          createdRows.push(created);
          existingNames.add(key);
        }
      }

      if (createdRows.length > 0) {
        setCompanies((prev) => [...createdRows, ...prev]);
      }
      setActionError(null);
      window.alert(
        `Company import completed. Imported: ${createdRows.length}, Skipped: ${skipped}.`,
      );
    } catch (error: any) {
      setActionError(error?.message || "Failed to import Excel file.");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {actionError}
        </div>
      )}

      <form
        onSubmit={handleCompanySubmit}
        className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
      >
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              Company Setup
            </h3>
            <p className="text-xs font-medium text-slate-400 mt-1">
              Maintain waste collection companies in a dedicated tab.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleImportClick}
              className="rounded-xl bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-600"
            >
              Import Excel
            </button>
            {editingCompanyId && (
              <button
                type="button"
                onClick={resetCompanyForm}
                className="rounded-xl bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImportFileChange}
        />

        <div className={`mb-5 rounded-2xl border px-4 py-3 ${isDark ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-blue-50 border-blue-100 text-blue-700"}`}>
          <p className="text-[11px] font-black uppercase tracking-widest">Excel Format</p>
          <p className="mt-1 text-xs font-bold">
            Use columns: `Company Name`, `Phone`, `Address`, `Active`
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name"
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
          <input
            type="text"
            value={companyPhone}
            onChange={(e) => setCompanyPhone(e.target.value)}
            placeholder="Phone number"
            className={`rounded-xl border px-4 py-3 font-bold outline-none ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
          <input
            type="text"
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            placeholder="Address"
            className={`rounded-xl border px-4 py-3 font-bold outline-none md:col-span-2 ${isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-blue-700"
          >
            {editingCompanyId ? "Update Company" : "Save Company"}
          </button>
        </div>
      </form>

      <div className={`rounded-[2rem] border shadow-xl p-8 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              Company Directory
            </h3>
            <p className="text-xs font-medium text-slate-400 mt-1">
              All registered waste collection companies.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
            {companies.length} company(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className={`${isDark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-500"}`}>
              <tr>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Company</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Phone</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Address</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest">Status</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`${isDark ? "divide-slate-700" : "divide-slate-200"} divide-y`}>
              {companies
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((company) => (
                  <tr key={company.id}>
                    <td className="px-4 py-3 font-bold">{company.name}</td>
                    <td className="px-4 py-3">{company.phone || "-"}</td>
                    <td className="px-4 py-3">{company.address || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                          company.active
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {company.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleCompanyEdit(company)}
                          className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-600"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCompanyToggle(company)}
                          className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600"
                        >
                          {company.active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WasteCompanySetup;
