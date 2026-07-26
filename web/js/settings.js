
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
                <section class="bs-card overflow-hidden">
                    <div class="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-1)] px-5 py-4">
                        <div class="flex min-w-0 items-center gap-3">
                            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand bs-text-base">
                                <i class="fa-solid ${icon}"></i>
                            </span>
                            <p class="truncate font-bold text-[var(--ink-900)] bs-text-base">${title}</p>
                        </div>
                        ${isLoading ? '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-brand"><i class="fa-solid fa-spinner fa-spin bs-text-sm"></i></span>' : ''}
                    </div>
                    <div class="bg-[var(--surface-2)] p-3">
                        <pre class="h-44 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-1)] p-4 font-mono text-[var(--ink-700)] bs-text-xs leading-relaxed shadow-[var(--shadow-sm)]">${escapeHtml(body)}</pre>
                    </div>
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
                <div class="space-y-6 p-5">
                    <section class="bs-card relative overflow-hidden">
                        <i class="fa-solid fa-star absolute -bottom-5 -right-3 rotate-[-12deg] text-[6.5rem] text-brand opacity-10"></i>
                        <div class="relative bg-gradient-to-br from-[var(--brand-50)] via-[var(--surface-1)] to-[var(--surface-2)] p-5">
                            <div class="flex items-center gap-4">
                                <div class="rounded-full bg-[var(--surface-1)] p-1 shadow-[var(--shadow-brand)]">
                                    ${renderAvatar(state.userAvatar, { userId: state.authUid, sizeClass: 'w-16 h-16', coreClass: 'bg-gradient-to-br from-brand-300 to-brand-500 bs-text-3xl text-white font-bold border-2 border-[var(--surface-1)]' })}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <h3 class="mb-1 font-bold text-[var(--ink-900)] bs-text-xl">每日頭像框任務</h3>
                                    <p class="text-[var(--ink-500)] bs-text-sm">今天發送 20 條訊息即可即時獲得頭像框</p>
                                </div>
                            </div>

                            <div class="mt-5">
                                <div class="mb-2 flex items-center justify-between gap-3 font-bold text-[var(--ink-700)] bs-text-sm">
                                    <span class="flex items-center gap-2"><i class="fa-solid fa-chart-simple text-brand"></i>進度</span>
                                    <span class="bs-chip shrink-0">${count} / ${threshold} 條</span>
                                </div>
                                <div class="h-3 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-3)] shadow-inner">
                                    <div class="h-full rounded-full bg-gradient-to-r from-brand-300 via-brand-500 to-brand-600 shadow-[var(--shadow-brand)] transition-all duration-1000" style="width: ${progress}%;"></div>
                                </div>
                            </div>

                            ${reward.active ? `
                                <p class="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-400 to-brand-600 px-4 py-2 text-center font-bold text-white shadow-[var(--shadow-brand)] bs-text-xs"><i class="fa-solid fa-circle-check"></i>今日頭像框已生效，明天會重新計算</p>
                            ` : `
                                <p class="mt-4 flex items-center justify-center gap-2 rounded-full bg-[var(--surface-1)] px-4 py-2 text-center text-[var(--ink-500)] shadow-[var(--shadow-sm)] bs-text-xs"><i class="fa-solid fa-star text-[var(--accent-gold)]"></i>仲差 ${remaining} 條訊息即可獲得今日頭像框</p>
                            `}
                        </div>
                    </section>

                    <section>
                        <h3 class="bs-section-title mb-4 flex items-center gap-3">
                            <span class="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand">
                                <i class="fa-solid fa-ticket"></i>
                            </span>
                            獎勵兌換
                        </h3>

                        <div class="space-y-3">
                            ${state.rewards.map(reward => `
                                <article class="bs-card flex items-stretch overflow-hidden">
                                    <div class="flex w-20 shrink-0 items-center justify-center border-r border-[var(--line)] bg-[var(--surface-2)] text-brand bs-text-2xl">
                                        <i class="fa-solid ${reward.icon}"></i>
                                    </div>
                                    <div class="flex min-w-0 flex-1 items-center gap-3 p-4">
                                        <div class="min-w-0 flex-1">
                                            <h4 class="font-bold leading-tight text-[var(--ink-900)] bs-text-base">${reward.title}</h4>
                                            <span class="bs-chip mt-2"><i class="fa-solid fa-coins text-[var(--accent-gold)]"></i>${reward.points} 積分</span>
                                        </div>
                                        <button class="action-btn bs-btn min-w-[5.25rem] shrink-0 bs-text-sm ${state.redeemedRewards.includes(reward.id) ? 'bs-btn-secondary text-[var(--accent-teal)]' : state.points >= reward.points ? 'bs-btn-primary' : 'bs-btn-secondary cursor-not-allowed text-[var(--ink-300)]'}" data-action="redeemReward" data-reward-id="${reward.id}">
                                            ${state.redeemedRewards.includes(reward.id) ? '<i class="fa-solid fa-check"></i>已換' : '<i class="fa-solid fa-ticket"></i>兌換'}
                                        </button>
                                    </div>
                                </article>
                            `).join('')}
                        </div>
                    </section>
                </div>
            `;
        }


        // --- 個人資料視圖 ---
        function renderProfile() {
            const avatar = state.userAvatar || '👤';
            const roleLabel = state.role === 'senior' ? '長輩' : state.role === 'child' ? '子女' : '未設定';
            const usesBibleVerse = state.dailyCardMode === 'bible';

            return `
                <div class="space-y-6 p-5">
                    <!-- 頭像和基本資訊 -->
                    <section class="bs-card relative overflow-hidden text-center">
                        <i class="fa-solid fa-star absolute left-5 top-5 rotate-[-12deg] text-[var(--accent-gold)] opacity-50 bs-text-lg"></i>
                        <i class="fa-solid fa-star absolute right-7 top-8 rotate-12 text-brand opacity-30 bs-text-sm"></i>
                        <div class="bg-gradient-to-br from-[var(--brand-50)] via-[var(--surface-1)] to-[var(--surface-2)] px-6 py-8">
                            <div class="mx-auto mb-4 w-fit rounded-full bg-[var(--surface-1)] p-1.5 shadow-[var(--shadow-brand)]">
                                ${renderAvatar(avatar, { userId: state.authUid, sizeClass: 'w-28 h-28', coreClass: 'bg-gradient-to-br from-[var(--brand-100)] to-[var(--brand-200)] border-4 border-[var(--surface-1)] text-brand-dark bs-text-4xl font-bold' })}
                            </div>
                            <h2 class="font-bold text-[var(--ink-900)] bs-text-2xl">${state.userName || '用戶'}</h2>
                            <p class="mt-1 break-all text-[var(--ink-500)] bs-text-sm">${state.currentUser?.email || ''}</p>
                            <span class="bs-chip mt-3"><i class="fa-solid fa-user-group text-brand"></i>${roleLabel}</span>
                        </div>
                    </section>

                    <!-- 家庭成員列表 -->
                    <section>
                        <h3 class="bs-section-title mb-3 flex items-center gap-3">
                            <span class="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand">
                                <i class="fa-solid fa-users"></i>
                            </span>
                            家庭成員列表
                        </h3>
                        ${renderLeaderboardCard()}
                    </section>

                    <!-- 顯示偏好 -->
                    <section class="bs-card overflow-hidden">
                        <div class="flex min-h-[72px] items-center px-5 py-4">
                            <span class="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand bs-text-lg">
                                <i class="fa-solid fa-text-height"></i>
                            </span>
                            <div class="min-w-0 flex-1">
                                <p class="font-bold text-[var(--ink-900)] bs-text-base">長者模式</p>
                                <p class="text-[var(--ink-500)] bs-text-sm">放大字體，方便閱讀</p>
                            </div>
                            <button class="action-btn relative ml-3 h-8 w-14 shrink-0 rounded-full transition-colors" data-action="toggleSeniorMode"
                                style="background: ${state.seniorMode ? 'var(--brand-500)' : 'var(--ink-300)'}">
                                <span class="absolute left-1 top-1 h-6 w-6 rounded-full bg-[var(--surface-1)] shadow-[var(--shadow-sm)] transition-transform"
                                    style="transform: translateX(${state.seniorMode ? '24px' : '0'})"></span>
                            </button>
                        </div>

                        <div class="mx-5 border-t border-[var(--line)]"></div>

                        <div class="flex min-h-[72px] items-center px-5 py-4">
                            <span class="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--accent-gold)] bs-text-lg">
                                <i class="fa-solid fa-calendar-day"></i>
                            </span>
                            <div class="min-w-0 flex-1">
                                <p class="font-bold text-[var(--ink-900)] bs-text-base">手撕日曆內容</p>
                                <p class="text-[var(--ink-500)] bs-text-sm">${usesBibleVerse ? '顯示聖經金句' : '顯示家庭小提醒'}</p>
                            </div>
                            <button class="action-btn relative ml-3 h-8 w-14 shrink-0 rounded-full transition-colors" data-action="toggleDailyCardMode" aria-label="切換手撕日曆內容"
                                style="background: ${usesBibleVerse ? 'var(--accent-gold)' : 'var(--ink-300)'}">
                                <span class="absolute left-1 top-1 h-6 w-6 rounded-full bg-[var(--surface-1)] shadow-[var(--shadow-sm)] transition-transform"
                                    style="transform: translateX(${usesBibleVerse ? '24px' : '0'})"></span>
                            </button>
                        </div>
                    </section>

                    <!-- 帳戶設定 -->
                    <section class="bs-card overflow-hidden">
                        <button class="action-btn flex min-h-[72px] w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--surface-2)]" data-action="openModal" data-modal="editProfile">
                            <span class="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand bs-text-lg">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </span>
                            <span class="min-w-0 flex-1 font-semibold text-[var(--ink-900)] bs-text-base">編輯個人資料</span>
                            <i class="fa-solid fa-chevron-right ml-3 text-[var(--ink-300)] bs-text-sm"></i>
                        </button>

                        <div class="mx-5 border-t border-[var(--line)]"></div>

                        <button class="action-btn flex min-h-[72px] w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--surface-2)]" data-action="openModal" data-modal="changePassword">
                            <span class="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand bs-text-lg">
                                <i class="fa-solid fa-lock"></i>
                            </span>
                            <span class="min-w-0 flex-1 font-semibold text-[var(--ink-900)] bs-text-base">修改密碼</span>
                            <i class="fa-solid fa-chevron-right ml-3 text-[var(--ink-300)] bs-text-sm"></i>
                        </button>
                    </section>

                    <!-- 家庭設定 -->
                    <section class="bs-card overflow-hidden">
                        <div class="p-5">
                            <h3 class="bs-section-title mb-3 flex items-center gap-3">
                                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand bs-text-lg">
                                    <i class="fa-solid fa-house-user"></i>
                                </span>
                                家庭邀請碼
                            </h3>
                            <div class="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                                <span class="block text-center font-bold tracking-[0.16em] text-[var(--ink-900)] bs-text-3xl">${state.calendarCode || '------'}</span>
                                <button class="action-btn bs-btn bs-btn-primary mt-3 w-full bs-text-sm" data-action="copyFamilyCode">
                                    <i class="fa-solid fa-copy"></i>複製
                                </button>
                            </div>
                            <p class="mt-2 text-center text-[var(--ink-300)] bs-text-xs">分享此碼給家人加入</p>
                        </div>

                        <div class="mx-5 border-t border-[var(--line)]"></div>

                        <button class="action-btn flex min-h-[72px] w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--surface-2)]" data-action="leaveFamily">
                            <span class="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-brand bs-text-lg">
                                <i class="fa-solid fa-people-arrows-left-right"></i>
                            </span>
                            <span class="min-w-0 flex-1">
                                <span class="block font-semibold text-[var(--ink-900)] bs-text-base">退出家庭</span>
                                <span class="block text-[var(--ink-500)] bs-text-xs">退出後可加入其他家庭</span>
                            </span>
                            <i class="fa-solid fa-chevron-right ml-3 text-[var(--ink-300)] bs-text-sm"></i>
                        </button>
                    </section>

                    <!-- 登出 -->
                    <section class="bs-card overflow-hidden">
                        <button class="action-btn flex min-h-[72px] w-full items-center px-5 py-4 text-left transition-colors hover:bg-[var(--surface-2)]" data-action="logout">
                            <span class="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--brand-red)] bs-text-lg">
                                <i class="fa-solid fa-right-from-bracket"></i>
                            </span>
                            <span class="min-w-0 flex-1 font-semibold text-[var(--brand-red)] bs-text-base">登出</span>
                            <i class="fa-solid fa-chevron-right ml-3 text-[var(--brand-red)] opacity-60 bs-text-sm"></i>
                        </button>
                    </section>
                </div>
            `;
        }
