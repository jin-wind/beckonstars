# Chat Voice Recording UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chat recording prompt with a WhatsApp-style recording interaction: hold to record, release to send, slide left to cancel, slide up to lock, and send/delete after locking.

**Architecture:** Keep the existing native Android recording bridge unchanged because `MainActivity.java` already supports `startVoiceRecording()` and `finishVoiceRecording(boolean cancelled)`. Implement the new interaction as a small front-end state machine in `android/app/src/main/assets/index.html`, with pure gesture helpers, a timer, updated chat input rendering, and explicit locked-mode action handlers.

**Tech Stack:** Inline HTML/CSS/JavaScript, Tailwind utility classes, Font Awesome icons, Android WebView JavaScript bridge.

---

## File Structure

- Modify `android/app/src/main/assets/index.html`
  - Add CSS animation for the recording red dot and horizontal cancel hint.
  - Expand `state.voiceRecording` from `{ active, cancel, startY }` to include `locked`, `startX`, `startY`, `elapsedMs`, and `gesture`.
  - Add helper functions near existing voice playback helpers: `createIdleVoiceRecordingState()`, `formatRecordingElapsed()`, `getVoiceRecordingGesture()`, `startVoiceRecordingTimer()`, `stopVoiceRecordingTimer()`, `resetVoiceRecordingState()`, `finishLockedVoiceRecording()`.
  - Replace the current floating black recording panel in `renderChat()` with an inline recording input bar.
  - Update `attachVoiceHoldEvents()` so pointer movement supports left-cancel and up-lock.
  - Add action dispatch cases for locked-mode send/delete buttons if the central click handler requires explicit cases.
  - Reset recording state on Android voice errors.
- No changes to `android/app/src/main/java/hk/beckonstars/app/MainActivity.java`
  - The current bridge already starts recording and finishes/cancels recording.
- Verification command: `.ndroid\gradlew.bat -p android assembleDebug`
  - The command is written this way in markdown only; run the actual PowerShell command shown in Task 4.

---

### Task 1: Add deterministic recording state helpers

**Files:**
- Modify: `android/app/src/main/assets/index.html:70-76`
- Modify: `android/app/src/main/assets/index.html:189-193`
- Modify: `android/app/src/main/assets/index.html:241-248`
- Modify: `android/app/src/main/assets/index.html:645`

- [ ] **Step 1: Add recording CSS animation**

In `android/app/src/main/assets/index.html`, inside the existing `<style>` block after `.animate-shake`, add:

```css
        @keyframes recordingPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.82); } }
        .recording-pulse { animation: recordingPulse 1.1s ease-in-out infinite; }
```

- [ ] **Step 2: Replace initial voice recording state**

Replace the existing state block:

```javascript
            voiceRecording: {
                active: false,
                cancel: false,
                startY: 0
            },
```

with:

```javascript
            voiceRecording: {
                active: false,
                cancel: false,
                locked: false,
                startX: 0,
                startY: 0,
                elapsedMs: 0,
                gesture: 'idle'
            },
```

- [ ] **Step 3: Add helper variables and functions after `voicePlayback`**

Immediately after the existing `const voicePlayback = { ... };` block, add:

```javascript
        let voiceRecordingTimer = null;

        function createIdleVoiceRecordingState() {
            return {
                active: false,
                cancel: false,
                locked: false,
                startX: 0,
                startY: 0,
                elapsedMs: 0,
                gesture: 'idle'
            };
        }

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
            const locked = dy < -75 && absDy > absDx * 0.9;
            const cancel = dx < -70 && absDx > absDy * 1.15;

            return {
                cancel,
                locked,
                gesture: locked ? 'lock' : cancel ? 'cancel' : 'recording'
            };
        }

        function startVoiceRecordingTimer(startedAt = Date.now()) {
            stopVoiceRecordingTimer();
            voiceRecordingTimer = setInterval(() => {
                if (!state.voiceRecording.active) {
                    stopVoiceRecordingTimer();
                    return;
                }
                state.voiceRecording.elapsedMs = Date.now() - startedAt;
                refreshVisibleContent();
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
```

- [ ] **Step 4: Update saved demo reset state**

In `saveDemoData()`, replace:

```javascript
                data.voiceRecording = { active: false, cancel: false, startY: 0 };
```

with:

```javascript
                data.voiceRecording = createIdleVoiceRecordingState();
```

- [ ] **Step 5: Manual focused check**

Search the file for `voiceRecording = { active: false, cancel: false, startY: 0 }`. Expected: no matches. Search for `createIdleVoiceRecordingState`. Expected: one function definition and at least one usage in `saveDemoData()`.

- [ ] **Step 6: Commit**

