import React, { useMemo, useRef, useState } from "react";
import { Client, SystemConfig } from "../types";
import { SupabaseClient } from "@supabase/supabase-js";
import { insertClient, updateClient, deleteClient } from "../utils/supabaseApi";

interface AinDatabaseProps {
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  systemConfig: SystemConfig;
  supabase: SupabaseClient | null;
}

const AinDatabase: React.FC<AinDatabaseProps> = ({
  clients,
  setClients,
  systemConfig,
  supabase,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formAin, setFormAin] = useState("");
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [selectedAins, setSelectedAins] = useState<string[]>([]);
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [pendingDeletedAins, setPendingDeletedAins] = useState<string[]>([]);

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

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormAin(client.ain);
      setFormName(client.name);
      setFormPhone(client.phone || "");
    } else {
      setEditingClient(null);
      setFormAin("");
      setFormName("");
      setFormPhone("");
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formAin || !formName || !supabase) {
      alert("AIN, Name, and a valid Supabase client are required!");
      return;
    }

    const clientData = {
      ain: formAin.trim(),
      name: formName.trim(),
      phone: formPhone.trim(),
      active: true,
    };
    if (editingClient) {
      // If changing the AIN, ensure the new AIN is not already used by another record
      if (
        clientData.ain !== editingClient.ain &&
        allClients.some((c) => c.ain === clientData.ain)
      ) {
        alert("This AIN already exists! Choose a different AIN.");
        return;
      }
      const updated =
        (await updateClient(supabase, editingClient.ain, clientData)) ||
        (clientData as Client);
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
      const inserted = (await insertClient(supabase, clientData)) || clientData;
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
  };

  const processDelete = async () => {
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

    setPendingDeletedAins((prev) => Array.from(new Set([...prev, ...idsToDelete])));
    setLocalClients((prev) => prev.filter((c) => !idsToDelete.includes(c.ain)));
    setClients((prev) => prev.filter((c) => !idsToDelete.includes(c.ain)));

    if (confirmDelete.isBulk) {
      for (const ain of selectedAins) {
        await deleteClient(supabase, ain);
      }
      setSelectedAins([]);
    } else if (confirmDelete.ain) {
      await deleteClient(supabase, confirmDelete.ain);
      setSelectedAins((prev) => prev.filter((id) => id !== confirmDelete.ain));
    }
    setConfirmDelete({ show: false, ain: null, isBulk: false });
  };

  const handleExport = () => {
    const headers = "AIN,Name,Phone\n";
    const rows = allClients.map((c) => `${c.ain},${c.name},${c.phone}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ain_database_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            const [ain, name, phone] = row;
          if (ain && name && !allClients.some((c) => c.ain === ain.trim())) {
            newClients.push({
              ain: ain.trim(),
              name: name.trim(),
              phone: (phone || "").trim(),
              active: true,
            });
          }
        }
      }

      if (newClients.length > 0) {
        setClients((prev) => {
          const map = new Map(prev.map((c) => [c.ain, c]));
          newClients.forEach((c) => map.set(c.ain, c as Client));
          return Array.from(map.values());
        });
        setLocalClients((prev) => {
          const next = [...prev];
          for (const nc of newClients) {
            const idx = next.findIndex((c) => c.ain === nc.ain);
            if (idx >= 0) next[idx] = nc as Client;
            else next.push(nc as Client);
          }
          return next;
        });
        for (const client of newClients) {
          await insertClient(supabase, client);
        }
        setPendingDeletedAins((prev) =>
          prev.filter((ain) => !newClients.some((c) => c.ain === ain)),
        );
        alert(`${newClients.length} new clients imported successfully!`);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

  const toggleSelectAll = () => {
    if (
      selectedAins.length === filteredClients.length &&
      filteredClients.length > 0
    ) {
      setSelectedAins([]);
    } else {
      setSelectedAins(filteredClients.map((c) => c.ain));
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
            className={`font-black py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-sm uppercase text-[10px] tracking-widest border ${isDark ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-slate-200 text-slate-700"}`}
          >
            <i className="fas fa-file-export text-green-500"></i> Export
          </button>
        </div>
      </div>

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
              {filteredClients.length} Profiles
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={`${isDark ? "bg-slate-900" : "bg-slate-900"}`}>
                <th className="px-6 py-4 w-14 text-center">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-2 border-slate-700 bg-transparent checked:bg-blue-500 checked:border-blue-500 transition-all cursor-pointer accent-blue-500"
                    checked={
                      filteredClients.length > 0 &&
                      selectedAins.length === filteredClients.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  AIN ID
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  Business Information
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  Communication
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-right tracking-[0.2em] pr-12">
                  Action
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-50"}`}
            >
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <i className="fas fa-database text-6xl mb-4"></i>
                      <p className="font-bold text-lg">No Client Data Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.ain}
                    className={`transition-all group ${selectedAins.includes(client.ain) ? "bg-blue-50/40 dark:bg-blue-900/10" : "hover:bg-slate-50/50 dark:hover:bg-slate-700/50"}`}
                  >
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-lg border-2 border-slate-200 transition-all cursor-pointer accent-blue-500"
                        checked={selectedAins.includes(client.ain)}
                        onChange={() => toggleSelectOne(client.ain)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-sm font-black px-3 py-1.5 rounded-xl border shadow-sm ${isDark ? "bg-blue-900/30 border-blue-800 text-blue-400" : "bg-blue-50 border-blue-100 text-blue-700"}`}
                      >
                        {client.ain}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className={`text-sm font-black transition-colors ${isDark ? "text-slate-200 group-hover:text-blue-400" : "text-slate-800 group-hover:text-blue-700"}`}
                      >
                        {client.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                        Verified Importer/Exporter
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {client.phone ? (
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center border ${isDark ? "bg-green-900/20 text-green-500 border-green-800" : "bg-green-50 text-green-500 border-green-100"}`}
                          >
                            <i className="fab fa-whatsapp text-sm"></i>
                          </div>
                          <span
                            className={`text-sm font-black ${isDark ? "text-slate-300" : "text-slate-600"}`}
                          >
                            {client.phone}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-500 text-[11px] italic font-bold">
                          No WhatsApp Linked
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenModal(client)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-md active:scale-90 border ${isDark ? "bg-slate-700 border-slate-600 text-blue-400 hover:bg-blue-600 hover:text-white" : "bg-white border-slate-100 text-blue-600 hover:bg-blue-600 hover:text-white"}`}
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
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-md active:scale-90 border ${isDark ? "bg-slate-700 border-slate-600 text-red-400 hover:bg-red-500 hover:text-white" : "bg-white border-slate-100 text-red-500 hover:bg-red-500 hover:text-white"}`}
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
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    className={`w-full px-6 py-3 rounded-2xl border-2 outline-none font-black text-slate-800 transition-all ${isDark ? "bg-slate-900 border-slate-700 text-slate-200 focus:border-green-500" : "bg-slate-50 border-slate-50 focus:bg-white focus:border-green-500 focus:ring-8 focus:ring-green-500/5"}`}
                    placeholder="017XXXXXXXX"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
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
                  className="flex-grow py-3 rounded-2xl font-black text-white uppercase text-[11px] tracking-widest bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95"
                >
                  {editingClient ? "Update Profile" : "Save Profile"}
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
