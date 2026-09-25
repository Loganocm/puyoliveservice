import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useMenuInput } from "@/hooks/useMenuInput";
import {
  X,
  Trophy,
  Users,
  Search,
  Clock,
  Swords,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Target,
  Flame,
  Zap,
  MessageSquare,
  Home,
  Megaphone,
} from "lucide-react";
import { APIClient } from "../api/client";
import { ForumsView } from "@/community/ForumsView";
import { Markdown } from "@/community/Markdown";
import { communityPath, parseCommunityPath } from "@/community/route";
import type { CommunityRoute } from "@/community/route";

type Tab = "activity" | "forums" | "leaderboard" | "players";

interface NewsItem {
  id: number;
  title: string;
  excerpt: string;
  created_at: string;
  post_count: number;
  author: { id: number; username: string };
}

function tabOf(route: CommunityRoute): Tab {
  switch (route.page) {
    case "home": return "activity";
    case "rankings": return "leaderboard";
    case "players": return "players";
    default: return "forums";
  }
}

interface RecentMatch {
  id: number;
  winner_id: number;
  player1: { id: number; username: string };
  player2: { id: number; username: string };
  player1_max_chain: number;
  player2_max_chain: number;
  duration_seconds: number;
  ended_at: string;
  elo_change: number;
  has_valid_replay?: boolean;
}

interface LeaderboardPlayer {
  rank: number;
  username: string;
  elo_rating: number;
  win_rate: number;
  games_played?: number;
  avatar_url?: string;
  level?: number;
}

interface AllPlayer {
  id: number;
  username: string;
  elo_rating: number;
  level: number;
  avatar_url?: string;
  games_played: number;
  games_won: number;
  win_rate: number;
  created_at: string;
}

interface SearchUser {
  id: number;
  username: string;
  elo_rating: number;
  level: number;
  avatar_url?: string;
  games_played: number;
  games_won: number;
}

interface GlobalStats {
  total_players: number;
  total_matches: number;
  matches_today: number;
  average_elo: number;
}

interface UserProfile {
  id: number;
  username: string;
  elo_rating: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  highest_chain: number;
  total_garbage_sent: number;
  rank?: number;
  level?: number;
  win_rate?: number;
  avatar_url?: string;
  created_at: string;
}

interface MatchHistoryEntry {
  id: number;
  opponent_username: string;
  result: "win" | "loss";
  elo_change: number;
  ended_at: string;
  duration_seconds: number;
  has_valid_replay?: boolean;
}

/**
 * The community hub: news and activity, forums, rankings and players, each
 * at its own /community URL so pages can be linked and shared. Opened from
 * the menu, or directly by visiting a /community link.
 * Design: website/src/content/docs/architecture/community.md.
 */
