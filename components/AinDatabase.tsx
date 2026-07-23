import React, { useEffect, useMemo, useRef, useState } from "react";
import { Client, SystemConfig } from "../types";
import { SupabaseClient } from "@supabase/supabase-js";
import { insertClient, updateClient, deleteClient } from "../utils/supabaseApi";
import {
  getClientPhones,
  getPrimaryClientPhone,
  parseClientPhones,
  serializeClientPhones,
} from "../utils/clientPhones";

interface AinDatabaseProps {
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  onVisibleRowsChange: (rows: Client[]) => void;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
  canAdd: boolean;
  canDelete: boolean;
  canImport: boolean;
  canExport: boolean;
}

const AinDatabase: React.FC<AinDatabaseProps> = ({
  clients,
  setClients,
  onVisibleRowsChange,
  systemConfig,
  supabase,
  canAdd,
  canDelete,
  canImport,
  canExport,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formAin, setFormAin] = useState("");
  const [formName, setFormName] = useState("");
  const [formPhonesText, setFormPhonesText] = useState("");
  const [formCircle, setFormCircle] = useState("East");
  const [selectedAins, setSelectedAins] = useState<string[]>([]);
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [pendingDeletedAins, setPendingDeletedAins] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<"latest" | "ain" | "name" | "phone">(
    "latest",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // For Custom Confirmation
  const [confirmDelete, setConfirmDelete] = useState<{
    show: boolean;
    ain: string | null;
    isBulk: boolean;
  }>({
    show: false,
    ain: null,
    isBulk: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClients = useMemo(() => {
    const merged = new Map<string, Client>();
    for (const c of clients) merged.set(c.ain, c);
    for (const c of localClients) merged.set(c.ain, c);
    for (const ain of pendingDeletedAins) merged.delete(ain);
    return Array.from(merged.values());
  }, [clients, localClients, pendingDeletedAins]);

  const filteredClients = allClients.filter(
    (c) =>
      c.ain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const clientTime = (client: Client) => {
    const raw = (client as any).created_at || (client as any).createdAt || "";
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const sortedClients = useMemo(() => {
    const rows = [...filteredClients];
    rows.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";

      if (sortKey === "latest") {
        left = clientTime(a);
        right = clientTime(b);
        if (left === right) {
          left = (a.ain || "").toLowerCase();
          right = (b.ain || "").toLowerCase();
        }
      } else if (sortKey === "ain") {
        left = (a.ain || "").toLowerCase();
        right = (b.ain || "").toLowerCase();
      } else if (sortKey === "name") {
        left = (a.name || "").toLowerCase();
        right = (b.name || "").toLowerCase();
      } else {
        left = getPrimaryClientPhone(a).toLowerCase();
        right = getPrimaryClientPhone(b).toLowerCase();
      }

      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filteredClients, sortKey, sortDir]);

  const toggleSort = (key: "latest" | "ain" | "name" | "phone") => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "latest" ? "desc" : "asc");
  };

  const getSortIcon = (key: "latest" | "ain" | "name" | "phone") => {
    if (sortKey !== key) return "fa-sort text-slate-400";
    return sortDir === "asc"
      ? "fa-sort-up text-blue-600"
      : "fa-sort-down text-blue-600";
  };

  useEffect(() => {
    onVisibleRowsChange(sortedClients);
  }, [sortedClients, onVisibleRowsChange]);

  const handleOpenModal = (client?: Client) => {
    if (!canAdd) {
      alert("You do not have permission to add or edit AIN profiles.");
      return;
    }
    setActionError(null);

    if (client) {
      setEditingClient(client);
      setFormAin(client.ain);
      setFormName(client.name);
      setFormPhonesText(getClientPhones(client).join("\n"));
      setFormCircle(client.circle || "East");
    } else {
      setEditingClient(null);
      setFormAin("");
      setFormName("");
      setFormPhonesText("");
      setFormCircle("East");
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    const trimmedAin = formAin.trim();
    const trimmedName = formName.trim();

    if (!trimmedAin || !trimmedName || !supabase) {
      alert("AIN, Name, and a valid Supabase client are required!");
      return;
    }
    if (!canAdd) {
      alert("You do not have permission to save AIN profiles.");
      return;
    }
    setActionError(null);

    const phones = parseClientPhones(formPhonesText);
    const clientData = {
      ain: trimmedAin,
      name: trimmedName,
      phone: serializeClientPhones(phones),
      phones,
      active: true,
      circle: formCircle,
    };

    try {
      setIsSaving(true);

      if (editingClient) {
        // If changing the AIN, ensure the new AIN is not already used by another record
        if (
          clientData.ain !== editingClient.ain &&
          allClients.some((c) => c.ain === clientData.ain)
        ) {
          alert("This AIN already exists! Choose a different AIN.");
          return;
        }
        const updated = await updateClient(supabase, editingClient.ain, clientData);
        if (!updated) return;
        setClients((prev) => {
          const next = prev.filter(
            (c) => c.ain !== editingClient.ain && c.ain !== updated.ain,
          );
          return [...next, updated];
        });
        setLocalClients((prev) => {
          const next = prev.filter(
            (c) => c.ain !== editingClient.ain && c.ain !== updated.ain,
          );
          return [...next, updated];
        });
        setPendingDeletedAins((prev) =>
          prev.filter((ain) => ain !== editingClient.ain),
        );
      } else {
        if (allClients.some((c) => c.ain === clientData.ain)) {
          alert("This AIN already exists!");
          return;
        }
        const inserted = await insertClient(supabase, clientData);
        if (!inserted) return;
        setClients((prev) => {
          const next = prev.filter((c) => c.ain !== inserted.ain);
          return [...next, inserted];
        });
        setLocalClients((prev) => {
          const next = prev.filter((c) => c.ain !== inserted.ain);
          return [...next, inserted];
        });
        setPendingDeletedAins((prev) =>
          prev.filter((ain) => ain !== inserted.ain),
        );
      }
      setShowModal(false);
    } catch (error: any) {
      const message = error?.message || "AIN save failed.";
      setActionError(message);
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  const processDelete = async () => {
    if (!canDelete) {
      alert("You do not have permission to delete AIN profiles.");
      return;
    }
    setActionError(null);
    if (!supabase) return;
    const idsToDelete = confirmDelete.isBulk
      ? selectedAins
      : confirmDelete.ain
        ? [confirmDelete.ain]
        : [];

    if (idsToDelete.length === 0) {
      setConfirmDelete({ show: false, ain: null, isBulk: false });
      return;
    }

    const deletedAins: string[] = [];

    try {
      if (confirmDelete.isBulk) {
        for (const ain of selectedAins) {
          const deleted = await deleteClient(supabase, ain);
          if (deleted) deletedAins.push(ain);
        }
        setSelectedAins((prev) => prev.filter((id) => !deletedAins.includes(id)));
      } else if (confirmDelete.ain) {
        const deleted = await deleteClient(supabase, confirmDelete.ain);
        if (deleted) deletedAins.push(confirmDelete.ain);
        setSelectedAins((prev) => prev.filter((id) => id !== confirmDelete.ain));
      }
    } catch (error: any) {
      const message = error?.message || "Delete failed.";
      setActionError(message);
      alert(message);
      return;
    }

    if (deletedAins.length === 0) {
      alert("Delete failed. This account may not have AIN delete permission.");
      return;
    }

    setPendingDeletedAins((prev) => Array.from(new Set([...prev, ...deletedAins])));
    setLocalClients((prev) => prev.filter((c) => !deletedAins.includes(c.ain)));
    setClients((prev) => prev.filter((c) => !deletedAins.includes(c.ain)));

    if (deletedAins.length !== idsToDelete.length) {
      alert("Some selected AIN profiles could not be deleted.");
    }
    setConfirmDelete({ show: false, ain: null, isBulk: false });
  };

  const handleExport = () => {
    if (!canExport) {
      alert("You do not have permission to export AIN profiles.");
      return;
    }
    const headers = "AIN,Name,Phone,Circle\n";
    const rows = allClients
      .map((c) => `${c.ain},${c.name},${serializeClientPhones(getClientPhones(c))},${c.circle || "East"}`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ain_database_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleImportClick = () => {
    if (!canImport) {
      alert("You do not have permission to import AIN profiles.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImport) {
      alert("You do not have permission to import AIN profiles.");
      return;
    }
    setActionError(null);
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").slice(1); // Skip header
      const newClients: Omit<Client, "created_at">[] = [];

      for (const line of lines) {
        const row = line.split(",");
        if (row.length >= 2) {
          const [ain, name, phone, circle] = row;
          if (ain && name && !allClients.some((c) => c.ain === ain.trim())) {
            newClients.push({
              ain: ain.trim(),
              name: name.trim(),
              phone: serializeClientPhones(parseClientPhones(phone || "")),
              phones: parseClientPhones(phone || ""),
              active: true,
              circle: circle ? circle.trim() : "East",
            });
          }
        }
      }

      if (newClients.length > 0) {
        const insertedClients: Client[] = [];
        let failedCount = 0;

        for (const client of newClients) {
          try {
            const inserted = await insertClient(supabase, client);
            if (inserted) insertedClients.push(inserted);
          } catch (error) {
            failedCount += 1;
          }
        }

        if (insertedClients.length === 0) {
          alert("Import failed. This account may not have AIN import/add permission.");
          return;
        }

        setClients((prev) => {
          const map = new Map(prev.map((c) => [c.ain, c]));
          insertedClients.forEach((c) => map.set(c.ain, c));
          return Array.from(map.values());
        });
        setLocalClients((prev) => {
          const next = [...prev];
          for (const nc of insertedClients) {
            const idx = next.findIndex((c) => c.ain === nc.ain);
            if (idx >= 0) next[idx] = nc;
            else next.push(nc);
          }
          return next;
        });
        setPendingDeletedAins((prev) =>
          prev.filter((ain) => !insertedClients.some((c) => c.ain === ain)),
        );
        alert(
          failedCount > 0
            ? `${insertedClients.length} clients imported successfully, ${failedCount} failed.`
            : `${insertedClients.length} new clients imported successfully!`,
        );
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

  const toggleSelectAll = () => {
    if (
      selectedAins.length === sortedClients.length &&
      sortedClients.length > 0
    ) {
      setSelectedAins([]);
    } else {
      setSelectedAins(sortedClients.map((c) => c.ain));
    }
  };

  const toggleSelectOne = (ain: string) => {
    setSelectedAins((prev) =>
      prev.includes(ain) ? prev.filter((a) => a !== ain) : [...prev, ain],
    );
  };

  const isDark = systemConfig.theme === "dark";

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div
        className={`flex flex-wrap gap-3 items-center backdrop-blur-sm p-4 rounded-2xl border shadow-sm ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white/50 border-white"}`}
      >
        <button
          onClick={() => handleOpenModal()}
          disabled={!canAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-200 uppercase text-[11px] tracking-wider"
        >
          <i className="fas fa-plus-circle"></i> New Client
        </button>

        {selectedAins.length > 0 && (
          <button
            onClick={() =>
              setConfirmDelete({ show: true, ain: null, isBulk: true })
            }
            className="bg-red-500 hover:bg-red-600 text-white font-black py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-100 uppercase text-[11px] tracking-wider animate-in zoom-in duration-200"
          >
            <i className="fas fa-trash-alt"></i> Delete Selected (
            {selectedAins.length})
          </button>
        )}

        <div className="flex-grow"></div>

        <div className="flex gap-2">
          <button
            onClick={handleImportClick}
            disabled={!canImport}
            className="bg-slate-800 hover:bg-slate-900 text-white font-black py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-sm uppercase text-[10px] tracking-widest"
          >
            <i className="fas fa-file-import text-blue-400"></i> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleFileChange}
          />
          <button
            onClick={handleExport}
            disabled={!canExport}
            className={`font-black py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-sm uppercase text-[10px] tracking-widest border ${isDark ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-slate-200 text-slate-700"}`}
          >
            <i className="fas fa-file-export text-green-500"></i> Export
          </button>
        </div>
      </div>

      {actionError && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            isDark
              ? "bg-red-950/30 border-red-900 text-red-300"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {actionError}
        </div>
      )}

      {/* Table Section */}
      <div
        className={`rounded-[2rem] shadow-xl border overflow-hidden ${isDark ? "bg-slate-800 border-slate-700 shadow-slate-900/50" : "bg-white border-slate-100 shadow-slate-200/50"}`}
      >
        <div
          className={`p-6 border-b flex flex-wrap items-center justify-between gap-4 ${isDark ? "bg-slate-900/50 border-slate-700" : "bg-slate-50/50 border-slate-100"}`}
        >
          <div className="relative flex-grow max-w-md">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              type="text"
              placeholder="Search database..."
              className={`w-full border-2 rounded-2xl pl-12 pr-4 py-3 focus:border-blue-500 focus:bg-white outline-none transition-all font-bold text-slate-700 placeholder:text-slate-400 ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-100"}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest">
              {sortedClients.length} Profiles
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`${isDark ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-300"} border-b`}
              >
                <th className="px-6 py-3 w-12 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                    checked={
                      sortedClients.length > 0 &&
                      selectedAins.length === sortedClients.length
                    }
                    onChange={toggleSelectAll}
                    disabled={!canDelete}
                  />
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => toggleSort("ain")}
                    className="inline-flex items-center gap-1"
                  >
                    AIN ID <i className={`fas ${getSortIcon("ain")}`}></i>
                  </button>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1"
                  >
                    Business Information{" "}
                    <i className={`fas ${getSortIcon("name")}`}></i>
                  </button>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Circle
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => toggleSort("phone")}
                    className="inline-flex items-center gap-1"
                  >
                    Communication <i className={`fas ${getSortIcon("phone")}`}></i>
                  </button>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-300"}`}
            >
              {sortedClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <i className="fas fa-database text-6xl mb-4"></i>
                      <p className="font-bold text-lg">No Client Data Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedClients.map((client) => (
                  <tr
                    key={client.ain}
                    className={`group transition-all ${
                      selectedAins.includes(client.ain)
                        ? "bg-blue-50/50 dark:bg-blue-900/10"
                        : isDark
                          ? "hover:bg-slate-800/40"
                          : "hover:bg-slate-50/70"
                    }`}
                  >
                    <td className="px-6 py-3 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                        checked={selectedAins.includes(client.ain)}
                        onChange={() => toggleSelectOne(client.ain)}
                        disabled={!canDelete}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-sm font-black px-3 py-1.5 rounded-xl border shadow-sm ${isDark ? "bg-blue-900/30 border-blue-800 text-blue-400" : "bg-blue-50 border-blue-100 text-blue-700"}`}
                      >
                        {client.ain}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div
                        className={`text-sm font-black transition-colors ${isDark ? "text-slate-200 group-hover:text-blue-400" : "text-slate-800 group-hover:text-blue-700"}`}
                      >
                        {client.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                        Verified Importer/Exporter
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs font-black px-2.5 py-1 rounded-xl border shadow-sm ${
                          client.circle === "West"
                            ? "bg-purple-50 border-purple-100 text-purple-700 dark:bg-purple-950/20 dark:border-purple-800 dark:text-purple-400"
                            : client.circle === "North"
                              ? "bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400"
                              : client.circle === "South"
                                ? "bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400"
                                : "bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400"
                        }`}
                      >
                        {client.circle || "East"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {getClientPhones(client).length > 0 ? (
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${isDark ? "bg-green-900/20 text-green-500 border-green-800" : "bg-green-50 text-green-500 border-green-100"}`}
                          >
                            <i className="fab fa-whatsapp text-sm"></i>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getClientPhones(client).map((phoneNumber) => (
                              <span
                                key={`${client.ain}-${phoneNumber}`}
                                className={`text-xs font-black px-3 py-1.5 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}
                              >
                                {phoneNumber}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-500 text-[11px] italic font-bold">
                          No WhatsApp Linked
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleOpenModal(client)}
                          disabled={!canAdd}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isDark ? "bg-slate-700 text-blue-400 hover:bg-blue-600 hover:text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"}`}
                          title="Edit Profile"
                        >
                          <i className="fas fa-pen text-xs"></i>
                        </button>
                        <button
                          onClick={() =>
                            setConfirmDelete({
                              show: true,
                              ain: client.ain,
                              isBulk: false,
                            })
                          }
                          disabled={!canDelete}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isDark ? "bg-slate-700 text-red-400 hover:bg-red-500 hover:text-white" : "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white"}`}
                          title="Delete Record"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div
            className={`rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <div className="bg-gradient-to-br from-slate-900 to-blue-900 p-8 pb-10 relative">
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
              >
                <i className="fas fa-times text-2xl"></i>
              </button>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-400/20 text-blue-400">
                  <i
                    className={`fas ${editingClient ? "fa-user-edit" : "fa-user-plus"} text-3xl`}
                  ></i>
                </div>
                <div>
                  <h2 className="text-white font-black text-xl tracking-tight leading-none">
                    {editingClient ? "Update Profile" : "New Registration"}
                  </h2>
                  <p className="text-blue-300/60 text-xs font-bold mt-2 uppercase tracking-widest">
                    Client Management System
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`p-8 -mt-6 rounded-t-[2.5rem] space-y-5 ${isDark ? "bg-slate-800" : "bg-white"}`}
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    AIN Identification Number
                  </label>
                  <input
                    type="text"
                    className={`w-full px-6 py-3 rounded-2xl border-2 outline-none font-black text-base transition-all ${isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-50 text-slate-800"} focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5`}
                    placeholder="8031XXXXX"
                    value={formAin}
                    onChange={(e) => setFormAin(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    className={`w-full px-6 py-3 rounded-2xl border-2 outline-none font-black text-slate-800 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500" : "bg-slate-50 border-slate-50 focus:bg-white focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5"}`}
                    placeholder="Enter legal business name..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    WhatsApp Numbers
                  </label>
                  <textarea
                    rows={4}
                    className={`w-full px-6 py-3 rounded-2xl border-2 outline-none font-black text-slate-800 transition-all resize-none ${isDark ? "bg-slate-900 border-slate-700 text-slate-200 focus:border-green-500" : "bg-slate-50 border-slate-50 focus:bg-white focus:border-green-500 focus:ring-8 focus:ring-green-500/5"}`}
                    placeholder={"017XXXXXXXX\n018XXXXXXXX"}
                    value={formPhonesText}
                    onChange={(e) => setFormPhonesText(e.target.value)}
                  />
                  <p className="text-[10px] font-bold text-slate-400 ml-1">
                    এক লাইনে একটি নাম্বার লিখুন। কমা, সেমিকোলন, বা পাইপ দিয়েও আলাদা করা যাবে।
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    সার্কেল (Circle)
                  </label>
                  <select
                    className={`w-full px-6 py-3 rounded-2xl border-2 outline-none font-black text-base transition-all ${
                      isDark ? "bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500" : "bg-slate-50 border-slate-50 focus:bg-white focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5"
                    }`}
                    value={formCircle}
                    onChange={(e) => setFormCircle(e.target.value)}
                  >
                    <option value="East">East</option>
                    <option value="West">West</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className={`flex-grow py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all ${isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !canAdd}
                  className="flex-grow py-3 rounded-2xl font-black text-white uppercase text-[11px] tracking-widest bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95"
                >
                  {isSaving
                    ? "Saving..."
                    : editingClient
                      ? "Update Profile"
                      : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            className={`rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-10 text-center animate-in zoom-in-95 ${isDark ? "bg-slate-800" : "bg-white"}`}
          >
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
              <i className="fas fa-exclamation-triangle text-3xl"></i>
            </div>
            <h3
              className={`text-xl font-black leading-tight ${isDark ? "text-white" : "text-slate-900"}`}
            >
              Confirm Deletion
            </h3>
            <p
              className={`font-medium text-sm mt-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              {confirmDelete.isBulk
                ? `Are you sure you want to delete ${selectedAins.length} selected client profiles? This action is permanent.`
                : `Are you sure you want to delete client AIN: ${confirmDelete.ain}? This cannot be undone.`}
            </p>
            <div className="flex flex-col gap-3 mt-8">
              <button
                onClick={processDelete}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-xl shadow-red-100 transition-all active:scale-95 uppercase text-xs tracking-widest"
              >
                Yes, Delete Permanently
              </button>
              <button
                onClick={() =>
                  setConfirmDelete({ show: false, ain: null, isBulk: false })
                }
                className={`w-full py-4 font-black rounded-2xl transition-all uppercase text-xs tracking-widest ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AinDatabase;
