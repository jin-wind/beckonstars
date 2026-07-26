
        // --- 局部刷新（避免全頁閃屏） ---


        window.handleAndroidBackButton = handleInAppBackNavigation;


        // 初始化渲染
        window.onload = async () => {
            registerPwa();
            updateNotificationPermission();
            loadDemoData();

            // 嘗試恢復登入狀態
            const hasAuth = restoreAuthState();

            render(); // 先渲染，讓使用者看到畫面

            // 嘗試連接伺服器
            const connected = await initCloudBackend();
            console.log('[beckon] Server connection result:', connected, 'mode:', state.backendMode);

            // 檢查更新
            checkForUpdate();

            if (hasAuth && state.currentUser) {
                // 已登入，檢查是否有家庭
                if (state.currentUser.families && state.currentUser.families.length > 0) {
                    state.familyId = state.currentUser.families[0];
                    state.calendarCode = state.familyId;
                    state.appReady = true;
                    if (!state.role) {
                        state.role = localStorage.getItem('beckon-stars-role') || 'child';
                    }
                    const savedSeniorMode = localStorage.getItem('beckon-stars-senior-mode');
                    state.seniorMode = savedSeniorMode !== null ? savedSeniorMode === 'true' : state.role === 'senior';
                    document.body.classList.toggle('senior-mode', state.seniorMode);
                    applySeniorModeVars();
                    subscribeFamilyMessages(state.familyId);
                    subscribeFamilyMemories(state.familyId);
                    render();
                } else {
                    // 已登入但無家庭，進入角色選擇
                    state.onboardingStep = 2;
                    render();
                }
            } else if (state.appReady && state.familyId && state.backendMode === 'server') {
                // 舊版相容：無登入但有家庭
                connectFamily(state.familyId, true).catch(error => {
                    console.warn('[beckon] Server family restore failed', error);
                }).finally(() => {
                    render();
                });
            } else {
                render();
            }
        };


        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            deferredInstallPrompt = event;
            state.canInstallApp = true;
            render();
        });


        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            state.canInstallApp = false;
            showMessage('已安裝星喚到手機主畫面。');
        });


        // Android 返回鍵處理
        document.addEventListener('backbutton', (e) => {
            e.preventDefault();
            if (!handleInAppBackNavigation()) {
                // 沒有可返回的視圖，讓系統處理（退出 app）
                if (navigator.app && navigator.app.exitApp) {
                    navigator.app.exitApp();
                }
            }
        }, false);
