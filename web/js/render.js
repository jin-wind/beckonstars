
        function renderAvatar(avatar, options = {}) {
            const sizeClass = options.sizeClass || 'w-10 h-10';
            const coreClass = options.coreClass || 'bg-orange-100 text-brand-dark font-bold bs-text-xl';
            const extraClass = options.extraClass || '';
            const frameUrl = options.frameUrl || getAvatarFrameForUser(options.userId);
            const value = avatar || '👤';
            const isImage = typeof value === 'string' && (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/'));
            const imageSrc = isImage ? resolveMediaUrl(value) : '';
            const content = isImage
                ? `<img src="${escapeAttribute(imageSrc)}" class="w-full h-full object-cover" alt="avatar">`
                : `<span>${escapeHtml(value)}</span>`;
            return `
                <div class="avatar-wrap ${sizeClass} ${frameUrl ? 'avatar-frame-spacing' : ''} ${extraClass}">
                    <div class="avatar-core ${sizeClass} ${coreClass}">${content}</div>
                    ${frameUrl ? `<img src="${escapeAttribute(frameUrl)}" class="avatar-reward-frame" alt="">` : ''}
                </div>
            `;
        }


        function refreshVisibleContent() {
            // 更新聊天訊息（增量追加，避免閃爍）
            if (state.currentTab === 'chat') {
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    const visibleMessages = state.messages;
                    const existingMsgs = chatMessages.querySelectorAll('[data-msg-id]');
                    const existingById = new Map(Array.from(existingMsgs).map(el => [el.getAttribute('data-msg-id'), el]));
                    const visibleIds = new Set(visibleMessages.map(msg => String(msg.id)));
                    const anchor = document.getElementById('chatBottomAnchor');
                    const shouldAutoScroll = !isUserScrolledUp();

                    // 追加新訊息，並替換已轉譯/已總結的同一條訊息。
                    let touched = 0;
                    existingById.forEach((element, id) => {
                        if (!visibleIds.has(String(id))) {
                            element.remove();
                            touched++;
                        }
                    });
                    for (const msg of visibleMessages) {
                        const messageId = String(msg.id);
                        const existing = existingById.get(messageId);
                        const nextKey = getMessageRenderKey(msg);
                        if (existing) {
                            if (existing.getAttribute('data-msg-key') !== nextKey) {
                                const replacement = createChatMessageElement(msg, true);
                                if (replacement) {
                                    existing.replaceWith(replacement);
                                    touched++;
                                }
                            }
                            continue;
                        }
                        const newEl = createChatMessageElement(msg, true);
                        if (newEl && anchor) {
                            chatMessages.insertBefore(newEl, anchor);
                            touched++;
                        }
                    }

                    if (touched > 0) {
                        syncVoicePlayerUi();
                        if (shouldAutoScroll) {
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                    }
                }
            }
            // 更新「我」頁內的家庭成員活躍度列表
            if (state.currentTab === 'profile') {
                const lb = document.getElementById('familyMemberActivityCard');
                if (lb) {
                    lb.outerHTML = renderLeaderboardCard();
                }
            }
            // 更新日曆回憶
            if (state.currentTab === 'calendar' && state.calendarMode === 'tear-off') {
                updateCalendarContent();
            }
        }


        // --- 核心渲染引擎 ---
        function render() {
            const app = document.getElementById('app');
            const previousChatSnapshot = readChatScrollSnapshot();
            if (state.currentTab === 'leaderboard') state.currentTab = 'profile';
            saveDemoData();
            
            if (!state.appReady) {
                app.innerHTML = renderOnboardingFlow();
            } else if (state.aiImageGenView) {
                app.innerHTML = renderAIImageGen() + renderModals();
            } else {
                app.innerHTML = `
                    ${renderHeader()}
                    <main class="flex-1 min-h-0 ${state.currentTab === 'chat' ? 'overflow-hidden pb-[calc(5.75rem+env(safe-area-inset-bottom))]' : 'overflow-y-auto no-scrollbar pb-[calc(5.75rem+env(safe-area-inset-bottom))]'}">
                        ${state.currentTab === 'calendar' ? renderCalendar() : ''}
                        ${state.currentTab === 'chat' ? renderChat() : ''}
                        ${state.currentTab === 'rewards' ? renderRewards() : ''}
                        ${state.currentTab === 'profile' ? renderProfile() : ''}
                    </main>
                    ${renderBottomNav()}
                    ${renderModals()}
                `;
            }
            attachEvents();
            // Debug: Log memory audio elements
            requestAnimationFrame(() => {
                const audioElements = document.querySelectorAll('.bg-purple-50 audio');
                audioElements.forEach((audio, idx) => {
                    const src = audio.querySelector('source')?.src || '';
                    console.log(`[audio-debug] Memory audio ${idx}:`, src.slice(0, 100));
                    audio.addEventListener('error', (e) => {
                        console.error('[audio-debug] 加載失敗:', src.slice(0, 100), audio.error);
                    }, { once: true });
                    audio.addEventListener('loadedmetadata', () => {
                        console.log('[audio-debug] 加載成功:', src.slice(0, 100), 'duration:', audio.duration);
                    }, { once: true });
                });
            });
            requestAnimationFrame(() => {
                applyChatScrollAfterRender(previousChatSnapshot);
                restoreChatInputFocusAfterRender();
                syncVoicePlayerUi();
                initVideoPlayer();
            });
        }


        // --- 登入/註冊引導流程 (Onboarding) ---
        function renderOnboardingFlow() {
            if (state.onboardingStep === 1) return renderStep1Auth();
            if (state.onboardingStep === 2) return renderStep2Role();
            if (state.onboardingStep === 3) return renderStep3Profile();
            if (state.onboardingStep === 4) return renderStep4Connect();
        }


        // --- 主應用程式視圖 ---

        // 頂部導航列 (加入一鍵刪除按鈕)
        function renderHeader() {
            const titles = { 'calendar': '日曆', 'chat': '對話', 'rewards': '獎勵', 'profile': '我' };
            const currentTitle = titles[state.currentTab] || '星喚';
            return `
                <header class="bg-white px-6 pt-12 pb-4 shadow-sm z-10 sticky top-0 flex justify-between items-center rounded-b-2xl">
                    <div class="flex items-center">
                        ${renderAvatar(state.userAvatar, { userId: state.authUid, sizeClass: 'w-10 h-10', coreClass: 'bg-orange-100 bs-text-2xl border-2 border-brand-light shadow-sm', extraClass: 'mr-3' })}
                        <h2 class="bs-text-2xl font-bold text-gray-800">${currentTitle}</h2>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="bg-orange-100 text-brand-dark px-3 py-1.5 rounded-full font-bold flex items-center shadow-inner">
                            <i class="fa-solid fa-coins mr-1.5 text-yellow-500"></i> ${state.points}
                        </div>
                        <button class="action-btn w-9 h-9 rounded-full ${state.notificationPermission === 'granted' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'} flex items-center justify-center hover:bg-yellow-100 transition-colors" data-action="requestNotifications" title="開啟通知提示">
                            <i class="fa-solid ${state.notificationPermission === 'granted' ? 'fa-bell' : 'fa-bell-slash'}"></i>
                        </button>
                        ${state.canInstallApp ? `
                            <button class="action-btn w-9 h-9 rounded-full bg-orange-50 text-brand flex items-center justify-center hover:bg-orange-100 transition-colors" data-action="installApp" title="安裝成手機 App">
                                <i class="fa-solid fa-mobile-screen-button"></i>
                            </button>
                        ` : ''}
                        <button class="action-btn w-9 h-9 rounded-full bg-gray-900 text-green-300 flex items-center justify-center hover:bg-gray-800 transition-colors" data-action="openModal" data-modal="logs" title="查看 Log">
                            <i class="fa-solid fa-terminal"></i>
                        </button>
                        <button class="action-btn w-9 h-9 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors" data-action="openModal" data-modal="confirmReset" title="清除數據並重新開始">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </header>
            `;
        }


        // 底部導航列
        function renderBottomNav() {
            const tabs = [
                { id: 'calendar', icon: 'fa-calendar-days', label: '日曆' },
                { id: 'chat', icon: 'fa-comments', label: '聊天' },
                { id: 'rewards', icon: 'fa-gift', label: '獎勵' },
                { id: 'profile', icon: 'fa-user', label: '我' }
            ];

            return `
                <nav class="absolute bottom-0 w-full bg-white border-t border-gray-100 px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex justify-between items-center z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
                    ${tabs.map(tab => `
                        <button class="action-btn flex flex-col items-center p-2 flex-1 ${state.currentTab === tab.id ? 'text-brand' : 'text-gray-400'}" data-action="switchTab" data-tab="${tab.id}">
                            <i class="fa-solid ${tab.icon} bs-text-2xl mb-1 transition-transform ${state.currentTab === tab.id ? 'transform scale-110' : ''}"></i>
                            <span class="bs-text-xs font-medium">${tab.label}</span>
                        </button>
                    `).join('')}
                </nav>
            `;
        }


        // --- 事件處理 ---
        function attachEvents() {
            const buttons = document.querySelectorAll('.action-btn');
            buttons.forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.addEventListener('click', async event => {
                    event.preventDefault();
                    const action = newBtn.getAttribute('data-action');
                    state.errorMsg = ''; // 重置錯誤訊息
                    
                    // 刪除與重置數據
                    if (action === 'resetData') {
                        resetDemoData();
                        render();
                        setTimeout(() => showMessage('所有數據已清除，請重新設定。'), 100);
                        return;
                    }

                    // Onboarding 操作
                    if (action === 'switchAuthMode') {
                        state.authMode = newBtn.getAttribute('data-mode');
                        state.errorMsg = '';
                        render();
                    }
                    else if (action === 'login') {
                        handleLogin();
                    }
                    else if (action === 'register') {
                        handleRegister();
                    }
                    else if (action === 'androidGoogleLogin') {
                        startAndroidGoogleLogin();
                    }
                    else if (action === 'setRole') {
                        state.role = newBtn.getAttribute('data-role');
                        localStorage.setItem('beckon-stars-role', state.role);
                        state.seniorMode = state.role === 'senior';
                        localStorage.setItem('beckon-stars-senior-mode', state.seniorMode);
                        document.body.classList.toggle('senior-mode', state.seniorMode);
                        applySeniorModeVars();
                        state.userAvatar = null; // 重置頭像確保切換角色時重新賦予預設值
                        state.onboardingStep = 3;
                        render();
                    } 
                    else if (action === 'backStep') {
                        state.onboardingStep = parseInt(newBtn.getAttribute('data-step'));
                        render();
                    }
                    else if (action === 'selectAvatar') {
                        state.userAvatar = newBtn.getAttribute('data-avatar');
                        // 保留輸入框的值
                        const nameInput = document.getElementById('nameInput');
                        if (nameInput) state.userName = nameInput.value;
                        render();
                    }
                    else if (action === 'submitProfile') {
                        const nameInput = document.getElementById('nameInput');
                        if (!nameInput.value.trim()) {
                            state.errorMsg = '請輸入您的稱呼！';
                            render();
                            return;
                        }
                        state.userName = nameInput.value.trim();
                        state.onboardingStep = 4;
                        render();
                    }
                    else if (action === 'setConnectionMode') {
                        state.connectionMode = newBtn.getAttribute('data-mode');
                        render();
                    }
                    else if (action === 'copyCode' || action === 'copyFamilyCode') {
                        navigator.clipboard?.writeText(state.calendarCode || '').catch(() => {});
                        showMessage('已複製邀請碼！分享給家人吧。');
                    }
                    else if (action === 'submitJoinCode') {
                        const joinCodeInput = document.getElementById('joinCodeInput');
                        if (!joinCodeInput.value || joinCodeInput.value.length !== 6) {
                            state.errorMsg = '請輸入正確的6位數字邀請碼！';
                            render();
                            return;
                        }
                        try {
                            await connectFamily(joinCodeInput.value, false);
                            state.appReady = true;
                            render();
                            setTimeout(() => showMessage('成功加入同步家庭日曆！'), 500);
                        } catch (error) {
                            if (error.message === 'unauthorized') {
                                state.errorMsg = '登入已過期，請重新登入。';
                                state.onboardingStep = 1;
                                signOut();
                            } else {
                                state.errorMsg = error.message === 'family-not-found' ? '找不到這個家庭碼，請確認家人已建立。' : '加入失敗，請稍後再試。';
                            }
                            render();
                        }
                    }
                    else if (action === 'finishOnboarding') {
                        if (!state.calendarCode) state.calendarCode = Math.floor(100000 + Math.random() * 900000).toString();
                        try {
                            await connectFamily(state.calendarCode, true);
                            state.appReady = true;
                            render();
                            setTimeout(() => showMessage(`已建立同步家庭日曆！邀請碼是 ${state.calendarCode}。`), 500);
                        } catch (error) {
                            if (error.message === 'unauthorized') {
                                state.errorMsg = '登入已過期，請重新登入。';
                                state.onboardingStep = 1;
                                signOut();
                            } else {
                                state.errorMsg = '建立家庭失敗，請稍後再試。';
                            }
                            render();
                        }
                    }
                    // 個人資料操作
                    else if (action === 'toggleSeniorMode') {
                        state.seniorMode = !state.seniorMode;
                        localStorage.setItem('beckon-stars-senior-mode', state.seniorMode);
                        document.body.classList.toggle('senior-mode', state.seniorMode);
                        applySeniorModeVars();
                        render();
                    }
                    else if (action === 'toggleDailyCardMode') {
                        state.dailyCardMode = state.dailyCardMode === 'bible' ? 'encouragement' : 'bible';
                        localStorage.setItem(DAILY_CARD_MODE_KEY, state.dailyCardMode);
                        prefetchDailyCardWindow();
                        if (state.dailyCardMode === 'bible') {
                            showMessage('手撕日曆已切換為聖經金句。');
                        } else {
                            showMessage('手撕日曆已切換為家庭小提醒。');
                        }
                        render();
                    }
                    else if (action === 'logout') {
                        state.showModal = 'confirmLogout';
                        render();
                    }
                    else if (action === 'confirmLogout') {
                        state.appReady = false;
                        state.onboardingStep = 1;
                        state.showModal = null;
                        signOut();
                        render();
                    }
                    else if (action === 'leaveFamily') {
                        state.showModal = 'confirmLeaveFamily';
                        render();
                    }
                    else if (action === 'confirmLeaveFamily') {
                        if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
                        if (unsubscribeMemories) { unsubscribeMemories(); unsubscribeMemories = null; }
                        const oldFamilyId = state.familyId;
                        serverApi(`/api/families/${encodeURIComponent(oldFamilyId)}/leave`, { method: 'DELETE' })
                            .then(() => {
                                state.familyId = null;
                                state.calendarCode = null;
                                state.messages = [];
                                state.memories = [];
                                state.showModal = null;
                                state.appReady = false;
                                state.onboardingStep = 4;
                                state.connectionMode = 'select';
                                if (state.currentUser?.families) {
                                    state.currentUser.families = state.currentUser.families.filter(f => f !== oldFamilyId);
                                }
                                saveDemoData();
                                render();
                                showMessage('已退出家庭，請選擇加入或建立新家庭');
                            })
                            .catch(err => {
                                console.error('退出家庭失敗', err);
                                showMessage('退出失敗，請稍後再試');
                                state.showModal = null;
                                render();
                            });
                    }
                    else if (action === 'downloadUpdate') {
                        if (window.BeckonStarsAndroid?.downloadAndInstallUpdate) {
                            window.BeckonStarsAndroid.downloadAndInstallUpdate(state.updateInfo.downloadUrl);
                            state.showModal = null;
                            render();
                            showMessage('正在下載更新，完成後會自動提示安裝');
                        } else {
                            window.open(state.updateInfo.downloadUrl, '_blank');
                            state.showModal = null;
                            render();
                        }
                    }
                    else if (action === 'uploadAvatar') {
                        const fileInput = document.getElementById('avatarFileInput');
                        if (fileInput) fileInput.click();
                    }
                    else if (action === 'editSelectAvatar') {
                        state.userAvatar = newBtn.getAttribute('data-avatar');
                        const preview = document.getElementById('editAvatarPreview');
                        if (preview) preview.innerHTML = `<span class="bs-text-4xl">${state.userAvatar}</span>`;
                        // 更新按鈕選中狀態
                        document.querySelectorAll('[data-action="editSelectAvatar"]').forEach(b => {
                            const isSelected = b.getAttribute('data-avatar') === state.userAvatar;
                            b.className = `action-btn bs-text-2xl p-2 rounded-xl transition-all ${isSelected ? 'bg-brand shadow-md scale-105' : 'bg-gray-50 border border-gray-200 opacity-60'}`;
                        });
                    }
                    else if (action === 'saveProfile') {
                        const nameInput = document.getElementById('editNameInput');
                        const newName = nameInput ? nameInput.value.trim() : '';
                        if (!newName) {
                            state.errorMsg = '名稱不能為空';
                            render();
                            return;
                        }
                        try {
                            const result = await serverApi('/api/auth/profile', {
                                method: 'PUT',
                                body: JSON.stringify({ name: newName, avatar: state.userAvatar })
                            });
                            state.userName = result.user.name;
                            state.userAvatar = result.user.picture || state.userAvatar;
                            state.currentUser = result.user;
                            localStorage.setItem('beckon-stars-user', JSON.stringify(result.user));
                            state.showModal = null;
                            render();
                            showMessage('個人資料已更新！');
                        } catch (error) {
                            state.errorMsg = '更新失敗，請稍後再試';
                            render();
                        }
                    }
                    else if (action === 'savePassword') {
                        const oldPwd = document.getElementById('oldPasswordInput')?.value || '';
                        const newPwd = document.getElementById('newPasswordInput')?.value || '';
                        const confirmPwd = document.getElementById('confirmPasswordInput')?.value || '';
                        if (!oldPwd || !newPwd || !confirmPwd) {
                            state.errorMsg = '請填寫所有欄位';
                            render();
                            return;
                        }
                        if (newPwd.length < 6) {
                            state.errorMsg = '新密碼長度至少 6 個字元';
                            render();
                            return;
                        }
                        if (newPwd !== confirmPwd) {
                            state.errorMsg = '兩次輸入的新密碼不一致';
                            render();
                            return;
                        }
                        try {
                            await serverApi('/api/auth/password', {
                                method: 'PUT',
                                body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
                            });
                            state.showModal = null;
                            render();
                            showMessage('密碼已成功修改！');
                        } catch (error) {
                            if (error.status === 401) {
                                state.errorMsg = '舊密碼不正確';
                            } else {
                                state.errorMsg = error.serverMessage || '修改失敗，請稍後再試';
                            }
                            render();
                        }
                    }
                    // 主應用程式操作
                    else if (action === 'switchTab') {
                        state.currentTab = newBtn.getAttribute('data-tab');
                        if (state.currentTab === 'chat') shouldStickChatToBottom = true;
                        render();
                        if (state.backendMode === 'server' && state.familyId && state.currentTab === 'calendar') {
                            refreshServerMemories(state.familyId).catch(() => {});
                        }
                        if (state.backendMode === 'server' && state.familyId && state.currentTab === 'chat') {
                            refreshServerMessages(state.familyId).catch(() => {});
                        }
                    }
                    else if (action === 'switchCalendar') {
                        state.calendarMode = newBtn.getAttribute('data-mode');
                        render();
                    }
                    else if (action === 'openModal') {
                        state.showModal = newBtn.getAttribute('data-modal');
                        state.pendingMemoryType = 'text';
                        state.pendingMemoryImage = '';
                        state.pendingMemoryAudio = null;
                        state.pendingMemoryAudioDuration = 0;
                        if (state.showModal === 'videoPlayer') {
                            state.videoUrl = null;
                            state.videoError = null;
                            state.videoGenerating = false;
                        }
                        if (state.showModal === 'logs') {
                            refreshServerLogs();
                        }
                        render();
                    }
                    else if (action === 'refreshLogs') {
                        refreshServerLogs();
                        render();
                    }
                    else if (action === 'generateVideo') {
                        state.videoGenerating = true;
                        state.videoError = null;
                        render();
                        try {
                            const familyId = state.familyId || state.calendarCode;
                            const result = await serverApi(`/api/families/${encodeURIComponent(familyId)}/summary-video`, {
                                method: 'POST',
                                body: JSON.stringify({
                                    month: today.getMonth() + 1,
                                    year: today.getFullYear()
                                })
                            });
                            if (result.error) {
                                state.videoError = result.message || '沒有照片可生成影片';
                            } else {
                                state.videoUrl = `${selfHostedApiBase}${result.videoUrl}`;
                            }
                        } catch (error) {
                            console.error('[video] generation failed', error);
                            state.videoError = '影片生成失敗，請稍後再試。';
                        }
                        state.videoGenerating = false;
                        render();
                    }
                    else if (action === 'requestNotifications') {
                        await requestNotificationPermission();
                        if (state.notificationPermission === 'granted') {
                            await refreshCurrentPushTokenInfo().catch(() => null);
                            showMessage(getPushStatusSummary());
                        }
                    }
                    else if (action === 'installApp') {
                        await installPwaApp();
                    }
                    else if (action === 'closeModal') {
                        const mv = document.getElementById('memVideo');
                        if (mv) { mv.pause(); mv.src = ''; }
                        state.showModal = null;
                        state.dailyRewardCelebration = null;
                        state.selectedDate = null;
                        state.pendingMemoryContent = '';
                        state.pendingMemoryImage = '';
                        state.pendingMemoryAudio = null;
                        state.pendingMemoryAudioDuration = 0;
                        state.isRecordingMemory = false;
                        state.videoUrl = null;
                        state.videoError = null;
                        state.videoGenerating = false;
                        render();
                    }
                    else if (action === 'viewMemories') {
                        state.selectedDate = newBtn.getAttribute('data-date');
                        state.showModal = 'memoryDetail';
                        render();
                    }
                    else if (action === 'selectMemoryType') {
                        const memoryContentInput = document.getElementById('memoryContentInput');
                        if (memoryContentInput) state.pendingMemoryContent = memoryContentInput.value;
                        state.pendingMemoryType = newBtn.getAttribute('data-type');
                        if (state.pendingMemoryType !== 'photo') state.pendingMemoryImage = '';
                        render();
                    }
                    else if (action === 'chooseMemoryImage') {
                        const imageInput = document.getElementById('memoryImageInput');
                        imageInput?.click();
                    }
                    else if (action === 'chooseMemoryCamera') {
                        const cameraInput = document.getElementById('memoryCameraInput');
                        cameraInput?.click();
                    }
                    else if (action === 'startMemoryVoiceRecording') {
                        if (!isAndroidApk()) {
                            showMessage('語音錄製功能僅在 Android APK 中可用。');
                            return;
                        }
                        if (!window.BeckonStarsAndroid?.startVoiceRecording) {
                            showMessage('您的 APK 版本不支援語音錄製。');
                            return;
                        }
                        state.recordingForMemory = true;
                        state.isRecordingMemory = true;
                        window.BeckonStarsAndroid.startVoiceRecording();
                        // Don't render immediately to avoid UI jump
                        setTimeout(() => render(), 50);
                    }
                    else if (action === 'stopMemoryVoiceRecording') {
                        if (window.BeckonStarsAndroid?.finishVoiceRecording) {
                            window.BeckonStarsAndroid.finishVoiceRecording(false);
                            state.isRecordingMemory = false;
                            // Don't render immediately to avoid UI jump
                        }
                    }
                    else if (action === 'deleteMemoryVoiceRecording') {
                        state.pendingMemoryAudio = null;
                        state.pendingMemoryAudioDuration = 0;
                        render();
                    }
                    else if (action === 'saveMemory') {
                        const memoryContentInput = document.getElementById('memoryContentInput');
                        const content = memoryContentInput?.value.trim();
                        if (state.pendingMemoryType === 'text' && !content) {
                            state.errorMsg = '請先寫低一點內容。';
                            render();
                            return;
                        }
                        if (state.pendingMemoryType === 'photo' && !content && !state.pendingMemoryImage) {
                            state.errorMsg = '請選擇一張相片或寫低內容。';
                            render();
                            return;
                        }
                        if (state.pendingMemoryType === 'voice' && !state.pendingMemoryAudio && !content) {
                            state.errorMsg = '請先錄製語音或寫低一些內容。';
                            render();
                            return;
                        }

                        let imgUrl = null;
                        let thumbnailUrl = null;
                        if (state.pendingMemoryType === 'photo' && state.pendingMemoryImage && state.backendMode === 'server') {
                            try {
                                const blob = await fetch(state.pendingMemoryImage).then(r => r.blob());
                                const file = new File([blob], 'memory.jpg', { type: blob.type });
                                const uploaded = await uploadMediaFile(file);
                                imgUrl = uploaded?.mediaUrl || state.pendingMemoryImage;
                                thumbnailUrl = uploaded?.thumbnailUrl || null;
                            } catch (err) {
                                console.warn('Media upload failed, using base64', err);
                                imgUrl = state.pendingMemoryImage;
                            }
                        }

                        let audioUrl = null;
                        if (state.pendingMemoryType === 'voice' && state.pendingMemoryAudio && state.backendMode === 'server') {
                            try {
                                const blob = await fetch(state.pendingMemoryAudio).then(r => r.blob());
                                const file = new File([blob], 'memory.m4a', { type: 'audio/mp4' });
                                const uploaded = await uploadMediaFile(file);
                                audioUrl = uploaded?.mediaUrl || state.pendingMemoryAudio;
                            } catch (err) {
                                console.warn('Audio upload failed, using base64', err);
                                audioUrl = state.pendingMemoryAudio;
                            }
                        }

                        const memoryData = {
                            uid: state.authUid || 'local',
                            date: today.getDate(),
                            month: today.getMonth() + 1,
                            year: today.getFullYear(),
                            childId: state.role === 'child' ? 'child_1' : 'senior',
                            childName: state.userName || (state.role === 'child' ? '我' : '媽媽'),
                            type: state.pendingMemoryType,
                            content,
                            img: imgUrl || (state.pendingMemoryType === 'photo' ? state.pendingMemoryImage : null),
                            imgUrl,
                            imageUrl: imgUrl,
                            thumbnailUrl,
                            audioUrl: audioUrl || (state.pendingMemoryType === 'voice' ? state.pendingMemoryAudio : null),
                            duration: state.pendingMemoryType === 'voice' ? state.pendingMemoryAudioDuration : 0,
                            createdAt: today.toISOString()
                        };

                        if (state.backendMode === 'server' && state.familyId) {
                            try {
                                await serverApi(`/api/families/${encodeURIComponent(state.familyId)}/memories`, {
                                    method: 'POST',
                                    body: JSON.stringify(memoryData)
                                });
                                await refreshServerMemories(state.familyId);
                                state.points += 10;
                                state.showModal = null;
                                state.pendingMemoryType = 'text';
                                state.pendingMemoryContent = '';
                                state.pendingMemoryImage = '';
                                state.pendingMemoryAudio = null;
                                state.pendingMemoryAudioDuration = 0;
                                render();
                                setTimeout(() => showMessage('已儲存今日回憶到自架服務器，並獲得 10 積分。'), 100);
                            } catch (error) {
                                console.warn('Server memory save failed', error);
                                showMessage('回憶儲存失敗，請檢查自架服務器後重試。');
                            }
                            return;
                        }

                        // Local fallback
                        const newMemory = { id: Date.now(), ...memoryData };
                        state.memories.unshift(newMemory);
                        state.points += 10;
                        state.showModal = null;
                        state.pendingMemoryType = 'text';
                        state.pendingMemoryContent = '';
                        state.pendingMemoryImage = '';
                        state.pendingMemoryAudio = null;
                        state.pendingMemoryAudioDuration = 0;
                        render();
                        setTimeout(() => showMessage('已儲存今日回憶，並獲得 10 積分。'), 100);
                    }
                    else if (action === 'sendMessage') {
                        sendChatMessage();
                    }
                    else if (action === 'sendLockedVoiceRecording') {
                        finishLockedVoiceRecording(false);
                    }
                    else if (action === 'deleteLockedVoiceRecording') {
                        finishLockedVoiceRecording(true);
                    }
                    else if (action === 'toggleVoice') {
                        await toggleVoiceMessage(newBtn.getAttribute('data-message-id'));
                    }
                    else if (action === 'selectChatImage') {
                        document.getElementById('chatImageInput')?.click();
                    }
                    else if (action === 'summarizeVoice') {
                        await summarizeVoiceMessage(newBtn.getAttribute('data-message-id'));
                    }
                    else if (action === 'summarizeTodayChat') {
                        state.summarizingChat = true;
                        render();
                        try {
                            const todayStr = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,'0')}-${today.getDate().toString().padStart(2,'0')}`;
                            const todayMessages = state.messages.filter(m => {
                                if (!m.time) return false;
                                return true; // 今日聊天室訊息
                            });
                            const chatText = todayMessages.map(m => {
                                const name = m.senderName || '用戶';
                                const content = m.transcript || m.content || '';
                                return `${name}: ${content}`;
                            }).filter(Boolean).join('\n');
                            if (!chatText.trim()) {
                                showMessage('今日暫無聊天內容可總結。');
                                state.summarizingChat = false;
                                render();
                                return;
                            }
                            const result = await serverApi('/api/summarize', {
                                method: 'POST',
                                body: JSON.stringify({ text: chatText, type: 'chat' })
                            });
                            state.showModal = 'chatSummary';
                            state.chatSummaryContent = result.summary || '暫無摘要';
                        } catch (err) {
                            console.warn('[summary] failed', err);
                            showMessage('AI 總結失敗，請稍後再試。');
                        }
                        state.summarizingChat = false;
                        render();
                    }
                    else if (action === 'transcribeVoice') {
                        await transcribeVoiceMessage(newBtn.getAttribute('data-message-id'));
                    }
                    else if (action === 'shareSummary') {
                        state.showModal = null;
                        state.currentTab = 'chat';
                        shouldStickChatToBottom = true;
                        render();
                        setTimeout(() => {
                            addSystemReply('已收到本週家庭回憶摘要，今晚一齊睇返啲相啦。');
                            showMessage('摘要已模擬分享至家庭聊天室。');
                        }, 700);
                    }
                    else if (action === 'redeemReward') {
                        const rewardId = parseInt(newBtn.getAttribute('data-reward-id'));
                        const reward = state.rewards.find(item => item.id === rewardId);
                        if (!reward || state.redeemedRewards.includes(rewardId)) return;
                        if (state.points < reward.points) {
                            showMessage('積分未夠，繼續同家人互動就可以累積更多。');
                            return;
                        }
                        state.points -= reward.points;
                        state.redeemedRewards.push(rewardId);
                        render();
                        setTimeout(() => showMessage(`已成功兌換「${reward.title}」。`), 100);
                    }
                    // AI 圖片生成操作
                    else if (action === 'openAIImageGen') {
                        state.aiImageGenView = true;
                        state.aiImageRefImage = null;
                        state.aiImageStyle = 'random';
                        state.aiImageGenerating = false;
                        state.aiImageResults = [];
                        render();
                    }
                    else if (action === 'closeAIImageGen') {
                        closeAIImageGen();
                    }
                    else if (action === 'uploadRefImage') {
                        const input = document.getElementById('aiImageFileInput');
                        if (input) input.click();
                    }
                    else if (action === 'captureRefImage') {
                        const input = document.getElementById('aiImageCameraInput');
                        if (input) input.click();
                    }
                    else if (action === 'removeRefImage') {
                        state.aiImageRefImage = null;
                        render();
                    }
                    else if (action === 'selectStyle') {
                        state.aiImageStyle = newBtn.getAttribute('data-style');
                        render();
                    }
                    else if (action === 'selectImageCount') {
                        state.aiImageCount = parseInt(newBtn.getAttribute('data-count'));
                        render();
                    }
                    else if (action === 'downloadAllGeneratedImages') {
                        for (const img of state.aiImageResults) {
                            downloadImage(img);
                        }
                        showMessage(`開始下載 ${state.aiImageResults.length} 張圖片`);
                    }
                    else if (action === 'generateAIImage') {
                        console.log('[AI Image] Button clicked');
                        console.log('[AI Image] Has ref image:', !!state.aiImageRefImage);
                        console.log('[AI Image] Is generating:', state.aiImageGenerating);
                        if (!state.aiImageRefImage || state.aiImageGenerating) {
                            console.log('[AI Image] Blocked - no image or already generating');
                            return;
                        }
                        console.log('[AI Image] Starting generation...');
                        await handleGenerateAIImage();
                    }
                    else if (action === 'viewGeneratedImage') {
                        const index = parseInt(newBtn.getAttribute('data-index'));
                        if (state.aiImageResults[index]) {
                            state.showModal = 'viewGeneratedImage';
                            state.selectedGeneratedImageIndex = index;
                            render();
                        }
                    }
                    else if (action === 'viewGeneratedImageFullscreen') {
                        const url = newBtn.getAttribute('data-url');
                        if (url) {
                            state.showModal = 'viewGeneratedImageFullscreen';
                            state.selectedGeneratedImageUrl = url;
                            render();
                        }
                    }
                    else if (action === 'downloadGeneratedImage') {
                        const url = newBtn.getAttribute('data-url');
                        if (url) {
                            if (isAndroidApk() && window.BeckonStarsAndroid?.saveImageToGallery) {
                                showMessage('正在保存圖片到手機相簿...');
                            }
                            downloadImage(url);
                        }
                    }
                    else if (action === 'shareGeneratedImage') {
                        const url = newBtn.getAttribute('data-url');
                        if (url) {
                            await shareGeneratedImageUrl(url);
                        }
                    }
                    else if (action === 'showQrCode') {
                        const url = newBtn.getAttribute('data-url');
                        if (url) {
                            state.selectedQrImageUrl = url;
                            state.showModal = 'qrCode';
                            render();
                        }
                    }
                });
            });

            // AI 圖片上傳輸入
            const aiImageFileInput = document.getElementById('aiImageFileInput');
            if (aiImageFileInput) {
                aiImageFileInput.addEventListener('change', async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    event.target.value = '';
                    state.aiImageRefImage = await compressAIRefImage(file);
                    render();
                });
            }

            const aiImageCameraInput = document.getElementById('aiImageCameraInput');
            if (aiImageCameraInput) {
                aiImageCameraInput.addEventListener('change', async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    event.target.value = '';
                    state.aiImageRefImage = await compressAIRefImage(file);
                    render();
                });
            }

            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.addEventListener('input', event => {
                    chatDraft = event.target.value;
                });
                chatInput.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        sendChatMessage();
                    }
                });
            }

            document.querySelectorAll('.voice-seek-bar').forEach(bar => {
                bar.addEventListener('click', event => {
                    const rect = bar.getBoundingClientRect();
                    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
                    seekVoiceMessage(bar.getAttribute('data-message-id'), ratio);
                });
            });

            const memoryImageInput = document.getElementById('memoryImageInput');
            if (memoryImageInput) {
                memoryImageInput.addEventListener('change', async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    state.pendingMemoryImage = await readFileAsDataUrl(file);
                    const memoryContentInput = document.getElementById('memoryContentInput');
                    if (memoryContentInput) state.pendingMemoryContent = memoryContentInput.value;
                    render();
                });
            }

            const memoryCameraInput = document.getElementById('memoryCameraInput');
            if (memoryCameraInput) {
                memoryCameraInput.addEventListener('change', async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    state.pendingMemoryImage = await readFileAsDataUrl(file);
                    const memoryContentInput = document.getElementById('memoryContentInput');
                    if (memoryContentInput) state.pendingMemoryContent = memoryContentInput.value;
                    render();
                });
            }

            const chatImageInput = document.getElementById('chatImageInput');
            if (chatImageInput) {
                chatImageInput.addEventListener('change', async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    event.target.value = '';
                    const img = await readFileAsDataUrl(file);
                    await sendChatMessage({ type: 'photo', content: '', img });
                });
            }

            const avatarFileInput = document.getElementById('avatarFileInput');
            if (avatarFileInput) {
                avatarFileInput.addEventListener('change', async event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    event.target.value = '';
                    const dataUrl = await compressImage(file);
                    state.userAvatar = dataUrl;
                    const preview = document.getElementById('editAvatarPreview');
                    if (preview) preview.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
                    // 取消 emoji 選中狀態
                    document.querySelectorAll('[data-action="editSelectAvatar"]').forEach(b => {
                        b.className = 'action-btn bs-text-2xl p-2 rounded-xl transition-all bg-gray-50 border border-gray-200 opacity-60';
                    });
                });
            }

            const voiceHoldButton = document.getElementById('voiceHoldButton');
            if (voiceHoldButton) attachVoiceHoldEvents(voiceHoldButton);

            // 日曆月份導航按鈕（箭頭切換月份）
            document.querySelectorAll('.calendar-nav-btn').forEach(btn => {
                btn.addEventListener('click', event => {
                    event.stopPropagation();
                    const dir = parseInt(btn.getAttribute('data-calendar-dir'));
                    navigateCalendarMonth(dir);
                });
            });

            // 日曆滑動手勢
            setupCalendarSwipe();
        }
