import React, { useEffect, useState } from 'react';
import { APIClient } from '../api/client';
import { AuthManager } from '../core/AuthManager';
import { ReplayViewer } from './ReplayViewer';
import { Clock, Calendar } from 'lucide-react';

interface MatchHistoryEntry {
    id: number;
    opponent_username: string;
    result: 'win' | 'loss';
    elo_change: number;
    ended_at: string;
    duration_seconds: number;
}

export const ProfileScreen: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [user, setUser] = useState(AuthManager.currentUser);
    const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'stats' | 'history'>('history');
    const [selectedReplayId, setSelectedReplayId] = useState<number | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            // Reload user stats
            const me = await APIClient.getMe();
            // AuthManager.currentUser = me; // Update global if needed, but safe to use local
            setUser(me);

            const history = await APIClient.getMatchHistory(me.id);
            setMatches(history.matches);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (selectedReplayId) {
        return <ReplayViewer matchId={selectedReplayId} onClose={() => setSelectedReplayId(null)} />;
    }

    return (
        <div className="fixed inset-0 z-40 bg-gray-900 text-white overflow-y-auto">
            <div className="max-w-4xl mx-auto p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-4">
                        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">
                            {user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                            <div>{user?.username}</div>
                            <div className="text-sm text-gray-400 font-normal">Level {user?.level} • {user?.elo_rating} Elo</div>
                        </div>
                    </h1>
                    <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Close</button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-gray-700 mb-6">
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 ${activeTab === 'history' ? 'border-b-2 border-orange-500 text-orange-500' : 'text-gray-400'}`}
                    >
                        Match History
                    </button>
                    <button 
                        onClick={() => setActiveTab('stats')}
                        className={`px-4 py-2 ${activeTab === 'stats' ? 'border-b-2 border-orange-500 text-orange-500' : 'text-gray-400'}`}
                    >
                        Statistics
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="text-center py-10">Loading...</div>
                ) : activeTab === 'history' ? (
                    <div className="space-y-4">
                        {matches.length === 0 && <div className="text-gray-500">No matches found.</div>}
                        {matches.map(match => (
                            <div key={match.id} className="bg-gray-800 p-4 rounded flex items-center justify-between hover:bg-gray-750 transition">
                                <div className="flex items-center gap-4">
                                    <div className={`w-2 h-12 rounded-full ${match.result === 'win' ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <div>
                                        <div className="font-bold text-lg">
                                            {match.result === 'win' ? 'VICTORY' : 'DEFEAT'} vs {match.opponent_username}
                                        </div>
                                        <div className="text-sm text-gray-400 flex gap-4">
                                            <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(match.ended_at).toLocaleDateString()}</span>
                                            <span className="flex items-center gap-1"><Clock size={12}/> {Math.floor(match.duration_seconds / 60)}m {match.duration_seconds % 60}s</span>
                                            <span className={match.elo_change > 0 ? 'text-green-400' : 'text-red-400'}>
                                                {match.elo_change > 0 ? '+' : ''}{match.elo_change} Elo
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedReplayId(match.id)}
                                    className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-bold text-sm"
                                >
                                    WATCH REPLAY
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800 p-6 rounded">
                            <div className="text-gray-400 text-sm uppercase">Total Games</div>
                            <div className="text-3xl font-bold">{user?.games_played}</div>
                        </div>
                        <div className="bg-gray-800 p-6 rounded">
                            <div className="text-gray-400 text-sm uppercase">Win Rate</div>
                            <div className="text-3xl font-bold">
                                {user?.games_played ? Math.round((user.games_won / user.games_played) * 100) : 0}%
                            </div>
                        </div>
                        <div className="bg-gray-800 p-6 rounded">
                            <div className="text-gray-400 text-sm uppercase">Max Chain</div>
                            <div className="text-3xl font-bold">{user?.highest_chain}</div>
                        </div>
                        <div className="bg-gray-800 p-6 rounded">
                            <div className="text-gray-400 text-sm uppercase">Total Garbage Sent</div>
                            <div className="text-3xl font-bold">{user?.total_garbage_sent}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
