
        async function checkForUpdate() {
            // GitHub releases currently publish Android APKs only. Never offer
            // an APK update to the iOS shell or browser/PWA clients.
            if (!isAndroidApk()) return;
            try {
                const resp = await fetch('https://api.github.com/repos/jin-wind/beckonstars/releases/latest');
                if (!resp.ok) return;
                const release = await resp.json();
                const tagName = release.tag_name;
                const latestCode = parseInt(tagName.replace('v', ''), 10);
                if (isNaN(latestCode) || latestCode <= CURRENT_VERSION_CODE) return;

                state.updateInfo = {
                    versionCode: latestCode,
                    versionName: tagName,
                    downloadUrl: `https://github.com/jin-wind/beckonstars/releases/download/${tagName}/app-debug.apk`,
                    releaseNotes: release.body || ''
                };
                state.showModal = 'updateAvailable';
                render();
            } catch (e) {
                console.log('[update] 檢查更新失敗:', e.message);
            }
        }
