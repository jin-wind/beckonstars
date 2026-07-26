
        function updateNotificationPermission() {
            state.notificationPermission = getRuntimeNotificationPermission();
            state.canInstallApp = !isNativeApp() && !!deferredInstallPrompt;
        }


        async function requestNotificationPermission() {
            if (isNativeApp()) {
                const granted = Platform.requestNotificationPermission();
                state.notificationPermission = getRuntimeNotificationPermission();
                render();
                if (granted || state.notificationPermission === 'granted') {
                    showLocalNotification('星喚通知已開啟', '通知會由系統原生通知處理提示。');
                    showMessage('App 通知已開啟。');
                    return;
                }
                showMessage('請在系統權限視窗或 App 設定中允許通知。');
                return;
            }

            if (!('Notification' in window)) {
                showMessage('此瀏覽器不支援通知。Android Chrome 建議安裝到主畫面後再試。');
                return;
            }

            const permission = await Notification.requestPermission();
            state.notificationPermission = permission;
            render();
            if (permission === 'granted') {
                await registerPushToken();
                showLocalNotification('星喚通知已開啟', '之後有新家庭訊息時，會在可支援的環境提示你。');
                setTimeout(() => showMessage(getPushStatusSummary()), 200);
                return;
            }

            showMessage('通知未開啟。你可以稍後在瀏覽器或手機設定中重新允許。');
        }


        function canUseCloudMessaging() {
            return false;
        }


        function getPushSetupProblem() {
            return '推播通知功能暫未支援。';
        }


        function getPushErrorMessage(error) {
            return '推播通知功能暫未支援。';
        }


        function getPushStatusSummary() {
            return '推播通知功能暫未支援。';
        }


        async function refreshCurrentPushTokenInfo() {
            state.pushTokenCount = 0;
            state.pushTokenPreview = '';
            return null;
        }


        async function registerPushToken() {
            state.pushStatus = '推播通知功能暫未支援。';
            return null;
        }


        async function showLocalNotification(title, body) {
            if (isNativeApp()) {
                Platform.showLocalNotification(title, body);
                return;
            }
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            const registration = await navigator.serviceWorker?.ready.catch(() => null);
            if (registration?.showNotification) {
                registration.showNotification(title, {
                    body,
                    icon: './icons/icon.svg',
                    badge: './icons/icon.svg',
                    tag: 'beckon-stars-message'
                });
                return;
            }
            new Notification(title, { body, icon: './icons/icon.svg' });
        }


        window.setAndroidNotificationPermission = permission => {
            state.notificationPermission = permission || getRuntimeNotificationPermission();
            render();
            showMessage(state.notificationPermission === 'granted'
                ? 'APK 通知已開啟。'
                : 'APK 通知未開啟，你可以稍後到 Android App 設定允許。');
        };
