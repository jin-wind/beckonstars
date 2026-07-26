        // ============================================================
        // 平台橋接層 — 唯一允許接觸原生介面的模組（一套代碼共用 iOS / Android）
        //
        //  Android: window.BeckonStarsAndroid
        //           （WebView addJavascriptInterface，同步呼叫、可帶回傳值）
        //  iOS:     window.webkit.messageHandlers.beckonStars
        //           （WKScriptMessageHandler，postMessage({ method, args }) 非同步）
        //           同步讀值由殼層注入的 window.__BeckonStarsIOS 快照提供：
        //           { versionCode, notificationPermission, supports: [method...] }
        //  瀏覽器:  優雅降級（Web API 或 no-op）
        //
        //  原生 → JS 回呼沿用既有全域函數名（handleAndroidVoiceRecording、
        //  setAndroidNotificationPermission 等）；名稱中的 "Android" 是歷史沿革，
        //  iOS 殼層呼叫同一組回呼即可，語義見 ios/BRIDGE.md。
        // ============================================================

        const isAndroidApk = () => typeof window !== 'undefined' && !!window.BeckonStarsAndroid;
        const isIosApp = () => typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.beckonStars;
        const isNativeApp = () => isAndroidApk() || isIosApp();

        const Platform = (() => {
            const iosSnapshot = () => window.__BeckonStarsIOS || {};

            const callAndroid = (method, ...args) => {
                const bridge = window.BeckonStarsAndroid;
                if (!bridge || typeof bridge[method] !== 'function') return undefined;
                try {
                    return bridge[method](...args);
                } catch (error) {
                    console.warn('[platform] Android bridge failed:', method, error);
                    return undefined;
                }
            };

            const postIos = (method, args = []) => {
                try {
                    window.webkit.messageHandlers.beckonStars.postMessage({ method, args });
                    return true;
                } catch (error) {
                    console.warn('[platform] iOS bridge failed:', method, error);
                    return false;
                }
            };

            // 呼叫原生方法：Android 走同步介面，iOS 走 postMessage。
            // 回傳 true 表示已交給原生處理，false 表示目前平台不支援。
            const invoke = (method, ...args) => {
                if (isAndroidApk() && typeof window.BeckonStarsAndroid[method] === 'function') {
                    callAndroid(method, ...args);
                    return true;
                }
                if (isIosApp() && supports(method)) {
                    return postIos(method, args);
                }
                return false;
            };

            const supports = (method) => {
                if (isAndroidApk()) return typeof window.BeckonStarsAndroid[method] === 'function';
                if (isIosApp()) return (iosSnapshot().supports || []).includes(method);
                return false;
            };

            return {
                supports,

                // ---- 同步讀值 ----
                getVersionCode() {
                    if (isAndroidApk()) return callAndroid('getVersionCode') || 0;
                    if (isIosApp()) return iosSnapshot().versionCode || 0;
                    return 0;
                },
                getNotificationPermission() {
                    if (isAndroidApk()) return callAndroid('getNotificationPermission') || 'default';
                    if (isIosApp()) return iosSnapshot().notificationPermission || 'default';
                    return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
                },

                // ---- 通知 ----
                requestNotificationPermission() {
                    if (isAndroidApk()) return callAndroid('requestNotificationPermission') === true;
                    if (isIosApp()) {
                        // iOS 為非同步授權，結果由殼層透過 setAndroidNotificationPermission 回報
                        postIos('requestNotificationPermission');
                        return iosSnapshot().notificationPermission === 'granted';
                    }
                    return false;
                },
                showLocalNotification(title, body) { return invoke('showLocalNotification', title, body); },

                // ---- 觸覺回饋 ----
                playRewardHaptic() {
                    if (invoke('playRewardHaptic')) return;
                    try { navigator.vibrate?.([35, 45, 70]); } catch (ignored) { /* 觸覺為可選 */ }
                },

                // ---- Google 登入 ----
                startGoogleSignIn() { return invoke('startGoogleSignIn'); },
                clearGoogleCredentialState() { return invoke('clearGoogleCredentialState'); },

                // ---- 語音錄製 / 轉寫 ----
                startVoiceRecording() { return invoke('startVoiceRecording'); },
                finishVoiceRecording(cancelled) { return invoke('finishVoiceRecording', !!cancelled); },
                transcribeReceivedVoice(messageId, audioDataUrl) { return invoke('transcribeReceivedVoice', messageId, audioDataUrl); },

                // ---- 媒體 / 分享 / 更新 ----
                setMediaApiConfig(apiBase, authToken) { return invoke('setMediaApiConfig', apiBase, authToken); },
                saveImageToGallery(imageUrl) { return invoke('saveImageToGallery', imageUrl); },
                shareAIImage(imageUrl) { return invoke('shareAIImage', imageUrl); },
                downloadAndInstallUpdate(downloadUrl) { return invoke('downloadAndInstallUpdate', downloadUrl); },
            };
        })();

        const getRuntimeNotificationPermission = () => Platform.getNotificationPermission();

        function playRewardHaptic() {
            Platform.playRewardHaptic();
        }

        const CURRENT_VERSION_CODE = Platform.getVersionCode();


        function handleInAppBackNavigation() {
            if (state.showModal) {
                state.showModal = null;
                state.dailyRewardCelebration = null;
                state.selectedGeneratedImageUrl = null;
                render();
                return true;
            }

            if (state.aiImageGenView) {
                closeAIImageGen();
                return true;
            }

            return false;
        }
