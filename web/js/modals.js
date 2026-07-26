
        function showDailyRewardCelebration(reward = state.dailyMessageReward) {
            const dateKey = getDailyRewardCelebrationDateKey(reward);
            if (!reward?.active || !dateKey || hasCelebratedDailyReward(reward)) return false;
            localStorage.setItem(DAILY_REWARD_CELEBRATED_DATE_KEY, dateKey);
            state.dailyRewardCelebration = {
                dateKey,
                frameUrl: reward.frameUrl || 'avatar-frame-daily.png',
                threshold: Number(reward.threshold || 20),
                count: Number(reward.count || reward.threshold || 20)
            };
            state.showModal = 'dailyRewardCelebration';
            playRewardHaptic();
            return true;
        }


        function maybeShowDailyRewardCelebration(rewardUpdate, options = {}) {
            if (!rewardUpdate?.activeChanged || !state.dailyMessageReward?.active) return false;
            if (options.skipIfInitialSync) return false;
            return showDailyRewardCelebration(state.dailyMessageReward);
        }


        // --- 彈出視窗 ---
        function renderModals() {
            if (!state.showModal) return '';

            let modalContent = '';

            // 刪除數據確認彈窗
            if (state.showModal === 'confirmReset') {
                modalContent = `
                    <div class="bs-modal-card w-[90%] max-w-sm border border-[var(--line)] p-5 text-center animate-fadeIn">
                        <div class="w-14 h-14 bg-[var(--surface-2)] text-[var(--brand-red)] rounded-full flex items-center justify-center bs-text-2xl mx-auto mb-4">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)] mb-2">確定刪除數據？</h3>
                        <div class="bs-card-flat bg-[var(--surface-2)] p-4 mb-5">
                            <p class="text-[var(--ink-500)] bs-text-sm leading-relaxed">這將會清除您的所有設定與進度，並返回初始選擇角色畫面。</p>
                        </div>
                        <div class="flex gap-3">
                            <button class="action-btn bs-btn bs-btn-secondary flex-1" data-action="closeModal">取消</button>
                            <button class="action-btn bs-btn bs-btn-danger flex-1" data-action="resetData">確定刪除</button>
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'dailyRewardCelebration') {
                const celebration = state.dailyRewardCelebration || {};
                const frameUrl = celebration.frameUrl || state.dailyMessageReward?.frameUrl || 'avatar-frame-daily.png';
                const count = Number(celebration.count || state.dailyMessageReward?.count || 20);
                const threshold = Number(celebration.threshold || state.dailyMessageReward?.threshold || 20);
                modalContent = `
                    <div class="daily-reward-card bs-modal-card relative w-[90%] max-w-sm overflow-hidden border border-[var(--line)] bg-[var(--surface-1)]">
                        <div class="absolute inset-x-0 top-0 h-28 bg-[var(--surface-2)]"></div>
                        <div class="relative px-6 pt-6 pb-6 text-center">
                            <div class="absolute inset-0 pointer-events-none overflow-hidden">
                                <i class="daily-reward-spark fa-solid fa-star bs-text-lg"></i>
                                <i class="daily-reward-spark fa-solid fa-star bs-text-xl"></i>
                                <i class="daily-reward-spark fa-solid fa-star bs-text-sm"></i>
                                <i class="daily-reward-spark fa-solid fa-star bs-text-lg"></i>
                            </div>
                            <div class="relative mx-auto mb-5 flex h-36 items-center justify-center">
                                <div class="daily-reward-halo"></div>
                                <div class="daily-reward-avatar-shell relative z-10">
                                    ${renderAvatar(state.userAvatar, { frameUrl, sizeClass: 'w-24 h-24', coreClass: 'bg-[var(--surface-2)] text-brand-dark font-bold bs-text-4xl shadow-xl ring-4 ring-[var(--surface-1)]' })}
                                </div>
                            </div>
                            <div class="bs-chip mx-auto mb-3 !bg-[var(--surface-2)] !text-brand-dark bs-text-xs font-bold px-4 py-2">
                                <i class="fa-solid fa-crown text-[var(--accent-gold)]"></i>
                                今日限定獎勵
                            </div>
                            <h3 class="bs-text-2xl font-bold text-[var(--ink-900)] mb-2">恭喜獲得今日頭像框</h3>
                            <p class="bs-text-base text-[var(--ink-500)] mb-5">每日 ${threshold} 條訊息任務完成</p>
                            <div class="bs-card-flat bg-[var(--surface-2)] px-4 py-3 mb-5">
                                <div class="flex items-center justify-between bs-text-sm font-bold text-[var(--ink-700)]">
                                    <span>任務進度</span>
                                    <span class="text-brand">${Math.min(count, threshold)} / ${threshold}</span>
                                </div>
                                <div class="mt-2 h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                                    <div class="h-full rounded-full bg-brand" style="width: 100%;"></div>
                                </div>
                            </div>
                            <button class="action-btn bs-btn bs-btn-primary w-full py-3.5" data-action="closeModal">
                                太好了
                            </button>
                        </div>
                    </div>
                `;
            }

            // 自訂訊息彈窗 (代替 alert)
            if (state.showModal === 'messageBox') {
                modalContent = `
                    <div class="bs-modal-card w-[90%] max-w-sm border border-[var(--line)] p-5 text-center animate-fadeIn">
                        <div class="w-14 h-14 bg-[var(--surface-2)] text-brand rounded-full flex items-center justify-center bs-text-2xl mx-auto mb-4">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)] mb-2">提示</h3>
                        <p class="bs-text-base text-[var(--ink-500)] leading-relaxed mb-5">${state.modalMessage}</p>
                        <button class="action-btn bs-btn bs-btn-primary w-full" data-action="closeModal">確定</button>
                    </div>
                `;
            }

            if (state.showModal === 'chatSummary') {
                modalContent = `
                    <div class="bs-modal-card w-[92%] max-w-md border border-[var(--line)] p-5 animate-fadeIn relative">
                        <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="flex items-center gap-3 pr-12 mb-4">
                            <div class="w-12 h-12 shrink-0 bg-[var(--surface-2)] text-brand-dark rounded-2xl flex items-center justify-center bs-text-xl">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>
                            </div>
                            <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">今日聊天總結</h3>
                        </div>
                        <div class="bs-card-flat bg-[var(--surface-2)] p-4 mb-5 max-h-[55vh] overflow-y-auto">
                            <p class="bs-text-base text-[var(--ink-700)] leading-relaxed whitespace-pre-line">${state.chatSummaryContent}</p>
                        </div>
                        <button class="action-btn bs-btn bs-btn-primary w-full" data-action="closeModal">關閉</button>
                    </div>
                `;
            }

            if (state.showModal === 'viewGeneratedImage') {
                const imageUrl = state.aiImageResults[state.selectedGeneratedImageIndex] || '';
                modalContent = `
                    <div class="bs-modal-card w-[94%] max-w-2xl border border-[var(--line)] p-4 animate-fadeIn relative">
                        <button class="action-btn absolute top-6 right-6 w-10 h-10 bg-[var(--ink-900)]/70 rounded-full text-white flex items-center justify-center z-10 shadow-lg" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="rounded-2xl overflow-hidden bg-[var(--surface-2)] border border-[var(--line)] max-h-[70vh] flex items-center justify-center">
                            <img src="${imageUrl}" class="w-full h-full object-contain" alt="生成圖片">
                        </div>
                        <div class="mt-4 flex gap-3">
                            <button class="action-btn bs-btn bs-btn-primary flex-1" data-action="downloadGeneratedImage" data-url="${escapeAttribute(imageUrl)}">
                                <i class="fa-solid fa-download"></i><span>下載圖片</span>
                            </button>
                            <button class="action-btn bs-btn bs-btn-secondary flex-1" data-action="shareGeneratedImage" data-url="${escapeAttribute(imageUrl)}">
                                <i class="fa-solid fa-share-nodes"></i><span>分享</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'viewGeneratedImageFullscreen') {
                const imageUrl = state.selectedGeneratedImageUrl || '';
                modalContent = `
                    <div class="bs-modal-card relative w-[96%] max-w-3xl max-h-[94vh] border border-[var(--line)] p-3 overflow-hidden animate-fadeIn" style="z-index: 9999;">
                        <div class="relative rounded-2xl overflow-hidden bg-[var(--ink-900)] flex items-center justify-center" style="height: min(76vh, 760px);">
                            <button class="action-btn absolute top-3 right-3 w-11 h-11 bg-[var(--surface-1)]/90 rounded-full text-[var(--ink-900)] flex items-center justify-center z-10 shadow-lg" data-action="closeModal">
                                <i class="fa-solid fa-times bs-text-xl"></i>
                            </button>
                            <img src="${imageUrl}" class="max-w-full max-h-full object-contain" alt="生成的圖片">
                        </div>
                        <div class="pt-3 flex gap-2 justify-center">
                            <button class="action-btn bs-btn bs-btn-primary min-w-0 flex-1 max-w-40 whitespace-nowrap" data-action="downloadGeneratedImage" data-url="${escapeAttribute(imageUrl)}">
                                <i class="fa-solid fa-download shrink-0"></i><span>保存</span>
                            </button>
                            <button class="action-btn bs-btn bs-btn-secondary min-w-0 flex-1 max-w-40 whitespace-nowrap" data-action="shareGeneratedImage" data-url="${escapeAttribute(imageUrl)}">
                                <i class="fa-solid fa-share-nodes shrink-0"></i><span>分享</span>
                            </button>
                            <button class="action-btn bs-btn bs-btn-ghost min-w-0 flex-1 max-w-40 whitespace-nowrap" data-action="showQrCode" data-url="${escapeAttribute(imageUrl)}">
                                <i class="fa-solid fa-qrcode shrink-0"></i><span>QR碼</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'logs') {
                modalContent = `
                    <div class="bs-modal-card w-[94%] max-w-lg border border-[var(--line)] p-5 animate-fadeIn relative max-h-[88vh] flex flex-col">
                        <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="flex items-center justify-between pr-12 mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-11 h-11 bg-[var(--surface-2)] text-[var(--accent-teal)] rounded-2xl flex items-center justify-center bs-text-xl">
                                    <i class="fa-solid fa-terminal"></i>
                                </div>
                                <div>
                                    <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">系統 Log</h3>
                                    <p class="bs-text-xs text-[var(--ink-500)]">${state.backendMode === 'server' ? 'SERVER CONNECTED' : 'SERVER OFFLINE'}</p>
                                </div>
                            </div>
                            <button class="action-btn w-10 h-10 rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-700)] flex items-center justify-center transition-colors" data-action="refreshLogs" title="刷新 Log">
                                <i class="fa-solid fa-rotate-right"></i>
                            </button>
                        </div>
                        <div class="space-y-3 overflow-y-auto pr-1 bg-[var(--surface-2)] rounded-2xl p-3 border border-[var(--line)]">
                            ${renderLogPanel('App Log', 'fa-mobile-screen-button', appLogEntries, '暫時未有 App log')}
                            ${renderLogPanel('Server Log', 'fa-server', serverLogEntries, '暫時未有 server log', { loading: serverLogsLoading, error: serverLogsError })}
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'weeklySummary') {
                const weekMemories = state.memories.slice(0, 4);
                const messageCount = state.messages.length;
                modalContent = `
                    <div class="bs-modal-card w-[92%] max-w-md border border-[var(--line)] p-5 animate-fadeIn relative">
                        <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="flex items-center gap-3 pr-12 mb-3">
                            <div class="w-12 h-12 shrink-0 bg-[var(--surface-2)] text-brand rounded-2xl flex items-center justify-center bs-text-xl">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>
                            </div>
                            <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">本週家庭回憶摘要</h3>
                        </div>
                        <p class="bs-text-sm text-[var(--ink-500)] mb-5">Demo AI 會把最近互動整理成 present 友善摘要。</p>
                        <div class="bs-card-flat bg-[var(--surface-2)] p-4 mb-4">
                            <p class="bs-text-base text-[var(--ink-900)] leading-relaxed">今週家人保持了穩定互動，共留下 ${state.memories.length} 個回憶、${messageCount} 則訊息。最值得紀念的是「${weekMemories[0]?.content || '今日的溫暖分享'}」，提醒家人即使忙碌亦有互相關心。</p>
                        </div>
                        <div class="grid grid-cols-3 gap-3 text-center mb-5">
                            <div class="bs-card-flat p-3">
                                <p class="bs-text-2xl font-bold text-brand">${state.memories.length}</p>
                                <p class="bs-text-xs text-[var(--ink-500)]">回憶</p>
                            </div>
                            <div class="bs-card-flat p-3">
                                <p class="bs-text-2xl font-bold text-brand">${messageCount}</p>
                                <p class="bs-text-xs text-[var(--ink-500)]">訊息</p>
                            </div>
                            <div class="bs-card-flat p-3">
                                <p class="bs-text-2xl font-bold text-brand">${state.points}</p>
                                <p class="bs-text-xs text-[var(--ink-500)]">積分</p>
                            </div>
                        </div>
                        <button class="action-btn bs-btn bs-btn-primary w-full" data-action="shareSummary">分享摘要給家人</button>
                    </div>
                `;
            }

            if (state.showModal === 'addMemory') {
                const memoryTypes = [
                    { id: 'photo', label: '相片', icon: 'fa-image', classes: 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--accent-sky)]' },
                    { id: 'text', label: '文字', icon: 'fa-pencil', classes: 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--accent-teal)]' },
                    { id: 'voice', label: '語音', icon: 'fa-microphone', classes: 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--accent-plum)]' }
                ];
                modalContent = `
                    <div class="bs-modal-sheet w-full max-h-[92vh] border border-b-0 border-[var(--line)] px-5 pb-5 transform transition-transform animate-slideUp overflow-y-auto no-scrollbar">
                        <div class="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-[var(--ink-300)] opacity-40"></div>
                        <div class="flex items-center justify-center gap-3 mt-3 mb-5">
                            <div class="w-11 h-11 rounded-2xl bg-[var(--surface-2)] text-brand flex items-center justify-center bs-text-xl">
                                <i class="fa-solid fa-book-open"></i>
                            </div>
                            <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">記錄今日點滴</h3>
                        </div>
                        <div class="grid grid-cols-3 gap-3 mb-5">
                            ${memoryTypes.map(type => `
                                <button class="action-btn bs-card-flat flex flex-col items-center justify-center min-h-24 p-3 transition-all ${type.classes} ${state.pendingMemoryType === type.id ? 'ring-2 ring-brand shadow-md bg-[var(--surface-1)]' : ''}" data-action="selectMemoryType" data-type="${type.id}">
                                    <span class="w-10 h-10 rounded-full bg-[var(--surface-1)] flex items-center justify-center mb-2 shadow-sm"><i class="fa-solid ${type.icon} bs-text-xl"></i></span>
                                    <span class="font-bold text-[var(--ink-700)] bs-text-sm">${type.label}</span>
                                </button>
                            `).join('')}
                        </div>
                        <div class="space-y-3 mb-5">
                            <textarea id="memoryContentInput" rows="3" placeholder="${state.pendingMemoryType === 'photo' ? '寫低想說的話（可選）...' : '寫低今日想分享的事...'}" class="bs-input ${state.errorMsg ? '!border-[var(--brand-red)]' : ''} p-4 resize-none bs-text-base">${state.pendingMemoryContent || ''}</textarea>
                            ${state.pendingMemoryType === 'photo' ? `
                                <input id="memoryImageInput" type="file" accept="image/*" class="hidden">
                                <input id="memoryCameraInput" type="file" accept="image/*" capture="environment" class="hidden">
                                <div class="grid grid-cols-2 gap-3">
                                    <button type="button" class="action-btn bs-card-flat min-h-24 bg-[var(--surface-2)] text-[var(--accent-sky)] p-4 font-bold flex flex-col items-center justify-center" data-action="chooseMemoryCamera">
                                        <i class="fa-solid fa-camera bs-text-2xl mb-2"></i><span class="bs-text-sm text-[var(--ink-700)]">拍攝相片</span>
                                    </button>
                                    <button type="button" class="action-btn bs-card-flat min-h-24 bg-[var(--surface-2)] text-[var(--accent-sky)] p-4 font-bold flex flex-col items-center justify-center" data-action="chooseMemoryImage">
                                        <i class="fa-solid fa-images bs-text-2xl mb-2"></i><span class="bs-text-sm text-[var(--ink-700)]">從相簿選擇</span>
                                    </button>
                                </div>
                                ${state.pendingMemoryImage ? `<div class="bs-card-flat overflow-hidden p-2"><img src="${state.pendingMemoryImage}" class="w-full h-44 object-cover rounded-xl"></div>` : ''}
                            ` : ''}
                            ${state.pendingMemoryType === 'voice' ? `
                                <div class="bs-card-flat bg-[var(--surface-2)] p-4 mb-3">
                                    ${state.isRecordingMemory ? `
                                        <div class="flex items-center justify-center gap-2 mb-3 text-[var(--brand-red)]">
                                            <span class="w-3 h-3 rounded-full bg-[var(--brand-red)] animate-pulse"></span>
                                            <p class="bs-text-sm font-bold">正在錄製中...</p>
                                        </div>
                                        <button type="button" class="action-btn bs-btn bs-btn-danger w-full animate-pulse" data-action="stopMemoryVoiceRecording">
                                            <i class="fa-solid fa-stop bs-text-xl"></i>
                                            <span class="bs-text-lg">停止錄音</span>
                                        </button>
                                    ` : !state.pendingMemoryAudio ? `
                                        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-[var(--surface-1)] text-[var(--accent-plum)] flex items-center justify-center bs-text-2xl shadow-sm">
                                            <i class="fa-solid fa-microphone"></i>
                                        </div>
                                        <button type="button" class="action-btn bs-btn w-full bg-[var(--accent-plum)] text-white" data-action="startMemoryVoiceRecording">
                                            <i class="fa-solid fa-microphone bs-text-xl"></i>
                                            <span class="bs-text-lg">開始錄音</span>
                                        </button>
                                        <p class="text-[var(--accent-plum)] bs-text-xs text-center mt-2">點擊按鈕開始錄製語音回憶</p>
                                    ` : `
                                        <div class="flex items-center justify-between gap-3">
                                            <div class="flex items-center min-w-0">
                                                <div class="w-12 h-12 shrink-0 bg-[var(--accent-plum)] rounded-full flex items-center justify-center text-white mr-3">
                                                    <i class="fa-solid fa-microphone"></i>
                                                </div>
                                                <div class="min-w-0">
                                                    <p class="font-bold text-[var(--ink-900)] bs-text-base">語音錄製完成</p>
                                                    <p class="text-[var(--ink-500)] bs-text-sm">${state.pendingMemoryAudioDuration}秒</p>
                                                </div>
                                            </div>
                                            <button type="button" class="action-btn w-10 h-10 shrink-0 bg-[var(--surface-1)] border border-[var(--line)] text-[var(--brand-red)] rounded-full flex items-center justify-center" data-action="deleteMemoryVoiceRecording">
                                                <i class="fa-solid fa-trash-can"></i>
                                            </button>
                                        </div>
                                    `}
                                </div>
                            ` : ''}
                            ${state.errorMsg ? `<p class="text-[var(--brand-red)] bs-text-sm animate-shake">${state.errorMsg}</p>` : ''}
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <button class="action-btn bs-btn bs-btn-secondary w-full" data-action="closeModal">取消</button>
                            <button class="action-btn bs-btn bs-btn-primary w-full" data-action="saveMemory">儲存回憶</button>
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'memoryDetail') {
                const dayMemories = state.memories.filter(m => m.date === parseInt(state.selectedDate));
                modalContent = `
                    <div class="bs-modal-card w-[92%] max-w-md border border-[var(--line)] p-5 relative animate-fadeIn">
                        <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="flex items-center gap-3 pr-12 mb-4">
                            <div class="w-11 h-11 rounded-2xl bg-[var(--surface-2)] text-brand flex items-center justify-center bs-text-xl">
                                <i class="fa-solid fa-calendar-day"></i>
                            </div>
                            <h3 class="bs-text-xl font-bold text-[var(--ink-900)]">${today.getMonth() + 1}月${state.selectedDate}日 的回憶</h3>
                        </div>
                        <div class="space-y-3 max-h-[64vh] overflow-y-auto no-scrollbar pr-1">
                            ${dayMemories.map(m => {
                                const memoryImageSrc = getMemoryImageSrc(m);
                                const memoryAudioSrc = getMemoryAudioSrc(m);
                                return `
                                    <div class="bs-card-flat p-4">
                                        <div class="flex items-center mb-3">
                                            <div class="w-8 h-8 rounded-full bg-brand text-white bs-text-xs flex items-center justify-center mr-2">
                                                ${m.childName[0]}
                                            </div>
                                            <span class="bs-text-sm font-bold text-[var(--ink-700)]">${m.childName}</span>
                                        </div>
                                        ${memoryImageSrc ? `<img src="${escapeAttribute(memoryImageSrc)}" class="w-full h-36 object-cover rounded-xl mb-3 border border-[var(--line)]">` : ''}
                                        ${m.type === 'voice' && memoryAudioSrc ? `
                                            <div class="bg-purple-50 bg-[var(--surface-2)] border border-[var(--line)] rounded-xl p-3 mb-3">
                                                <div class="flex items-center justify-between mb-2">
                                                    <div class="flex items-center">
                                                        <div class="w-8 h-8 bg-[var(--accent-plum)] rounded-full flex items-center justify-center text-white mr-2">
                                                            <i class="fa-solid fa-microphone bs-text-sm"></i>
                                                        </div>
                                                        <div>
                                                            <p class="font-bold text-[var(--accent-plum)] bs-text-sm">語音回憶</p>
                                                            <p class="text-[var(--accent-plum)] bs-text-xs">${m.duration || 0}秒</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <audio controls class="w-full" style="height: 32px;" preload="metadata">
                                                    <source src="${escapeAttribute(memoryAudioSrc)}" type="audio/mp4">
                                                    <source src="${escapeAttribute(memoryAudioSrc)}" type="audio/mpeg">
                                                    您的瀏覽器不支援音頻播放。
                                                </audio>
                                            </div>
                                        ` : ''}
                                        <p class="bs-text-base text-[var(--ink-900)] leading-relaxed">${m.content}</p>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'videoPlayer') {
                const hasPhotos = state.memories.some(m => getMemoryImageSrc(m) && m.month === today.getMonth() + 1 && m.year === today.getFullYear());
                if (state.videoGenerating) {
                    modalContent = `
                        <div class="bs-modal-card w-[92%] max-w-md h-96 border border-[var(--line)] p-6 flex flex-col items-center justify-center relative animate-fadeIn text-center">
                            <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center z-50" data-action="closeModal">
                                <i class="fa-solid fa-times bs-text-xl"></i>
                            </button>
                            <div class="relative w-20 h-20 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-5">
                                <i class="fa-solid fa-film bs-text-2xl text-brand"></i>
                                <span class="absolute inset-0 border-4 border-[var(--line)] border-t-brand rounded-full animate-spin"></span>
                            </div>
                            <h2 class="bs-text-2xl font-bold text-[var(--ink-900)] mb-2">正在生成回憶影片</h2>
                            <p class="bs-text-base text-[var(--ink-500)]">把這個月的照片縫合成影片...</p>
                        </div>
                    `;
                } else if (state.videoUrl) {
                    modalContent = `
                        <div class="bs-modal-card w-[94%] max-w-md border border-[var(--line)] p-3 overflow-hidden relative animate-fadeIn" id="videoContainer">
                            <div class="relative rounded-2xl overflow-hidden bg-[var(--ink-900)]">
                                <button class="action-btn absolute top-3 right-3 w-10 h-10 bg-[var(--surface-1)]/90 rounded-full text-[var(--ink-900)] flex items-center justify-center z-50 shadow-lg" data-action="closeModal">
                                    <i class="fa-solid fa-times bs-text-xl"></i>
                                </button>
                                <video src="${state.videoUrl}" playsinline class="w-full" style="max-height: 70vh;" id="memVideo"></video>
                                <div class="absolute inset-0 flex items-center justify-center pointer-events-none" id="videoOverlay">
                                    <div class="w-20 h-20 bg-[var(--surface-1)]/90 rounded-full flex items-center justify-center shadow-lg" id="videoPlayBtn" style="pointer-events:auto;">
                                        <i class="fa-solid fa-play text-brand bs-text-3xl ml-1" id="videoPlayIcon"></i>
                                    </div>
                                </div>
                                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--ink-900)]/90 to-transparent p-4 pt-8">
                                    <div class="w-full h-1.5 bg-[var(--surface-1)]/30 rounded-full mb-3 cursor-pointer" id="videoProgressBar">
                                        <div class="h-full bg-brand rounded-full transition-all" id="videoProgressFill" style="width:0%"></div>
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <p class="text-white bs-text-sm">${today.getFullYear()}年 ${today.getMonth() + 1}月 回憶精華</p>
                                        <span class="text-white/80 bs-text-xs" id="videoTime">0:00</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (state.videoError) {
                    modalContent = `
                        <div class="bs-modal-card w-[92%] max-w-md border border-[var(--line)] p-6 text-center relative animate-fadeIn">
                            <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                                <i class="fa-solid fa-times"></i>
                            </button>
                            <div class="w-14 h-14 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto mb-4">
                                <i class="fa-solid fa-triangle-exclamation bs-text-2xl text-[var(--brand-red)]"></i>
                            </div>
                            <h3 class="bs-text-xl font-bold text-[var(--ink-900)] mb-2">無法生成影片</h3>
                            <div class="bs-card-flat bg-[var(--surface-2)] p-4 mb-5">
                                <p class="bs-text-base text-[var(--ink-500)] leading-relaxed">${state.videoError}</p>
                            </div>
                            <button class="action-btn bs-btn bs-btn-primary w-full" data-action="closeModal">確定</button>
                        </div>
                    `;
                } else {
                    modalContent = `
                        <div class="bs-modal-card w-[92%] max-w-md border border-[var(--line)] overflow-hidden relative animate-fadeIn">
                            <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-1)] border border-[var(--line)] rounded-full text-[var(--ink-500)] flex items-center justify-center z-50 shadow-sm" data-action="closeModal">
                                <i class="fa-solid fa-times bs-text-xl"></i>
                            </button>
                            <div class="h-28 bg-[var(--surface-2)] flex items-center justify-center">
                                <div class="w-16 h-16 bg-[var(--surface-1)] rounded-full flex items-center justify-center shadow-md text-brand">
                                    <i class="fa-solid fa-film bs-text-3xl"></i>
                                </div>
                            </div>
                            <div class="p-6 text-center">
                                <h2 class="bs-text-2xl font-bold text-[var(--ink-900)] mb-2">${today.getFullYear()}年 ${today.getMonth() + 1}月 回憶精華</h2>
                                <p class="bs-text-base text-[var(--ink-500)] leading-relaxed mb-6">把這個月的照片縫合成一段溫馨的回憶影片</p>
                                ${hasPhotos ? `
                                    <button class="action-btn bs-btn bs-btn-primary w-full" data-action="generateVideo">
                                        <i class="fa-solid fa-wand-magic-sparkles"></i><span>生成回憶影片</span>
                                    </button>
                                ` : `
                                    <div class="bs-card-flat bg-[var(--surface-2)] p-5">
                                        <i class="fa-solid fa-image bs-text-3xl text-[var(--ink-300)] mb-3"></i>
                                        <p class="bs-text-base text-[var(--ink-700)] font-bold">這個月還沒有照片回憶</p>
                                        <p class="text-[var(--ink-500)] bs-text-sm mt-1">先去記錄一些回憶吧！</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
                }
            }

            // 登出確認
            if (state.showModal === 'confirmLogout') {
                modalContent = `
                    <div class="bs-modal-card w-[90%] max-w-sm border border-[var(--line)] p-5 text-center relative animate-fadeIn">
                        <div class="w-14 h-14 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fa-solid fa-right-from-bracket bs-text-2xl text-[var(--brand-red)]"></i>
                        </div>
                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)] mb-2">確認登出？</h3>
                        <p class="text-[var(--ink-500)] bs-text-sm leading-relaxed mb-5">登出後需要重新輸入電郵和密碼登入</p>
                        <div class="flex gap-3">
                            <button class="action-btn bs-btn bs-btn-secondary flex-1" data-action="closeModal">取消</button>
                            <button class="action-btn bs-btn bs-btn-danger flex-1" data-action="confirmLogout">登出</button>
                        </div>
                    </div>
                `;
            }

            // 退出家庭確認
            if (state.showModal === 'confirmLeaveFamily') {
                modalContent = `
                    <div class="bs-modal-card w-[90%] max-w-sm border border-[var(--line)] p-5 text-center relative animate-fadeIn">
                        <div class="w-14 h-14 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fa-solid fa-people-roof bs-text-2xl text-brand"></i>
                        </div>
                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)] mb-2">確認退出家庭？</h3>
                        <p class="text-[var(--ink-500)] bs-text-sm leading-relaxed mb-5">退出後你可以加入其他家庭，此家庭的訊息和回憶會保留</p>
                        <div class="flex gap-3">
                            <button class="action-btn bs-btn bs-btn-secondary flex-1" data-action="closeModal">取消</button>
                            <button class="action-btn bs-btn bs-btn-primary flex-1" data-action="confirmLeaveFamily">退出</button>
                        </div>
                    </div>
                `;
            }

            // 編輯個人資料
            if (state.showModal === 'editProfile') {
                const avatarOptions = state.role === 'senior' ? avatars.senior : avatars.child;
                const currentAvatar = state.userAvatar || '👤';
                const isCustomImage = currentAvatar.startsWith('data:') || currentAvatar.startsWith('http');
                modalContent = `
                    <div class="bs-modal-card w-[94%] max-w-md border border-[var(--line)] p-5 relative animate-fadeIn max-h-[88vh] overflow-y-auto no-scrollbar">
                        <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="flex items-center gap-3 pr-12 mb-5">
                            <div class="w-11 h-11 rounded-2xl bg-[var(--surface-2)] text-brand flex items-center justify-center bs-text-xl">
                                <i class="fa-solid fa-user-pen"></i>
                            </div>
                            <h2 class="bs-text-xl font-bold text-[var(--ink-900)]">編輯個人資料</h2>
                        </div>

                        <!-- 頭像 -->
                        <div class="bs-card-flat bg-[var(--surface-2)] text-center p-4 mb-4">
                            <div class="w-20 h-20 mx-auto rounded-full bg-[var(--surface-1)] flex items-center justify-center overflow-hidden border-4 border-[var(--brand-100)] mb-3 shadow-sm" id="editAvatarPreview">
                                ${isCustomImage ? `<img src="${currentAvatar}" class="w-full h-full object-cover" id="editAvatarImg">` : `<span class="bs-text-4xl" id="editAvatarEmoji">${currentAvatar}</span>`}
                            </div>
                            <button class="action-btn bs-btn bs-btn-ghost bs-text-sm" data-action="uploadAvatar">
                                <i class="fa-solid fa-camera"></i><span>上傳照片</span>
                            </button>
                            <input type="file" id="avatarFileInput" accept="image/*" class="hidden">
                        </div>

                        <!-- Emoji 頭像選擇 -->
                        <p class="bs-text-sm text-[var(--ink-500)] mb-2">或選擇 Emoji：</p>
                        <div class="grid grid-cols-6 gap-2 mb-4">
                            ${avatarOptions.map(a => `
                                <button class="action-btn bs-text-2xl p-2 rounded-xl border transition-all ${!isCustomImage && currentAvatar === a ? 'bg-brand text-white border-brand shadow-md scale-105' : 'bg-[var(--surface-2)] border-[var(--line)]'}" data-action="editSelectAvatar" data-avatar="${a}">${a}</button>
                            `).join('')}
                        </div>

                        <!-- 名稱 -->
                        <div class="mb-6">
                            <label class="bs-text-sm text-[var(--ink-500)] mb-1 block">名稱</label>
                            <input id="editNameInput" type="text" value="${state.userName || ''}" class="bs-input bs-text-base" placeholder="輸入您的稱呼">
                        </div>

                        ${state.errorMsg ? `<p class="text-[var(--brand-red)] bs-text-sm mb-4 text-center animate-shake">${state.errorMsg}</p>` : ''}

                        <button class="action-btn bs-btn bs-btn-primary w-full" data-action="saveProfile">
                            儲存
                        </button>
                    </div>
                `;
            }

            // 修改密碼
            if (state.showModal === 'changePassword') {
                modalContent = `
                    <div class="bs-modal-card w-[94%] max-w-md border border-[var(--line)] p-5 relative animate-fadeIn">
                        <button class="action-btn absolute top-4 right-4 w-10 h-10 bg-[var(--surface-2)] rounded-full text-[var(--ink-500)] flex items-center justify-center" data-action="closeModal">
                            <i class="fa-solid fa-times"></i>
                        </button>
                        <div class="flex items-center gap-3 pr-12 mb-5">
                            <div class="w-11 h-11 rounded-2xl bg-[var(--surface-2)] text-brand flex items-center justify-center bs-text-xl">
                                <i class="fa-solid fa-lock"></i>
                            </div>
                            <h2 class="bs-text-xl font-bold text-[var(--ink-900)]">修改密碼</h2>
                        </div>

                        <div class="bs-card-flat bg-[var(--surface-2)] space-y-4 p-4 mb-5">
                            <div>
                                <label class="bs-text-sm text-[var(--ink-500)] mb-1 block">舊密碼</label>
                                <input id="oldPasswordInput" type="password" class="bs-input bs-text-base" placeholder="輸入舊密碼" autocomplete="current-password">
                            </div>
                            <div>
                                <label class="bs-text-sm text-[var(--ink-500)] mb-1 block">新密碼</label>
                                <input id="newPasswordInput" type="password" class="bs-input bs-text-base" placeholder="至少 6 個字元" autocomplete="new-password">
                            </div>
                            <div>
                                <label class="bs-text-sm text-[var(--ink-500)] mb-1 block">確認新密碼</label>
                                <input id="confirmPasswordInput" type="password" class="bs-input bs-text-base" placeholder="再次輸入新密碼" autocomplete="new-password">
                            </div>
                        </div>

                        ${state.errorMsg ? `<p class="text-[var(--brand-red)] bs-text-sm mb-4 text-center animate-shake">${state.errorMsg}</p>` : ''}

                        <button class="action-btn bs-btn bs-btn-primary w-full" data-action="savePassword">
                            確認修改
                        </button>
                    </div>
                `;
            }

            // 更新提示
            if (state.showModal === 'updateAvailable') {
                const info = state.updateInfo || {};
                modalContent = `
                    <div class="bs-modal-card w-[90%] max-w-sm border border-[var(--line)] p-5 text-center animate-fadeIn">
                        <div class="w-14 h-14 bg-[var(--surface-2)] text-brand rounded-full flex items-center justify-center bs-text-2xl mx-auto mb-4">
                            <i class="fa-solid fa-cloud-arrow-down"></i>
                        </div>
                        <h3 class="bs-text-xl font-bold text-[var(--ink-900)] mb-2">有新版本 ${escapeHtml(info.versionName || '')}</h3>
                        ${info.releaseNotes ? `<div class="bs-card-flat bg-[var(--surface-2)] p-4 mb-5 text-left max-h-36 overflow-y-auto"><p class="text-[var(--ink-500)] bs-text-sm whitespace-pre-line">${escapeHtml(info.releaseNotes)}</p></div>` : ''}
                        <div class="flex gap-3">
                            <button class="action-btn bs-btn bs-btn-secondary flex-1" data-action="closeModal">稍後再說</button>
                            <button class="action-btn bs-btn bs-btn-primary flex-1" data-action="downloadUpdate">立即更新</button>
                        </div>
                    </div>
                `;
            }

            if (state.showModal === 'qrCode') {
                const qrUrl = state.selectedQrImageUrl || '';
                let qrSvg = '';
                if (qrUrl && typeof qrcode !== 'undefined') {
                    try {
                        const qr = qrcode(0, 'M');
                        qr.addData(qrUrl);
                        qr.make();
                        qrSvg = qr.createSvgTag(4, 8);
                    } catch (e) {
                        qrSvg = '<p class="text-[var(--brand-red)]">QR碼生成失敗</p>';
                    }
                }
                modalContent = `
                    <div class="bs-modal-card w-[90%] max-w-sm border border-[var(--line)] p-5 text-center animate-fadeIn">
                        <div class="w-12 h-12 rounded-2xl bg-[var(--surface-2)] text-brand flex items-center justify-center bs-text-xl mx-auto mb-3">
                            <i class="fa-solid fa-qrcode"></i>
                        </div>
                        <h3 class="bs-text-lg font-bold text-[var(--ink-900)] mb-4">圖片QR碼</h3>
                        <div class="bs-card-flat bg-[var(--surface-1)] p-4 inline-block mb-4 max-w-full overflow-hidden">
                            ${qrSvg.replace(/width="\d+(?:px)?"/, 'width="100%"').replace(/height="\d+(?:px)?"/, 'height="100%"').replace(/<svg /, '<svg style="max-width:220px;max-height:220px;display:block;margin:0 auto;" ')}
                        </div>
                        <p class="text-[var(--ink-500)] bs-text-xs mb-4">掃描QR碼可查看或下載圖片</p>
                        <button class="action-btn bs-btn bs-btn-secondary w-full" data-action="closeModal">關閉</button>
                    </div>
                `;
            }

            return `
                <div class="bs-modal-backdrop absolute inset-0 z-50 flex items-${state.showModal === 'addMemory' ? 'end' : 'center'} justify-center">
                    ${modalContent}
                </div>
            `;
        }


        // --- 顯示自訂訊息框 ---
        function showMessage(text) {
            state.modalMessage = text;
            state.showModal = 'messageBox';
            render();
        }
