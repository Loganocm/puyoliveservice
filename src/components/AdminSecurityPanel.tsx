import { useState, useEffect, useCallback } from "react";
import { APIClient } from "@/api/client";
import { Loader2, Trash2 } from "lucide-react";

export function AdminSecurityPanel() {
  const [subTab, setSubTab] = useState<"bans" | "audit" | "login">("bans");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [banReason, setBanReason] = useState("");
  const [banUserId, setBanUserId] = useState("");
  const [banIp, setBanIp] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (subTab === "bans") {
        const res = await APIClient.adminGetBans(page);
        setData(res.bans || []);
        setTotalPages(res.totalPages || 1);
      } else if (subTab === "audit") {
        const res = await APIClient.adminGetAuditLogs(page);
        setData(res.logs || []);
        setTotalPages(res.totalPages || 1);
      } else if (subTab === "login") {
        const res = await APIClient.adminGetLoginLogs(page);
        setData(res.logs || []);
        setTotalPages(res.totalPages || 1);
      }
    } catch {
      setData([]);
    }
    setLoading(false);
  }, [subTab, page]);

  useEffect(() => {
    setPage(1);
  }, [subTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateBan = async () => {
    if (!banReason) return;
    try {
        await APIClient.adminCreateBan({
            user_id: banUserId ? Number(banUserId) : undefined,
            ip_address: banIp || undefined,
            reason: banReason,
        });
        setBanReason("");
        setBanUserId("");
        setBanIp("");
        loadData();
    } catch(e) { console.error(e); }
  };

  const handleDeleteBan = async (id: number) => {
    try {
        await APIClient.adminDeleteBan(id);
        loadData();
    } catch(e) { console.error(e); }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
      <div className="flex gap-4 mb-6 border-b border-white/10 pb-4">
        <button className={`font-bold transition ${subTab === "bans" ? "text-red-400" : "text-white/50"}`} onClick={() => setSubTab("bans")}>Active Bans</button>
        <button className={`font-bold transition ${subTab === "audit" ? "text-red-400" : "text-white/50"}`} onClick={() => setSubTab("audit")}>Audit Logs</button>
        <button className={`font-bold transition ${subTab === "login" ? "text-red-400" : "text-white/50"}`} onClick={() => setSubTab("login")}>Login Logs</button>
      </div>

      {subTab === "bans" && (
        <div className="mb-6 flex gap-2 flex-wrap">
            <input type="text" placeholder="User ID (optional)" className="bg-white/5 border border-white/10 px-3 py-2 rounded text-white text-sm" value={banUserId} onChange={e => setBanUserId(e.target.value)} />
            <input type="text" placeholder="IP Address (optional)" className="bg-white/5 border border-white/10 px-3 py-2 rounded text-white text-sm" value={banIp} onChange={e => setBanIp(e.target.value)} />
            <input type="text" placeholder="Reason (Required)" className="bg-white/5 border border-white/10 px-3 py-2 rounded text-white flex-1 text-sm" value={banReason} onChange={e => setBanReason(e.target.value)} />
            <button onClick={handleCreateBan} className="bg-red-500/20 text-red-300 px-4 rounded border border-red-500/30 font-bold hover:bg-red-500/30 text-sm">Issue Ban</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-white/50" /></div>
      ) : (
        <table className="w-full text-sm text-left text-white/70">
            <thead>
                <tr className="border-b border-white/10">
                    <th className="py-2">ID</th>
                    {subTab === "bans" && <th className="py-2">User / IP</th>}
                    {subTab === "bans" && <th className="py-2">Reason</th>}
                    {subTab === "bans" && <th className="py-2 text-right">Actions</th>}
                    
                    {subTab === "audit" && <th className="py-2">Admin</th>}
                    {subTab === "audit" && <th className="py-2">Action</th>}
                    {subTab === "audit" && <th className="py-2">Target</th>}
                    
                    {subTab === "login" && <th className="py-2">User</th>}
                    {subTab === "login" && <th className="py-2">IP</th>}
                    {subTab === "login" && <th className="py-2">Success</th>}
                    <th className="py-2 text-right">Date</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row: any) => (
                    <tr key={row.id} className="border-b border-white/5">
                        <td className="py-2 font-mono">#{row.id}</td>
                        {subTab === "bans" && <td className="py-2 font-medium text-white">{row.user?.username || row.ip_address || "Unknown"}</td>}
                        {subTab === "bans" && <td className="py-2">{row.reason}</td>}
                        {subTab === "bans" && (
                            <td className="py-2 text-right">
                                <button onClick={() => handleDeleteBan(row.id)} className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-white/5">
                                    <Trash2 className="w-4 h-4 ml-auto" />
                                </button>
                            </td>
                        )}

                        {subTab === "audit" && <td className="py-2 font-medium">{row.admin?.username || `ID: ${row.admin_id}`}</td>}
                        {subTab === "audit" && <td className="py-2"><span className="bg-white/10 px-2 py-0.5 rounded text-xs">{row.action}</span></td>}
                        {subTab === "audit" && <td className="py-2">{row.target_id ? `User #${row.target_id}` : (row.target_ip || "System")}</td>}

                        {subTab === "login" && <td className="py-2 font-medium">{row.user?.username || `ID: ${row.user_id}`}</td>}
                        {subTab === "login" && <td className="py-2 font-mono text-xs">{row.ip_address}</td>}
                        {subTab === "login" && <td className="py-2">{row.success ? <span className="text-green-400 px-2 py-0.5 bg-green-500/10 rounded">Yes</span> : <span className="text-red-400 px-2 py-0.5 bg-red-500/10 rounded">No</span>}</td>}

                        <td className="py-2 text-right text-white/40 text-xs">{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                ))}
                {data.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-white/40">No records found.</td></tr>
                )}
            </tbody>
        </table>
      )}
      
      <div className="flex justify-between items-center mt-6">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-white/5 rounded text-white/50 border border-white/10 hover:text-white disabled:opacity-30">Prev</button>
        <span className="text-white/50 text-xs">Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-white/5 rounded text-white/50 border border-white/10 hover:text-white disabled:opacity-30">Next</button>
      </div>
    </div>
  );
}