export const CommunityScreen: React.FC<{
  onClose: () => void;
  onWatchReplay: () => void;
  initialRoute?: CommunityRoute;
}> = ({ onClose, onWatchReplay, initialRoute }) => {
  const [route, setRoute] = useState<CommunityRoute>(initialRoute ?? { page: "home" });
  const tab = tabOf(route);
  const [news, setNews] = useState<NewsItem[] | null>(null);

  /** Go somewhere in the hub, and give it a URL. */
  const navigate = useCallback((next: CommunityRoute) => {
    setViewingProfile(null);
    setRoute(next);
    const path = communityPath(next);
    if (window.location.pathname + window.location.search !== path) window.history.pushState(null, "", path);
  }, []);

  /** Leave the hub, and the /community URL with it. */
  const close = useCallback(() => {
    if (window.location.pathname.startsWith("/community")) window.history.pushState(null, "", "/");
    onClose();
  }, [onClose]);

  // Opening the hub gives it its URL; Back and Forward move within it.
  useEffect(() => {
    const path = communityPath(route);
    if (!window.location.pathname.startsWith("/community")) window.history.pushState(null, "", path);
    const onPop = () => {
      const r = parseCommunityPath(window.location.pathname, window.location.search);
      if (r) { setViewingProfile(null); setRoute(r); } else onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Activity tab
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // Leaderboard tab
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [lbPage, setLbPage] = useState(0);
  const [lbHasMore, setLbHasMore] = useState(false);

  // Players tab
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [allPlayers, setAllPlayers] = useState<AllPlayer[]>([]);
  const [allPlayersPage, setAllPlayersPage] = useState(0);
  const [allPlayersHasMore, setAllPlayersHasMore] = useState(false);
  const [allPlayersLoading, setAllPlayersLoading] = useState(false);
  const PLAYERS_PER_PAGE = 20;

  // Profile view (inline)
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(
    null,
  );
  const [profileMatches, setProfileMatches] = useState<MatchHistoryEntry[]>([]);
  const [profilePercentiles, setProfilePercentiles] = useState<Record<
    string,
    number
  > | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Escape (or the pad's back button) goes up one level, then closes.
  useMenuInput({
    onBack: () => {
      if (viewingProfile) setViewingProfile(null);
      else if (route.page === "thread" || route.page === "compose") navigate({ page: "forum", slug: route.slug, p: 1 });
      else if (route.page === "forum") navigate({ page: "forums" });
      else close();
    },
  }, [route, close, navigate, viewingProfile]);

  const [loading, setLoading] = useState(true);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Clean up search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Load initial data for the active tab
  useEffect(() => {
    if (tab !== "forums") loadTabData(tab);
  }, [tab]);

  const loadTabData = async (t: Tab) => {
    setLoading(true);
    try {
      switch (t) {
        case "activity": {
          APIClient.getForumNews(3).then(d => setNews(d.news ?? [])).catch(() => setNews([]));
          const [matches, stats] = await Promise.all([
            APIClient.getRecentMatches(15),
            APIClient.getLeaderboardStats(),
          ]);
          setRecentMatches(matches);
          setGlobalStats(stats);
          break;
        }
        case "leaderboard": {
          const data = await APIClient.getLeaderboard(25, 0);
          setLeaderboard(
            data.leaderboard.map((p: any, _: number) => ({
              rank: p.rank,
              username: p.username,
              elo_rating: p.elo_rating,
              win_rate: p.win_rate,
              games_played: p.games_played,
              avatar_url: p.avatar_url,
              level: p.level,
            })),
          );
          setLbHasMore(data.pagination?.hasMore ?? false);
          setLbPage(0);
          break;
        }
        case "players":
          // Load all players list
          try {
            setAllPlayersLoading(true);
            const data = await APIClient.getAllPlayers(PLAYERS_PER_PAGE, 0);
            setAllPlayers(data.players);
            setAllPlayersHasMore(data.pagination?.hasMore ?? false);
            setAllPlayersPage(0);
          } finally {
            setAllPlayersLoading(false);
          }
          break;
      }
    } catch (e) {
      console.error("[Community] Load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreLeaderboard = async () => {
    const nextOffset = (lbPage + 1) * 25;
    try {
      const data = await APIClient.getLeaderboard(25, nextOffset);
      const mapped = data.leaderboard.map((p: any) => ({
        rank: p.rank,
        username: p.username,
        elo_rating: p.elo_rating,
        win_rate: p.win_rate,
        games_played: p.games_played,
        avatar_url: p.avatar_url,
        level: p.level,
      }));
      setLeaderboard((prev) => [...prev, ...mapped]);
      setLbHasMore(data.pagination?.hasMore ?? false);
      setLbPage((p) => p + 1);
    } catch (e) {
      console.error("[Community] Load more failed:", e);
    }
  };

  // Debounced user search
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const data = await APIClient.searchUsers(q.trim());
        setSearchResults(data.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Navigate all players pages
  const loadAllPlayersPage = useCallback(async (page: number) => {
    setAllPlayersLoading(true);
    try {
      const data = await APIClient.getAllPlayers(
        PLAYERS_PER_PAGE,
        page * PLAYERS_PER_PAGE,
      );
      setAllPlayers(data.players);
      setAllPlayersHasMore(data.pagination?.hasMore ?? false);
      setAllPlayersPage(page);
    } catch (e) {
      console.error("[Community] Players page load failed:", e);
    } finally {
      setAllPlayersLoading(false);
    }
  }, []);

  // Load a user's profile (inline view)
  const openProfile = async (identifier: string | number) => {
    setProfileLoading(true);
    setViewingProfile(null);
    setProfileMatches([]);
    setProfilePercentiles(null);
    try {
      const profile = await APIClient.getUserProfile(identifier);
      setViewingProfile(profile);
      const historyData = await APIClient.getMatchHistory(profile.id, 10, 0);
      setProfileMatches(historyData.matches || []);
      // Fetch percentiles in background (non-blocking)
      if (profile?.id) {
        APIClient.getUserPercentiles(profile.id)
          .then(setProfilePercentiles)
          .catch(() => {});
      }
    } catch (e) {
      console.error("[Community] Profile load failed:", e);
    } finally {
      setProfileLoading(false);
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return "#FFD700";
    if (rank === 2) return "#C0C0C0";
    if (rank === 3) return "#CD7F32";
    return "#888";
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType; to: CommunityRoute }[] = [
    { id: "activity", label: "Home", icon: Home, to: { page: "home" } },
    { id: "forums", label: "Forums", icon: MessageSquare, to: { page: "forums" } },
    { id: "leaderboard", label: "Rankings", icon: Trophy, to: { page: "rankings" } },
    { id: "players", label: "Players", icon: Users, to: { page: "players" } },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-6xl h-full sm:h-auto border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col sm:max-h-[94vh]"
        style={{ background: "var(--pl-bg-raised)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5">
              <Users className="w-5 h-5" style={{ color: "var(--pl-accent-secondary)" }} />
            </div>
            <h2 className="text-xl font-bold tracking-wide">Community</h2>
          </div>
          <button
            onClick={close}
            aria-label="Close community"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 sm:px-6 pt-4 pb-2 overflow-x-auto" role="tablist" aria-label="Community sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id && !viewingProfile}
              onClick={() => navigate(t.to)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0 ${
                tab === t.id && !viewingProfile
                  ? "text-white"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
              style={tab === t.id && !viewingProfile ? { background: "var(--pl-accent-primary)" } : undefined}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
          {viewingProfile && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-violet-600 text-white ml-auto">
              <Users size={16} />
              {viewingProfile.username}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 custom-scrollbar">
          <AnimatePresence mode="wait">
            {viewingProfile ? (
              <ProfileView
                key="profile-view"
                profile={viewingProfile}
                matches={profileMatches}
                percentiles={profilePercentiles}
                loading={profileLoading}
                onBack={() => setViewingProfile(null)}
                onWatchReplay={onWatchReplay}
                formatDuration={formatDuration}
                timeAgo={timeAgo}
              />
            ) : route.page === "forums" || route.page === "forum" || route.page === "thread" || route.page === "compose" ? (
              <motion.div key="forums" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-2">
                <ForumsView route={route} navigate={navigate} onPlayerClick={openProfile} timeAgo={timeAgo} />
              </motion.div>
            ) : tab === "activity" ? (
              <div key="home">
                <NewsSection news={news} timeAgo={timeAgo} onOpen={id => navigate({ page: "thread", slug: "announcements", id, p: 1 })} onAll={() => navigate({ page: "forum", slug: "announcements", p: 1 })} />
              <ActivityTab
                key="activity"
                recentMatches={recentMatches}
                globalStats={globalStats}
                loading={loading}
                onPlayerClick={openProfile}
                onWatchReplay={onWatchReplay}
                formatDuration={formatDuration}
                timeAgo={timeAgo}
              />
              </div>
            ) : tab === "leaderboard" ? (
              <LeaderboardTab
                key="leaderboard"
                players={leaderboard}
                loading={loading}
                hasMore={lbHasMore}
                onLoadMore={loadMoreLeaderboard}
                onPlayerClick={openProfile}
                getRankColor={getRankColor}
              />
            ) : (
              <PlayersTab
                key="players"
                searchQuery={searchQuery}
                searchResults={searchResults}
                searching={searching}
                onSearch={handleSearch}
                onPlayerClick={openProfile}
                allPlayers={allPlayers}
                allPlayersPage={allPlayersPage}
                allPlayersHasMore={allPlayersHasMore}
                allPlayersLoading={allPlayersLoading}
                onPageChange={loadAllPlayersPage}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

/* ─────────── NEWS ─────────── */
const NewsSection: React.FC<{
  news: NewsItem[] | null;
  timeAgo: (iso: string) => string;
  onOpen: (id: number) => void;
  onAll: () => void;
}> = ({ news, timeAgo, onOpen, onAll }) => {
  if (!news || news.length === 0) return null;
  return (
    <section className="pt-2 pb-5" aria-labelledby="news-heading">
      <div className="flex items-center justify-between mb-3">
        <h3 id="news-heading" className="flex items-center gap-2 text-sm font-bold tracking-widest text-white/60">
          <Megaphone size={16} style={{ color: "var(--pl-accent-primary)" }} /> NEWS
        </h3>
        <button onClick={onAll} className="text-xs text-white/50 hover:text-white">All announcements</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {news.map(n => (
          <button key={n.id} onClick={() => onOpen(n.id)} className="text-left p-4 rounded-2xl bg-white/[0.04] border border-white/5 hover:bg-white/[0.07] transition-colors flex flex-col gap-2">
            <div className="font-semibold text-white">{n.title}</div>
            <div className="text-sm text-white/60 line-clamp-3"><Markdown source={n.excerpt} /></div>
            <div className="text-xs text-white/40 mt-auto">{n.author.username} · {timeAgo(n.created_at)} · {n.post_count - 1} comments</div>
          </button>
        ))}
      </div>
    </section>
  );
};

/* ─────────── ACTIVITY TAB ─────────── */
const ActivityTab: React.FC<{
  recentMatches: RecentMatch[];
  globalStats: GlobalStats | null;
  loading: boolean;
  onPlayerClick: (id: string | number) => void;
  onWatchReplay: () => void;
  formatDuration: (s: number) => string;
  timeAgo: (iso: string) => string;
}> = ({
  recentMatches,
  globalStats,
  loading,
  onPlayerClick,
  onWatchReplay,
  formatDuration,
  timeAgo,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.15 }}
  >
    {/* Global Stats Bar */}
    {globalStats && (
      <div className="grid grid-cols-4 gap-3 mt-4 mb-6">
        {[
          {
            label: "Players",
            value: globalStats.total_players,
            icon: Users,
            color: "text-blue-400",
          },
          {
            label: "Matches",
            value: globalStats.total_matches,
            icon: Swords,
            color: "text-violet-400",
          },
          {
            label: "Today",
            value: globalStats.matches_today,
            icon: Flame,
            color: "text-orange-400",
          },
          {
            label: "Avg Elo",
            value: globalStats.average_elo,
            icon: TrendingUp,
            color: "text-emerald-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white/[0.03] border border-white/5 rounded-xl p-4 flex items-center gap-3"
          >
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div>
              <div className="text-lg font-bold">
                {s.value.toLocaleString()}
              </div>
              <div className="text-xs text-white/40 uppercase tracking-wider">
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}

    <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
      Recent Matches
    </h3>

    {loading ? (
      <div className="flex items-center justify-center py-12 text-white/30">
        Loading...
      </div>
    ) : recentMatches.length === 0 ? (
      <div className="text-center py-12 text-white/30">No matches yet</div>
    ) : (
      <div className="space-y-2">
        {recentMatches
          .filter((m) => m.player1 && m.player2)
          .map((m, i) => {
            const winner = m.winner_id === m.player1.id ? m.player1 : m.player2;
            const loser = m.winner_id === m.player1.id ? m.player2 : m.player1;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-4 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.06] transition-colors group"
              >
                <Swords className="w-4 h-4 text-white/20 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      onClick={() => onPlayerClick(winner.id)}
                      className="font-bold text-emerald-400 hover:underline truncate"
                    >
                      {winner.username}
                    </button>
                    <span className="text-white/20">beat</span>
                    <button
                      onClick={() => onPlayerClick(loser.id)}
                      className="font-bold text-red-400/80 hover:underline truncate"
                    >
                      {loser.username}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/30 shrink-0">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {m.duration_seconds
                      ? formatDuration(m.duration_seconds)
                      : "—"}
                  </span>
                  <span>{timeAgo(m.ended_at)}</span>
                  {m.has_valid_replay && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { APIClient } = await import("../api/client");
                          const replayData = await APIClient.getReplay(m.id);

                          // Validate replay data before creating scene (V3 only)
                          if (
                            !replayData ||
                            replayData.version !== 3 ||
                            typeof replayData.engineVersion !== 'string' ||
                            !Array.isArray(replayData.inputs) ||
                            replayData.inputs.length === 0
                          ) {
                            console.error("Invalid replay data:", replayData);
                            return;
                          }

                          const { SceneManager } =
                            await import("../core/SceneManager");
                          const { ReplayScene } =
                            await import("../scenes/ReplayScene");
                          SceneManager.changeScene(new ReplayScene(replayData));
                          onWatchReplay();
                        } catch (e) {
                          console.error("Failed to load replay", e);
                        }
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-md font-bold text-[10px] uppercase tracking-wider transition-colors border border-white/5"
                    >
                      Replay
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
      </div>
    )}
  </motion.div>
);

/* ─────────── LEADERBOARD TAB ─────────── */
const LeaderboardTab: React.FC<{
  players: LeaderboardPlayer[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onPlayerClick: (id: string | number) => void;
  getRankColor: (rank: number) => string;
}> = ({
  players,
  loading,
  hasMore,
  onLoadMore,
  onPlayerClick,
  getRankColor,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.15 }}
    className="mt-4"
  >
    {/* Table Header */}
    <div className="grid grid-cols-[60px_1fr_100px_80px] gap-2 px-4 pb-2 text-xs font-bold text-white/30 uppercase tracking-wider">
      <div>Rank</div>
      <div>Player</div>
      <div className="text-right">Elo</div>
      <div className="text-right">Win%</div>
    </div>

    {loading ? (
      <div className="flex items-center justify-center py-12 text-white/30">
        Loading...
      </div>
    ) : (
      <div className="space-y-1">
        {players.map((p, i) => (
          <motion.button
            key={`${p.rank}-${p.username}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.015 }}
            onClick={() => onPlayerClick(p.username)}
            className="w-full grid grid-cols-[60px_1fr_100px_80px] gap-2 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.06] transition-colors items-center text-left group"
          >
            <div className="flex items-center gap-1">
              {p.rank <= 3 ? (
                <Trophy size={16} style={{ color: getRankColor(p.rank) }} />
              ) : (
                <span className="text-sm font-bold text-white/30">
                  #{p.rank}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center text-xs font-bold shrink-0 border border-white/5 bg-cover bg-center overflow-hidden">
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  p.username[0]?.toUpperCase()
                )}
              </div>
              <div className="truncate">
                <span className="font-bold group-hover:text-indigo-300 transition-colors">
                  {p.username}
                </span>
                {p.level && (
                  <span className="ml-2 text-xs text-white/20">
                    Lv.{p.level}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right font-bold text-amber-400/80 text-sm">
              {p.elo_rating}
            </div>
            <div className="text-right text-sm text-white/50">
              {p.win_rate}%
            </div>
          </motion.button>
        ))}
        {hasMore && (
          <button
            onClick={onLoadMore}
            className="w-full py-3 text-sm font-bold text-indigo-400 hover:text-indigo-300 hover:bg-white/5 rounded-xl transition-colors"
          >
            Load More
          </button>
        )}
      </div>
    )}
  </motion.div>
);

/* ─────────── PLAYERS TAB ─────────── */
const PlayersTab: React.FC<{
  searchQuery: string;
  searchResults: SearchUser[];
  searching: boolean;
  onSearch: (q: string) => void;
  onPlayerClick: (id: string | number) => void;
  allPlayers: AllPlayer[];
  allPlayersPage: number;
  allPlayersHasMore: boolean;
  allPlayersLoading: boolean;
  onPageChange: (page: number) => void;
}> = ({
  searchQuery,
  searchResults,
  searching,
  onSearch,
  onPlayerClick,
  allPlayers,
  allPlayersPage,
  allPlayersHasMore,
  allPlayersLoading,
  onPageChange,
}) => {
  const showSearchResults = searchQuery.trim().length >= 2;

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="mt-4"
    >
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search players by username..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
        />
      </div>

      {showSearchResults ? (
        /* Search Results */
        searching ? (
          <div className="flex items-center justify-center py-12 text-white/30">
            Searching...
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-12 text-white/30">
            No players found for "{searchQuery}"
          </div>
        ) : (
          <div className="space-y-2">
            {searchResults.map((u, i) => {
              const winRate =
                u.games_played > 0
                  ? Math.round((u.games_won / u.games_played) * 100)
                  : 0;
              return (
                <motion.button
                  key={u.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => onPlayerClick(u.id)}
                  className="w-full flex items-center gap-4 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.06] transition-colors group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center text-sm font-bold shrink-0 border border-white/5 overflow-hidden">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      u.username[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold group-hover:text-indigo-300 transition-colors truncate">
                      {u.username}
                    </div>
                    <div className="text-xs text-white/30">
                      Lv.{u.level} · {u.games_played} games · {winRate}% win
                      rate
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-amber-400/80">
                      {u.elo_rating}
                    </div>
                    <div className="text-xs text-white/30">Elo</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )
      ) : (
        /* All Players List */
        <>
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_80px_70px_100px] gap-2 px-4 pb-2 text-xs font-bold text-white/30 uppercase tracking-wider">
            <div>Player</div>
            <div className="text-right">Elo</div>
            <div className="text-right">Games</div>
            <div className="text-right">Joined</div>
          </div>

          {allPlayersLoading ? (
            <div className="flex items-center justify-center py-12 text-white/30">
              Loading...
            </div>
          ) : allPlayers.length === 0 ? (
            <div className="text-center py-12 text-white/30">
              No players yet
            </div>
          ) : (
            <div className="space-y-1">
              {allPlayers.map((p, i) => (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.015 }}
                  onClick={() => onPlayerClick(p.id)}
                  className="w-full grid grid-cols-[1fr_80px_70px_100px] gap-2 px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.06] transition-colors items-center text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center text-xs font-bold shrink-0 border border-white/5 overflow-hidden">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        p.username[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="truncate">
                      <span className="font-bold group-hover:text-indigo-300 transition-colors">
                        {p.username}
                      </span>
                      <span className="ml-2 text-xs text-white/20">
                        Lv.{p.level}
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-bold text-amber-400/80 text-sm">
                    {p.elo_rating}
                  </div>
                  <div className="text-right text-sm text-white/50">
                    {p.games_played}
                  </div>
                  <div className="text-right text-xs text-white/30">
                    {formatDate(p.created_at)}
                  </div>
                </motion.button>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-2">
            <button
              onClick={() => onPageChange(allPlayersPage - 1)}
              disabled={allPlayersPage === 0 || allPlayersLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-white/60 hover:text-white hover:bg-white/5"
            >
              <ChevronLeft size={16} />
              Prev
            </button>
            <span className="text-xs text-white/30 font-medium">
              Page {allPlayersPage + 1}
            </span>
            <button
              onClick={() => onPageChange(allPlayersPage + 1)}
              disabled={!allPlayersHasMore || allPlayersLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-white/60 hover:text-white hover:bg-white/5"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};

/* ─────────── PROFILE VIEW (inline) ─────────── */
const ProfileView: React.FC<{
  profile: UserProfile;
  matches: MatchHistoryEntry[];
  percentiles: Record<string, number> | null;
  loading: boolean;
  onBack: () => void;
  onWatchReplay: () => void;
  formatDuration: (s: number) => string;
  timeAgo: (iso: string) => string;
}> = ({
  profile,
  matches,
  percentiles,
  loading,
  onBack,
  onWatchReplay,
  formatDuration,
  timeAgo,
}) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.15 }}
    className="mt-4"
  >
    {/* Back button */}
    <button
      onClick={onBack}
      className="text-sm text-indigo-400 hover:text-indigo-300 font-bold mb-4 flex items-center gap-1 transition-colors"
    >
      ← Back
    </button>

    {/* Profile Header */}
    <div className="flex items-center gap-5 mb-6">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/20 flex items-center justify-center text-3xl font-bold border border-white/10 overflow-hidden shrink-0">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          profile.username[0]?.toUpperCase()
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-1">{profile.username}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {profile.level && (
            <span className="bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 text-xs font-medium text-blue-300">
              Level {profile.level}
            </span>
          )}
          <span className="bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 text-xs font-medium text-amber-400">
            {profile.elo_rating} Elo
          </span>
          {profile.rank && (
            <span className="bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 text-xs font-medium text-emerald-400">
              Rank #{profile.rank}
            </span>
          )}
        </div>
      </div>
    </div>

    {/* Stats Grid */}
    <div className="grid grid-cols-4 gap-3 mb-6">
      {[
        {
          label: "Games",
          value: profile.games_played,
          icon: Swords,
          color: "text-blue-400",
          pKey: "games_played",
        },
        {
          label: "Win Rate",
          value: `${profile.win_rate ?? 0}%`,
          icon: Target,
          color: "text-emerald-400",
          pKey: "win_rate",
        },
        {
          label: "Best Chain",
          value: profile.highest_chain,
          icon: Zap,
          color: "text-yellow-400",
          pKey: "highest_chain",
        },
        {
          label: "Garbage Sent",
          value: profile.total_garbage_sent.toLocaleString(),
          icon: Flame,
          color: "text-red-400",
          pKey: "total_garbage_sent",
        },
      ].map((s) => (
        <div
          key={s.label}
          className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center gap-2.5"
        >
          <s.icon className={`w-4 h-4 ${s.color} shrink-0`} />
          <div>
            <div className="text-base font-bold">{s.value}</div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">
              {s.label}
            </div>
            {percentiles?.[s.pKey] != null && (
              <div className="text-[9px] text-indigo-400/70 mt-0.5">
                Top {Math.round(percentiles[s.pKey])}%
              </div>
            )}
          </div>
        </div>
      ))}
    </div>

    {/* Match History */}
    <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
      Recent Matches
    </h3>
    {loading ? (
      <div className="flex items-center justify-center py-8 text-white/30">
        Loading...
      </div>
    ) : matches.length === 0 ? (
      <div className="text-center py-8 text-white/30">No match history</div>
    ) : (
      <div className="space-y-2">
        {matches.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl"
          >
            <div
              className={`w-1 h-8 rounded-full shrink-0 ${m.result === "win" ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">
                <span
                  className={
                    m.result === "win" ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {m.result === "win" ? "WIN" : "LOSS"}
                </span>
                <span className="text-white/40 mx-2">vs</span>
                <span>{m.opponent_username}</span>
              </div>
              <div className="text-xs text-white/30 flex items-center gap-2">
                <span>{timeAgo(m.ended_at)}</span>
                {m.duration_seconds > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(m.duration_seconds)}</span>
                  </>
                )}
                {m.elo_change !== 0 && (
                  <>
                    <span>·</span>
                    <span
                      className={
                        m.elo_change > 0 ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {m.elo_change > 0 ? "+" : ""}
                      {m.elo_change}
                    </span>
                  </>
                )}
              </div>
            </div>
            {m.has_valid_replay && (
              <button
                onClick={async () => {
                  try {
                    const { APIClient } = await import("../api/client");
                    const replayData = await APIClient.getReplay(m.id);
                    if (!replayData || replayData.version !== 3 || typeof replayData.engineVersion !== 'string') {
                      console.error("Invalid replay data:", replayData);
                      return;
                    }
                    const { SceneManager } =
                      await import("../core/SceneManager");
                    const { ReplayScene } =
                      await import("../scenes/ReplayScene");
                    SceneManager.changeScene(new ReplayScene(replayData));
                    onWatchReplay();
                  } catch (e) {
                    console.error("Failed to load replay", e);
                  }
                }}
                className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors border border-white/5 shrink-0"
              >
                Replay
              </button>
            )}
          </motion.div>
        ))}
      </div>
    )}
  </motion.div>
);