```powershell
git add android/app/src/main/assets/index.html
git commit -m @'
feat: add voice recording state helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

### Task 2: Render WhatsApp-style recording input states

**Files:**
- Modify: `android/app/src/main/assets/index.html:1881-1920`

- [ ] **Step 1: Add render helpers before `renderChat()`**

Immediately before `function renderChat()`, add:

```javascript
        function renderVoiceRecordingBar() {
            const recording = state.voiceRecording || createIdleVoiceRecordingState();
            const elapsed = formatRecordingElapsed(recording.elapsedMs);

            if (recording.locked) {
                return `
                    <div class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] flex items-center gap-2">
                        <button class="action-btn w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0" data-action="deleteLockedVoiceRecording" title="刪除錄音">
                            <i class="fa-solid fa-trash-can bs-text-lg"></i>
                        </button>
                        <div class="min-w-0 flex-1 bg-gray-50 rounded-full px-4 py-3 flex items-center gap-3 border border-gray-100">
                            <span class="w-2.5 h-2.5 rounded-full bg-red-500 recording-pulse shrink-0"></span>
                            <span class="font-bold text-gray-800 tabular-nums">${elapsed}</span>
                            <span class="bs-text-sm text-green-700 font-bold flex items-center gap-1 truncate">
                                <i class="fa-solid fa-lock"></i> 已鎖定，正在錄音
                            </span>
                        </div>
                        <button class="action-btn w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shrink-0 shadow-md hover:bg-brand-dark transition-colors" data-action="sendLockedVoiceRecording" title="發送錄音">
                            <i class="fa-solid fa-paper-plane bs-text-xl"></i>
                        </button>
                    </div>
                `;
            }

            if (recording.active) {
                const isCancel = recording.cancel;
                return `
                    <div class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                        <div class="flex items-center gap-2">
                            <button id="voiceHoldButton" class="w-12 h-12 rounded-full ${isCancel ? 'bg-red-100 text-red-600' : 'bg-red-500 text-white'} flex items-center justify-center shrink-0 select-none touch-none shadow-md" title="按住錄音，向左滑取消，向上滑鎖定">
                                <i class="fa-solid ${isCancel ? 'fa-ban' : 'fa-microphone'} bs-text-xl"></i>
                            </button>
                            <div class="min-w-0 flex-1 ${isCancel ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} rounded-full px-4 py-3 flex items-center gap-3 border transition-colors">
                                <span class="w-2.5 h-2.5 rounded-full ${isCancel ? 'bg-red-600' : 'bg-red-500 recording-pulse'} shrink-0"></span>
                                <span class="font-bold ${isCancel ? 'text-red-700' : 'text-gray-800'} tabular-nums">${elapsed}</span>
                                <span class="bs-text-sm ${isCancel ? 'text-red-600 font-bold' : 'text-gray-400'} truncate">
                                    ${isCancel ? '鬆手取消錄音' : '<i class="fa-solid fa-arrow-left mr-1"></i>向左滑取消'}
                                </span>
                            </div>
                            <div class="w-12 h-12 rounded-full ${recording.gesture === 'lock' ? 'bg-green-500 text-white' : 'bg-orange-50 text-brand'} flex items-center justify-center shrink-0 shadow-sm" title="向上滑鎖定">
                                <i class="fa-solid ${recording.gesture === 'lock' ? 'fa-lock' : 'fa-arrow-up'} bs-text-lg"></i>
                            </div>
                        </div>
                        <p class="bs-text-xs text-center mt-2 ${isCancel ? 'text-red-500 font-bold' : 'text-gray-400'}">
                            ${isCancel ? '保持向左並鬆手即可取消' : '鬆手即發送；向上滑可鎖定錄音'}
                        </p>
                    </div>
                `;
            }

            return `
                <div class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] flex items-center gap-2">
                    <button id="voiceHoldButton" class="w-10 h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 select-none touch-none" title="按住錄音，向左滑取消，向上滑鎖定">
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
```

- [ ] **Step 2: Replace chat input markup in `renderChat()`**

Inside `renderChat()`, replace the existing block from:

```javascript
                    <div class="shrink-0 bg-white px-3 py-3 border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] flex items-center gap-2">
```

through the closing conditional floating panel:

```javascript
                    ${state.voiceRecording.active ? `
                        <div class="absolute inset-x-6 bottom-32 z-40 rounded-2xl ${state.voiceRecording.cancel ? 'bg-red-500' : 'bg-gray-900'} text-white p-4 text-center shadow-2xl">
                            <i class="fa-solid ${state.voiceRecording.cancel ? 'fa-ban' : 'fa-microphone'} bs-text-2xl mb-2"></i>
                            <p class="font-bold">${state.voiceRecording.cancel ? '鬆手取消發送' : '正在錄音，鬆手發送'}</p>
                            <p class="bs-text-xs opacity-80 mt-1">按住說話；手指向上滑到取消區即可取消</p>
                        </div>
                    ` : ''}
```

with:

```javascript
                    ${renderVoiceRecordingBar()}
```

- [ ] **Step 3: Manual focused check**

Open the rendered chat in a browser or APK. Expected idle state: microphone, image button, text input, send button are still visible. Expected old floating prompt text `按住說話；手指向上滑到取消區即可取消` no longer appears in the file.

- [ ] **Step 4: Commit**

```powershell
git add android/app/src/main/assets/index.html
git commit -m @'
feat: render whatsapp style voice recorder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

### Task 3: Implement left-cancel, up-lock, and locked send/delete behavior

**Files:**
- Modify: `android/app/src/main/assets/index.html:3208-3268`
- Modify: `android/app/src/main/assets/index.html:3316-3320`
- Modify: central action dispatcher in `android/app/src/main/assets/index.html` where `data-action` values are handled

- [ ] **Step 1: Add locked finish helper before `attachVoiceHoldEvents()`**

Immediately before `function attachVoiceHoldEvents(button)`, add:

```javascript
        function finishLockedVoiceRecording(cancelled) {
            if (!state.voiceRecording.active || !state.voiceRecording.locked) return;
            resetVoiceRecordingState();
            render();
            if (isAndroidApk() && window.BeckonStarsAndroid?.finishVoiceRecording) {
                window.BeckonStarsAndroid.finishVoiceRecording(!!cancelled);
            }
        }
```

- [ ] **Step 2: Replace `attachVoiceHoldEvents()` with the new state machine**

Replace the entire existing `function attachVoiceHoldEvents(button) { ... }` block with:

```javascript
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
                if (isAndroidApk() && window.BeckonStarsAndroid?.startVoiceRecording) {
                    window.BeckonStarsAndroid.startVoiceRecording();
                } else {
                    window.handleAndroidVoiceError('目前環境未支援 APK 錄音。請在 Android APK 內使用。');
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
                refreshVisibleContent();

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
                render();
                if (isAndroidApk() && window.BeckonStarsAndroid?.finishVoiceRecording) {
                    window.BeckonStarsAndroid.finishVoiceRecording(!!cancelled);
                }
            };

            const finish = event => {
                if (!state.voiceRecording.active || event.pointerId !== pointerId) return;
                event.preventDefault();
                if (state.voiceRecording.locked) {
                    cleanupDocumentListeners();
                    pointerId = null;
                    refreshVisibleContent();
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
```

- [ ] **Step 3: Add action dispatcher cases**

Find the central handler that reads `const action = target.dataset.action` or equivalent and add these two cases next to the other chat actions:

```javascript
                case 'sendLockedVoiceRecording':
                    finishLockedVoiceRecording(false);
                    break;
                case 'deleteLockedVoiceRecording':
                    finishLockedVoiceRecording(true);
                    break;
```

- [ ] **Step 4: Reset recording state on Android errors**

Replace `window.handleAndroidVoiceError` with:

```javascript
        window.handleAndroidVoiceError = message => {
            state.transcribingMessageId = null;
            resetVoiceRecordingState();
            render();
            showMessage(message || '語音識別失敗，請再試一次。');
        };
```

- [ ] **Step 5: Manual gesture check in APK**

Install and open the debug APK, go to chat, then verify:

1. Press and hold microphone: recording timer appears in the bottom bar.
2. Release without sliding: a voice message is sent.
3. Press and hold, slide left until the cancel hint turns red, then release: no voice message is sent.
4. Press and hold, slide up until lock appears, then release finger: recording continues and shows delete/send buttons.
5. In locked mode, tap delete: recording stops and no voice message is sent.
6. In locked mode, record again and tap send: a voice message is sent.

- [ ] **Step 6: Commit**

```powershell
git add android/app/src/main/assets/index.html
git commit -m @'
feat: support locked voice recording gestures

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

### Task 4: Build and smoke test Android asset path

**Files:**
- Verify: `android/app/src/main/assets/index.html`
- Verify: `android/app/build.gradle:22-33`

- [ ] **Step 1: Confirm no root `index.html` will overwrite the asset**

Run:

```powershell
Test-Path "D:\Code\星喚\index.html"
```

Expected: `False`. If it returns `True`, inspect that root file before building because `android/app/build.gradle:22-33` copies root `index.html` over `android/app/src/main/assets/index.html` during `preBuild`.

- [ ] **Step 2: Build debug APK**

Run:

```powershell
.\android\gradlew.bat -p android assembleDebug
```

Expected: build succeeds and creates:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

- [ ] **Step 3: Manual APK smoke test**

Run on a connected Android device/emulator:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n hk.beckonstars.app/.MainActivity
```

Expected: app opens, chat loads, voice recording flow matches Task 3 Step 5.

- [ ] **Step 4: Commit verification-only updates if any**

If no files changed during verification, do not commit. If the smoke test revealed a small fix and it was implemented, commit it:

```powershell
git add android/app/src/main/assets/index.html
git commit -m @'
fix: polish voice recording smoke test issues

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Self-Review

**Spec coverage:** The approved visual direction is covered: hold-to-record, release-to-send, left-slide cancel, up-slide lock, locked delete/send controls, inline bottom-bar feedback, and no Android native bridge changes.

**Placeholder scan:** This plan contains no placeholder tasks, no incomplete requirements, and no deferred implementation details.

**Type consistency:** The state fields are consistent across tasks: `active`, `cancel`, `locked`, `startX`, `startY`, `elapsedMs`, and `gesture`. The locked action names are `sendLockedVoiceRecording` and `deleteLockedVoiceRecording` in both render markup and dispatcher cases.
