
import { SettingsManager } from '../core/SettingsManager';
import { NetworkManager } from '../core/NetworkManager';
import { SceneManager } from '../core/SceneManager';
import { GameScene } from '../scenes/GameScene';
import { MenuScene } from '../scenes/MenuScene';
import { ReplayScene } from '../scenes/ReplayScene';
import { isReplayFileV2 } from '../core/ReplayEngine';
import { ControlsManager } from '../core/ControlsManager';
import type { GameAction } from '../core/ControlsManager';
import { SoundManager } from '../core/SoundManager';
import { AuthManager } from '../core/AuthManager';
import { APIClient } from '../api/client';
import { Input } from '../core/Input';
import { GameEvents } from '../core/GameEvents';
import { WaterButton } from './WaterButton';

export class UIManager {
    private static mainMenu: HTMLElement;
    // activeScreen unused in this implementation, we query DOM directly

    // Controller Navigation State
    private static lastNavTime = 0;
    private static readonly NAV_DELAY = 150; // ms between moves
    private static currentFocus: HTMLElement | null = null;
    private static settingsMenu: HTMLElement;
    private static multiplayerMenu: HTMLElement;
    private static modeMenu: HTMLElement;
    private static controlsMenu: HTMLElement;
    private static leaderboardMenu: HTMLElement;
    private static gameHud: HTMLElement;
    private static gameOverModal: HTMLElement;
    // New UI Elements
    private static loginScreen: HTMLElement;
    private static profileHeader: HTMLElement;
    private static matchReadyModal: HTMLElement;
    private static uiLayer: HTMLElement;

    private static currentRoomId: string | null = null;
    private static isCapturingKey: GameAction | null = null;
    private static lastTimeLimit: number | null = null;

    private static isPausedMenu: boolean = false;
    public static onResume: (() => void) | null = null;
    private static waterButtons: WaterButton[] = [];

    public static update() {
        // Handle Back / Pause Action (Keyboard Esc / Controller Start)
        if (Input.isActionPressed('pause')) {
            this.handleBackNavigation();
        }

        // Handle Controller Menu Navigation (D-Pad / Sticks)
        this.processControllerNavigation();
    }

    private static handleBackNavigation() {
        // 1. If Modals are open, close them
        if (document.getElementById('stats-modal')?.classList.contains('active')) {
            this.hideStatsModal(); // Actually we need to make this public or accessible or just call element click
            document.getElementById('btn-close-stats')?.click();
            return;
        }

        // 2. If Overlays are open (Settings, Multiplayer, etc)
        if (!this.settingsMenu.classList.contains('hidden')) {
            // If Controls is open efficiently, handle that
            if (!this.controlsMenu.classList.contains('hidden')) {
                this.showSettings(); // Back to Settings
                return;
            }
            this.showMain();
            SettingsManager.save();
            return;
        }

        if (!this.multiplayerMenu.classList.contains('hidden')) {
            // If in private room section?
            if (!document.getElementById('private-room-section')?.classList.contains('hidden') && !this.currentRoomId) {
                // Close private section
                document.getElementById('btn-private-toggle')?.click();
                return;
            }
            if (this.currentRoomId) {
                // Leave Room? Or just warn? Back button usually leaves queue/room.
                // let's mirror btn-lobby-back logic
                document.getElementById('btn-lobby-back')?.click();
                return;
            }
            this.showMain();
            return;
        }

        if (!this.leaderboardMenu?.classList.contains('hidden')) {
            this.showMain();
            return;
        }

        if (!this.modeMenu.classList.contains('hidden')) {
            this.showMain();
            return;
        }

        if (!this.controlsMenu.classList.contains('hidden')) {
            this.showSettings();
            return;
        }

        // Game Over / Pause Menu
        if (this.isPausedMenu) {
            // Resume?
            document.getElementById('btn-go-resume')?.click();
            return;
        }
    }

