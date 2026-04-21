import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Users,
  Swords,
  Trash2,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { APIClient } from "@/api/client";
import { NetworkManager } from "@/core/NetworkManager";
import { useMenuInput } from "@/hooks/useMenuInput";
import { AdminSecurityPanel } from "@/components/AdminSecurityPanel";

interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  elo_rating: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  highest_chain: number;
  total_garbage_sent: number;
  level: number;
  current_xp: number;
  is_admin: boolean;
  created_at: string;
}

interface AdminStats {
  totalUsers: number;
  totalMatches: number;
  recentUsers: number;
  recentMatches: number;
}

interface EditingState {
  userId: number;
  field: string;
  value: string;
}

interface AdminRoom {
  id: string;
  players: { id: string; username: string; userId?: number; ready: boolean }[];
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  ranked: boolean;
  inMatch: boolean;
  matchConcluded: boolean;
  createdAt: number;
  settings: {
    bestOf: number;
    maxPlayers: number;
    garbageMultiplier: number;
    marginTime: number;
  };
}

export function AdminScreen({ onBack, onWatchReplay }: { onBack: () => void, onWatchReplay?: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "rooms" | "security">("users");
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [deleteRoomConfirm, setDeleteRoomConfirm] = useState<string | null>(
    null,
  );
  const LIMIT = 20;

  useMenuInput({ onBack }, [onBack]);

  const loadStats = useCallback(async () => {
    try {
      const data = await APIClient.adminGetStats();
      setStats(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await APIClient.adminGetUsers(page, LIMIT, search);
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e: any) {
      setError(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Rooms management via socket
  const loadRooms = useCallback(() => {
    setRoomsLoading(true);
    NetworkManager.emitToServer("admin_list_rooms");
  }, []);

  useEffect(() => {
    const onRoomsList = (data: { rooms: AdminRoom[] }) => {
      setRooms(data.rooms);
      setRoomsLoading(false);
    };
    const onRoomDeleted = (data: { roomId: string }) => {
      setSuccess(`Room ${data.roomId} deleted`);
      setDeleteRoomConfirm(null);
      setTimeout(() => setSuccess(""), 3000);
      loadRooms();
    };
    NetworkManager.on("admin_rooms_list", onRoomsList);
    NetworkManager.on("admin_room_deleted", onRoomDeleted);
    return () => {
      NetworkManager.off("admin_rooms_list", onRoomsList);
      NetworkManager.off("admin_room_deleted", onRoomDeleted);
    };
  }, [loadRooms]);

  useEffect(() => {
    if (activeTab === "rooms") loadRooms();
  }, [activeTab, loadRooms]);

  const handleDeleteRoom = (roomId: string) => {
    NetworkManager.emitToServer("admin_delete_room", { roomId });
  };

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const startEdit = (userId: number, field: string, currentValue: any) => {
    setEditing({ userId, field, value: String(currentValue ?? "") });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const numericFields = [
        "elo_rating",
        "games_played",
        "games_won",
        "games_lost",
        "highest_chain",
        "total_garbage_sent",
        "level",
        "current_xp",
      ];
      const val = numericFields.includes(editing.field)
        ? Number(editing.value)
        : editing.value;
      await APIClient.adminUpdateUser(editing.userId, { [editing.field]: val });
      setSuccess(`Updated ${editing.field} for user #${editing.userId}`);
      setEditing(null);
      setTimeout(() => setSuccess(""), 3000);
      loadUsers();
    } catch (e: any) {
      setError(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError("");
    try {
      const result = await APIClient.adminDeleteUser(id);
      setSuccess(`Deleted user: ${result.deleted}`);
      setDeleteConfirm(null);
      setTimeout(() => setSuccess(""), 3000);
      loadUsers();
      loadStats();
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  const editableFields = [
    { key: "username", label: "Username" },
    { key: "email", label: "Email" },
    { key: "elo_rating", label: "ELO" },
    { key: "games_played", label: "Games" },
    { key: "games_won", label: "Wins" },
    { key: "games_lost", label: "Losses" },
    { key: "highest_chain", label: "Best Chain" },
    { key: "total_garbage_sent", label: "Garbage" },
    { key: "level", label: "Level" },
    { key: "current_xp", label: "XP" },
  ];

  return (
    <div className="size-full relative overflow-hidden bg-transparent flex items-center justify-center">
      {/* Grid bg */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(239,68,68,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(239,68,68,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <BackButton onClick={onBack} />

      <div className="w-full max-w-6xl px-6 py-20 overflow-y-auto max-h-full">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-red-400" />
            <h1 className="text-4xl font-black text-white tracking-tighter italic drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              ADMIN PANEL
            </h1>
          </div>
          <button
            onClick={async () => {
              const { SceneManager } = await import("@/core/SceneManager");
              const { ReplayScene } = await import("@/scenes/ReplayScene");
              const mockReplayData = {
                version: 3 as const,
                engineVersion: '1.0.0',
                seed: 1337,
                players: [
                  { id: "1", username: "Admin Tester 1" },
                  { id: "2", username: "Target Dummy" }
                ],
                winner: 0 as const,
                duration: 60 * 60 * 2,
                fps: 60,
                inputs: [
                  { f: 10, p: 0 as const, i: "HD" as const },
                  { f: 20, p: 0 as const, i: "HD" as const },
                  { f: 30, p: 0 as const, i: "CW" as const },
                  { f: 32, p: 0 as const, i: "HD" as const },
                  { f: 45, p: 1 as const, i: "R" as const },
                  { f: 50, p: 1 as const, i: "HD" as const },
                  { f: 60, p: 0 as const, i: "L" as const },
                  { f: 62, p: 0 as const, i: "HD" as const }
                ],
                playerSettings: [
                  { sdf: 10, softDropProtection: true },
                  { sdf: 10, softDropProtection: true }
                ] as [{ sdf: number; softDropProtection: boolean }, { sdf: number; softDropProtection: boolean }],
                roomSettings: { garbageMultiplier: 1, marginTime: 96 },
                pieceSequences: [[], []] as [number[], number[]],
                garbageColumns: [[], []] as [number[][], number[][]],
                events: [],
                stateHashes: [],
              };
              SceneManager.changeScene(new ReplayScene(mockReplayData));
              onWatchReplay?.();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-300 border border-purple-500/30 rounded-xl hover:bg-purple-500/30 font-bold text-sm transition"
          >
            Mock Replay
          </button>
        </motion.div>

        {/* Stats Cards */}
        {stats && (
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {[
              {
                label: "Total Users",
                value: stats.totalUsers,
                icon: Users,
                color: "text-blue-400",
              },
              {
                label: "Total Matches",
                value: stats.totalMatches,
                icon: Swords,
                color: "text-purple-400",
              },
              {
                label: "New Users (24h)",
                value: stats.recentUsers,
                icon: Users,
                color: "text-green-400",
              },
              {
                label: "Matches (24h)",
                value: stats.recentMatches,
                icon: Swords,
                color: "text-yellow-400",
              },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-white/50 text-xs font-medium uppercase tracking-wider">
                    {s.label}
                  </span>
                </div>
                <span className="text-2xl font-black text-white">
                  {s.value.toLocaleString()}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-red-300 text-sm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              className="bg-green-500/20 border border-green-500/30 rounded-lg px-4 py-2 mb-4 text-green-300 text-sm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Bar */}
        <motion.div
          className="flex gap-2 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search by username..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/30 transition"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-5 py-2.5 bg-white/10 border border-white/10 rounded-xl text-white text-sm font-medium hover:bg-white/15 transition"
          >
            Search
          </button>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === "users" ? "bg-red-500/20 border border-red-500/30 text-red-300" : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"}`}
          >
            <Users className="w-3.5 h-3.5 inline mr-1.5" />
            Users
          </button>
          <button
            onClick={() => setActiveTab("rooms")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === "rooms" ? "bg-red-500/20 border border-red-500/30 text-red-300" : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"}`}
          >
            <Swords className="w-3.5 h-3.5 inline mr-1.5" />
            Rooms
            {rooms.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-white/10 rounded text-xs">
                {rooms.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === "security" ? "bg-red-500/20 border border-red-500/30 text-red-300" : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"}`}
          >
            <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5" />
            Security
          </button>
        </div>

        {/* Security Tab */}
        {activeTab === "security" && <AdminSecurityPanel />}

        {/* Users Table */}
        {
          activeTab === "users" && (
            <>
              <motion.div
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-16 text-white/40 text-sm">
                    No users found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            User
                          </th>
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            ELO
                          </th>
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            Games
                          </th>
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            W/L
                          </th>
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            Lvl
                          </th>
                          <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                            Joined
                          </th>
                          <th className="px-4 py-3 text-right text-white/50 font-medium text-xs uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr
                            key={u.id}
                            className="border-b border-white/5 hover:bg-white/5 transition group"
                          >
                            <td className="px-4 py-3 text-white/60 font-mono text-xs">
                              #{u.id}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">
                                  {u.username}
                                </span>
                                {u.is_admin && (
                                  <Shield className="w-3 h-3 text-red-400" />
                                )}
                              </div>
                              {u.email && (
                                <div className="text-white/30 text-xs">
                                  {u.email}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-white/80 font-mono">
                              {u.elo_rating}
                            </td>
                            <td className="px-4 py-3 text-white/60">
                              {u.games_played}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-green-400">
                                {u.games_won}
                              </span>
                              <span className="text-white/20 mx-1">/</span>
                              <span className="text-red-400">
                                {u.games_lost}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white/60">
                              {u.level}
                            </td>
                            <td className="px-4 py-3 text-white/40 text-xs">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button
                                  onClick={() =>
                                    startEdit(u.id, "elo_rating", u.elo_rating)
                                  }
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
                                  title="Edit user"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {!u.is_admin &&
                                  (deleteConfirm === u.id ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleDelete(u.id)}
                                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                                        title="Confirm delete"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 transition"
                                        title="Cancel"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirm(u.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/50 hover:text-red-400 transition"
                                      title="Delete user"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mb-8">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-white/60 text-sm font-medium">
                    Page {page} of {totalPages} ({total} users)
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) /* end users tab */
        }

        {/* Rooms Tab */}
        {activeTab === "rooms" && (
          <motion.div
            className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-white/60 text-xs font-medium uppercase tracking-wider">
                Active Rooms ({rooms.length})
              </span>
              <button
                onClick={loadRooms}
                disabled={roomsLoading}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/60 hover:bg-white/10 transition flex items-center gap-1.5"
              >
                {roomsLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                Refresh
              </button>
            </div>

            {roomsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-16 text-white/40 text-sm">
                No active rooms
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                        Room ID
                      </th>
                      <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                        Players
                      </th>
                      <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                        Settings
                      </th>
                      <th className="px-4 py-3 text-left text-white/50 font-medium text-xs uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-4 py-3 text-right text-white/50 font-medium text-xs uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-white/5 hover:bg-white/5 transition group"
                      >
                        <td className="px-4 py-3 text-white font-mono font-bold">
                          {r.id}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {r.players.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center gap-1.5"
                              >
                                <div
                                  className={`w-1.5 h-1.5 rounded-full ${p.ready ? "bg-emerald-400" : "bg-white/20"}`}
                                />
                                <span className="text-xs text-white/70">
                                  {p.username}
                                </span>
                                {p.userId && (
                                  <span className="text-[9px] text-white/20">
                                    #{p.userId}
                                  </span>
                                )}
                              </div>
                            ))}
                            {r.playerCount === 0 && (
                              <span className="text-xs text-white/30">
                                Empty
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {r.inMatch ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.matchConcluded ? "bg-white/5 text-white/30" : "bg-green-500/20 text-green-400"}`}
                            >
                              {r.matchConcluded ? "ENDED" : "IN GAME"}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">
                              LOBBY
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {r.ranked && (
                              <span className="text-[10px] text-amber-400 font-bold">
                                RANKED
                              </span>
                            )}
                            {r.isPrivate && (
                              <span className="text-[10px] text-white/40">
                                PRIVATE
                              </span>
                            )}
                            {!r.ranked && !r.isPrivate && (
                              <span className="text-[10px] text-white/40">
                                PUBLIC
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-white/40">
                          Bo{r.settings.bestOf} · {r.settings.garbageMultiplier}
                          x
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">
                          {new Date(r.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {deleteRoomConfirm === r.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleDeleteRoom(r.id)}
                                className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                                title="Confirm delete"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteRoomConfirm(null)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 transition"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteRoomConfirm(r.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/50 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                              title="Force close room"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Edit Modal */}
        <AnimatePresence>
          {editing && (
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditing(null)}
            >
              <motion.div
                className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-white/50" />
                  Edit User #{editing.userId}
                </h2>

                <div className="space-y-3 mb-6">
                  {editableFields.map((f) => {
                    const user = users.find((u) => u.id === editing.userId);
                    const currentVal = user ? (user as any)[f.key] : "";
                    const isActive = editing.field === f.key;
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <label className="text-white/50 text-xs font-medium uppercase tracking-wider w-24 shrink-0">
                          {f.label}
                        </label>
                        <input
                          type={
                            ["username", "email"].includes(f.key)
                              ? "text"
                              : "number"
                          }
                          value={
                            isActive ? editing.value : String(currentVal ?? "")
                          }
                          onChange={(e) => {
                            if (isActive) {
                              setEditing({ ...editing, value: e.target.value });
                            } else {
                              setEditing({
                                userId: editing.userId,
                                field: f.key,
                                value: e.target.value,
                              });
                            }
                          }}
                          onFocus={() => {
                            if (!isActive) {
                              setEditing({
                                userId: editing.userId,
                                field: f.key,
                                value: String(currentVal ?? ""),
                              });
                            }
                          }}
                          className={`flex-1 px-3 py-2 bg-white/5 border rounded-lg text-white text-sm focus:outline-none transition ${
                            isActive
                              ? "border-red-400/50 bg-red-500/5"
                              : "border-white/10"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 rounded-lg border border-white/10 text-white/60 text-sm hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-medium hover:bg-red-500/30 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
