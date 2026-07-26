        let deferredInstallPrompt = null;
        let serviceWorkerRegistration = null;


        async function registerPwa() {
            if (isNativeApp()) return;
            if (!('serviceWorker' in navigator)) return;
            try {
                serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js');
            } catch (error) {
                console.warn('Service worker registration failed', error);
            }
        }


        async function installPwaApp() {
            if (isNativeApp()) {
                showMessage('目前已經是 App 版本，不需要再加入主畫面。');
                return;
            }
            if (!deferredInstallPrompt) {
                showMessage('如手機瀏覽器沒有彈出安裝按鈕，可在瀏覽器選單選「加入主畫面」。');
                return;
            }

            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice.catch(() => null);
            deferredInstallPrompt = null;
            state.canInstallApp = false;
            render();
        }
