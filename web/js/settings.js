
        function applySeniorModeVars() {
            const appEl = document.getElementById('app');
            if (!appEl) return;
            const sm = state.seniorMode;
            appEl.style.setProperty('--font-xs', sm ? '15px' : '12px');
            appEl.style.setProperty('--font-sm', sm ? '18px' : '14px');
            appEl.style.setProperty('--font-base', sm ? '20px' : '16px');
            appEl.style.setProperty('--font-lg', sm ? '22px' : '18px');
            appEl.style.setProperty('--font-xl', sm ? '24px' : '20px');
            appEl.style.setProperty('--font-2xl', sm ? '28px' : '24px');
            appEl.style.setProperty('--font-3xl', sm ? '32px' : '30px');
            appEl.style.setProperty('--font-4xl', sm ? '38px' : '36px');
            appEl.style.setProperty('--space-xs', sm ? '6px' : '4px');
            appEl.style.setProperty('--space-sm', sm ? '10px' : '8px');
            appEl.style.setProperty('--space-md', sm ? '16px' : '12px');
            appEl.style.setProperty('--space-lg', sm ? '20px' : '16px');
            appEl.style.setProperty('--space-xl', sm ? '28px' : '24px');
            appEl.style.setProperty('--btn-min-h', sm ? '52px' : '44px');
            appEl.style.setProperty('--touch-target', sm ? '48px' : '40px');
            appEl.style.setProperty('--line-height', sm ? '1.5' : '1.4');
            appEl.style.setProperty('--radius', sm ? '20px' : '16px');
        }


        function renderLogPanel(title, icon, logs, emptyText, options = {}) {
            const isLoading = !!options.loading;
            const errorText = options.error || '';
            const lines = logs.slice(-80).map(formatDisplayLogLine);
            const body = errorText
                ? `讀取失敗：${errorText}`
                : (lines.length ? lines.join('\n') : (isLoading ? '讀取中...' : emptyText));
            return `
                <section class="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                    <div class="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <p class="font-bold text-gray-700 bs-text-sm"><i class="fa-solid ${icon} mr-2"></i>${title}</p>
                        ${isLoading ? '<i class="fa-solid fa-spinner fa-spin text-gray-400 bs-text-xs"></i>' : ''}
                    </div>
                    <pre class="bg-gray-950 text-gray-100 font-mono bs-text-xs leading-relaxed p-3 h-44 overflow-y-auto whitespace-pre-wrap">${escapeHtml(body)}</pre>
                </section>
            `;
        }


        // 獎勵視圖
        function renderRewards() {
            const reward = state.dailyMessageReward || {};
            const threshold = Number(reward.threshold || 20);
            const count = Math.min(Number(reward.count ?? state.dailyMessages ?? 0), threshold);
            const remaining = Math.max(threshold - count, 0);
            const progress = threshold > 0 ? Math.min((count / threshold) * 100, 100) : 0;
            return `
                <div class="p-6">
                    <div class="bg-gradient-to-br from-brand-light to-brand text-white rounded-3xl p-6 shadow-lg mb-8 relative overflow-hidden">
                        <i class="fa-solid fa-star absolute -right-4 -bottom-4 text-7xl text-white opacity-20 transform -rotate-15"></i>
                        <div class="flex items-center gap-4 mb-4">
                            ${renderAvatar(state.userAvatar, { userId: state.authUid, sizeClass: 'w-16 h-16', coreClass: 'bg-white/20 bs-text-3xl text-white font-bold border border-white/30' })}
                            <div class="min-w-0 flex-1">
                                <h3 class="bs-text-xl font-bold mb-1">每日頭像框任務</h3>
                                <p class="text-white/80 bs-text-sm">今天發送 20 條訊息即可即時獲得頭像框</p>
                            </div>
                        </div>
                        
                        <div class="bg-black/10 rounded-full h-3 mb-2 relative overflow-hidden">
                            <div class="bg-white h-full rounded-full transition-all duration-1000" style="width: ${progress}%;"></div>
                        </div>
                        <div class="flex justify-between bs-text-sm font-bold">
                            <span>進度</span>
                            <span>${count} / ${threshold} 條</span>
                        </div>
                        
                        ${reward.active ? `
                            <p class="mt-4 bs-text-xs text-center text-white/90 font-bold">今日頭像框已生效，明天會重新計算</p>
                        ` : `
                            <p class="mt-4 bs-text-xs text-center text-white/70">仲差 ${remaining} 條訊息即可獲得今日頭像框</p>
                        `}
                    </div>

                    <h3 class="bs-text-xl font-bold text-gray-800 mb-4 flex items-center">
                        <i class="fa-solid fa-ticket text-brand mr-2"></i> 獎勵兌換
                    </h3>

                    <div class="space-y-4">
                        ${state.rewards.map(reward => `
                            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center">
                                <div class="w-14 h-14 rounded-full ${reward.color} flex items-center justify-center bs-text-2xl mr-4 shrink-0">
                                    <i class="fa-solid ${reward.icon}"></i>
                                </div>
                                <div class="flex-1">
                                    <h4 class="font-bold text-gray-800 bs-text-lg leading-tight">${reward.title}</h4>
                                    <p class="text-brand font-bold bs-text-sm mt-1">${reward.points} 積分</p>
                                </div>
                                <button class="action-btn ml-2 px-4 py-2 rounded-xl font-bold bs-text-sm ${state.redeemedRewards.includes(reward.id) ? 'bg-green-100 text-green-600' : state.points >= reward.points ? 'bg-brand text-white shadow-md hover:bg-brand-dark' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}" data-action="redeemReward" data-reward-id="${reward.id}">
                                    ${state.redeemedRewards.includes(reward.id) ? '已換' : '兌換'}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }


        // --- 個人資料視圖 ---
        function renderProfile() {
            const avatar = state.userAvatar || '👤';
            const roleLabel = state.role === 'senior' ? '長輩' : state.role === 'child' ? '子女' : '未設定';
            const usesBibleVerse = state.dailyCardMode === 'bible';

            return `
                <div class="p-6 space-y-4">
                    <!-- 頭像和基本資訊 -->
                    <div class="bg-white rounded-3xl shadow-sm p-6 text-center">
                        ${renderAvatar(avatar, { userId: state.authUid, sizeClass: 'w-24 h-24', coreClass: 'bg-orange-100 border-4 border-orange-200 text-5xl', extraClass: 'mx-auto mb-4' })}
                        <h2 class="bs-text-2xl font-bold text-gray-800">${state.userName || '用戶'}</h2>
                        <p class="text-gray-500 bs-text-sm mt-1">${state.currentUser?.email || ''}</p>
                        <span class="inline-block mt-2 px-3 py-1 rounded-full bs-text-xs font-medium bg-orange-100 text-brand-dark">${roleLabel}</span>
                    </div>

                    <!-- 家庭成員列表 -->
                    <div>
                        <h3 class="bs-text-lg font-bold text-gray-800 mb-3 flex items-center">
                            <i class="fa-solid fa-users text-brand mr-2"></i>家庭成員列表
                        </h3>
                        ${renderLeaderboardCard()}
                    </div>

                    <!-- 長者模式開關 -->
                    <div class="bg-white rounded-3xl shadow-sm p-5 flex items-center justify-between">
                        <div>
                            <p class="font-bold text-gray-800 bs-text-lg">長者模式</p>
                            <p class="bs-text-sm text-gray-500">放大字體，方便閱讀</p>
                        </div>
                        <button class="action-btn relative w-14 h-8 rounded-full transition-colors" data-action="toggleSeniorMode"
                            style="background: ${state.seniorMode ? '#FF944D' : '#d1d5db'}">
                            <span class="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform"
                                style="transform: translateX(${state.seniorMode ? '24px' : '0'})"></span>
                        </button>
                    </div>

                    <!-- 手撕日曆內容開關 -->
                    <div class="bg-white rounded-3xl shadow-sm p-5 flex items-center justify-between">
                        <div>
                            <p class="font-bold text-gray-800 bs-text-lg">手撕日曆內容</p>
                            <p class="bs-text-sm text-gray-500">${usesBibleVerse ? '顯示聖經金句' : '顯示家庭小提醒'}</p>
                        </div>
                        <button class="action-btn relative w-14 h-8 rounded-full transition-colors" data-action="toggleDailyCardMode" aria-label="切換手撕日曆內容"
                            style="background: ${usesBibleVerse ? '#F59E0B' : '#d1d5db'}">
                            <span class="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform"
                                style="transform: translateX(${usesBibleVerse ? '24px' : '0'})"></span>
                        </button>
                    </div>

                    <!-- 家庭邀請碼 -->
                    <div class="bg-white rounded-3xl shadow-sm p-6">
                        <h3 class="bs-text-lg font-bold text-gray-800 mb-3"><i class="fa-solid fa-users mr-2 text-brand"></i>家庭邀請碼</h3>
                        <div class="flex items-center justify-center gap-3 bg-orange-50 rounded-2xl p-4">
                            <span class="bs-text-3xl font-bold tracking-[0.3em] text-gray-800">${state.calendarCode || '------'}</span>
                            <button class="action-btn px-4 py-2 bg-brand text-white rounded-xl bs-text-sm font-bold shadow-md hover:bg-brand-dark transition-colors" data-action="copyFamilyCode">
                                <i class="fa-regular fa-copy mr-1"></i>複製
                            </button>
                        </div>
                        <p class="bs-text-xs text-gray-400 text-center mt-2">分享此碼給家人加入</p>
                    </div>

                    <!-- 退出家庭 -->
                    <div class="bg-white rounded-3xl shadow-sm p-5">
                        <button class="action-btn w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-orange-50 text-orange-600 font-bold hover:bg-orange-100 transition-colors" data-action="leaveFamily">
                            <i class="fa-solid fa-right-from-bracket"></i>退出家庭
                        </button>
                        <p class="bs-text-xs text-gray-400 text-center mt-2">退出後可加入其他家庭</p>
                    </div>

                    <!-- 操作按鈕 -->
                    <div class="bg-white rounded-3xl shadow-sm p-2">
                        <button class="action-btn w-full flex items-center px-4 py-4 rounded-2xl hover:bg-gray-50 transition-colors" data-action="openModal" data-modal="editProfile">
                            <i class="fa-solid fa-pen-to-square text-brand bs-text-lg w-8"></i>
                            <span class="text-gray-800 font-medium">編輯個人資料</span>
                            <i class="fa-solid fa-chevron-right text-gray-300 ml-auto"></i>
                        </button>
                        <div class="border-t border-gray-100 mx-4"></div>
                        <button class="action-btn w-full flex items-center px-4 py-4 rounded-2xl hover:bg-gray-50 transition-colors" data-action="openModal" data-modal="changePassword">
                            <i class="fa-solid fa-lock text-brand bs-text-lg w-8"></i>
                            <span class="text-gray-800 font-medium">修改密碼</span>
                            <i class="fa-solid fa-chevron-right text-gray-300 ml-auto"></i>
                        </button>
                    </div>

                    <!-- 登出 -->
                    <button class="action-btn w-full bg-red-50 text-red-500 font-bold py-4 rounded-2xl hover:bg-red-100 transition-colors" data-action="logout">
                        <i class="fa-solid fa-right-from-bracket mr-2"></i>登出
                    </button>
                </div>
            `;
        }
