
        async function connectFamily(familyId, shouldCreate) {
            state.familyId = familyId;
            state.calendarCode = familyId;

            const connected = await initCloudBackend();
            if (!connected) return false;

            const result = await serverApi(`/api/families/${encodeURIComponent(familyId)}/connect`, {
                method: 'POST',
                body: JSON.stringify({
                    shouldCreate,
                    name: state.userName || '家庭成員',
                    role: state.role || 'child',
                    avatar: state.userAvatar || ''
                })
            }).catch(error => {
                if (error.status === 404) throw new Error('family-not-found');
                if (error.status === 401) throw new Error('unauthorized');
                throw error;
            });

            // 更新用戶資訊
            if (result?.member) {
                state.authUid = result.member.uid;
            }

            // 重置載入標記，確保新加入的家庭能拉取歷史數據
            hasLoadedCloudMessages = false;
            hasLoadedCloudMemories = false;

            subscribeFamilyMessages(familyId);
            subscribeFamilyMemories(familyId);
            return true;
        }


        function renderLeaderboardCard() {
            const memberScores = {};
            state.messages.forEach(msg => {
                const key = msg.senderId || msg.uid || 'unknown';
                if (!memberScores[key]) {
                    memberScores[key] = { id: key, name: msg.senderName || '家庭成員', avatar: (msg.senderName || '家')[0], score: 0, messageCount: 0 };
                }
                memberScores[key].score += 10;
                memberScores[key].messageCount++;
            });
            state.memories.forEach(mem => {
                const key = mem.uid || mem.childId || 'unknown';
                if (!memberScores[key]) {
                    memberScores[key] = { id: key, name: mem.childName || '家庭成員', avatar: (mem.childName || '家')[0], score: 0, messageCount: 0 };
                }
                memberScores[key].score += 15;
            });
            const sorted = Object.values(memberScores).sort((a, b) => b.score - a.score);
            if (sorted.length === 0) {
                return `<div id="familyMemberActivityCard" class="bs-card overflow-hidden"><div class="flex flex-col items-center justify-center px-6 py-12 text-center"><div class="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-2)] ring-8 ring-[var(--brand-50)]"><i class="fa-solid fa-users bs-text-3xl text-brand"></i></div><h3 class="mb-2 bs-text-xl font-bold text-[var(--ink-900)]">暫未有家庭互動</h3><p class="bs-text-base text-[var(--ink-500)]">開始聊天和分享回憶後，家庭成員活躍度會自動更新。</p></div></div>`;
            }
            const rankIcons = ['<i class="fa-solid fa-crown"></i>', '<i class="fa-solid fa-medal"></i>', '<i class="fa-solid fa-medal"></i>'];
            const subtitles = ['本週互動最熱烈！', '繼續保持～', '加油追上去！'];
            const rankItems = sorted.map((member, index) => {
                const rank = index + 1;
                const icon = rank <= 3 ? rankIcons[index] : String(rank);
                const subtitle = rank <= 3 ? subtitles[index] : (member.messageCount > 0 ? `${member.messageCount} 則訊息` : '潛水中...');
                const avatarBg = rank === 1 ? 'bg-[var(--brand-100)] text-[var(--brand-700)]' : (rank <= 3 ? 'bg-[var(--surface-2)] text-brand-dark' : 'bg-[var(--surface-2)] text-[var(--ink-500)]');
                const badgeClass = rank === 1
                    ? 'bg-[var(--accent-gold)] text-[var(--ink-900)] ring-4 ring-[var(--brand-100)]'
                    : rank === 2
                        ? 'bg-[var(--surface-3)] text-[var(--ink-700)] ring-4 ring-[var(--surface-2)]'
                        : rank === 3
                            ? 'bg-[var(--brand-300)] text-[var(--brand-700)] ring-4 ring-[var(--brand-50)]'
                            : 'bg-[var(--surface-2)] text-[var(--ink-500)]';
                return `<div class="flex items-center border-b border-[var(--line)] px-5 py-4 last:border-b-0 ${rank <= 3 ? 'bg-[var(--surface-1)]' : ''}"><div class="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-[var(--shadow-sm)] ${badgeClass} ${rank <= 3 ? 'bs-text-base' : 'bs-text-sm font-bold'}">${icon}</div>${renderAvatar(member.avatar, { userId: member.id, sizeClass: 'w-12 h-12', coreClass: `${avatarBg} bs-text-xl font-bold`, extraClass: 'mr-4' })}<div class="min-w-0 flex-1"><div class="truncate bs-text-base font-bold text-[var(--ink-900)]">${member.name}</div><div class="bs-text-xs text-[var(--ink-500)]">${subtitle}</div></div><div class="ml-3 text-right"><div class="bs-text-lg font-bold text-brand">${member.score.toLocaleString()}</div><div class="bs-text-xs text-[var(--ink-500)]">分</div></div></div>`;
            }).join('');
            return `<div id="familyMemberActivityCard" class="bs-card overflow-hidden">${rankItems}</div>`;
        }


        // 步驟 3: 綁定日曆
        function renderStep4Connect() {
            if (!state.connectionMode || state.connectionMode === 'select') {
                return `
                    <div class="h-full overflow-y-auto bg-[var(--surface-0)] px-6 py-8 animate-fadeIn">
                        <div class="mx-auto flex min-h-full w-full max-w-sm flex-col">
                            <button class="action-btn mb-6 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-700)] shadow-[var(--shadow-sm)]" data-action="backStep" data-step="2">
                                <i class="fa-solid fa-arrow-left"></i>
                            </button>
                            <h2 class="bs-text-3xl font-bold text-[var(--ink-900)]">加入共用日曆</h2>
                            <p class="mb-8 mt-2 bs-text-base text-[var(--ink-500)]">與家人連結，隨時隨地分享生活點滴。</p>

                            <div class="space-y-4">
                                <button class="action-btn bs-card group flex w-full items-center gap-4 p-5 text-left ring-1 ring-[var(--line)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)]" data-action="setConnectionMode" data-mode="create">
                                    <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--brand-100)] bs-text-2xl text-brand">
                                        <i class="fa-solid fa-house-chimney-medical"></i>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">建立新日曆</h3>
                                        <p class="mt-1 bs-text-sm text-[var(--ink-500)]">產生一組數字邀請家人加入</p>
                                    </div>
                                    <i class="fa-solid fa-chevron-right text-[var(--ink-300)] transition-transform group-focus:translate-x-1"></i>
                                </button>

                                <button class="action-btn bs-card group flex w-full items-center gap-4 p-5 text-left ring-1 ring-[var(--line)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)]" data-action="setConnectionMode" data-mode="join">
                                    <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] bs-text-2xl text-[var(--ink-700)]">
                                        <i class="fa-solid fa-right-to-bracket"></i>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">加入現有日曆</h3>
                                        <p class="mt-1 bs-text-sm text-[var(--ink-500)]">輸入家人提供給您的6位數字</p>
                                    </div>
                                    <i class="fa-solid fa-chevron-right text-[var(--ink-300)] transition-transform group-focus:translate-x-1"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (state.connectionMode === 'create') {
                if (!state.calendarCode) {
                    // 生成 6 位隨機數字
                    state.calendarCode = Math.floor(100000 + Math.random() * 900000).toString();
                }
                return `
                    <div class="h-full overflow-y-auto bg-[var(--surface-0)] px-6 py-8 text-center animate-fadeIn">
                        <div class="mx-auto flex min-h-full w-full max-w-sm flex-col">
                            <button class="action-btn mb-5 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-700)] shadow-[var(--shadow-sm)]" data-action="setConnectionMode" data-mode="select">
                                <i class="fa-solid fa-arrow-left"></i>
                            </button>
                            <h2 class="mb-6 bs-text-2xl font-bold text-[var(--ink-900)]">您的日曆邀請碼</h2>

                            <div class="bs-card mb-8 p-5">
                                <p class="mb-5 bs-text-base text-[var(--ink-500)]">請將這組數字告訴您的家人</p>
                                <div class="mb-5 flex items-stretch gap-4 text-left">
                                    <div class="flex w-24 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-900)] shadow-[var(--shadow-sm)]">
                                        <i class="fa-solid fa-qrcode bs-text-4xl"></i>
                                    </div>
                                    <div class="flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-[var(--surface-2)] px-3 py-5 font-mono bs-text-3xl font-bold text-brand">
                                        ${state.calendarCode}
                                    </div>
                                </div>
                                <button class="action-btn bs-btn bs-btn-secondary mx-auto" data-action="copyCode">
                                    <i class="fa-regular fa-copy"></i><span>複製號碼</span>
                                </button>
                            </div>

                            <div class="flex-1"></div>
                            <button class="action-btn bs-btn bs-btn-primary w-full" data-action="finishOnboarding">
                                <span>進入應用程式</span><i class="fa-solid fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                `;
            }

            if (state.connectionMode === 'join') {
                return `
                    <div class="h-full overflow-y-auto bg-[var(--surface-0)] px-6 py-8 text-center animate-fadeIn">
                        <div class="mx-auto flex min-h-full w-full max-w-sm flex-col">
                            <button class="action-btn mb-6 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-700)] shadow-[var(--shadow-sm)]" data-action="setConnectionMode" data-mode="select">
                                <i class="fa-solid fa-arrow-left"></i>
                            </button>
                            <h2 class="bs-text-3xl font-bold text-[var(--ink-900)]">輸入邀請碼</h2>
                            <p class="mb-8 mt-2 bs-text-base text-[var(--ink-500)]">請輸入家人提供給您的6位數字</p>

                            <div class="relative mb-8">
                                <input type="number" id="joinCodeInput" placeholder="_ _ _ _ _ _" class="bs-input text-center font-mono font-bold ${state.errorMsg ? '!border-[var(--brand-red)]' : ''}" style="font-size: var(--font-3xl);">
                                ${state.errorMsg ? `<p class="mt-3 bs-text-sm text-[var(--brand-red)] animate-shake">${state.errorMsg}</p>` : ''}
                            </div>

                            <div class="flex-1"></div>
                            <button class="action-btn bs-btn bs-btn-primary w-full" data-action="submitJoinCode">
                                <i class="fa-solid fa-link"></i><span>確認加入</span>
                            </button>
                        </div>
                    </div>
                `;
            }
        }
