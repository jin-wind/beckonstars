
        function getMessageImageSrc(message) {
            return resolveMediaUrl(message?.thumbnailUrl || message?.imgUrl || message?.img || '');
        }


        function getMessageAudioSrc(message) {
            return resolveMediaUrl(message?.audioUrl || message?.audio || '');
        }


        function getChatMessagesContainer() {
            return document.getElementById('chatMessages');
        }


        function readChatScrollSnapshot() {
            const container = getChatMessagesContainer();
            if (!container) return null;
            const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
            return {
                scrollTop: container.scrollTop,
                distanceToBottom,
                atBottom: distanceToBottom <= 48
            };
        }


        function applyChatScrollAfterRender(previousSnapshot) {
            if (state.currentTab !== 'chat') {
                lastRenderedMessageCount = state.messages.length;
                shouldStickChatToBottom = false;
                return;
            }

            const container = getChatMessagesContainer();
            if (!container) return;

            const shouldAutoScroll = shouldStickChatToBottom || !previousSnapshot || previousSnapshot.atBottom;

            if (shouldAutoScroll) {
                container.scrollTop = container.scrollHeight;
            } else {
                const nextTop = container.scrollHeight - container.clientHeight - (previousSnapshot.distanceToBottom || 0);
                container.scrollTop = Math.max(0, nextTop);
            }

            lastRenderedMessageCount = state.messages.length;
            shouldStickChatToBottom = false;
        }


        function restoreChatInputFocusAfterRender() {
            // 已移除：避免發送訊息後強制聚焦導致 Android 手機虛擬鍵盤自動彈出
            shouldRestoreChatInputFocus = false;
        }


        function renderVoicePlayer(message, isMe) {
            const messageId = String(message.id);
            const audioSource = getMessageAudioSrc(message);
            const isActive = voicePlayback.messageId === messageId;
            const duration = isActive && voicePlayback.duration ? voicePlayback.duration : getVoiceDurationSeconds(message);
            const currentTime = isActive ? voicePlayback.currentTime : 0;
            const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
            const isPlaying = isActive && voicePlayback.isPlaying;
            const trackClass = isMe ? 'bg-white/50' : 'bg-[var(--surface-3)]';
            const fillClass = 'bg-[var(--brand-600)]';
            const buttonClass = isMe
                ? 'bg-white text-[var(--brand-700)] shadow-sm'
                : 'bg-[var(--surface-2)] text-[var(--brand-700)] ring-1 ring-inset ring-[var(--line)]';
            const timeClass = isMe ? 'text-white/80' : 'text-[var(--ink-500)]';

            if (!audioSource) {
                return `
                    <div class="flex min-w-48 items-center gap-3 rounded-2xl ${isMe ? 'bg-white/10' : 'bg-[var(--surface-2)]'} px-3 py-2.5">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isMe ? 'bg-white/20 text-white' : 'bg-[var(--brand-100)] text-[var(--brand-700)]'}">
                            <i class="fa-solid fa-microphone"></i>
                        </div>
                        <p class="bs-text-sm font-medium opacity-80">錄音檔未同步</p>
                    </div>
                `;
            }

            return `
                <div class="voice-player flex w-full items-center gap-2.5 py-0.5" data-message-id="${escapeAttribute(messageId)}" data-duration="${duration}">
                    <button type="button" class="action-btn voice-play-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${buttonClass} transition-transform active:scale-95" data-action="toggleVoice" data-message-id="${escapeAttribute(messageId)}" title="${isPlaying ? '暫停錄音' : '播放錄音'}">
                        <i class="fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} voice-play-icon bs-text-sm"></i>
                    </button>
                    <button type="button" class="voice-seek-bar flex h-9 min-w-24 flex-1 items-center" data-message-id="${escapeAttribute(messageId)}" title="調整播放位置">
                        <span class="relative block h-2.5 w-full overflow-hidden rounded-full ${trackClass}">
                            <span class="voice-progress-fill absolute inset-y-0 left-0 rounded-full ${fillClass} shadow-[0_0_8px_rgba(240,122,46,0.35)]" style="width: ${progress}%;"></span>
                        </span>
                    </button>
                    <span class="voice-time flex shrink-0 items-center gap-0.5 tabular-nums ${timeClass} bs-text-xs">
                        <span class="voice-current">${formatVoiceTime(currentTime)}</span>
                        <span class="opacity-50">/</span>
                        <span class="voice-duration">${formatVoiceTime(duration)}</span>
                    </span>
                </div>
            `;
        }


        function syncVoicePlayerUi() {
            document.querySelectorAll('.voice-player').forEach(player => {
                const messageId = String(player.getAttribute('data-message-id') || '');
                const isActive = voicePlayback.messageId === messageId;
                const duration = isActive && voicePlayback.duration
                    ? voicePlayback.duration
                    : Number(player.getAttribute('data-duration')) || 0;
                const currentTime = isActive ? voicePlayback.currentTime : 0;
                const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
                const isPlaying = isActive && voicePlayback.isPlaying;

                const icon = player.querySelector('.voice-play-icon');
                if (icon) icon.className = `fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} voice-play-icon bs-text-sm`;

                const playButton = player.querySelector('.voice-play-button');
                if (playButton) playButton.title = isPlaying ? '暫停錄音' : '播放錄音';

                const fill = player.querySelector('.voice-progress-fill');
                if (fill) fill.style.width = `${progress}%`;

                const current = player.querySelector('.voice-current');
                if (current) current.textContent = formatVoiceTime(currentTime);

                const total = player.querySelector('.voice-duration');
                if (total) total.textContent = formatVoiceTime(duration);
            });
        }


        async function toggleVoiceMessage(messageId) {
            const id = String(messageId || '');
            const message = state.messages.find(item => String(item.id) === id);
            const audioSource = getMessageAudioSrc(message);
            if (!audioSource) {
                showMessage('錄音檔未同步，暫時不能播放。');
                return;
            }

            const audio = getVoiceAudio();
            if (voicePlayback.messageId === id && !audio.paused) {
                audio.pause();
                return;
            }

            if (voicePlayback.messageId !== id) {
                audio.pause();
                voicePlayback.messageId = id;
                voicePlayback.duration = getVoiceDurationSeconds(message);
                voicePlayback.currentTime = 0;
                audio.src = audioSource;
                try {
                    audio.currentTime = 0;
                } catch (error) {}
            }

            try {
                await audio.play();
            } catch (error) {
                console.warn('Voice playback failed', error);
                voicePlayback.isPlaying = false;
                syncVoicePlayerUi();
                showMessage('錄音播放失敗，請稍後再試。');
            }
        }


        function seekVoiceMessage(messageId, ratio) {
            const id = String(messageId || '');
            const message = state.messages.find(item => String(item.id) === id);
            const audioSource = getMessageAudioSrc(message);
            if (!audioSource) return;

            const audio = getVoiceAudio();
            if (voicePlayback.messageId !== id) {
                audio.pause();
                voicePlayback.messageId = id;
                voicePlayback.duration = getVoiceDurationSeconds(message);
                voicePlayback.currentTime = 0;
                audio.src = audioSource;
            }

            const duration = voicePlayback.duration || getVoiceDurationSeconds(message);
            if (!duration) return;

            const nextTime = Math.min(duration, Math.max(0, duration * ratio));
            try {
                audio.currentTime = nextTime;
            } catch (error) {}
            voicePlayback.currentTime = nextTime;
            syncVoicePlayerUi();
        }


        function getDailyBibleVerseTarget(dateStr) {
            const verses = [
                { chineses: '約', bid: 43, chapter: 3, verse: 16, reference: '約翰福音 3:16' },
                { chineses: '詩', bid: 19, chapter: 23, verse: 1, reference: '詩篇 23:1' },
                { chineses: '羅', bid: 45, chapter: 12, verse: 12, reference: '羅馬書 12:12' },
                { chineses: '腓', bid: 50, chapter: 4, verse: 6, reference: '腓立比書 4:6' },
                { chineses: '賽', bid: 23, chapter: 41, verse: 10, reference: '以賽亞書 41:10' },
                { chineses: '箴', bid: 20, chapter: 3, verse: 5, reference: '箴言 3:5' },
                { chineses: '太', bid: 40, chapter: 5, verse: 9, reference: '馬太福音 5:9' }
            ];
            const seed = String(dateStr || new Date().toISOString().slice(0, 10));
            let hash = 0;
            for (let i = 0; i < seed.length; i++) hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
            return verses[hash % verses.length];
        }


        async function fetchFhlBibleVerse(dateStr) {
            const target = getDailyBibleVerseTarget(dateStr);
            const params = new URLSearchParams({
                chineses: target.chineses,
                chap: String(target.chapter),
                sec: String(target.verse),
                version: 'unv',
                gb: '0'
            });
            const sourceUrl = `https://bible.fhl.net/json/qb.php?${params.toString()}`;
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error(`fhl-${response.status}`);
            const data = await response.json();
            const record = data.record && data.record[0];
            if (data.status !== 'success' || !record || !record.bible_text) throw new Error('fhl-empty-verse');
            return {
                ok: true,
                translation: data.version || 'unv',
                versionName: data.v_name || 'FHL和合本',
                book: target.bid,
                chapter: record.chap || target.chapter,
                verse: record.sec || target.verse,
                reference: `${target.reference}`,
                text: String(record.bible_text || '').replace(/\s+/g, ' ').trim(),
                source: '信望愛站聖經',
                sourceUrl
            };
        }


        async function fetchBollsLifeBibleVerse() {
            const response = await fetch('https://bolls.life/get-random-verse/CUV/');
            if (!response.ok) throw new Error(`bolls-${response.status}`);
            const verse = await response.json();
            return {
                ok: true,
                translation: verse.translation || 'CUV',
                book: verse.book,
                chapter: verse.chapter,
                verse: verse.verse,
                reference: `CUV ${verse.book}:${verse.chapter}:${verse.verse}`,
                text: String(verse.text || '').replace(/\s+/g, ' ').trim(),
                source: 'Bolls Life Bible API',
                sourceUrl: 'https://bolls.life/get-random-verse/CUV/'
            };
        }


        async function fetchDailyBibleVerse(dateStr) {
            return fetchCachedDateResource(dateStr, bibleVerseCache, bibleVerseRequests, async () => {
                try {
                    return await fetchFhlBibleVerse(dateStr);
                } catch (e) {
                    console.warn('FHL Bible verse fetch failed, falling back to Bolls Life', e);
                    try {
                        return await fetchBollsLifeBibleVerse();
                    } catch (fallbackError) {
                        console.warn('Bible verse fallback fetch failed', fallbackError);
                        return { ok: false, error: 'bible-verse-unavailable', source: '信望愛站聖經' };
                    }
                }
            });
        }


        async function refreshServerMessages(familyId) {
            const result = await serverApi(`/api/families/${encodeURIComponent(familyId)}/messages`);
            const rewardUpdate = updateDailyMessageRewardStatus(result?.rewards?.dailyMessageFrame);
            const incoming = (result.messages || []).map(message => normalizeCloudMessage(message.id, message));

            // Opt-in diagnostic logging for voice transcript sync.
            const debugVoiceMessages = localStorage.getItem('beckonDebugVoiceMessages') === 'true';
            const audioMessages = debugVoiceMessages ? incoming.filter(m => m.type === 'audio') : [];
            if (debugVoiceMessages && audioMessages.length > 0) {
                console.log(`[debug] 前端收到 ${audioMessages.length} 條語音消息`);
                audioMessages.forEach(m => {
                    console.log(`  - 消息 ${m.id}: transcript="${m.transcript || '(empty)'}"`);
                });
            }

            const knownIds = new Set(state.messages.map(message => String(message.id)));
            if (hasLoadedCloudMessages) {
                incoming.forEach(message => {
                    if (!knownIds.has(String(message.id)) && message.senderId !== state.authUid && document.hidden) {
                        showLocalNotification(`星喚：${message.senderName}`, message.content || '你有新的家庭訊息');
                    }
                });
            }
            const changed = incoming.length !== state.messages.length || incoming.some((message, index) => {
                const current = state.messages[index];
                return !current
                    || String(message.id) !== String(current.id)
                    || getMessageRenderKey(message) !== getMessageRenderKey(current);
            });
            if (changed) state.messages = incoming;
            const wasInitialSync = !hasLoadedCloudMessages;
            hasLoadedCloudMessages = true;
            if (state.appReady && maybeShowDailyRewardCelebration(rewardUpdate, { skipIfInitialSync: wasInitialSync })) {
                render();
                return;
            }
            if (rewardUpdate.activeChanged && state.appReady) {
                render();
                return;
            }
            if (changed) refreshVisibleContent();
        }


        function subscribeFamilyMessages(familyId) {
            if (unsubscribeMessages) unsubscribeMessages();
            refreshServerMessages(familyId).catch(error => {
                console.warn('Server message sync failed', error);
            });
            const timer = setInterval(() => refreshServerMessages(familyId).catch(error => {
                console.warn('Server message sync failed', error);
            }), 3000);
            unsubscribeMessages = () => clearInterval(timer);
        }


        function normalizeCloudMessage(id, data) {
            const date = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
            return {
                id,
                senderId: data.senderId || data.uid || 'member',
                senderName: data.senderName || '家庭成員',
                type: data.type || 'text',
                content: data.content || '',
                time: data.time || `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
                childId: data.childId || 'child_1',
                uid: data.uid || data.senderId || '',
                img: data.img || null,
                imgUrl: data.imgUrl || null,
                thumbnailUrl: data.thumbnailUrl || null,
                audio: data.audio || null,
                audioUrl: data.audioUrl || null,
                audioMime: data.audioMime || '',
                audioDurationMs: data.audioDurationMs || 0,
                transcript: data.transcript || '',
                aiSummary: data.aiSummary || null
            };
        }

        function getMessageRenderKey(msg) {
            return [
                msg.id,
                msg.senderId,
                msg.senderName,
                msg.type,
                msg.content,
                msg.img || msg.imgUrl || msg.thumbnailUrl || '',
                msg.audio || msg.audioUrl || '',
                msg.audioDurationMs || 0,
                msg.transcript || '',
                msg.aiSummary || '',
                getAvatarFrameForUser(msg.senderId || msg.uid || ''),
                state.transcribingMessageId === String(msg.id) ? 'transcribing' : ''
            ].map(value => String(value ?? '')).join('|');
        }


        function createChatMessageElement(msg, disableAnimation = false) {
            const isMe = msg.senderId === state.authUid || msg.uid === state.authUid;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderSingleChatMessage(msg, isMe);
            const el = tempDiv.firstElementChild;
            if (disableAnimation) {
                el.classList.remove('animate-fadeIn');
            }
            return el;
        }


        function appendMessageToChat(msg) {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return;
            const anchor = document.getElementById('chatBottomAnchor');
            const shouldAutoScroll = !isUserScrolledUp();
            const newEl = createChatMessageElement(msg);
            if (newEl && anchor) {
                chatMessages.insertBefore(newEl, anchor);
                syncVoicePlayerUi();
                if (shouldAutoScroll) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        }


        function isUserScrolledUp() {
            const container = getChatMessagesContainer();
            if (!container) return false;
            return container.scrollHeight - container.scrollTop - container.clientHeight > 80;
        }


        function renderSingleChatMessage(msg, isMe) {
            const displayAvatar = isMe ? state.userAvatar : ((msg.senderName || '家')[0] || '👤');
            const displayName = isMe ? state.userName : (msg.senderName || '家庭成員');
            const messageId = String(msg.id);
            const senderUserId = msg.senderId || msg.uid || '';
            const imageSrc = getMessageImageSrc(msg);
            const audioSrc = getMessageAudioSrc(msg);
            return `
                <div data-msg-id="${escapeAttribute(messageId)}" data-msg-key="${escapeAttribute(getMessageRenderKey(msg))}" class="flex items-end ${isMe ? 'justify-end' : 'justify-start'} animate-fadeIn">
                    ${!isMe ? renderAvatar(displayAvatar, { userId: senderUserId, sizeClass: 'w-10 h-10', coreClass: 'bg-[var(--brand-100)] text-[var(--brand-700)] font-bold bs-text-xl', extraClass: 'mr-2 mb-5 shrink-0' }) : ''}
                    <div class="flex max-w-[82%] flex-col ${isMe ? 'items-end' : 'items-start'}">
                        ${!isMe ? `<span class="mb-1 ml-2 bs-text-xs font-medium text-[var(--ink-500)]">${displayName}</span>` : ''}
                        <div class="${isMe ? 'bs-bubble-mine' : 'bs-bubble-theirs'} max-w-full px-4 py-3">
                            ${msg.type === 'text' ? `<p class="bs-text-lg leading-relaxed">${msg.content}</p>` : ''}
                            ${msg.type === 'photo' && imageSrc ? `<img src="${escapeAttribute(imageSrc)}" class="max-h-64 max-w-60 rounded-2xl object-cover shadow-sm">${msg.content ? `<p class="mt-2 bs-text-base leading-relaxed">${msg.content}</p>` : ''}` : ''}
                            ${msg.type === 'audio' ? `<div class="w-64 max-w-[70vw] space-y-2.5">${renderVoicePlayer(msg, isMe)}<div class="rounded-2xl border ${isMe ? 'border-white/20 bg-white/10' : 'border-[var(--line)] bg-[var(--surface-2)]'} px-3 py-2.5"><p class="mb-1 bs-text-xs font-medium opacity-70">語音轉譯</p>${msg.transcript ? `<p class="bs-text-base leading-relaxed">${msg.transcript}</p>` : `<p class="bs-text-sm leading-relaxed opacity-80">未取得轉譯文字，可播放錄音確認內容。</p>`}</div></div>` : ''}
                        </div>
                        ${msg.type === 'audio' && msg.transcript && !msg.aiSummary && state.backendMode === 'server' ? `
                            <button class="action-btn bs-btn bs-btn-secondary mt-2 !min-h-0 gap-1.5 px-3 py-2 bs-text-sm font-bold" data-action="summarizeVoice" data-message-id="${escapeAttribute(messageId)}">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>總結錄音
                            </button>
                        ` : ''}
                        ${msg.type === 'audio' && (msg.audio || msg.audioUrl) && !msg.transcript && state.backendMode === 'server' ? `
                            <button class="action-btn bs-btn bs-btn-ghost mt-2 !min-h-0 gap-1.5 px-3 py-2 bs-text-sm font-bold text-[var(--brand-700)] disabled:opacity-60" data-action="transcribeVoice" data-message-id="${escapeAttribute(messageId)}" ${state.transcribingMessageId === messageId ? 'disabled' : ''}>
                                <i class="fa-solid ${state.transcribingMessageId === messageId ? 'fa-spinner fa-spin' : 'fa-closed-captioning'}"></i>${state.transcribingMessageId === messageId ? 'AI 轉譯中' : 'AI 轉譯錄音'}
                            </button>
                        ` : ''}
                        ${msg.aiSummary ? `
                            <div class="bs-card-flat relative mt-2 w-full bg-[var(--surface-2)] p-3 pl-10">
                                <div class="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-100)] text-[var(--brand-700)] bs-text-xs">
                                    <i class="fa-solid fa-robot"></i>
                                </div>
                                <p class="bs-text-sm font-medium leading-relaxed text-[var(--ink-700)]">${msg.aiSummary}</p>
                            </div>
                        ` : ''}
                        <span class="mt-1.5 px-1 bs-text-xs font-medium text-[var(--ink-300)]">${msg.time}</span>
                    </div>
                </div>
            `;
        }


        function renderChatMessages() {
            const visibleMessages = state.messages;
            return `
                <div class="mb-2 flex justify-center">
                    <span class="bs-chip border border-[var(--line)] bg-[var(--surface-1)] px-3 py-1 bs-text-xs font-medium text-[var(--ink-500)] shadow-sm">今天</span>
                </div>
                ${visibleMessages.map(msg => {
                    const isMe = msg.senderId === state.authUid || msg.uid === state.authUid;
                    return renderSingleChatMessage(msg, isMe);
                }).join('')}
            `;
        }


        function renderChat() {
            return `
                <div class="flex h-full min-h-0 flex-col bg-[var(--surface-0)]">
                    <div id="chatMessages" class="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-5">
                        ${renderChatMessages()}
                        <div id="chatBottomAnchor" aria-hidden="true" class="h-px"></div>
                    </div>

                    ${state.backendMode === 'server' ? `
                    <div class="flex shrink-0 gap-2 bg-[var(--surface-0)] px-3 pb-1 pt-2">
                        <button class="action-btn bs-btn bs-btn-secondary flex-1 gap-2 px-4 py-2.5 bs-text-sm font-bold disabled:opacity-60" data-action="summarizeTodayChat" ${state.summarizingChat ? 'disabled' : ''}>
                            <i class="fa-solid ${state.summarizingChat ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-[var(--brand-700)]"></i>
                            ${state.summarizingChat ? 'AI 總結中...' : 'AI 總結今日聊天'}
                        </button>
                        <button class="action-btn bs-btn bs-btn-ghost h-12 w-12 shrink-0 !p-0 text-[var(--brand-700)]" data-action="openAIImageGen" title="AI 圖片生成">
                            <i class="fa-solid fa-image bs-text-lg"></i>
                        </button>
                    </div>
                    ` : ''}

                    ${renderVoiceRecordingBar()}
                </div>
            `;
        }


        async function sendChatMessage(override = null) {
            const chatInput = document.getElementById('chatInput');
            const isTextMessage = !override;
            const content = override ? (override.content || '') : (chatInput?.value || chatDraft).trim();
            const hasImage = override?.img || override?.imgUrl;
            const hasAudio = override?.audio || override?.audioUrl;
            if (!content && !hasImage && !hasAudio) return;
            if (isTextMessage) {
                chatDraft = '';
                shouldRestoreChatInputFocus = false;
            }

            const now = new Date();
            const message = {
                id: Date.now().toString(),
                uid: state.authUid || null,
                senderId: state.authUid,
                senderName: state.userName || '我',
                type: override?.type || 'text',
                content,
                img: override?.img || null,
                imgUrl: override?.imgUrl || null,
                thumbnailUrl: override?.thumbnailUrl || null,
                audio: override?.audio || null,
                audioUrl: override?.audioUrl || null,
                audioMime: override?.audioMime || '',
                audioDurationMs: override?.audioDurationMs || 0,
                transcript: override?.transcript || '',
                aiSummary: override?.aiSummary || null,
                time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
                childId: state.role === 'child' ? 'child_1' : 'senior'
            };
            state.points += 5;

            if (state.backendMode === 'server' && state.familyId) {
                if (chatInput && isTextMessage && !override) {
                    chatInput.value = '';
                }
                state.messages.push(message);
                appendMessageToChat(message);
                try {
                    const result = await serverApi(`/api/families/${encodeURIComponent(state.familyId)}/messages`, {
                        method: 'POST',
                        body: JSON.stringify(message)
                    });
                    if (result?.message?.id) {
                        const rewardUpdate = updateDailyMessageRewardStatus(result?.rewards?.dailyMessageFrame);
                        const serverMessage = normalizeCloudMessage(result.message.id, result.message);
                        const index = state.messages.findIndex(item => String(item.id) === String(message.id));
                        if (index >= 0) state.messages[index] = serverMessage;

                        if (rewardUpdate.activeChanged) {
                            shouldStickChatToBottom = true;
                            maybeShowDailyRewardCelebration(rewardUpdate);
                            render();
                            return serverMessage;
                        }

                        const localEl = document.querySelector(`[data-msg-id="${CSS.escape(String(message.id))}"]`);
                        if (localEl) {
                            localEl.setAttribute('data-msg-id', String(serverMessage.id));
                            localEl.setAttribute('data-msg-key', getMessageRenderKey(serverMessage));
                            const replacement = createChatMessageElement(serverMessage, true);
                            if (replacement) localEl.replaceWith(replacement);
                        } else {
                            refreshVisibleContent();
                        }
                        return serverMessage;
                    }
                } catch (error) {
                    console.warn('Server message send failed', error);
                    if (isTextMessage) {
                        chatDraft = content;
                        shouldRestoreChatInputFocus = false;
                    }
                    showMessage('訊息送出失敗，請檢查自架服務器。');
                }
                return message;
            }

            const localThreshold = Number(state.dailyMessageReward?.threshold || 20);
            const localCount = Math.min(Number(state.dailyMessageReward?.count || state.dailyMessages || 0) + 1, localThreshold);
            mergeDailyMessageReward({ count: localCount, threshold: localThreshold });
            state.messages.push(message);
            shouldStickChatToBottom = true;
            refreshVisibleContent();
            setTimeout(() => {
                const replies = state.role === 'child'
                    ? ['收到呀，記得食飯同早啲休息。', '好開心收到你訊息，得閒再打俾我啦。', '見到你分享我好放心，今晚等你。']
                    : ['收到，今晚返嚟陪你食飯。', '我睇到啦，等陣打俾你。', '多謝提醒，我會安排時間返嚟。'];
                addSystemReply(replies[Math.floor(Math.random() * replies.length)]);
            }, 900);
            return message;
        }


        function addSystemReply(content) {
            const now = new Date();
            const msg = {
                id: Date.now().toString(),
                senderId: state.role === 'child' ? 'senior' : 'child_1',
                senderName: state.role === 'child' ? '媽媽' : '大仔 (阿強)',
                type: 'text',
                content,
                time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
                childId: 'child_1'
            };
            state.messages.push(msg);
            if (state.currentTab === 'chat') {
                appendMessageToChat(msg);
            }
        }
