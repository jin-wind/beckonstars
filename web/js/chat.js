
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
            const trackClass = isMe ? 'bg-white/25' : 'bg-gray-200';
            const fillClass = isMe ? 'bg-white' : 'bg-brand';
            const buttonClass = isMe ? 'bg-white text-brand' : 'bg-brand text-white';
            const timeClass = isMe ? 'text-white/85' : 'text-gray-500';

            if (!audioSource) {
                return `
                    <div class="flex items-center gap-3 min-w-48">
                        <div class="w-9 h-9 rounded-full ${isMe ? 'bg-white/20' : 'bg-orange-100'} flex items-center justify-center">
                            <i class="fa-solid fa-microphone ${isMe ? 'text-white' : 'text-brand'}"></i>
                        </div>
                        <p class="bs-text-sm opacity-80">錄音檔未同步</p>
                    </div>
                `;
            }

            return `
                <div class="voice-player flex items-center gap-2 w-full" data-message-id="${escapeAttribute(messageId)}" data-duration="${duration}">
                    <button type="button" class="action-btn voice-play-button w-9 h-9 rounded-full ${buttonClass} flex items-center justify-center shrink-0 shadow-sm" data-action="toggleVoice" data-message-id="${escapeAttribute(messageId)}" title="${isPlaying ? '暫停錄音' : '播放錄音'}">
                        <i class="fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'} voice-play-icon bs-text-sm"></i>
                    </button>
                    <button type="button" class="voice-seek-bar flex-1 min-w-24 h-8 flex items-center" data-message-id="${escapeAttribute(messageId)}" title="調整播放位置">
                        <span class="relative block h-2 w-full rounded-full ${trackClass} overflow-hidden">
                            <span class="voice-progress-fill absolute inset-y-0 left-0 rounded-full ${fillClass}" style="width: ${progress}%;"></span>
                        </span>
                    </button>
                    <span class="voice-time flex items-center gap-0.5 bs-text-xs tabular-nums ${timeClass} shrink-0">
                        <span class="voice-current">${formatVoiceTime(currentTime)}</span>
                        <span class="opacity-60">/</span>
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
                <div data-msg-id="${escapeAttribute(messageId)}" data-msg-key="${escapeAttribute(getMessageRenderKey(msg))}" class="flex ${isMe ? 'justify-end' : 'justify-start'}">
                    ${!isMe ? renderAvatar(displayAvatar, { userId: senderUserId, sizeClass: 'w-10 h-10', coreClass: 'bg-orange-200 text-brand-dark font-bold bs-text-xl', extraClass: 'mr-2' }) : ''}
                    <div class="max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                        ${!isMe ? `<span class="bs-text-xs text-gray-500 mb-1 ml-1">${displayName}</span>` : ''}
                        <div class="p-3 rounded-2xl shadow-sm ${isMe ? 'bg-brand text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'}">
                            ${msg.type === 'text' ? `<p class="bs-text-lg">${msg.content}</p>` : ''}
                            ${msg.type === 'photo' && imageSrc ? `<img src="${escapeAttribute(imageSrc)}" class="max-w-56 max-h-56 rounded-xl object-cover">${msg.content ? `<p class="bs-text-base mt-2">${msg.content}</p>` : ''}` : ''}
                            ${msg.type === 'audio' ? `<div class="space-y-2 w-60 max-w-[68vw]">${renderVoicePlayer(msg, isMe)}<div class="${isMe ? 'bg-white/10' : 'bg-gray-50'} rounded-xl p-2"><p class="bs-text-xs opacity-70 mb-1">語音轉譯</p>${msg.transcript ? `<p class="bs-text-base">${msg.transcript}</p>` : `<p class="bs-text-sm opacity-80">未取得轉譯文字，可播放錄音確認內容。</p>`}</div></div>` : ''}
                        </div>
                        ${msg.type === 'audio' && msg.transcript && !msg.aiSummary && state.backendMode === 'server' ? `
                            <button class="action-btn mt-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-3 py-2 bs-text-sm font-bold" data-action="summarizeVoice" data-message-id="${escapeAttribute(messageId)}">
                                <i class="fa-solid fa-wand-magic-sparkles mr-1"></i>總結錄音
                            </button>
                        ` : ''}
                        ${msg.type === 'audio' && (msg.audio || msg.audioUrl) && !msg.transcript && state.backendMode === 'server' ? `
                            <button class="action-btn mt-2 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl px-3 py-2 bs-text-sm font-bold disabled:opacity-60" data-action="transcribeVoice" data-message-id="${escapeAttribute(messageId)}" ${state.transcribingMessageId === messageId ? 'disabled' : ''}>
                                <i class="fa-solid ${state.transcribingMessageId === messageId ? 'fa-spinner fa-spin' : 'fa-closed-captioning'} mr-1"></i>${state.transcribingMessageId === messageId ? 'AI 轉譯中' : 'AI 轉譯錄音'}
                            </button>
                        ` : ''}
                        ${msg.aiSummary ? `
                            <div class="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3 shadow-sm relative w-full">
                                <div class="absolute -top-2 -left-2 bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center bs-text-xs shadow-md">
                                    <i class="fa-solid fa-robot"></i>
                                </div>
                                <p class="bs-text-sm text-blue-800 pl-3 font-medium">${msg.aiSummary}</p>
                            </div>
                        ` : ''}
                        <span class="bs-text-xs text-gray-400 mt-1 ${isMe ? 'mr-1' : 'ml-1'}">${msg.time}</span>
                    </div>
                </div>
            `;
        }


        function renderChatMessages() {
            const visibleMessages = state.messages;
            return `
                <div class="text-center bs-text-xs text-gray-400 mb-4">今天</div>
                ${visibleMessages.map(msg => {
                    const isMe = msg.senderId === state.authUid || msg.uid === state.authUid;
                    return renderSingleChatMessage(msg, isMe);
                }).join('')}
            `;
        }


        function renderChat() {
            return `
                <div class="flex flex-col h-full min-h-0 bg-[#FFF8F0]">
                    <div id="chatMessages" class="flex-1 min-h-0 px-4 pt-4 pb-3 space-y-6 overflow-y-auto no-scrollbar">
                        ${renderChatMessages()}
                        <div id="chatBottomAnchor" aria-hidden="true" class="h-px"></div>
                    </div>

                    ${state.backendMode === 'server' ? `
                    <div class="shrink-0 px-3 py-2 bg-[#FFF8F0] flex gap-2">
                        <button class="action-btn flex-1 bg-white border border-gray-100 rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 bs-text-sm font-bold text-gray-600 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60" data-action="summarizeTodayChat" ${state.summarizingChat ? 'disabled' : ''}>
                            <i class="fa-solid ${state.summarizingChat ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-brand"></i>
                            ${state.summarizingChat ? 'AI 總結中...' : 'AI 總結今日聊天'}
                        </button>
                        <button class="action-btn w-12 h-12 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-brand shadow-sm hover:bg-gray-50 transition-colors" data-action="openAIImageGen" title="AI 圖片生成">
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
