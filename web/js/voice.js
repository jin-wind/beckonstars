
        function formatRecordingElapsed(ms) {
            const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
            const minutes = Math.floor(seconds / 60);
            const remaining = seconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
        }


        function getVoiceRecordingGesture(recording, clientX, clientY) {
            if (!recording?.active) return { cancel: false, locked: false, gesture: 'idle' };

            const dx = clientX - recording.startX;
            const dy = clientY - recording.startY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const locked = dy < -45 && absDy > absDx * 0.9;
            const cancel = dx > 40 && absDx > absDy * 1.15;

            return {
                cancel,
                locked,
                gesture: locked ? 'lock' : cancel ? 'cancel' : 'recording'
            };
        }


        function updateVoiceRecordingTimerUi() {
            if (!state.voiceRecording.active) return;
            const elapsed = formatRecordingElapsed(state.voiceRecording.elapsedMs);
            const timerEl = document.getElementById('voiceRecordingTimerText');
            if (timerEl && timerEl.textContent !== elapsed) {
                timerEl.textContent = elapsed;
            }
            const lockedTimerEl = document.getElementById('voiceRecordingLockedTimerText');
            if (lockedTimerEl && lockedTimerEl.textContent !== elapsed) {
                lockedTimerEl.textContent = elapsed;
            }
        }


        function startVoiceRecordingTimer(startedAt = Date.now()) {
            stopVoiceRecordingTimer();
            voiceRecordingTimer = setInterval(() => {
                if (!state.voiceRecording.active) {
                    stopVoiceRecordingTimer();
                    return;
                }
                state.voiceRecording.elapsedMs = Date.now() - startedAt;
                updateVoiceRecordingTimerUi();
            }, 500);
        }


        function stopVoiceRecordingTimer() {
            if (voiceRecordingTimer) clearInterval(voiceRecordingTimer);
            voiceRecordingTimer = null;
        }


        function resetVoiceRecordingState() {
            stopVoiceRecordingTimer();
            state.voiceRecording = createIdleVoiceRecordingState();
        }


        function formatVoiceTime(totalSeconds) {
            const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
            const minutes = Math.floor(safeSeconds / 60);
            const seconds = String(safeSeconds % 60).padStart(2, '0');
            return `${minutes}:${seconds}`;
        }


        function getVoiceDurationSeconds(message) {
            return Math.max(0, Math.round((Number(message?.audioDurationMs) || 0) / 1000));
        }


        function getVoiceAudio() {
            if (voicePlayback.audio) return voicePlayback.audio;

            const audio = new Audio();
            audio.preload = 'metadata';
            audio.addEventListener('loadedmetadata', () => {
                if (Number.isFinite(audio.duration)) voicePlayback.duration = audio.duration;
                syncVoicePlayerUi();
            });
            audio.addEventListener('timeupdate', () => {
                voicePlayback.currentTime = audio.currentTime || 0;
                if (Number.isFinite(audio.duration)) voicePlayback.duration = audio.duration;
                syncVoicePlayerUi();
            });
            audio.addEventListener('play', () => {
                voicePlayback.isPlaying = true;
                syncVoicePlayerUi();
            });
            audio.addEventListener('pause', () => {
                voicePlayback.isPlaying = false;
                syncVoicePlayerUi();
            });
            audio.addEventListener('ended', () => {
                voicePlayback.isPlaying = false;
                voicePlayback.currentTime = 0;
                try {
                    audio.currentTime = 0;
                } catch (error) {}
                syncVoicePlayerUi();
            });
            voicePlayback.audio = audio;
            return audio;
        }


        async function summarizeVoiceText(text) {
            if (!text || state.backendMode !== 'server') return '';
            try {
                const result = await serverApi('/api/summarize', {
                    method: 'POST',
                    body: JSON.stringify({ text })
                });
                return result.summary || '';
            } catch (error) {
                console.warn('Voice summary failed', error);
                return text.length > 80 ? `語音摘要：${text.slice(0, 77)}...` : `語音摘要：${text}`;
            }
        }


        // 聊天視圖
        function renderVoiceRecordingBar() {
            const recording = state.voiceRecording || createIdleVoiceRecordingState();
            const elapsed = formatRecordingElapsed(recording.elapsedMs);
            const isCancelling = recording.cancel || recording.gesture === 'cancel';
            const isLocking = recording.gesture === 'lock';

            if (recording.locked) {
                return `
                    <div id="chatComposerBar" class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] flex items-center gap-3">
                        <button class="action-btn w-12 h-12 rounded-full bg-red-100 text-brand-red flex items-center justify-center shrink-0 shadow-sm hover:bg-red-200 transition-colors" data-action="deleteLockedVoiceRecording" title="刪除錄音">
                            <i class="fa-solid fa-trash bs-text-lg"></i>
                        </button>
                        <div class="min-w-0 flex-1 flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                            <span class="w-3 h-3 rounded-full bg-brand-red recording-pulse shrink-0"></span>
                            <div class="min-w-0 flex-1">
                                <p id="voiceRecordingLockedTimerText" class="font-bold text-gray-800 bs-text-base leading-tight">${elapsed}</p>
                                <p class="bs-text-xs text-gray-500 mt-0.5">已鎖定，正在錄音</p>
                            </div>
                            <i class="fa-solid fa-lock text-brand"></i>
                        </div>
                        <button class="action-btn w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shrink-0 shadow-md hover:bg-brand-dark transition-colors" data-action="sendLockedVoiceRecording" title="傳送錄音">
                            <i class="fa-solid fa-paper-plane bs-text-xl"></i>
                        </button>
                    </div>
                `;
            }

            if (recording.active) {
                return `
                    <div id="chatComposerBar" class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                        <div class="flex items-center gap-3">
                            <button id="voiceHoldButton" class="w-12 h-12 rounded-full ${isCancelling ? 'bg-red-100 text-brand-red' : 'bg-brand text-white'} flex items-center justify-center shrink-0 select-none touch-none shadow-md ${isCancelling ? '' : 'recording-pulse'}" title="按住錄音">
                                <i class="fa-solid ${isCancelling ? 'fa-ban' : 'fa-microphone'} bs-text-xl"></i>
                            </button>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center justify-between gap-3">
                                    <div class="min-w-0 flex-1 flex items-center gap-2 ${isCancelling ? 'text-brand-red' : 'text-gray-500'} font-bold bs-text-sm">
                                        ${isCancelling ? '<i class="fa-solid fa-ban"></i><span>鬆手取消錄音</span>' : '<span>向右滑取消</span><i class="fa-solid fa-arrow-right-long"></i>'}
                                    </div>
                                    <div class="flex items-center gap-2 text-gray-800 font-bold bs-text-base shrink-0">
                                        <span class="w-2.5 h-2.5 rounded-full bg-brand-red recording-pulse"></span>
                                        <span id="voiceRecordingTimerText">${elapsed}</span>
                                    </div>
                                    <div class="w-10 h-10 rounded-full ${isLocking ? 'bg-brand text-white shadow-md' : 'bg-gray-100 text-gray-500'} flex items-center justify-center shrink-0 transition-colors">
                                        <i class="fa-solid ${isLocking ? 'fa-lock' : 'fa-arrow-up'}"></i>
                                    </div>
                                </div>
                                <p class="bs-text-xs text-gray-400 mt-1 text-center">${isCancelling ? '保持向右並鬆手即可取消' : '鬆手即發送；向上滑可鎖定錄音'}</p>
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
                <div id="chatComposerBar" class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] flex items-center gap-2">
                    <button id="voiceHoldButton" class="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 select-none touch-none" title="按住錄音">
                        <i class="fa-solid fa-microphone bs-text-xl"></i>
                    </button>
                    <button class="action-btn w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0" data-action="selectChatImage" title="傳送圖片">
                        <i class="fa-solid fa-image bs-text-xl"></i>
                    </button>
                    <input id="chatImageInput" type="file" accept="image/*" class="hidden">
                    <input id="chatInput" type="text" value="${escapeAttribute(chatDraft)}" placeholder="發送溫暖訊息..." class="min-w-0 flex-1 bg-gray-100 rounded-full px-4 py-3 bs-text-base outline-none focus:ring-2 focus:ring-brand-light">
                    <button class="action-btn w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shrink-0 shadow-md hover:bg-brand-dark transition-colors" data-action="sendMessage">
                        <i class="fa-solid fa-paper-plane bs-text-xl"></i>
                    </button>
                </div>
            `;
        }


        // 當需要只更新底部錄音列時呼叫，避免全頁 render
        function replaceVoiceRecordingBar() {
            const composer = document.getElementById('chatComposerBar');
            if (composer) {
                const oldInput = document.getElementById('chatInput');
                if (oldInput) chatDraft = oldInput.value;

                composer.outerHTML = renderVoiceRecordingBar();

                // 重新綁定新按鈕的指針事件與其他事件
                const newBtn = document.getElementById('voiceHoldButton');
                if (newBtn && !state.voiceRecording.locked && state.voiceRecording.active) {
                    // 如果依然在 active 且非 locked 狀態（這通常表示還在 pointermove），
                    // 不要透過 attachVoiceHoldEvents 重新覆蓋 start/move/finish，
                    // 否則會遺失外層作用域中正在綁定的 pointerId。
                    // 因此針對「滑動更新 UI」的情境，新按鈕直接接續即可。
                } else if (newBtn && !state.voiceRecording.locked) {
                    attachVoiceHoldEvents(newBtn);
                }
                const newInput = document.getElementById('chatInput');
                if (newInput) {
                    newInput.addEventListener('input', event => chatDraft = event.target.value);
                    newInput.addEventListener('keydown', event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            sendChatMessage();
                        }
                    });
                }
                // 將新 action buttons 綁定中央 handler
                document.querySelectorAll('#chatComposerBar .action-btn').forEach(btn => {
                    btn.addEventListener('click', async event => {
                        event.preventDefault();
                        const action = btn.getAttribute('data-action');
                        if (action === 'sendMessage') sendChatMessage();
                        else if (action === 'sendLockedVoiceRecording') finishLockedVoiceRecording(false);
                        else if (action === 'deleteLockedVoiceRecording') finishLockedVoiceRecording(true);
                        else if (action === 'selectChatImage') document.getElementById('chatImageInput')?.click();
                    });
                });
                const chatImageInput = document.getElementById('chatImageInput');
                if (chatImageInput) {
                    chatImageInput.addEventListener('change', async event => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        event.target.value = '';
                        if (state.backendMode === 'server') {
                            try {
                                const uploaded = await uploadMediaFile(file);
                                await sendChatMessage({ type: 'photo', content: '', imgUrl: uploaded.mediaUrl, thumbnailUrl: uploaded.thumbnailUrl });
                            } catch (err) {
                                console.warn('Image upload failed, using base64', err);
                                const img = await readFileAsDataUrl(file);
                                await sendChatMessage({ type: 'photo', content: '', img });
                            }
                        } else {
                            const img = await readFileAsDataUrl(file);
                            await sendChatMessage({ type: 'photo', content: '', img });
                        }
                    });
                }
            } else {
                render();
            }
        }


        function finishLockedVoiceRecording(cancelled) {
            if (!state.voiceRecording.active || !state.voiceRecording.locked) return;
            resetVoiceRecordingState();
            replaceVoiceRecordingBar();
            if (Platform.supports('finishVoiceRecording')) {
                Platform.finishVoiceRecording(!!cancelled);
            }
        }


        function attachVoiceHoldEvents(button) {
            let pointerId = null;
            let safetyTimer = null;
            let startedAt = 0;

            const cleanupDocumentListeners = () => {
                document.removeEventListener('pointermove', move, true);
                document.removeEventListener('pointerup', finish, true);
                document.removeEventListener('pointercancel', finish, true);
                window.removeEventListener('blur', cancelFromWindow, true);
                if (safetyTimer) clearTimeout(safetyTimer);
                safetyTimer = null;
            };

            const start = event => {
                if (state.voiceRecording.active) return;
                event.preventDefault();
                pointerId = event.pointerId;
                startedAt = Date.now();
                button.setPointerCapture?.(pointerId);
                state.voiceRecording = {
                    active: true,
                    cancel: false,
                    locked: false,
                    startX: event.clientX,
                    startY: event.clientY,
                    elapsedMs: 0,
                    gesture: 'recording'
                };
                render();
                startVoiceRecordingTimer(startedAt);
                document.addEventListener('pointermove', move, true);
                document.addEventListener('pointerup', finish, true);
                document.addEventListener('pointercancel', finish, true);
                window.addEventListener('blur', cancelFromWindow, true);
                safetyTimer = setTimeout(() => {
                    if (!state.voiceRecording.active) return;
                    completeRecording(false);
                }, 60000);
                if (Platform.supports('startVoiceRecording')) {
                    Platform.startVoiceRecording();
                } else {
                    window.handleAndroidVoiceError('目前環境未支援語音錄製。請在星喚 App 內使用。');
                }
            };

            const move = event => {
                if (!state.voiceRecording.active || state.voiceRecording.locked || event.pointerId !== pointerId) return;
                const gesture = getVoiceRecordingGesture(state.voiceRecording, event.clientX, event.clientY);
                const changed = state.voiceRecording.cancel !== gesture.cancel
                    || state.voiceRecording.locked !== gesture.locked
                    || state.voiceRecording.gesture !== gesture.gesture;

                if (!changed) return;

                state.voiceRecording.cancel = gesture.cancel;
                state.voiceRecording.locked = gesture.locked;
                state.voiceRecording.gesture = gesture.gesture;

                replaceVoiceRecordingBar();

                if (gesture.locked) {
                    cleanupDocumentListeners();
                    try {
                        button.releasePointerCapture?.(pointerId);
                    } catch (error) {}
                    pointerId = null;
                }
            };

            const completeRecording = cancelled => {
                cleanupDocumentListeners();
                try {
                    if (pointerId !== null) button.releasePointerCapture?.(pointerId);
                } catch (error) {}
                pointerId = null;
                resetVoiceRecordingState();
                replaceVoiceRecordingBar();
                if (Platform.supports('finishVoiceRecording')) {
                    Platform.finishVoiceRecording(!!cancelled);
                }
            };

            const finish = event => {
                if (!state.voiceRecording.active || event.pointerId !== pointerId) return;
                event.preventDefault();
                if (state.voiceRecording.locked) {
                    cleanupDocumentListeners();
                    pointerId = null;
                    replaceVoiceRecordingBar();
                    return;
                }
                completeRecording(state.voiceRecording.cancel);
            };

            const cancelFromWindow = () => {
                if (!state.voiceRecording.active || state.voiceRecording.locked) return;
                completeRecording(true);
            };

            button.addEventListener('pointerdown', start);
        }


        window.handleAndroidVoiceRecording = async payload => {
            let recording = payload;
            if (typeof payload === 'string') {
                try {
                    recording = JSON.parse(payload);
                } catch (error) {
                    recording = {};
                }
            }
            if (!recording || recording.cancelled) return;

            // Handle memory recording separately
            if (state.recordingForMemory) {
                state.recordingForMemory = false;
                state.isRecordingMemory = false;
                const audioData = recording.audio || recording.audioUrl || '';
                if (!audioData) {
                    showMessage('錄音失敗，請重試。');
                    return;
                }
                state.pendingMemoryAudio = audioData;
                state.pendingMemoryAudioDuration = Math.round((recording.durationMs || 0) / 1000);
                // Delay render to avoid UI jump while Android is finishing up
                setTimeout(() => render(), 100);
                return;
            }

            const audio = recording.audio || '';
            const audioUrl = recording.audioUrl || '';
            const transcript = String(recording.transcript || '').trim();
            if (!audio && !audioUrl) {
                showMessage('錄音失敗，請再試一次。');
                return;
            }
            state.showModal = null;
            const sentMessage = await sendChatMessage({
                type: 'audio',
                content: transcript || '語音訊息',
                transcript,
                audio,
                audioUrl,
                audioMime: recording.audioMime || 'audio/mp4',
                audioDurationMs: recording.durationMs || 0,
                aiSummary: null
            });
            if (sentMessage && sentMessage.id && !sentMessage.transcript) {
                state.transcribingMessageId = String(sentMessage.id);
                refreshVisibleContent();
                const waitForTranscript = waitForServerMessage(sentMessage.id, message => !!message.transcript, {
                    timeoutMs: 45000,
                    intervalMs: 1200
                });
                waitForTranscript.catch(err => {
                    console.warn('[voice] transcript polling failed', err);
                }).finally(() => {
                    if (state.transcribingMessageId === String(sentMessage.id)) {
                        state.transcribingMessageId = null;
                        refreshVisibleContent();
                    }
                });
            }
        };


        window.handleAndroidVoiceError = message => {
            state.transcribingMessageId = null;
            resetVoiceRecordingState();
            render();
            showMessage(message || '語音識別失敗，請再試一次。');
        };


        window.handleAndroidVoiceTranscript = async payload => {
            let result = payload;
            if (typeof payload === 'string') {
                try {
                    result = JSON.parse(payload);
                } catch (error) {
                    result = {};
                }
            }

            const messageId = String(result?.messageId || '');
            const transcript = String(result?.transcript || '').trim();
            state.transcribingMessageId = null;

            if (!messageId || !transcript) {
                render();
                showMessage('接收端未能轉譯呢段錄音，可以播放錄音確認內容。');
                return;
            }

            try {
                await serverApi(`/api/families/${encodeURIComponent(state.familyId)}/messages/${encodeURIComponent(messageId)}/transcript`, {
                    method: 'POST',
                    body: JSON.stringify({ transcript })
                });
                await refreshServerMessages(state.familyId);
                showMessage('錄音已在本機轉成文字。');
            } catch (error) {
                console.warn('Voice transcript update failed', error);
                const message = state.messages.find(item => String(item.id) === messageId);
                if (message) {
                    message.transcript = transcript;
                    if (!message.content || message.content === '語音訊息') message.content = transcript;
                }
                render();
                showMessage('已轉譯，但回寫服務器失敗，請檢查連線。');
            }
        };


        async function transcribeVoiceMessage(messageId) {
            if (!messageId || state.backendMode !== 'server' || !state.familyId) return;
            const message = state.messages.find(item => String(item.id) === String(messageId));
            if (!message?.audio && !message?.audioUrl) {
                showMessage('呢條語音沒有可轉譯的錄音。');
                return;
            }

            state.transcribingMessageId = String(messageId);
            render();
            try {
                await serverApi(`/api/families/${encodeURIComponent(state.familyId)}/messages/${encodeURIComponent(messageId)}/transcribe`, {
                    method: 'POST',
                    body: JSON.stringify({})
                });
                await refreshServerMessages(state.familyId);
                showMessage('AI 已將錄音轉成文字。');
            } catch (error) {
                console.warn('Voice message transcription failed', error);
                showMessage('AI 轉譯錄音失敗，請稍後再試。');
            } finally {
                state.transcribingMessageId = null;
                render();
            }
        }


        async function waitForServerMessage(messageId, predicate, options = {}) {
            const timeoutMs = Number(options.timeoutMs) || 30000;
            const intervalMs = Number(options.intervalMs) || 1000;
            const deadline = Date.now() + timeoutMs;
            const targetId = String(messageId);

            console.log(`[debug] 開始等待消息 ${targetId} 的 transcript，超時 ${timeoutMs}ms`);

            while (Date.now() < deadline) {
                await refreshServerMessages(state.familyId);
                const message = state.messages.find(item => String(item.id) === targetId);
                console.log(`[debug] 輪詢檢查消息 ${targetId}: transcript="${message?.transcript || '(not found or empty)'}"`);
                if (message && predicate(message)) {
                    console.log(`[debug] ✅ 找到 transcript: "${message.transcript}"`);
                    return message;
                }
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
            console.warn(`[debug] ⚠️ 超時：未能在 ${timeoutMs}ms 內獲取消息 ${targetId} 的 transcript`);
            return null;
        }


        async function summarizeVoiceMessage(messageId) {
            if (!messageId || state.backendMode !== 'server' || !state.familyId) return;
            render();
            try {
                await serverApi(`/api/families/${encodeURIComponent(state.familyId)}/messages/${encodeURIComponent(messageId)}/summarize`, {
                    method: 'POST',
                    body: JSON.stringify({})
                });
                await refreshServerMessages(state.familyId);
            } catch (error) {
                console.warn('Voice message summary failed', error);
                showMessage('總結錄音失敗，請稍後再試。');
            }
        }
