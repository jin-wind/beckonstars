
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
                return `<div id="familyMemberActivityCard" class="bg-white rounded-3xl shadow-sm overflow-hidden"><div class="flex flex-col items-center justify-center py-12 px-6 text-center"><div class="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-4"><i class="fa-solid fa-users bs-text-3xl text-brand"></i></div><h3 class="bs-text-xl font-bold text-gray-800 mb-2">暫未有家庭互動</h3><p class="text-gray-500">開始聊天和分享回憶後，家庭成員活躍度會自動更新。</p></div></div>`;
            }
            const rankIcons = ['👑', '2', '3'];
            const subtitles = ['本週互動最熱烈！', '繼續保持～', '加油追上去！'];
            const rankItems = sorted.map((member, index) => {
                const rank = index + 1;
                const icon = rank <= 3 ? rankIcons[index] : String(rank);
                const subtitle = rank <= 3 ? subtitles[index] : (member.messageCount > 0 ? `${member.messageCount} 則訊息` : '潛水中...');
                const avatarBg = rank === 1 ? 'bg-[#f6d1aa] text-[#b66122]' : (rank <= 3 ? 'bg-orange-100 text-brand-dark' : 'bg-gray-100 text-gray-500');
                return `<div class="flex items-center py-4 px-5 border-b border-gray-50"><div class="w-8 text-center mr-4 ${rank <= 3 ? (rank===1?'bs-text-2xl text-yellow-400':rank===2?'bs-text-xl text-gray-400':'bs-text-lg text-amber-600') : 'bs-text-base text-gray-400'} font-bold">${icon}</div>${renderAvatar(member.avatar, { userId: member.id, sizeClass: 'w-12 h-12', coreClass: `${avatarBg} bs-text-xl font-bold`, extraClass: 'mr-4' })}<div class="flex-1"><div class="font-bold text-gray-800 bs-text-base">${member.name}</div><div class="bs-text-xs text-gray-400">${subtitle}</div></div><div class="text-right"><div class="bs-text-lg font-bold text-brand">${member.score.toLocaleString()}</div><div class="bs-text-xs text-gray-400">分</div></div></div>`;
            }).join('');
            return `<div id="familyMemberActivityCard" class="bg-white rounded-3xl shadow-sm overflow-hidden">${rankItems}</div>`;
        }


        // 步驟 3: 綁定日曆
        function renderStep4Connect() {
            if (!state.connectionMode || state.connectionMode === 'select') {
                return `
                    <div class="flex flex-col h-full p-8 bg-[#FFF8F0] animate-fadeIn">
                        <button class="action-btn self-start text-gray-400 mb-6 bs-text-xl" data-action="backStep" data-step="2">
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <h2 class="bs-text-3xl font-bold text-gray-800 mb-2">加入共用日曆</h2>
                        <p class="text-gray-500 mb-10">與家人連結，隨時隨地分享生活點滴。</p>
                        
                        <div class="space-y-6">
                            <button class="action-btn w-full bg-white border-2 border-brand p-6 rounded-3xl shadow-sm text-left flex items-center hover:bg-orange-50 transition-colors" data-action="setConnectionMode" data-mode="create">
                                <div class="w-14 h-14 rounded-full bg-orange-100 text-brand flex items-center justify-center bs-text-2xl mr-4 shrink-0">
                                    <i class="fa-solid fa-house-chimney-medical"></i>
                                </div>
                                <div>
                                    <h3 class="bs-text-xl font-bold text-gray-800">建立新日曆</h3>
                                    <p class="bs-text-sm text-gray-500 mt-1">產生一組數字邀請家人加入</p>
                                </div>
                            </button>

                            <button class="action-btn w-full bg-white border-2 border-gray-200 p-6 rounded-3xl shadow-sm text-left flex items-center hover:bg-gray-50 transition-colors" data-action="setConnectionMode" data-mode="join">
                                <div class="w-14 h-14 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center bs-text-2xl mr-4 shrink-0">
                                    <i class="fa-solid fa-right-to-bracket"></i>
                                </div>
                                <div>
                                    <h3 class="bs-text-xl font-bold text-gray-800">加入現有日曆</h3>
                                    <p class="bs-text-sm text-gray-500 mt-1">輸入家人提供給您的6位數字</p>
                                </div>
                            </button>
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
                    <div class="flex flex-col h-full p-8 bg-[#FFF8F0] animate-fadeIn text-center">
                        <button class="action-btn self-start text-gray-400 mb-2 bs-text-xl" data-action="setConnectionMode" data-mode="select">
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <h2 class="bs-text-2xl font-bold text-gray-800 mb-6">您的日曆邀請碼</h2>
                        
                        <div class="bg-white p-8 rounded-3xl shadow-lg border border-orange-100 mb-8">
                            <p class="text-gray-500 mb-4">請將這組數字告訴您的家人</p>
                            <div class="text-6xl font-bold text-brand tracking-widest font-mono mb-4 bg-orange-50 py-4 rounded-xl">
                                ${state.calendarCode}
                            </div>
                            <button class="action-btn text-brand-dark font-bold py-2 px-4 rounded-full bg-orange-100 flex items-center justify-center mx-auto" data-action="copyCode">
                                <i class="fa-regular fa-copy mr-2"></i> 複製號碼
                            </button>
                        </div>

                        <div class="flex-1"></div>
                        <button class="action-btn w-full bg-brand text-white bs-text-xl font-bold py-4 rounded-2xl shadow-lg hover:bg-brand-dark transition-colors" data-action="finishOnboarding">
                            進入應用程式
                        </button>
                    </div>
                `;
            }

            if (state.connectionMode === 'join') {
                return `
                    <div class="flex flex-col h-full p-8 bg-[#FFF8F0] animate-fadeIn text-center">
                        <button class="action-btn self-start text-gray-400 mb-6 bs-text-xl" data-action="setConnectionMode" data-mode="select">
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <h2 class="bs-text-3xl font-bold text-gray-800 mb-2">輸入邀請碼</h2>
                        <p class="text-gray-500 mb-8">請輸入家人提供給您的6位數字</p>
                        
                        <div class="mb-8 relative">
                            <input type="number" id="joinCodeInput" placeholder="_ _ _ _ _ _" class="w-full text-center bs-text-4xl font-mono tracking-widest p-6 rounded-2xl border-2 ${state.errorMsg ? 'border-red-400' : 'border-gray-200'} focus:border-brand outline-none bg-white">
                            ${state.errorMsg ? `<p class="text-red-500 bs-text-sm mt-3 animate-shake">${state.errorMsg}</p>` : ''}
                        </div>

                        <div class="flex-1"></div>
                        <button class="action-btn w-full bg-brand text-white bs-text-xl font-bold py-4 rounded-2xl shadow-lg hover:bg-brand-dark transition-colors" data-action="submitJoinCode">
                            確認加入
                        </button>
                    </div>
                `;
            }
        }
