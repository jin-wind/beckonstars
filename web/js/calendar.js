
        function getDailyEncouragement(dateStr) {
            const seed = String(dateStr || new Date().toISOString().slice(0, 10));
            let hash = 0;
            for (let i = 0; i < seed.length; i++) hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
            return familyEncouragementMessages[hash % familyEncouragementMessages.length];
        }


        function getDisplayedDateKey(year = state.calendarYear, month = state.calendarMonth, day = state.calendarDay || today.getDate()) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }


        function getShiftedCalendarDate(year, month, day, offset) {
            const date = new Date(year, month - 1, day + offset);
            return {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate()
            };
        }


        function prefetchDailyCard(dateStr) {
            const key = dateStr || 'today';
            if (state.dailyCardMode === 'bible') {
                if (bibleVerseCache[key] || bibleVerseRequests[key]) return bibleVerseCache[key] || bibleVerseRequests[key];
                const request = fetchDailyBibleVerse(dateStr);
                request.then(result => { if (result) updateCalendarContent(); });
                return request;
            }
            return Promise.resolve({
                ok: true,
                text: getDailyEncouragement(key),
                source: 'family-encouragement'
            });
        }


        function prefetchDailyCardWindow(year = state.calendarYear, month = state.calendarMonth, day = state.calendarDay || today.getDate()) {
            return [-1, 0, 1].map(offset => {
                const shifted = getShiftedCalendarDate(year, month, day, offset);
                return prefetchDailyCard(getDisplayedDateKey(shifted.year, shifted.month, shifted.day));
            });
        }


        // 日曆視圖
        function renderCalendar() {
            let visibleMemories = state.memories;
            if (state.role === 'child') {
                visibleMemories = state.memories.filter(m => m.childId === 'child_1');
            }

            return `
                <div class="p-5 space-y-4" id="calendarContent">
                    <div class="flex bg-gray-200 gap-1 rounded-full p-1" style="background: var(--surface-2);">
                        <button class="action-btn flex-1 py-2.5 rounded-full font-bold bs-text-sm transition-all ${state.calendarMode === 'tear-off' ? 'bg-white text-brand-dark shadow-sm' : 'text-[var(--ink-500)]'}" data-action="switchCalendar" data-mode="tear-off">
                            <i class="fa-solid fa-scroll mr-1.5"></i>手撕日曆
                        </button>
                        <button class="action-btn flex-1 py-2.5 rounded-full font-bold bs-text-sm transition-all ${state.calendarMode === 'monthly' ? 'bg-white text-brand-dark shadow-sm' : 'text-[var(--ink-500)]'}" data-action="switchCalendar" data-mode="monthly">
                            <i class="fa-solid fa-table-cells mr-1.5"></i>現時月曆
                        </button>
                    </div>

                    ${state.calendarMode === 'tear-off' ? renderTearOffCalendar(visibleMemories) : renderMonthlyCalendar(visibleMemories)}

                    <button class="action-btn bs-btn bs-btn-secondary w-full" data-action="openModal" data-modal="weeklySummary">
                        <i class="fa-solid fa-wand-magic-sparkles text-brand"></i>生成家庭回憶摘要
                    </button>

                    <button class="action-btn bs-btn bs-btn-primary w-full" data-action="openModal" data-modal="addMemory">
                        <i class="fa-solid fa-plus-circle"></i>記錄今日回憶
                    </button>
                </div>
            `;
        }


        let calendarMotionLocked = false;

        let pendingCalendarContentUpdate = false;


        // 只更新日曆容器（不重建整個 DOM，避免閃爍）
        function updateCalendarContent() {
            if (calendarMotionLocked) {
                pendingCalendarContentUpdate = true;
                return;
            }

            let visibleMemories = state.memories;
            if (state.role === 'child') {
                visibleMemories = state.memories.filter(m => m.childId === 'child_1');
            }
            const calendarEl = document.getElementById('calendarContent');
            if (!calendarEl) return;

            // 保留切換按鈕和底部按鈕，只替換中間的日曆內容
            const tmp = document.createElement('div');
            tmp.innerHTML = state.calendarMode === 'tear-off'
                ? renderTearOffCalendar(visibleMemories)
                : renderMonthlyCalendar(visibleMemories);
            const newCalendar = tmp.firstElementChild;

            // 找到現有的日曆容器（切換按鈕之後的第一個子元素）
            const switcher = calendarEl.querySelector('.flex.bg-gray-200');
            if (switcher && switcher.nextElementSibling) {
                // 如果現有元素有 calendarPageContainer，保留其動畫狀態
                const oldContainer = switcher.nextElementSibling;
                calendarEl.replaceChild(newCalendar, oldContainer);
            }

            // 重新綁定日曆區塊的事件
            calendarEl.querySelectorAll('.calendar-nav-btn').forEach(btn => {
                btn.addEventListener('click', event => {
                    event.stopPropagation();
                    navigateCalendarMonth(parseInt(btn.getAttribute('data-calendar-dir')));
                });
            });
            setupCalendarSwipe();
        }


        // 手撕日曆 - 產生某一天的頁面 HTML（不含容器）
        function tearOffPageHtml(displayDay, displayYear, displayMonth, memories) {
            const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
            const displayDate = new Date(displayYear, displayMonth - 1, displayDay);
            const isCurrentMonth = displayYear === today.getFullYear() && displayMonth === today.getMonth() + 1;
            const isToday = isCurrentMonth && displayDay === today.getDate();
            const dayMemories = memories.filter(m => m.date === displayDay && m.month === displayMonth);
            const dateKey = getDisplayedDateKey(displayYear, displayMonth, displayDay);
            const bibleVerse = bibleVerseCache[dateKey] || null;
            const hasBibleVerse = bibleVerse && bibleVerse.ok;

            // 日曆副標題顯示
            let subDateDisplay = '';
            if (state.dailyCardMode === 'bible') {
                subDateDisplay = `<p class="bs-text-xs text-gray-400 mt-1">${isToday ? '今日' : `${displayMonth}月${displayDay}日`} · 聖經金句</p>`;
            } else {
                subDateDisplay = `<p class="bs-text-xs text-gray-400 mt-1">${isToday ? '今日' : `${displayMonth}月${displayDay}日`} · 家庭小提醒</p>`;
            }

            let dailyCardHtml = '';
            if (state.dailyCardMode === 'bible') {
                if (hasBibleVerse) {
                    dailyCardHtml = `
                        <div class="bg-[#FFF8F0] border border-amber-200 rounded-xl p-4 pb-7 shadow-sm inline-block text-left relative max-w-full">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="bg-amber-100 text-amber-700 px-2 py-1 rounded bs-text-sm font-bold">${isToday ? '今日金句' : '金句'}</span>
                                <span class="text-gray-500 bs-text-xs font-medium">${escapeHtml(bibleVerse.reference || '')}</span>
                            </div>
                            <p class="text-gray-700 font-medium leading-relaxed">${escapeHtml(bibleVerse.text || '')}</p>
                            <p class="absolute right-3 bottom-2 text-[3px] text-gray-400 tracking-wide uppercase">FROM ${escapeHtml(bibleVerse.source || '信望愛站聖經')}</p>
                        </div>
                    `;
                }
            } else {
                const encouragement = getDailyEncouragement(dateKey);
                dailyCardHtml = `
                    <div class="bg-[#FFF8F0] border border-orange-200 rounded-xl p-4 shadow-sm inline-block text-left relative max-w-full">
                        <div class="flex items-start gap-2">
                            <span class="bg-orange-100 text-brand-dark px-2 py-1 rounded bs-text-sm font-bold shrink-0">${isToday ? '今日適宜' : '適宜'}</span>
                            <span class="text-gray-700 font-medium leading-relaxed">${escapeHtml(encouragement.replace(/^今日適宜/, '').trim())}</span>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="p-8 text-center relative tear-off-bg">
                    <h3 class="bs-text-2xl font-medium text-gray-500 mb-2">${dayNames[displayDate.getDay()]}</h3>
                    <h1 class="text-8xl font-bold text-gray-800 mb-2 font-serif">${displayDay}</h1>
                    ${subDateDisplay}
                    <div class="mt-4">${dailyCardHtml}</div>
                </div>
                ${dayMemories.length > 0 ? `
                    <div class="bg-orange-50 p-4 border-t border-orange-100">
                        <p class="bs-text-sm font-bold text-brand-dark mb-2"><i class="fa-solid fa-heart"></i> ${displayDay}日已有 ${dayMemories.length} 個回憶</p>
                        <div class="flex gap-2 overflow-x-auto no-scrollbar">
                            ${dayMemories.map(m => {
                                const memoryImageSrc = getMemoryImageSrc(m, true);
                                const memoryAudioSrc = getMemoryAudioSrc(m);
                                return `
                                    <div class="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden ${memoryImageSrc ? '' : memoryAudioSrc ? 'bg-gradient-to-br from-purple-100 to-purple-50 border border-purple-200' : 'bg-white border border-orange-200'}">
                                        ${memoryImageSrc ? `<img src="${escapeAttribute(memoryImageSrc)}" class="w-full h-full object-cover">` : memoryAudioSrc ? `
                                            <div class="flex items-end justify-center gap-0.5 h-6">
                                                <div class="w-1 bg-purple-400 rounded-full" style="height: 40%;"></div>
                                                <div class="w-1 bg-purple-500 rounded-full" style="height: 70%;"></div>
                                                <div class="w-1 bg-purple-600 rounded-full" style="height: 100%;"></div>
                                                <div class="w-1 bg-purple-500 rounded-full" style="height: 60%;"></div>
                                                <div class="w-1 bg-purple-400 rounded-full" style="height: 35%;"></div>
                                            </div>
                                        ` : `<i class="fa-solid fa-font text-gray-400 bs-text-xl"></i>`}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            `;
        }


        // 手撕日曆
        function renderTearOffCalendar(memories) {
            const daysInMonth = new Date(state.calendarYear, state.calendarMonth, 0).getDate();
            const displayDay = Math.min(state.calendarDay || today.getDate(), daysInMonth);
            const isCurrentMonth = state.calendarYear === today.getFullYear() && state.calendarMonth === today.getMonth() + 1;
            const prevDate = getShiftedCalendarDate(state.calendarYear, state.calendarMonth, displayDay, -1);
            const nextDate = getShiftedCalendarDate(state.calendarYear, state.calendarMonth, displayDay, 1);
            prefetchDailyCardWindow(state.calendarYear, state.calendarMonth, displayDay);

            return `
                <div class="bg-white rounded-3xl shadow-xl overflow-hidden border-2 border-gray-100 relative" id="tearOffCalendar">
                    <div class="bg-brand-red text-white py-3 px-6 flex justify-between items-center">
                        <button class="calendar-nav-btn text-white/80 hover:text-white bs-text-lg px-2" data-calendar-dir="-1"><i class="fa-solid fa-chevron-left"></i></button>
                        <span class="bs-text-xl font-bold">${state.calendarYear}年 ${state.calendarMonth}月</span>
                        <button class="calendar-nav-btn text-white/80 hover:text-white bs-text-lg px-2" data-calendar-dir="1"><i class="fa-solid fa-chevron-right"></i></button>
                    </div>

                    <div class="calendar-page-container overflow-hidden relative" id="calendarPageContainer">
                        <div class="calendar-page calendar-page-adjacent" data-calendar-preview="-1" aria-hidden="true" style="transform: translate3d(-100%, 0, 0);">
                            ${tearOffPageHtml(prevDate.day, prevDate.year, prevDate.month, memories)}
                        </div>
                        <div class="calendar-page" id="calendarPage">
                            ${tearOffPageHtml(displayDay, state.calendarYear, state.calendarMonth, memories)}
                        </div>
                        <div class="calendar-page calendar-page-adjacent" data-calendar-preview="1" aria-hidden="true" style="transform: translate3d(100%, 0, 0);">
                            ${tearOffPageHtml(nextDate.day, nextDate.year, nextDate.month, memories)}
                        </div>
                    </div>
                </div>
            `;
        }


        // 月曆 - 產生某個月的頁面 HTML（不含容器）
        function monthlyPageHtml(calYear, calMonth, memories) {
            const daysInMonth = new Date(calYear, calMonth, 0).getDate();
            const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
            const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth() + 1;
            const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

            let gridHtml = dayNames.map(d => `<div class="text-center bs-text-sm font-bold text-gray-400 py-2">${d}</div>`).join('');
            for (let i = 0; i < firstDay; i++) gridHtml += `<div></div>`;
            for (let i = 1; i <= daysInMonth; i++) {
                const isToday = isCurrentMonth && i === today.getDate();
                const dayMemories = memories.filter(m => m.date === i && m.month === calMonth);
                const hasMemory = dayMemories.length > 0;
                gridHtml += `
                    <div class="aspect-square flex items-center justify-center p-1 relative">
                        <button class="action-btn w-full h-full rounded-xl flex items-center justify-center font-medium bs-text-lg transition-all ${isToday ? 'bg-brand text-white shadow-md' : 'bg-gray-50 text-gray-700 hover:bg-orange-100'} ${hasMemory && !isToday ? 'border-2 border-brand-light' : ''}"
                                ${hasMemory ? `data-action="viewMemories" data-date="${i}" data-month="${calMonth}"` : ''}>
                            ${i}
                        </button>
                        ${hasMemory ? `<div class="absolute top-2 right-2 w-2 h-2 bg-brand-red rounded-full shadow-sm"></div>` : ''}
                    </div>
                `;
            }

            return `
                <div class="flex justify-between items-center mb-4">
                    <button class="calendar-nav-btn text-gray-400 hover:text-brand transition-colors p-2" data-calendar-dir="-1"><i class="fa-solid fa-chevron-left"></i></button>
                    <h3 class="bs-text-xl font-bold text-gray-800">${calYear}年 ${calMonth}月</h3>
                    <button class="calendar-nav-btn text-gray-400 hover:text-brand transition-colors p-2" data-calendar-dir="1"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
                <div class="grid grid-cols-7 gap-2 mb-6">
                    ${gridHtml}
                </div>
            `;
        }


        // 月曆
        function renderMonthlyCalendar(memories) {
            const calYear = state.calendarYear;
            const calMonth = state.calendarMonth;
            const prevMonth = getShiftedCalendarMonth(calYear, calMonth, -1);
            const nextMonth = getShiftedCalendarMonth(calYear, calMonth, 1);

            return `
                <div class="bg-white rounded-3xl shadow-lg p-5 border border-gray-100 relative" id="monthlyCalendar">
                    <div class="calendar-page-container overflow-hidden relative" id="calendarPageContainer">
                        <div class="calendar-page calendar-page-adjacent" data-calendar-preview="-1" aria-hidden="true" style="transform: translate3d(-100%, 0, 0);">
                            ${monthlyPageHtml(prevMonth.year, prevMonth.month, memories)}
                        </div>
                        <div class="calendar-page" id="calendarPage">
                            ${monthlyPageHtml(calYear, calMonth, memories)}
                        </div>
                        <div class="calendar-page calendar-page-adjacent" data-calendar-preview="1" aria-hidden="true" style="transform: translate3d(100%, 0, 0);">
                            ${monthlyPageHtml(nextMonth.year, nextMonth.month, memories)}
                        </div>
                    </div>

                    <button class="action-btn w-full bg-gradient-to-r from-orange-400 to-brand-dark text-white rounded-xl p-4 flex items-center justify-between shadow-md mt-4" data-action="openModal" data-modal="videoPlayer">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center mr-3 backdrop-blur-sm">
                                <i class="fa-solid fa-play text-white"></i>
                            </div>
                            <div class="text-left">
                                <p class="font-bold bs-text-lg">本月回憶影片</p>
                                <p class="bs-text-xs text-orange-100">為您集合這個月的溫暖時刻</p>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-white/70"></i>
                    </button>
                </div>
            `;
        }


        // --- 日曆導航 ---
        function getVisibleCalendarMemories() {
            let visibleMemories = state.memories;
            if (state.role === 'child') visibleMemories = visibleMemories.filter(m => m.childId === 'child_1');
            return visibleMemories;
        }


        function getShiftedCalendarMonth(year, month, dir) {
            let nextMonth = month + dir;
            let nextYear = year;
            if (nextMonth > 12) { nextMonth = 1; nextYear++; }
            else if (nextMonth < 1) { nextMonth = 12; nextYear--; }
            return { year: nextYear, month: nextMonth };
        }


        function getCalendarMonthTarget(dir) {
            const mode = state.calendarMode;
            const shifted = getShiftedCalendarMonth(state.calendarYear, state.calendarMonth, dir);
            const maxDay = new Date(shifted.year, shifted.month, 0).getDate();
            const targetDay = Math.min(state.calendarDay || today.getDate(), maxDay);
            const visibleMemories = getVisibleCalendarMemories();
            const html = mode === 'tear-off'
                ? tearOffPageHtml(targetDay, shifted.year, shifted.month, visibleMemories)
                : monthlyPageHtml(shifted.year, shifted.month, visibleMemories);

            return {
                html,
                dateKey: mode === 'tear-off' ? getDisplayedDateKey(shifted.year, shifted.month, targetDay) : null,
                year: mode === 'tear-off' ? shifted.year : null,
                month: mode === 'tear-off' ? shifted.month : null,
                day: mode === 'tear-off' ? targetDay : null,
                apply() {
                    state.calendarMonth = shifted.month;
                    state.calendarYear = shifted.year;
                    if (mode === 'tear-off') {
                        if (state.calendarDay) state.calendarDay = Math.min(state.calendarDay, maxDay);
                    } else {
                        state.calendarDay = null;
                    }
                }
            };
        }


        function getCalendarSwipeTarget(dir) {
            const mode = state.calendarMode;
            const visibleMemories = getVisibleCalendarMemories();

            if (mode === 'tear-off') {
                const shifted = getShiftedCalendarDate(state.calendarYear, state.calendarMonth, state.calendarDay || today.getDate(), dir);

                return {
                    html: tearOffPageHtml(shifted.day, shifted.year, shifted.month, visibleMemories),
                    dateKey: getDisplayedDateKey(shifted.year, shifted.month, shifted.day),
                    year: shifted.year,
                    month: shifted.month,
                    day: shifted.day,
                    apply() {
                        state.calendarDay = shifted.day;
                        state.calendarMonth = shifted.month;
                        state.calendarYear = shifted.year;
                    }
                };
            }

            const shifted = getShiftedCalendarMonth(state.calendarYear, state.calendarMonth, dir);
            return {
                html: monthlyPageHtml(shifted.year, shifted.month, visibleMemories),
                dateKey: null,
                apply() {
                    state.calendarMonth = shifted.month;
                    state.calendarYear = shifted.year;
                    state.calendarDay = null;
                }
            };
        }


        function getCalendarMotionTarget(dir, intent) {
            return intent === 'month' ? getCalendarMonthTarget(dir) : getCalendarSwipeTarget(dir);
        }


        function prefetchCalendarTarget(target) {
            if (target?.dateKey && target.year && target.month && target.day) {
                prefetchDailyCardWindow(target.year, target.month, target.day);
            } else if (target?.dateKey) {
                prefetchDailyCard(target.dateKey);
            }
        }


        function createCalendarPageFromHtml(html) {
            const page = document.createElement('div');
            page.className = 'calendar-page';
            page.innerHTML = html;
            return page;
        }


        function setCalendarMotionTransition(motion, transition) {
            [motion.prevPage, motion.currentPage, motion.nextPage].forEach(page => {
                if (page) page.style.transition = transition;
            });
        }


        function setCalendarMotionX(motion, x) {
            motion.currentX = x;
            motion.currentPage.style.transform = `translate3d(${x}px, 0, 0)`;
            motion.prevPage.style.transform = `translate3d(${x - motion.width}px, 0, 0)`;
            motion.nextPage.style.transform = `translate3d(${x + motion.width}px, 0, 0)`;
        }


        function getBoundedCalendarDragDelta(delta, width) {
            const limit = width * 1.05;
            const abs = Math.abs(delta);
            if (abs <= limit) return delta;
            return Math.sign(delta) * (limit + (abs - limit) * 0.18);
        }


        function beginCalendarMotion(container, currentPage, intent) {
            if (calendarMotionLocked) return null;
            const width = container.getBoundingClientRect().width || container.offsetWidth;
            if (!width) return null;

            const prevTarget = getCalendarMotionTarget(-1, intent);
            const nextTarget = getCalendarMotionTarget(1, intent);
            const height = container.getBoundingClientRect().height || currentPage.getBoundingClientRect().height;
            let prevPage = container.querySelector('[data-calendar-preview="-1"]');
            let nextPage = container.querySelector('[data-calendar-preview="1"]');
            if (!prevPage) prevPage = createCalendarPageFromHtml(prevTarget.html);
            if (!nextPage) nextPage = createCalendarPageFromHtml(nextTarget.html);

            calendarMotionLocked = true;
            pendingCalendarContentUpdate = false;

            container.classList.add('is-calendar-motion');
            if (height) container.style.height = `${Math.ceil(height)}px`;
            currentPage.style.position = 'relative';
            currentPage.style.zIndex = '2';
            currentPage.style.transition = 'none';
            currentPage.style.transform = 'translate3d(0, 0, 0)';
            prevPage.classList.add('calendar-page-adjacent');
            nextPage.classList.add('calendar-page-adjacent');
            prevPage.setAttribute('aria-hidden', 'true');
            nextPage.setAttribute('aria-hidden', 'true');
            prevPage.style.zIndex = '1';
            nextPage.style.zIndex = '1';

            if (!prevPage.parentElement) container.appendChild(prevPage);
            if (!nextPage.parentElement) container.appendChild(nextPage);

            const motion = { container, width, baseX: 0, currentX: 0, currentPage, prevPage, nextPage, prevTarget, nextTarget };
            setCalendarMotionX(motion, 0);
            return motion;
        }


        function releaseCalendarMotion(renderLatest = true) {
            const shouldUpdate = renderLatest || pendingCalendarContentUpdate;
            calendarMotionLocked = false;
            pendingCalendarContentUpdate = false;
            if (shouldUpdate) updateCalendarContent();
        }


        function animateCalendarMotion(motion, toX, duration, onDone) {
            const currentPage = motion?.currentPage;
            if (!currentPage) {
                onDone?.();
                return;
            }

            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                currentPage.removeEventListener('transitionend', handleTransitionEnd);
                onDone?.();
            };
            const handleTransitionEnd = event => {
                if (event.target === currentPage && event.propertyName === 'transform') finish();
            };
            const timer = setTimeout(finish, duration + 90);

            currentPage.addEventListener('transitionend', handleTransitionEnd);
            [motion.prevPage, motion.currentPage, motion.nextPage].forEach(page => page?.classList.add('is-animating'));
            setCalendarMotionTransition(motion, `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`);
            requestAnimationFrame(() => setCalendarMotionX(motion, toX));
        }


        function completeCalendarMotion(motion, dir) {
            const target = dir > 0 ? motion?.nextTarget : motion?.prevTarget;
            if (!motion || !target) {
                releaseCalendarMotion(true);
                return;
            }

            prefetchCalendarTarget(target);
            const finalX = motion.baseX - dir * motion.width;
            const currentX = Number.isFinite(motion.currentX) ? motion.currentX : motion.baseX;
            const distance = Math.abs(finalX - currentX);
            const duration = Math.max(180, Math.min(360, Math.round(150 + (distance / motion.width) * 210)));

            animateCalendarMotion(motion, finalX, duration, () => {
                target.apply();
                releaseCalendarMotion(true);
            });
        }


        function cancelCalendarMotion(motion) {
            if (!motion) {
                releaseCalendarMotion(true);
                return;
            }

            const currentX = Number.isFinite(motion.currentX) ? motion.currentX : motion.baseX;
            const distance = Math.abs(motion.baseX - currentX);
            const duration = Math.max(160, Math.min(280, Math.round(120 + (distance / motion.width) * 180)));

            animateCalendarMotion(motion, motion.baseX, duration, () => releaseCalendarMotion(true));
        }


        // 箭頭按鈕：切換月份
        function navigateCalendarMonth(dir) {
            const container = document.getElementById('calendarPageContainer');
            const page = document.getElementById('calendarPage');
            if (!container || !page) {
                changeCalendarMonth(dir);
                return;
            }

            const motion = beginCalendarMotion(container, page, 'month');
            if (!motion) return;
            completeCalendarMotion(motion, dir);
        }


        // 滑動：切換日期（手撕）或月份（月曆）
        function navigateCalendarSwipe(dir) {
            const container = document.getElementById('calendarPageContainer');
            const page = document.getElementById('calendarPage');
            if (!container || !page) {
                if (state.calendarMode === 'tear-off') changeCalendarDay(dir);
                else changeCalendarMonth(dir);
                return;
            }

            const motion = beginCalendarMotion(container, page, 'swipe');
            if (!motion) return;
            completeCalendarMotion(motion, dir);
        }


        function changeCalendarDay(dir) {
            const daysInMonth = new Date(state.calendarYear, state.calendarMonth, 0).getDate();
            state.calendarDay = (state.calendarDay || today.getDate()) + dir;
            if (state.calendarDay < 1) {
                state.calendarMonth--;
                if (state.calendarMonth < 1) { state.calendarMonth = 12; state.calendarYear--; }
                state.calendarDay = new Date(state.calendarYear, state.calendarMonth, 0).getDate();
            } else if (state.calendarDay > daysInMonth) {
                state.calendarMonth++;
                if (state.calendarMonth > 12) { state.calendarMonth = 1; state.calendarYear++; }
                state.calendarDay = 1;
            }
            prefetchDailyCardWindow(state.calendarYear, state.calendarMonth, state.calendarDay);
            updateCalendarContent();
        }


        function changeCalendarMonth(dir) {
            state.calendarMonth += dir;
            if (state.calendarMonth > 12) {
                state.calendarMonth = 1;
                state.calendarYear++;
            } else if (state.calendarMonth < 1) {
                state.calendarMonth = 12;
                state.calendarYear--;
            }
            state.calendarDay = null;
            if (state.calendarMode === 'tear-off') {
                const displayDay = Math.min(today.getDate(), new Date(state.calendarYear, state.calendarMonth, 0).getDate());
                prefetchDailyCardWindow(state.calendarYear, state.calendarMonth, displayDay);
            }
            updateCalendarContent();
        }


        function setupCalendarSwipe() {
            const container = document.getElementById('calendarPageContainer');
            if (!container) return;

            let startX = 0;
            let startY = 0;
            let dx = 0;
            let lastX = 0;
            let lastMoveAt = 0;
            let velocityX = 0;
            let isDragging = false;
            let isHorizontal = null;
            let hasMoved = false;
            let motion = null;
            let pendingX = null;
            let rafId = null;

            const cleanupDocumentSwipeListeners = () => {
                document.removeEventListener('touchmove', move, true);
                document.removeEventListener('touchend', finish, true);
                document.removeEventListener('touchcancel', cancel, true);
            };

            const applyDragX = () => {
                rafId = null;
                if (!motion || pendingX === null) return;
                setCalendarMotionTransition(motion, 'none');
                [motion.prevPage, motion.currentPage, motion.nextPage].forEach(page => page?.classList.remove('is-animating'));
                setCalendarMotionX(motion, pendingX);
                pendingX = null;
            };

            const scheduleDragX = x => {
                pendingX = x;
                if (!rafId) rafId = requestAnimationFrame(applyDragX);
            };

            const resetGesture = () => {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = null;
                pendingX = null;
                dx = 0;
                velocityX = 0;
                motion = null;
                isDragging = false;
                isHorizontal = null;
                hasMoved = false;
            };

            const start = event => {
                if (isDragging || calendarMotionLocked || event.touches.length !== 1) return;
                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
                lastX = startX;
                lastMoveAt = performance.now();
                dx = 0;
                velocityX = 0;
                isDragging = true;
                isHorizontal = null;
                hasMoved = false;
                motion = null;

                document.addEventListener('touchmove', move, { passive: false, capture: true });
                document.addEventListener('touchend', finish, true);
                document.addEventListener('touchcancel', cancel, true);
            };

            const move = event => {
                if (!isDragging) return;
                if (event.touches.length !== 1) {
                    cancel();
                    return;
                }

                const touchX = event.touches[0].clientX;
                const touchY = event.touches[0].clientY;
                const now = performance.now();
                const diffX = touchX - startX;
                const diffY = touchY - startY;

                if (isHorizontal === null) {
                    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
                        isHorizontal = Math.abs(diffX) > Math.abs(diffY);
                    }
                    if (!isHorizontal) {
                        isDragging = false;
                        cleanupDocumentSwipeListeners();
                        return;
                    }
                }

                if (!isHorizontal) return;

                event.preventDefault();
                dx = diffX;
                hasMoved = true;
                const elapsed = Math.max(1, now - lastMoveAt);
                velocityX = (touchX - lastX) / elapsed;
                lastX = touchX;
                lastMoveAt = now;

                if (!motion) {
                    const currentPage = document.getElementById('calendarPage');
                    motion = currentPage ? beginCalendarMotion(container, currentPage, 'swipe') : null;
                    if (!motion) {
                        resetGesture();
                        return;
                    }
                }

                const boundedDx = getBoundedCalendarDragDelta(dx, motion.width);
                scheduleDragX(motion.baseX + boundedDx);
            };

            const finish = () => {
                if (!isDragging) {
                    cleanupDocumentSwipeListeners();
                    return;
                }
                isDragging = false;
                cleanupDocumentSwipeListeners();

                if (rafId) {
                    cancelAnimationFrame(rafId);
                    applyDragX();
                }

                if (!hasMoved || !motion) {
                    resetGesture();
                    return;
                }

                const threshold = motion.width * 0.22;
                const velocityThreshold = 0.42;
                const absDx = Math.abs(dx);
                const projectedDx = dx + velocityX * 180;

                if (absDx > threshold || Math.abs(velocityX) > velocityThreshold || Math.abs(projectedDx) > threshold) {
                    const commitDx = absDx > threshold ? dx : projectedDx;
                    const dir = commitDx > 0 ? -1 : 1;
                    const finishingMotion = motion;
                    resetGesture();
                    completeCalendarMotion(finishingMotion, dir);
                } else {
                    const cancellingMotion = motion;
                    resetGesture();
                    cancelCalendarMotion(cancellingMotion);
                }
            };

            const cancel = () => {
                const cancellingMotion = motion;
                cleanupDocumentSwipeListeners();
                resetGesture();
                if (cancellingMotion) cancelCalendarMotion(cancellingMotion);
            };

            container.addEventListener('touchstart', start, { passive: true });
        }
