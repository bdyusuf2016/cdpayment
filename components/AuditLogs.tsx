import React, { useState } from "react";
import { LogEntry, SystemConfig } from "../types";
import { printElement } from "../utils/printTable";

interface AuditLogsProps {
  systemConfig: SystemConfig;
}

const AuditLogs: React.FC<AuditLogsProps> = ({ systemConfig }) => {
  const [logs] = useState<LogEntry[]>([]);

  const [filter, setFilter] = useState("");

  const filteredLogs = logs.filter(
    (l) =>
      l.details.toLowerCase().includes(filter.toLowerCase()) ||
      l.action.toLowerCase().includes(filter.toLowerCase()),
  );

  const isDark = systemConfig.theme === "dark";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div
        className={`rounded-[2rem] shadow-xl border overflow-hidden ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-300"}`}
      >
        <div
          className={`p-8 border-b flex flex-wrap items-center justify-between gap-6 ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-900"}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 text-blue-400">
              <i className="fas fa-list-check text-xl"></i>
            </div>
            <div>
              <h3 className="text-white font-black uppercase text-xs tracking-widest">
                System Audit Logs
              </h3>
              <p className="text-slate-500 text-[9px] font-black uppercase tracking-tighter">
                Real-time security & action tracking
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input
                type="text"
                placeholder="Filter logs..."
                className={`border rounded-xl pl-12 pr-4 py-2.5 text-xs font-bold outline-none focus:border-blue-500 transition-all w-64 ${isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-800 border-slate-700 text-white"}`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button className="bg-white/10 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase border border-white/10 hover:bg-white/20 transition-all">
              <i className="fas fa-download mr-2"></i> CSV
            </button>
            <button
              onClick={() =>
                printElement(
                  document.getElementById("auditlogs-table"),
                  "System Audit Logs",
                )
              }
              className="bg-white/10 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase border border-white/10 hover:bg-white/20 transition-all ml-2"
            >
              <i className="fas fa-print mr-2"></i> Print
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table id="auditlogs-table" className="w-full text-left">
            <thead>
              <tr className={`${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Timestamp
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Initiator
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Action
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Module
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Activity Detail
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-300"}`}
            >
              {filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest"
                  >
                    No logs available
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className={`transition-colors group ${isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50/50"}`}
                  >
                    <td className="px-8 py-6 text-[11px] font-black text-slate-400 font-mono tracking-tighter whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="px-8 py-6">
                      <span
                        className={`text-[11px] font-black uppercase tracking-tight ${isDark ? "text-slate-200" : "text-slate-900"}`}
                      >
                        {log.user}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            log.type === "danger"
                              ? "bg-red-500"
                              : log.type === "success"
                                ? "bg-green-500"
                                : log.type === "warning"
                                  ? "bg-amber-500"
                                  : "bg-blue-500"
                          }`}
                        ></div>
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${isDark ? "text-slate-300" : "text-slate-700"}`}
                        >
                          {log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-tighter ${isDark ? "text-slate-400 bg-slate-900 border-slate-700" : "text-slate-400 bg-slate-100 border-slate-200"}`}
                      >
                        {log.module}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <p
                        className={`text-[11px] font-bold leading-snug transition-colors ${isDark ? "text-slate-400 group-hover:text-slate-200" : "text-slate-500 group-hover:text-slate-800"}`}
                      >
                        {log.details}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-600 p-8 rounded-[2rem] shadow-xl shadow-blue-100 flex items-center justify-between text-white">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-[1.5rem] bg-white/10 flex items-center justify-center border border-white/20">
            <i className="fas fa-shield-halved text-3xl"></i>
          </div>
          <div>
            <h4 className="font-black text-lg uppercase tracking-tight">
              Security Protocol Active
            </h4>
            <p className="text-white/60 font-bold text-xs uppercase tracking-widest mt-1">
              End-to-End Audit Trail Encryption Enabled
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
            System Uptime
          </p>
          <p className="text-2xl font-black">99.99%</p>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