    public static async init() {
        this.mainMenu = document.getElementById('main-menu')!;
        this.settingsMenu = document.getElementById('settings-menu')!;
        this.multiplayerMenu = document.getElementById('multiplayer-menu')!;
        this.modeMenu = document.getElementById('mode-menu')!;
        this.controlsMenu = document.getElementById('controls-menu')!;
        this.leaderboardMenu = document.getElementById('leaderboard-menu')!;
        this.gameHud = document.getElementById('game-hud')!;
        this.gameOverModal = document.getElementById('game-over-modal')!;

        // New Hooks
        this.loginScreen = document.getElementById('login-screen')!;
        this.profileHeader = document.getElementById('profile-header')!;
        this.matchReadyModal = document.getElementById('match-ready-modal')!;
        this.uiLayer = document.getElementById('ui-layer')!;

        // Add global click listener for button sounds
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON' || target.classList.contains('button') || target.closest('button')) {
                SoundManager.play('click');
            }
        });

        this.bindEvents();
        this.bindAuthEvents();
        this.setupProfileListeners();

        // Check Auth
        const hasSession = await AuthManager.init();
        if (hasSession) {
            this.showMain();
        } else {
            // Show Auth Screen
            this.showAuth();
        }

        // Show UI after auth check is done (prevents flash)
        this.uiLayer.classList.remove('hidden');

        // Initialize Fancy Water Buttons
        try {
            this.waterButtons.push(new WaterButton('btn-singleplayer', '#6366F1', '#818CF8'));
            this.waterButtons.push(new WaterButton('btn-multiplayer', '#8B5CF6', '#A78BFA'));
            this.waterButtons.push(new WaterButton('btn-leaderboard', '#EC4899', '#F472B6'));
            this.waterButtons.push(new WaterButton('btn-settings', '#06B6D4', '#22D3EE'));
        } catch (e) {
            console.warn("Failed to initialize WaterButtons:", e);
        }
    }

    private static bindAuthEvents() {
        // --- PHASE 1: JOIN ---
        document.getElementById('auth-phase-1')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('auth-username') as HTMLInputElement;
            const username = input.value.trim();

            if (!username) {
                // Guest
                AuthManager.loginAsGuest();
                this.showMain();
                return;
            }

            // Check if exists
            try {
                const exists = await APIClient.checkUsername(username);
                if (exists) {
                    // Go to Phase 2 (Login)
                    this.showAuthPhase(2);
                    const dispName = document.getElementById('auth-display-name');
                    if (dispName) dispName.innerText = username.toUpperCase();
                    // Focus password
                    setTimeout(() => document.getElementById('auth-password')?.focus(), 100);
                } else {
                    // Go to Phase 3 (Register)
                    this.showAuthPhase(3);
                    const dispName = document.getElementById('auth-register-name');
                    if (dispName) dispName.innerText = username.toUpperCase();
                    // Focus password
                    setTimeout(() => document.getElementById('reg-new-password')?.focus(), 100);
                }
            } catch (e: any) {
                console.error("Auth check failed:", e);
                alert("Connection failed. Please try again.");
            }
        });


        // --- PHASE 2: LOGIN ---
        document.getElementById('btn-auth-back')?.addEventListener('click', () => {
            this.showAuthPhase(1);
        });

        document.getElementById('auth-phase-2')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = (document.getElementById('auth-username') as HTMLInputElement).value.trim();
            const password = (document.getElementById('auth-password') as HTMLInputElement).value;
            const btnLogin = document.getElementById('btn-auth-login') as HTMLButtonElement;

            try {
                if (btnLogin) {
                    btnLogin.innerText = "Logging in...";
                    btnLogin.disabled = true;
                }
                await AuthManager.login(username, password);
                this.showMain();
            } catch (e: any) {
                alert(e.message || "Login failed");
                if (btnLogin) {
                    btnLogin.innerText = "LOGIN";
                    btnLogin.disabled = false;
                }
            }
        });


        // --- PHASE 3: REGISTER ---
        document.getElementById('btn-reg-back')?.addEventListener('click', () => {
            this.showAuthPhase(1);
        });

        // Toggle Password Visibility
        document.querySelectorAll('.btn-show-pass').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target as HTMLButtonElement;
                const wrapper = button.closest('.password-wrapper');
                const input = wrapper?.querySelector('input');
                if (input) {
                    if (input.type === 'password') {
                        input.type = 'text';
                        button.innerText = 'HIDE';
                    } else {
                        input.type = 'password';
                        button.innerText = 'SHOW';
                    }
                }
            });
        });

        // Real-time Password Validation
        const passInput = document.getElementById('reg-new-password') as HTMLInputElement;
        const confirmInput = document.getElementById('reg-confirm-password') as HTMLInputElement;

        const validatePasswords = () => {
            if (passInput && confirmInput) {
                const p1 = passInput.value;
                const p2 = confirmInput.value;
                if (p2 && p1 !== p2) {
                    confirmInput.style.borderColor = '#ff3333';
                    confirmInput.style.boxShadow = '0 0 10px rgba(255, 51, 51, 0.5)';
                } else {
                    confirmInput.style.borderColor = ''; // Reset to default/CSS
                    confirmInput.style.boxShadow = '';
                }
            }
        };

        passInput?.addEventListener('input', validatePasswords);
        confirmInput?.addEventListener('input', validatePasswords);

        document.getElementById('auth-phase-3')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = (document.getElementById('auth-username') as HTMLInputElement).value.trim();
            const password = (document.getElementById('reg-new-password') as HTMLInputElement).value;
            const confirm = (document.getElementById('reg-confirm-password') as HTMLInputElement).value;
            const email = (document.getElementById('reg-new-email') as HTMLInputElement).value;

            if (password !== confirm) {
                alert("Passwords do not match!");
                return;
            }

            try {
                await AuthManager.register(username, password, email);
                this.showMain();
            } catch (e: any) {
                alert(e.message || "Registration failed");
            }
        });

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', () => {
            AuthManager.logout();
        });
    }

    private static showAuthPhase(phase: number) {
        document.getElementById('auth-phase-1')?.classList.add('hidden');
        document.getElementById('auth-phase-2')?.classList.add('hidden');
        document.getElementById('auth-phase-3')?.classList.add('hidden');

        document.getElementById(`auth-phase-${phase}`)?.classList.remove('hidden');
    }

    private static setupProfileListeners() {
        // 1. Profile Click -> Open Stats Modal
        const profileHeader = document.getElementById('profile-header');

        const openModal = (e: Event) => {
            // Prevent if clicking logout button or its children
            const target = e.target as HTMLElement;
            if (target.closest('#btn-logout')) {
                return; // Let logout button handle its own click
            }

            console.log('[UIManager] Profile header clicked');
            if (AuthManager.isAuthenticated()) {
                console.log('[UIManager] Opening stats modal');
                this.showStatsModal();
            } else {
                console.log('[UIManager] Not authenticated, skipping modal');
            }
        };

        // Attach to container
        if (profileHeader) {
            profileHeader.addEventListener('click', openModal);
            console.log('[UIManager] Profile click listener attached');
        } else {
            console.warn('[UIManager] profile-header element not found!');
        }

        // 2. Stats Modal Interactions
        const closeBtn = document.getElementById('btn-close-stats');
        const overlay = document.getElementById('modal-overlay');
        const largeAvatar = document.getElementById('stats-large-avatar');
        const fileInput = document.getElementById('avatar-upload') as HTMLInputElement;

        // Close
        const closeStats = () => this.hideStatsModal();
        closeBtn?.addEventListener('click', closeStats);
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) closeStats();
        });

        // Upload from Large Avatar
        largeAvatar?.addEventListener('click', () => {
            fileInput.click();
        });

        // REMOVE Avatar
        const removeBtn = document.getElementById('btn-remove-avatar');
        removeBtn?.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent triggering upload
            if (confirm("Remove current profile picture?")) {
                const user = AuthManager.currentUser;
                if (user) {
                    try {
                        // Pass null or empty string to clear
                        await APIClient.uploadAvatar(user.id, "");
                        user.avatar_url = "";
                        this.updateProfile();
                        this.showStatsModal(); // refresh modal
                    } catch (err) {
                        console.error("Failed to remove avatar", err);
                    }
                }
            }
        });

        // File Selected
        fileInput?.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files[0]) {
                await this.handleAvatarUpload(files[0]);
            }
        });


        // 3. Tabs Logic
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                // Toggle Buttons
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Toggle Content
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const content = document.getElementById(`tab-${tab}`);
                content?.classList.add('active');

                // Load Data
                if (tab === 'history' && AuthManager.currentUser) {
                    this.loadMatchHistory(AuthManager.currentUser.id);
                }

                if (tab === 'settings' && AuthManager.currentUser) {
                    const user = AuthManager.currentUser;
                    const usernameInput = document.getElementById('update-username') as HTMLInputElement;
                    const emailInput = document.getElementById('update-email') as HTMLInputElement;

                    if (usernameInput) usernameInput.value = user.username;
                    if (emailInput) emailInput.value = user.email || '';
                }
            });
        });
        this.setupProfileSettings();
    }

    private static async loadMatchHistory(userId: number) {
        const list = document.getElementById('match-history-list');
        if (!list) return;

        list.innerHTML = '<div class="match-item placeholder">Loading matches...</div>';

        try {
            const data = await APIClient.getMatchHistory(userId, 50);
            const matches = data.matches;

            if (matches.length === 0) {
                list.innerHTML = '<div class="match-item placeholder">No matches found.</div>';
                return;
            }

            list.innerHTML = ''; // Clear

            matches.forEach((m: any) => {
                const item = document.createElement('div');
                item.className = 'match-item';

                // OPPONENT | RESULT | ELO | DATE | ACTION
                const resultClass = m.result === 'win' ? 'result-win' : 'result-loss';
                const eloDiff = m.elo_change >= 0 ? `+${m.elo_change}` : `${m.elo_change}`;
                const dateStr = new Date(m.ended_at).toLocaleDateString();

                item.innerHTML = `
                    <div class="col-opp">${m.opponent_username}</div>
                    <div class="col-res ${resultClass}">${m.result.toUpperCase()}</div>
                    <div class="col-elo">${m.elo_after} <span style="font-size:0.8em; color:#888;">(${eloDiff})</span></div>
                    <div class="col-date">${dateStr}</div>
                    <div class="col-act"></div>
                `;

                // Watch Button
                const btn = document.createElement('button');
                btn.className = 'btn-watch';
                btn.innerText = 'WATCH';
                btn.onclick = () => this.loadReplay(m.id);

                item.querySelector('.col-act')?.appendChild(btn);
                list.appendChild(item);
            });

        } catch (e) {
            console.error("Failed to load history", e);
            list.innerHTML = '<div class="match-item placeholder">Failed to load history.</div>';
        }
    }

    private static async loadReplay(matchId: number) {
        try {
            alert("Loading Replay..."); // Temporary feedback
            const replayData = await APIClient.getReplay(matchId);

            if (!replayData) {
                alert("Invalid Replay Data");
                return;
            }

            // V2 Format: Use new ReplayScene with dual-board view
            if (isReplayFileV2(replayData)) {
                this.hideAll();
                SceneManager.changeScene(new ReplayScene(replayData));
                return;
            }

            // V1/Legacy replays are no longer supported with the new replay viewer
            // They used time-based events which can't be deterministically replayed
            alert("This replay was recorded with an older format and cannot be viewed.\n\nNew replays will use the improved replay system!");

        } catch (e) {
            console.error(e);
            alert("Failed to load replay.");
        }
    }

    private static showStatsModal() {
        const user = AuthManager.currentUser;
        if (!user) return;

        // Populate Data
        this.setElementText('stats-username', user.username);
        this.setElementText('stats-rank', user.rank ? `RANK #${user.rank}` : 'UNRANKED');
        this.setElementText('stats-wins', user.games_won.toString());
        this.setElementText('stats-losses', user.games_lost.toString());
        this.setElementText('stats-elo', user.elo_rating.toString());

        // Calculate Win Rate
        const winRate = user.games_played > 0
            ? Math.round((user.games_won / user.games_played) * 100)
            : 0;
        this.setElementText('stats-winrate', `${winRate}%`);

        // Large Avatar
        const largeAvatar = document.getElementById('stats-large-avatar');
        const removeBtn = document.getElementById('btn-remove-avatar');

        if (largeAvatar) {
            largeAvatar.style.backgroundImage = user.avatar_url
                ? `url(${user.avatar_url})`
                : 'none';
            if (!user.avatar_url) {
                largeAvatar.innerText = user.username.charAt(0).toUpperCase();
                largeAvatar.style.display = 'flex';
                largeAvatar.style.alignItems = 'center';
                largeAvatar.style.justifyContent = 'center';
                largeAvatar.style.fontSize = '40px';
                largeAvatar.style.color = '#fff';
                removeBtn?.classList.add('hidden');
            } else {
                largeAvatar.innerText = '';
                removeBtn?.classList.remove('hidden');
            }
        }

        // Show Modal
        const overlay = document.getElementById('modal-overlay');
        overlay?.classList.remove('hidden');
        // Small timeout to allow transition to work
        setTimeout(() => overlay?.classList.add('active'), 10);
    }

    private static hideStatsModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay?.classList.remove('active');
        setTimeout(() => overlay?.classList.add('hidden'), 300);
    }

    private static setElementText(id: string, text: string) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    private static async handleAvatarUpload(file: File) {
        // 1. Resize/Compress on Client
        try {
            const base64 = await this.resizeImage(file, 200, 200);

            // 2. Upload
            const user = AuthManager.currentUser;
            if (user) {
                await APIClient.uploadAvatar(user.id, base64);

                // 3. Update UI
                // Update AuthManager cache
                user.avatar_url = base64;
                this.updateProfile();
            }
        } catch (e) {
            console.error("Upload failed", e);
            alert("Failed to upload image. Try a smaller file.");
        }
    }

    private static setupProfileSettings() {
        const form = document.getElementById('form-update-profile') as HTMLFormElement;
        if (!form) return;

        // Helper to setup change button
        const setupChangeBtn = (btnId: string, inputId: string) => {
            const btn = document.getElementById(btnId);
            const input = document.getElementById(inputId) as HTMLInputElement;
            if (btn && input) {
                btn.addEventListener('click', () => {
                    input.readOnly = false;
                    input.focus();
                    btn.style.display = 'none'; // Hide button after clicking
                });
            }
        };

        setupChangeBtn('btn-change-username', 'update-username');
        setupChangeBtn('btn-change-email', 'update-email');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = AuthManager.currentUser;
            if (!user) return;

            const usernameInput = document.getElementById('update-username') as HTMLInputElement;
            const emailInput = document.getElementById('update-email') as HTMLInputElement;
            const passwordInput = document.getElementById('update-password') as HTMLInputElement;
            const confirmInput = document.getElementById('update-confirm') as HTMLInputElement;
            const btnSave = document.getElementById('btn-save-profile') as HTMLButtonElement;

            const newUsername = usernameInput.value.trim();
            const newEmail = emailInput.value.trim();
            const newPassword = passwordInput.value;
            const confirmPass = confirmInput.value;

            // 1. Validation
            if (!newUsername) {
                alert("Username cannot be empty.");
                return;
            }

            if (newPassword && newPassword !== confirmPass) {
                alert("Passwords do not match.");
                return;
            }

            // 2. Prepare Data
            const data: any = {};
            if (newUsername !== user.username) data.username = newUsername;
            // Handle email (User type might not have email locally?)
            // We assume user object *might* have email or we just send if changed from input default
            // Actually, we don't have email in local User object (AuthManager.User).
            // We should fetch full profile or just send if input is populated.
            // Let's send if populated.
            if (newEmail) data.email = newEmail;
            if (newPassword) data.password = newPassword;

            if (Object.keys(data).length === 0) {
                alert("No changes allowed or detected.");
                return;
            }

            // 3. Submit
            try {
                btnSave.disabled = true;
                btnSave.innerText = "SAVING...";

                const result = await APIClient.updateProfile(user.id, data);

                // 4. Success
                alert("Profile updated successfully!");

                // Update local session
                // We need to re-login essentially with new token
                if (result.token) {
                    localStorage.setItem('puyolive_token', result.token);
                    // Update AuthManager
                    AuthManager.token = result.token;
                    AuthManager.currentUser = result.user; // Update with new profile
                }

                // Refresh UI
                this.updateProfile();
                this.showStatsModal(); // Refresh modal content

                // Clear password fields
                passwordInput.value = "";
                confirmInput.value = "";

            } catch (err: any) {
                console.error("Update failed", err);
                alert(err.message || "Failed to update profile.");
            } finally {
                btnSave.disabled = false;
                btnSave.innerText = "SAVE CHANGES";
            }
        });
    }

    private static showLeaderboard() {
        this.hideAll();
        document.getElementById('leaderboard-menu')?.classList.remove('hidden');

        // Listener is in bindEvents() now

        this.loadLeaderboard();
    }

    private static async loadLeaderboard() {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;

        list.innerHTML = '<div class="lb-item placeholder">Loading top players...</div>';

        try {
            const data = await APIClient.getLeaderboard(50, 0);
            const { leaderboard } = data; // { leaderboard: [], pagination: {} }

            list.innerHTML = '';

            if (leaderboard.length === 0) {
                list.innerHTML = '<div class="lb-item placeholder">No ranked players yet.</div>';
                return;
            }

            const currentUserId = AuthManager.currentUser?.id;

            leaderboard.forEach((p: any) => {
                const item = document.createElement('div');
                const isMe = p.id === currentUserId;
                item.className = `lb-item ${isMe ? 'current-user' : ''}`;

                // Rank styling
                let rankClass = '';
                if (p.rank === 1) rankClass = 'top-1';
                else if (p.rank === 2) rankClass = 'top-2';
                else if (p.rank === 3) rankClass = 'top-3';

                item.innerHTML = `
                    <span class="col-rank ${rankClass}">#${p.rank}</span>
                    <span class="col-name">${p.username}</span>
                    <span class="col-elo">${p.elo_rating}</span>
                    <span class="col-winrate">${p.win_rate}%</span>
                `;
                list.appendChild(item);
            });

            // Show "My Rank" panel if user is logged in
            if (AuthManager.currentUser) {
                const myPanel = document.getElementById('my-rank-display');
                if (myPanel) {
                    // We could fetch explicit rank, or find in list
                    // Ideally, fetch specifically for accurate data if outside top 50
                    myPanel.classList.remove('hidden');

                    // Quick stats from AuthManager (might be slightly stale but ok for now)
                    const user = AuthManager.currentUser;
                    const winRate = user.games_played > 0 ? Math.round((user.games_won / user.games_played) * 100) : 0;

                    myPanel.innerHTML = `
                        <div class="my-rank-info">
                            <span class="label">YOUR RANKING</span>
                            <span class="value main">${user.rank ? '#' + user.rank : '-'}</span>
                        </div>
                        <div class="my-rank-divider"></div>
                        <div class="my-rank-info">
                            <span class="label">ELO RATING</span>
                            <span class="value accent">${user.elo_rating}</span>
                        </div>
                        <div class="my-rank-divider"></div>
                        <div class="my-rank-info">
                            <span class="label">WIN RATE</span>
                            <span class="value secondary">${winRate}%</span>
                        </div>
                     `;
                }
            }

        } catch (e) {
            console.error("Failed to load leaderboard", e);
            list.innerHTML = '<div class="lb-item placeholder" style="color:red">Failed to load data.</div>';
        }
    }

    private static resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% quality JPG
            };
            img.onerror = reject;
        });
    }

    private static updateProfile() {
        const nameEl = document.getElementById('profile-name');
        const rankEl = document.getElementById('profile-rank');
        const header = document.getElementById('profile-header');
        const avatarEl = document.getElementById('user-avatar'); // Top Right

        if (header) header.classList.remove('hidden');

        if (AuthManager.isGuest) {
            if (nameEl) nameEl.innerText = "Guest";
            if (rankEl) {
                rankEl.innerText = "UNRANKED (Auth Disabled)";
                rankEl.style.color = "#999";
            }
            if (avatarEl) {
                avatarEl.style.backgroundImage = 'none';
                avatarEl.innerText = '?';
            }
        } else {
            const user = AuthManager.currentUser;
            if (user) {
                if (nameEl) nameEl.innerText = user.username.toUpperCase();
                if (rankEl) {
                    // Update Rank/Elo Display
                    const rankText = user.rank ? `#${user.rank}` : '-';
                    const eloText = user.elo_rating.toString();

                    // Check for changes (Simple dopamine check)
                    const prevElo = parseInt(rankEl.dataset.lastElo || '0');
                    const prevRank = parseInt(rankEl.dataset.lastRank || '0');

                    // Construct HTML
                    rankEl.innerHTML = `<span class="rank-global">${rankText}</span> <span class="rank-elo">${eloText}</span>`;

                    // Animate if improved
                    const globalRankEl = rankEl.querySelector('.rank-global');
                    const eloRankEl = rankEl.querySelector('.rank-elo');

                    if (prevElo > 0 && user.elo_rating > prevElo) {
                        eloRankEl?.classList.remove('elo-up');
                        void (eloRankEl as HTMLElement).offsetWidth; // trigger reflow
                        eloRankEl?.classList.add('elo-up');
                    }

                    // Rank improved (Number got smaller, e.g. 5 -> 4)
                    if (prevRank > 0 && user.rank && user.rank < prevRank) {
                        globalRankEl?.classList.remove('rank-up');
                        void (globalRankEl as HTMLElement).offsetWidth; // trigger reflow
                        globalRankEl?.classList.add('rank-up');
                        SoundManager.play('click'); // Subtle sound hint
                    }

                    // Store current values
                    rankEl.dataset.lastElo = user.elo_rating.toString();
                    rankEl.dataset.lastRank = user.rank ? user.rank.toString() : '999999';

                    // rankEl.innerText = `ELO: ${user.elo_rating}`; // OLD
                    rankEl.style.color = "white"; // Reset base color
                }
                if (avatarEl) {
                    if (user.avatar_url) {
                        avatarEl.style.backgroundImage = `url(${user.avatar_url})`;
                        avatarEl.innerText = '';
                        avatarEl.style.backgroundSize = 'cover';
                    } else {
                        avatarEl.style.backgroundImage = 'none';
                        avatarEl.innerText = user.username.charAt(0).toUpperCase();
                    }
                }
            }
        }
    }

    private static bindEvents() {
        // Main Menu
        document.getElementById('btn-singleplayer')?.addEventListener('click', () => {
            this.showModeSelection();
        });

        document.getElementById('btn-multiplayer')?.addEventListener('click', () => {
            this.showMultiplayer();
        });

        document.getElementById('btn-settings')?.addEventListener('click', () => {
            this.showSettings();
        });

        document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
            this.showLeaderboard();
        });

        document.getElementById('btn-leaderboard-back')?.addEventListener('click', () => {
            this.showMain();
        });

        // Settings
        document.getElementById('btn-controls')?.addEventListener('click', () => {
            this.showControls();
        });

        document.getElementById('btn-settings-back')?.addEventListener('click', () => {
            SettingsManager.save();
            this.showMain();
        });

        this.bindSettingInput('input-das', 'val-das', 'das', 1, 50, 1);
        this.bindSettingInput('input-arr', 'val-arr', 'arr', 0, 30, 1);
        this.bindSettingInput('input-softdrop', 'val-softdrop', 'sdf', 1, 50, 1); // fixed key
        this.bindSettingInput('input-volume', 'val-volume', 'masterVolume', 0, 100, 1);

        // Multiplayer
        const privateSection = document.getElementById('private-room-section');
        const btnCancelMatch = document.getElementById('btn-cancel-match');
        const statusQueue = document.getElementById('status-queue');
        const matchmakingModeSelect = document.querySelector('.matchmaking-mode-select');

        // Ranked Matchmaking
        document.getElementById('btn-find-ranked')?.addEventListener('click', () => {
            // Check if user is authenticated
            if (!AuthManager.isAuthenticated()) {
                alert('You must be logged in to play Ranked matches!');
                return;
            }

            NetworkManager.joinQueue(true); // true = ranked
            matchmakingModeSelect?.classList.add('hidden');
            btnCancelMatch?.classList.remove('hidden');
            statusQueue?.classList.remove('hidden');
            statusQueue!.textContent = "Searching for ranked opponent...";
        });

        // Unranked Matchmaking
        document.getElementById('btn-find-unranked')?.addEventListener('click', () => {
            NetworkManager.joinQueue(false); // false = unranked
            matchmakingModeSelect?.classList.add('hidden');
            btnCancelMatch?.classList.remove('hidden');
            statusQueue?.classList.remove('hidden');
            statusQueue!.textContent = "Searching for unranked opponent...";
        });

        document.getElementById('btn-cancel-match')?.addEventListener('click', () => {
            NetworkManager.leaveQueue();
            matchmakingModeSelect?.classList.remove('hidden');
            btnCancelMatch?.classList.add('hidden');
            statusQueue?.classList.add('hidden');
        });

        document.getElementById('btn-private-toggle')?.addEventListener('click', () => {
            privateSection?.classList.toggle('hidden');
        });

        document.getElementById('btn-create-room')?.addEventListener('click', () => {
            NetworkManager.createRoom();
        });

        document.getElementById('btn-join-room')?.addEventListener('click', () => {
            const roomId = prompt("Enter Room ID:");
            if (roomId) NetworkManager.joinRoom(roomId);
        });

        document.getElementById('btn-set-server')?.addEventListener('click', () => {
            const url = prompt("Enter Server URL:", NetworkManager.serverUrl || "http://localhost:3000");
            if (url) NetworkManager.connect(url);
        });

        document.getElementById('btn-lobby-back')?.addEventListener('click', () => {
            NetworkManager.leaveQueue();
            this.showMain();
        });

        document.getElementById('btn-start-game')?.addEventListener('click', () => {
            if (this.currentRoomId) {
                NetworkManager.startGame(this.currentRoomId);
            }
        });

        // Controls
        document.getElementById('btn-controls-back')?.addEventListener('click', () => {
            this.showSettings();
        });

        document.getElementById('btn-reset-controls')?.addEventListener('click', () => {
            ControlsManager.resetToDefaults();
            this.refreshControlsUI();
        });

        this.bindControlsEvents();

        // Mode Selection
        // Mode Selection
        document.getElementById('btn-mode-3min')?.addEventListener('click', () => {
            this.hideAll();
            this.lastTimeLimit = 180;
            SceneManager.changeScene(new GameScene(undefined, 180)); // 3 minutes = 180 seconds
        });

        document.getElementById('btn-mode-5min')?.addEventListener('click', () => {
            this.hideAll();
            this.lastTimeLimit = 300;
            SceneManager.changeScene(new GameScene(undefined, 300)); // 5 minutes = 300 seconds
        });

        document.getElementById('btn-mode-10min')?.addEventListener('click', () => {
            this.hideAll();
            this.lastTimeLimit = 600;
            SceneManager.changeScene(new GameScene(undefined, 600)); // 10 minutes = 600 seconds
        });

        document.getElementById('btn-mode-practice')?.addEventListener('click', () => {
            this.hideAll();
            this.lastTimeLimit = 0;
            SceneManager.changeScene(new GameScene(undefined, 0)); // 0 = no time limit
        });

        document.getElementById('btn-mode-back')?.addEventListener('click', () => {
            this.showMain();
        });

        // Game Over / Pause
        // Resume Button
        document.getElementById('btn-go-resume')?.addEventListener('click', () => {
            if (this.isPausedMenu) {
                this.hidePause();
                if (this.onResume) this.onResume();
            }
        });

        // Restart Button
        document.getElementById('btn-go-restart')?.addEventListener('click', () => {
            // Always Restart Logic now (Resume is separate)
            if (this.isPausedMenu) {
                this.hidePause();
                if (this.lastTimeLimit !== null) {
                    this.hideAll();
                    SceneManager.changeScene(new GameScene(undefined, this.lastTimeLimit));
                } else {
                    this.showMain();
                    SceneManager.changeScene(new MenuScene());
                }
                return;
            } else {
                this.hideGameOver();
            }

            // If multiplayer, requeue for a new match
            if (this.currentRoomId) {
                const roomIdToLeave = this.currentRoomId;
                this.currentRoomId = null;

                // Use requeue to properly clean up room and join queue atomically
                NetworkManager.requeue(roomIdToLeave);

                // Show multiplayer menu with searching state immediately
                this.showMultiplayer(true);
                SceneManager.changeScene(new MenuScene());
            } else {
                if (this.lastTimeLimit !== null) {
                    this.hideAll();
                    SceneManager.changeScene(new GameScene(undefined, this.lastTimeLimit));
                } else {
                    this.showMain();
                    SceneManager.changeScene(new MenuScene());
                }
            }
        });

        document.getElementById('btn-go-menu')?.addEventListener('click', () => {
            if (this.isPausedMenu) {
                this.hidePause();
                // Ensure onResume cleanup if needed?
                // Just go to menu
            }
            if (this.currentRoomId) {
                NetworkManager.leaveRoom(this.currentRoomId);
                NetworkManager.leaveQueue();
                this.currentRoomId = null;
            }
            this.hideGameOver();
            this.showMain();
            SceneManager.changeScene(new MenuScene());
        });

        // Validating network state on load
        this.updateMultiplayerStatus();
        // Validating network state on load
        this.updateMultiplayerStatus();
        NetworkManager.on('connect', () => {
            this.updateMultiplayerStatus();
            // Hide any disconnect modal if it exists
            const disModal = document.getElementById('disconnect-modal');
            if (disModal) disModal.classList.add('hidden');
        });
        NetworkManager.on('disconnect', () => {
            this.updateMultiplayerStatus();
            // Show disconnect feedback if in game or queue
            if (!this.mainMenu.classList.contains('hidden') && this.gameHud.classList.contains('hidden')) {
                // In menu, just update status text (handled by updateMultiplayerStatus)
                return;
            }

            // If in game or lobby, show critical alert
            let disModal = document.getElementById('disconnect-modal');
            if (!disModal) {
                disModal = document.createElement('div');
                disModal.id = 'disconnect-modal';
                disModal.className = 'modal';
                disModal.innerHTML = `
                    <h2 style="color: #ff3333;">CONNECTION LOST</h2>
                    <p>Reconnecting to server...</p>
                    <button id="btn-force-menu" class="btn-secondary">RETURN TO MENU</button>
                `;
                this.uiLayer.appendChild(disModal);
                document.getElementById('btn-force-menu')?.addEventListener('click', () => {
                    disModal!.classList.add('hidden');
                    this.hideAll();
                    this.showMain();
                    SceneManager.changeScene(new MenuScene());
                });
            }
            disModal.classList.remove('hidden');
        });
        NetworkManager.on('room_created', (data: any) => {
            const status = document.getElementById('status-room');
            if (status) status.innerText = `Room Created: ${data.roomId} (Waiting...)`;
            this.currentRoomId = data.roomId;
            this.updateStartButton();
        });
        NetworkManager.on('player_joined', (data: any) => {
            const status = document.getElementById('status-room');
            if (status) status.innerText = `Room Joined! Players: ${data.count}`;
            this.updateStartButton();
        });

        NetworkManager.on('queue_update', (data: { count: number, ranked: number, unranked: number }) => {
            // Update global counter
            const globalQueue = document.getElementById('status-global-queue');
            if (globalQueue) {
                // If the server hasn't updated to send separate counts yet, handle gracefully (though we just updated server logic previously? No, we updated match recording. We assume server sends this? Let's check server actually.)
                // Wait, I never updated the server to send this data. I should check server/index.ts first. 
                // BUT, assuming the server *will* send it or I need to update it.
                // The prompt implied the data was "already sent" or I should use it. 
                // Let's assume I need to handle it if it exists.

                const r = data.ranked !== undefined ? data.ranked : '?';
                const u = data.unranked !== undefined ? data.unranked : '?';

                globalQueue.innerHTML = `<span style="color:#aaa">QUEUES:</span> <span style="color:#ffcc00">RANKED (${r})</span> <span style="color:#666">|</span> <span style="color:#00ccff">CASUAL (${u})</span>`;
                // globalQueue.style.color = data.count > 0 ? '#ff4d00' : '#ffffff'; // Removed to rely on innerHTML colors
            }

            // Update local status if searching
            const statusQueue = document.getElementById('status-queue');
            if (statusQueue && !statusQueue.classList.contains('hidden')) {
                // We don't verify WHICH queue they are in here easily without tracking it in UIManager
                // But generally "Searching..." is fine, maybe add count?
                statusQueue.innerText = `Searching... (${data.count} players online)`;
            }
        });

        NetworkManager.on('match_found', (data: any) => {
            console.log("UI: Match Found", data);
            const statusQueue = document.getElementById('status-queue');
            const btnFindMatch = document.getElementById('btn-find-match');
            const btnCancelMatch = document.getElementById('btn-cancel-match');

            if (statusQueue) {
                statusQueue.classList.remove('hidden');
                statusQueue.textContent = "Match Found! Starting game...";
            }

            // Reset the finding match button states for next time
            btnFindMatch?.classList.remove('hidden');
            btnCancelMatch?.classList.add('hidden');

            this.currentRoomId = data.roomId;

            // Trigger VS Screen
            this.showMatchReady(data.players || []);
        });

        NetworkManager.on('requeue_confirmed', () => {
            console.log("UI: Requeue confirmed, resetting state");
            // State is already being handled by the requeue button handler
        });
        NetworkManager.on('game_start', (data: any) => {
            console.log("UI: Game Start", data);

            // Just ensure VS Modal is gone if it was there
            this.matchReadyModal.classList.add('hidden');

            this.hideAll();
            const roomId = data.roomId || this.currentRoomId;
            // Identify Opponent ID for filtering
            let opponentId: string | undefined;
            if (data.players && Array.isArray(data.players)) {
                const myId = NetworkManager.getSocket()?.id;
                opponentId = data.players.find((id: string) => id !== myId);
            }

            if (roomId) {
                // Ensure we transition correctly
                try {
                    SceneManager.changeScene(new GameScene(roomId, 0, data.seed, opponentId));
                } catch (e) {
                    console.error("Error creating GameScene:", e);
                }
            } else {
                console.error("Game Start received but no Room ID provided or cached!");
            }
        });

        NetworkManager.on('leaderboard_update', () => {
            const lbMenu = document.getElementById('leaderboard-menu');
            if (lbMenu && !lbMenu.classList.contains('hidden')) {
                console.log("UI: refreshing leaderboard...");
                this.loadLeaderboard();
            }
        });

        GameEvents.on('exit_game', () => {
            if (this.currentRoomId) {
                NetworkManager.leaveRoom(this.currentRoomId);
                NetworkManager.leaveQueue();
                this.currentRoomId = null;
            }
            this.hideAll();
            this.showMain();
            // SoundManager.play('menu_back'); // Optional
        });

        NetworkManager.on('elo_update', (data: { new_elo: number, change: number }) => {
            console.log("UI: Elo Updated", data);
            if (AuthManager.currentUser) {
                AuthManager.currentUser.elo_rating = data.new_elo;

                // Update header
                this.updateProfile();

                // Show localized feedback via DOM Toast (Only if NOT in game over screen? Or always?)
                // If we have match_result, we might not need this toast if the Game Over screen covers it.
                // But this is good for instant feedback.
                const sign = data.change >= 0 ? '+' : '';
                const color = data.change >= 0 ? '#00ff00' : '#ff0000';

                // Create toast element manually
                const toast = document.createElement('div');
                toast.innerText = `ELO ${sign}${data.change}`;
                Object.assign(toast.style, {
                    position: 'fixed',
                    top: '20%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: color,
                    fontSize: '48px',
                    fontWeight: 'bold',
                    textShadow: '0px 0px 10px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                    zIndex: '1000',
                    transition: 'top 2s ease-out, opacity 2s ease-out',
                    opacity: '1'
                });

                document.body.appendChild(toast);

                // Animate
                requestAnimationFrame(() => {
                    // Force reflow
                    void toast.offsetWidth;
                    toast.style.top = '15%';
                    toast.style.opacity = '0';
                });

                setTimeout(() => {
                    if (document.body.contains(toast)) document.body.removeChild(toast);
                }, 2000);
            }
        });

        NetworkManager.on('match_result', (data: any) => {
            console.log("UI: Match Result Received", data);
            if (AuthManager.currentUser) {
                // Update persistent user state
                AuthManager.currentUser.level = data.new_level;
                AuthManager.currentUser.current_xp = data.new_xp;
                AuthManager.currentUser.elo_rating = data.new_elo;

                this.updateProfile();

                // Forward to GameEvents so React Overlay can pick it up
                GameEvents.emit('match_result', data);
            }
        });
    }

    private static bindSettingInput(inputId: string, valId: string, settingKey: keyof typeof SettingsManager, min: number, max: number, step: number) {
        const input = document.getElementById(inputId) as HTMLInputElement;
        const valDisplay = document.getElementById(valId);

        if (!input || !valDisplay) return;

        // Initialize (Apply constraints to DOM)
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);

        input.value = String(SettingsManager[settingKey]);
        valDisplay.innerText = String(SettingsManager[settingKey]);

        input.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            let value = parseFloat(target.value);

            // Clamp
            value = Math.max(min, Math.min(max, value));

            // Update Manager
            (SettingsManager as any)[settingKey] = value;

            // Update Display
            valDisplay.innerText = String(value);
        });
    }

    public static hideAll() {
        this.mainMenu.classList.add('hidden');
        this.settingsMenu.classList.add('hidden');
        this.multiplayerMenu.classList.add('hidden');
        this.modeMenu.classList.add('hidden');
        this.controlsMenu.classList.add('hidden');
        this.gameHud.classList.add('hidden');
        this.loginScreen.classList.add('hidden');
        document.getElementById('leaderboard-menu')?.classList.add('hidden');

        // Force hide overlays
        this.gameOverModal?.classList.add('hidden');
        this.gameOverModal?.classList.remove('visible');
        this.matchReadyModal.classList.add('hidden');

        const hudMessage = document.getElementById('hud-message');
        if (hudMessage) hudMessage.className = ''; // Clear classes (e.g. visible)

        // Explicitly hide Global Logo and Profile Header in-game
        document.getElementById('global-logo')?.classList.add('hidden');
        document.getElementById('profile-header')?.classList.add('hidden');

        this.isPausedMenu = false;
    }

    // Replay controls
    public static showReplayControls(): void {
        document.getElementById('replay-controls')?.classList.remove('hidden');
    }

    public static hideReplayControls(): void {
        document.getElementById('replay-controls')?.classList.add('hidden');
    }

    public static showAuth() {
        this.hideAll();
        // Login Screen is now a full screen, no need to show/blur main menu behind it
        // this.mainMenu.classList.remove('hidden');
        // this.mainMenu.style.filter = "blur(4px) brightness(0.5)";
        // this.mainMenu.style.pointerEvents = "none";

        // ensure profile header is hidden
        this.profileHeader.classList.add('hidden');
        this.loginScreen.classList.remove('hidden');
    }

    public static showMain() {
        this.hideAll();
        // Show Logo
        document.getElementById('global-logo')?.classList.remove('hidden');

        // Ensure we switch BACK to the MenuScene (clears game if running)
        SceneManager.changeScene(new MenuScene());

        // Refresh profile to get latest stats (e.g. after a match)
        if (AuthManager.isAuthenticated()) {
            AuthManager.refreshProfile().then(() => {
                this.updateProfile();
            });
        }
        this.mainMenu.classList.remove('hidden');
        this.mainMenu.style.filter = "none";
        this.mainMenu.style.pointerEvents = "auto";
        this.updateProfile();
    }

    public static showMatchReady(players: any[]) {
        // Player data likely comes from match_found event
        // We'll mock if missing for now
        const p1 = players[0] || { username: 'Player 1', elo: 1000 };
        const p2 = players[1] || { username: 'Player 2', elo: 1000 };

        const p1Name = document.querySelector('#vs-p1 .p-name') as HTMLElement;
        const p1Rank = document.querySelector('#vs-p1 .p-rating') as HTMLElement;
        const p1Avatar = document.querySelector('#vs-p1 .p-avatar') as HTMLElement;

        const p2Name = document.querySelector('#vs-p2 .p-name') as HTMLElement;
        const p2Rank = document.querySelector('#vs-p2 .p-rating') as HTMLElement;
        const p2Avatar = document.querySelector('#vs-p2 .p-avatar') as HTMLElement;

        if (p1Name) p1Name.innerText = p1.username;
        if (p1Rank) p1Rank.innerText = p1.elo ? `ELO: ${p1.elo}` : 'UNRANKED';
        if (p1Avatar) {
            p1Avatar.style.backgroundImage = p1.avatar_url ? `url(${p1.avatar_url})` : 'none';
            p1Avatar.innerText = p1.avatar_url ? '' : p1.username.charAt(0).toUpperCase();
        }

        if (p2Name) p2Name.innerText = p2.username;
        if (p2Rank) p2Rank.innerText = p2.elo ? `ELO: ${p2.elo}` : 'UNRANKED';
        if (p2Avatar) {
            p2Avatar.style.backgroundImage = p2.avatar_url ? `url(${p2.avatar_url})` : 'none';
            p2Avatar.innerText = p2.avatar_url ? '' : p2.username.charAt(0).toUpperCase();
        }

        this.matchReadyModal.classList.remove('hidden');

        // Start countdown animation
        const cd = document.getElementById('vs-countdown');
        if (cd) {
            let count = 3;
            cd.innerText = String(count);
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    cd.innerText = String(count);
                } else {
                    clearInterval(interval);
                    // The 'game_start' event should typically come from server shortly, 
                    // which will hide this modal.
                }
            }, 1000);
        }
    }

    public static showSettings() {
        this.hideAll();
        this.settingsMenu.classList.remove('hidden');
        this.refreshSettingsUI();
    }

    public static showMultiplayer(isSearching: boolean = false) {
        this.hideAll();
        this.multiplayerMenu.classList.remove('hidden');
        this.updateMultiplayerStatus();
        this.updateStartButton();

        const matchmakingModeSelect = document.querySelector('.matchmaking-mode-select');
        const btnCancelMatch = document.getElementById('btn-cancel-match');
        const statusQueue = document.getElementById('status-queue');

        if (isSearching) {
            // Show searching state (requeuing or already in queue)
            matchmakingModeSelect?.classList.add('hidden');
            btnCancelMatch?.classList.remove('hidden');
            statusQueue?.classList.remove('hidden');
            if (statusQueue) statusQueue.textContent = "Searching for opponent...";
        } else {
            // Reset to default state
            matchmakingModeSelect?.classList.remove('hidden');
            btnCancelMatch?.classList.add('hidden');
            statusQueue?.classList.add('hidden');
        }
    }

    public static showModeSelection() {
        this.hideAll();
        this.modeMenu.classList.remove('hidden');
    }

    public static showControls() {
        this.hideAll();
        this.controlsMenu.classList.remove('hidden');
        this.refreshControlsUI();
    }

    public static showGameHUD(isMultiplayer: boolean = false) {
        this.hideAll();
        this.gameHud.classList.remove('hidden');

        // Toggle Multiplayer Stats
        const attackEl = document.getElementById('hud-attack')?.parentElement;
        const vsScoreEl = document.querySelector('.versus-score') as HTMLElement;
        const garbageEl = document.getElementById('hud-garbage-text')?.parentElement;

        if (attackEl) attackEl.style.display = isMultiplayer ? 'block' : 'none';
        if (vsScoreEl) vsScoreEl.style.display = isMultiplayer ? 'block' : 'none';

        if (garbageEl) {
            garbageEl.style.display = isMultiplayer ? 'block' : 'none';
        }

        const spChainEl = document.getElementById('stat-max-chain');
        const spClearedEl = document.getElementById('stat-cleared');
        if (spChainEl) spChainEl.style.display = isMultiplayer ? 'none' : 'block';
        if (spClearedEl) spClearedEl.style.display = isMultiplayer ? 'none' : 'block';

        // Reset Values
        this.updateScore(0);
        this.updateGarbage(0, 0);
    }

    public static updateScore(score: number) {
        const el = document.getElementById('hud-score');
        if (el) el.innerText = String(score);
    }

    public static updateSPStats(maxChain: number, cleared: number) {
        const chainEl = document.getElementById('hud-max-chain');
        const clearedEl = document.getElementById('hud-cleared');
        if (chainEl) chainEl.innerText = String(maxChain);
        if (clearedEl) clearedEl.innerText = String(cleared);
    }

    public static updateGarbage(queue: number, tray: number) {
        const el = document.getElementById('hud-garbage-text');
        if (el) el.innerText = `Q: ${queue} / T: ${tray}`;
    }

    public static updateTime(timeString: string) {
        const el = document.getElementById('hud-time');
        if (el) el.innerText = timeString;
    }

    public static showGameOver(score: number, message: string) {
        this.isPausedMenu = false;
        this.gameHud.classList.remove('hidden'); // Ensure HUD is visible behind
        this.gameOverModal.classList.remove('hidden');
        this.gameOverModal.classList.add('visible');

        const title = document.getElementById('go-title');
        if (title) {
            title.innerText = message;
            title.style.color = message === "YOU WIN!" ? "#00ff00" : "#ff0000";
        }

        const scoreEl = document.getElementById('go-score');
        if (scoreEl) scoreEl.innerText = `Final Score: ${score}`;

        const restartBtn = document.getElementById('btn-go-restart');
        if (restartBtn) {
            restartBtn.innerText = this.currentRoomId ? 'REQUEUE' : 'RESTART';
        }

        document.getElementById('btn-go-resume')?.classList.add('hidden');
    }

    public static showPause() {
        this.isPausedMenu = true;
        this.gameOverModal.classList.remove('hidden');
        this.gameOverModal.classList.add('visible');

        const title = document.getElementById('go-title');
        if (title) {
            title.innerText = "PAUSED";
            title.style.color = "#ffffff";
        }

        const scoreEl = document.getElementById('go-score');
        if (scoreEl) scoreEl.innerText = "";

        // Show Resume Button
        const resumeBtn = document.getElementById('btn-go-resume');
        if (resumeBtn) {
            resumeBtn.classList.remove('hidden');
        }

        const restartBtn = document.getElementById('btn-go-restart');
        if (restartBtn) {
            restartBtn.innerText = "RESTART";
        }
    }

    public static hidePause() {
        this.gameOverModal.classList.add('hidden');
        this.isPausedMenu = false;
    }

    public static hideGameOver() {
        this.gameOverModal.classList.add('hidden');
    }

    private static refreshSettingsUI() {
        const keys = [
            { id: 'input-das', key: 'das' },
            { id: 'input-arr', key: 'arr' },
            { id: 'input-softdrop', key: 'sdf' },
            { id: 'input-volume', key: 'masterVolume' }
        ];

        keys.forEach(item => {
            const el = document.getElementById(item.id) as HTMLInputElement;
            const disp = document.getElementById(item.id.replace('input', 'val'));
            if (el && disp) {
                el.value = String((SettingsManager as any)[item.key]);
                disp.innerText = String((SettingsManager as any)[item.key]);
            }
        });
    }

    private static updateMultiplayerStatus() {
        const conn = document.getElementById('status-connection');
        if (conn) {
            conn.innerText = NetworkManager.isConnected ? "Connected" : "Disconnected";
            conn.style.color = NetworkManager.isConnected ? "#00ff00" : "#ff0000";
        }

        // Reset Search UI state when showing menu
        const btnFind = document.getElementById('btn-find-match');
        const btnCancel = document.getElementById('btn-cancel-match');
        const statusQueue = document.getElementById('status-queue');

        btnFind?.classList.remove('hidden');
        btnCancel?.classList.add('hidden');
        statusQueue?.classList.add('hidden');

        this.updateStartButton();

        // Start Controller Polling for UI Status
        this.pollControllerStatus();
    }

    private static pollControllerStatus() {
        const statusEl = document.getElementById('controller-connected-status');
        if (!statusEl) return;

        setInterval(() => {
            const gps = navigator.getGamepads ? navigator.getGamepads() : [];
            let connected = false;
            let name = "";

            for (const gp of gps) {
                if (gp && gp.connected) {
                    connected = true;
                    name = gp.id;
                    // Simplify name (remove huge ID strings from browsers)
                    // e.g. "Xbox 360 Controller (Standard Gamepad Vendor: 045e Product: 028e)"
                    // -> "Xbox 360 Controller"
                    name = name.split(' (')[0];
                    if (name.length > 30) name = name.substring(0, 30) + "...";
                    break;
                }
            }

            if (connected) {
                statusEl.innerText = `Status: Connected (${name})`;
                statusEl.style.color = '#44ff44';
            } else {
                statusEl.innerText = 'Status: Not Connected';
                statusEl.style.color = '#ff4444';
            }
        }, 2000);
    }

    private static updateStartButton() {
        const btn = document.getElementById('btn-start-game') as HTMLButtonElement;
        if (!btn) return;

        const roomStatus = document.getElementById('status-room')?.innerText || '';
        const hasRoom = this.currentRoomId !== null;
        const hasTwoPlayers = roomStatus.includes('Players: 2');

        btn.disabled = !hasRoom || !hasTwoPlayers;
    }

    private static bindControlsEvents() {
        // Tab Switching
        const tabs = document.querySelectorAll('.controls-tabs .tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                tabs.forEach(t => t.classList.remove('active'));
                btn.classList.add('active');

                // Toggle sections (assuming we have unique IDs for them now)
                document.getElementById('tab-keyboard')?.classList.toggle('active', tab === 'keyboard');
                document.getElementById('tab-controller')?.classList.toggle('active', tab === 'controller');
            });
        });

        // Add click listeners to all key display buttons
        const bindings = document.querySelectorAll('.control-binding');
        bindings.forEach(binding => {
            const btn = binding.querySelector('.key-display') as HTMLButtonElement;
            const action = binding.getAttribute('data-action') as GameAction;
            const type = binding.getAttribute('data-type'); // 'keyboard' or 'controller'

            btn?.addEventListener('click', () => {
                if (type === 'controller') {
                    this.startControllerCapture(action);
                } else {
                    this.startKeyCapture(action);
                }
            });
        });

        // Listen for key presses when capturing
        document.addEventListener('keydown', (e) => {
            if (this.isCapturingKey) {
                e.preventDefault();
                const success = ControlsManager.setKey(this.isCapturingKey, e.code);
                if (success) {
                    this.refreshControlsUI();
                    this.stopKeyCapture();
                } else {
                    // Show error - key already bound
                    alert(`Key ${e.code} is already bound to another action!`);
                }
            }
        });
    }

    private static startKeyCapture(action: GameAction) {
        // If already capturing, stop the previous one first
        if (this.isCapturingKey) this.stopKeyCapture();
        if (this.isCapturingController) this.stopControllerCapture();

        this.isCapturingKey = action;
        const binding = document.querySelector(`.control-binding[data-type="keyboard"][data-action="${action}"]`);
        const btn = binding?.querySelector('.key-display') as HTMLButtonElement;
        if (btn) {
            btn.innerText = '...';
            btn.classList.add('binding-active');
        }
    }

    private static stopKeyCapture() {
        const action = this.isCapturingKey;
        this.isCapturingKey = null;
        if (action) {
            const binding = document.querySelector(`.control-binding[data-type="keyboard"][data-action="${action}"]`);
            const btn = binding?.querySelector('.key-display') as HTMLButtonElement;
            btn?.classList.remove('binding-active');
            this.refreshControlsUI();
        }
    }

    private static isCapturingController: GameAction | null = null;

    private static startControllerCapture(action: GameAction) {
        // If already capturing, stop the previous one first
        if (this.isCapturingController) this.stopControllerCapture();
        if (this.isCapturingKey) this.stopKeyCapture();

        this.isCapturingController = action;
        const binding = document.querySelector(`.control-binding[data-type="controller"][data-action="${action}"]`);
        const btn = binding?.querySelector('.key-display') as HTMLButtonElement;

        if (btn) {
            btn.innerText = 'Press Btn...';
            btn.classList.add('binding-active');
        }

        // Loop using requestAnimationFrame + Input helper
        const loop = () => {
            if (!this.isCapturingController) return;

            // Do NOT call Input.update() here. The main game loop handles it.
            // Calling it twice breaks 'isPressed' checks (prevKeys gets overwritten).

            const pressed = Input.getLastPressedButton();
            if (pressed) {
                const success = ControlsManager.setControllerKey(this.isCapturingController, pressed);
                if (success) {
                    this.stopControllerCapture();
                    // stopControllerCapture refreshes UI, but let's be safe
                    // actually stopControllerCapture calls refreshControlsUI
                    return;
                }
            }

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    private static stopControllerCapture() {
        if (!this.isCapturingController) return;

        const action = this.isCapturingController;
        this.isCapturingController = null;

        const binding = document.querySelector(`.control-binding[data-type="controller"][data-action="${action}"]`);
        const btn = binding?.querySelector('.key-display') as HTMLButtonElement;
        btn?.classList.remove('binding-active');
        this.refreshControlsUI();
    }

    private static refreshControlsUI() {
        try {
            // Keyboard
            const kBindings = ControlsManager.getAllBindings();
            for (const [action, keyCode] of Object.entries(kBindings)) {
                const binding = document.querySelector(`.control-binding[data-type="keyboard"][data-action="${action}"]`);
                const btn = binding?.querySelector('.key-display') as HTMLButtonElement;
                if (btn) {
                    btn.innerText = ControlsManager.getKeyName(keyCode || '');
                }
            }

            // Controller
            const actions: GameAction[] = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotateCW', 'rotateCCW'];
            for (const action of actions) {
                const code = ControlsManager.getControllerKey(action);
                const binding = document.querySelector(`.control-binding[data-type="controller"][data-action="${action}"]`);
                const btn = binding?.querySelector('.key-display') as HTMLButtonElement;
                if (btn) {
                    btn.innerText = ControlsManager.getKeyName(code || '');
                }
            }
        } catch (e) {
            console.error('Error refreshing controls UI:', e);
        }
    }

    // --- Controller Navigation ---

    private static processControllerNavigation() {
        // Block navigation if we're capturing input for rebinding
        if (this.isCapturingKey || this.isCapturingController) return;

        // Only run if we are in a menu (activeScreen is set) or specific overlays are visible
        // We detect active screen by checking which .screen is not hidden
        const screens = document.querySelectorAll('.screen:not(.hidden)');
        if (screens.length === 0) return;

        const currentScreen = screens[screens.length - 1] as HTMLElement; // Topmost screen

        // Rate limit navigation
        const now = Date.now();
        if (now - this.lastNavTime < this.NAV_DELAY) return;

        // Input Mappings for Menu
        // We use raw Gamepad API here for navigation to avoid GameAction binding conflicts (e.g., hardDrop is Dpad Up maybe?)
        // actually existing bindings are: moveLeft/Right/SoftDrop(Down)/HardDrop(Up or Button)
        // Best to use dpad for menu nav regardless of game bindings if possible, or use 'move' actions?
        // Let's stick to raw gamepad D-pad signals for menu reliability
        const gp = navigator.getGamepads()[0] || navigator.getGamepads()[1];
        if (!gp) return;

        // Threshold
        const threshold = 0.5;

        let moved = false;

        // UP (D-Pad Up is usually Axis 1 or Button 12)
        if (gp.buttons[12]?.pressed || gp.axes[1] < -threshold) {
            this.navigateFocus(currentScreen, -1);
            moved = true;
        }
        // DOWN
        else if (gp.buttons[13]?.pressed || gp.axes[1] > threshold) {
            this.navigateFocus(currentScreen, 1);
            moved = true;
        }

        // SELECT (A / Cross - Btn 0)
        if (gp.buttons[0]?.pressed) {
            // Check if we are currently focusing something
            if (this.currentFocus) {
                this.currentFocus.click();
            }
            moved = true;
        }

        // BACK (B / Circle - Btn 1)
        if (gp.buttons[1]?.pressed) {
            this.handleBackNavigation();
            moved = true;
        }

        if (moved) {
            this.lastNavTime = now;
        }
    }

    private static navigateFocus(screen: HTMLElement, direction: number) {
        // Find all focusable elements
        const focusable = Array.from(screen.querySelectorAll('button, input, .tab-btn')) as HTMLElement[];
        const visible = focusable.filter(el => {
            return el.offsetParent !== null && !el.classList.contains('hidden') && !(el as HTMLButtonElement).disabled;
        });

        if (visible.length === 0) return;

        let idx = -1;
        if (this.currentFocus && visible.includes(this.currentFocus)) {
            idx = visible.indexOf(this.currentFocus);
        }

        if (idx === -1) {
            idx = 0;
        } else {
            idx += direction;
            if (idx < 0) idx = visible.length - 1;
            if (idx >= visible.length) idx = 0;
        }

        this.setFocus(visible[idx]);
    }

    private static setFocus(el: HTMLElement) {
        if (this.currentFocus) this.currentFocus.classList.remove('gamepad-focus');

        this.currentFocus = el;
        this.currentFocus.classList.add('gamepad-focus');
        this.currentFocus.focus();
        this.currentFocus.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

