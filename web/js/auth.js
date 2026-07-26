
        // --- 電郵/密碼認證 ---

        async function handleGoogleCredentialResponse(response) {
            const credential = response?.credential || '';
            if (!credential) return;

            try {
                state.googleSignInLoading = true;
                state.errorMsg = '';
                render();
                const result = await serverApi('/api/auth/google', {
                    method: 'POST',
                    body: JSON.stringify({ credential })
                });
                state.googleSignInLoading = false;
                handleAuthSuccess(result);
            } catch (error) {
                console.error('[auth] Google login failed:', error);
                state.googleSignInLoading = false;
                if (error.status === 503) {
                    state.errorMsg = 'Google 登入尚未設定';
                } else if (error.status === 409) {
                    state.errorMsg = error.serverMessage || '此電郵已綁定另一個 Google 帳號';
                } else if (error.status === 401 || error.status === 400) {
                    state.errorMsg = error.serverMessage || 'Google 登入驗證失敗，請重新登入';
                } else {
                    state.errorMsg = error.serverMessage || 'Google 登入失敗，請稍後再試';
                }
                render();
            }
        }


        function startAndroidGoogleLogin() {
            if (state.googleSignInLoading) return;
            if (!isAndroidApk() || !window.BeckonStarsAndroid?.startGoogleSignIn) {
                state.errorMsg = 'Google 登入需要在 Android APK 內使用';
                render();
                return;
            }

            state.googleSignInLoading = true;
            state.errorMsg = '';
            render();
            try {
                window.BeckonStarsAndroid.startGoogleSignIn();
            } catch (error) {
                console.error('[auth] Android Google login failed to start:', error);
                state.googleSignInLoading = false;
                state.errorMsg = '無法啟動 Google 登入，請稍後再試';
                render();
            }
        }


        window.handleAndroidGoogleCredential = credential => {
            handleGoogleCredentialResponse({ credential });
        };


        window.handleAndroidGoogleError = message => {
            state.googleSignInLoading = false;
            state.errorMsg = message || 'Google 登入失敗，請稍後再試';
            render();
        };


        function handleAuthSuccess(result) {
            state.authToken = result.token;
            state.currentUser = result.user;
            state.authUid = result.user.userId;
            state.userName = result.user.name;
            state.userAvatar = result.user.picture || '👤';

            localStorage.setItem('beckon-stars-auth-token', result.token);
            localStorage.setItem('beckon-stars-user', JSON.stringify(result.user));

            console.log('[auth] Logged in as:', result.user.name, result.user.email);

            if (result.user.families && result.user.families.length > 0) {
                state.familyId = result.user.families[0];
                state.calendarCode = state.familyId;
                state.appReady = true;
                state.role = localStorage.getItem('beckon-stars-role') || 'child';
                const savedSeniorMode = localStorage.getItem('beckon-stars-senior-mode');
                state.seniorMode = savedSeniorMode !== null ? savedSeniorMode === 'true' : state.role === 'senior';
                document.body.classList.toggle('senior-mode', state.seniorMode);
                applySeniorModeVars();
                subscribeFamilyMessages(state.familyId);
                subscribeFamilyMemories(state.familyId);
                render();
            } else {
                state.onboardingStep = 2;
                render();
            }
        }


        async function handleLogin() {
            const emailInput = document.getElementById('authEmail');
            const passwordInput = document.getElementById('authPassword');
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            if (!email || !password) {
                state.errorMsg = '請輸入電郵和密碼';
                render();
                return;
            }

            try {
                state.errorMsg = '';
                const result = await serverApi('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });
                handleAuthSuccess(result);
            } catch (error) {
                console.error('[auth] Login failed:', error);
                if (error.code === 'password-login-unavailable') {
                    state.errorMsg = '此帳號使用 Google 登入';
                } else if (error.status === 401) {
                    state.errorMsg = '電郵或密碼不正確';
                } else if (error.status === 0) {
                    state.errorMsg = '無法連接到伺服器，請檢查網絡連接';
                } else {
                    state.errorMsg = error.serverMessage || '登入失敗，請稍後再試';
                }
                render();
            }
        }


        async function handleRegister() {
            const nameInput = document.getElementById('authName');
            const emailInput = document.getElementById('authEmail');
            const passwordInput = document.getElementById('authPassword');
            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            if (!name || !email || !password) {
                state.errorMsg = '請填寫所有欄位';
                render();
                return;
            }
            if (password.length < 6) {
                state.errorMsg = '密碼長度至少 6 個字元';
                render();
                return;
            }

            try {
                state.errorMsg = '';
                const result = await serverApi('/api/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ email, password, name })
                });
                handleAuthSuccess(result);
            } catch (error) {
                console.error('[auth] Register failed:', error);
                if (error.status === 409) {
                    state.errorMsg = '此電郵已註冊，請直接登入';
                } else if (error.status === 400) {
                    state.errorMsg = '請檢查填寫的資料是否正確';
                } else if (error.status === 0) {
                    state.errorMsg = '無法連接到伺服器，請檢查網絡連接';
                } else {
                    state.errorMsg = '註冊失敗，請稍後再試';
                }
                render();
            }
        }


        function restoreAuthState() {
            const token = localStorage.getItem('beckon-stars-auth-token');
            const userJson = localStorage.getItem('beckon-stars-user');
            if (token && userJson) {
                try {
                    state.authToken = token;
                    state.currentUser = JSON.parse(userJson);
                    state.authUid = state.currentUser.userId;
                    state.userName = state.currentUser.name;
                    state.userAvatar = state.currentUser.picture || '👤';
                    return true;
                } catch (e) {
                    console.warn('[auth] Failed to restore auth state:', e);
                }
            }
            return false;
        }


        function signOut() {
            state.authToken = null;
            state.currentUser = null;
            state.authUid = null;
            try {
                window.BeckonStarsAndroid?.clearGoogleCredentialState?.();
            } catch (ignored) {}
            localStorage.removeItem('beckon-stars-auth-token');
            localStorage.removeItem('beckon-stars-user');
        }


        // 步驟 1: 登入/註冊
        function renderStep1Auth() {
            const isLogin = state.authMode === 'login';
            return `
                <div class="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-b from-[#FFF8F0] to-[#FFE5D0] animate-fadeIn overflow-y-auto">
                    <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mb-4">
                        <i class="fa-solid fa-star bs-text-4xl text-brand"></i>
                    </div>
                    <h1 class="bs-text-3xl font-bold text-gray-800 mb-1 tracking-wider">星喚</h1>
                    <p class="bs-text-base text-gray-600 mb-6">Beckon Stars</p>

                    <div class="w-full max-w-sm">
                        <div class="flex mb-6 bg-gray-100 rounded-xl p-1">
                            <button class="action-btn flex-1 py-2 rounded-lg bs-text-sm font-medium transition-colors ${isLogin ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}" data-action="switchAuthMode" data-mode="login">登入</button>
                            <button class="action-btn flex-1 py-2 rounded-lg bs-text-sm font-medium transition-colors ${!isLogin ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}" data-action="switchAuthMode" data-mode="register">註冊</button>
                        </div>

                        <div class="mb-4">
                            <button class="action-btn w-full min-h-[44px] bg-white text-gray-700 bs-text-base font-bold py-3 px-6 rounded-xl border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-3" data-action="androidGoogleLogin" ${state.googleSignInLoading ? 'disabled' : ''}>
                                <i class="fa-brands fa-google text-red-500"></i>
                                <span>${state.googleSignInLoading ? 'Google 登入中...' : '使用 Google 登入'}</span>
                            </button>
                        </div>

                        <div class="flex items-center gap-3 mb-4">
                            <div class="h-px bg-gray-200 flex-1"></div>
                            <span class="bs-text-xs text-gray-400">或使用電郵</span>
                            <div class="h-px bg-gray-200 flex-1"></div>
                        </div>

                        ${!isLogin ? `
                        <div class="mb-3">
                            <input id="authName" type="text" placeholder="用戶名稱" class="w-full px-4 py-3 rounded-xl border border-gray-200 bs-text-base focus:outline-none focus:border-brand bg-white" autocomplete="name">
                        </div>
                        ` : ''}

                        <div class="mb-3">
                            <input id="authEmail" type="email" placeholder="電郵地址" class="w-full px-4 py-3 rounded-xl border border-gray-200 bs-text-base focus:outline-none focus:border-brand bg-white" autocomplete="email">
                        </div>

                        <div class="mb-4">
                            <input id="authPassword" type="password" placeholder="密碼" class="w-full px-4 py-3 rounded-xl border border-gray-200 bs-text-base focus:outline-none focus:border-brand bg-white" autocomplete="${isLogin ? 'current-password' : 'new-password'}">
                        </div>

                        <button class="action-btn w-full bg-brand text-white bs-text-lg font-bold py-3 px-6 rounded-xl shadow-md hover:opacity-90 transition-opacity" data-action="${isLogin ? 'login' : 'register'}">
                            ${isLogin ? '登入' : '註冊'}
                        </button>

                        ${state.errorMsg ? `<p class="text-red-500 bs-text-sm mt-3 text-center animate-shake">${state.errorMsg}</p>` : ''}

                        <p class="bs-text-xs text-gray-400 text-center mt-4">${isLogin ? '還沒有帳號？' : '已有帳號？'} <button class="action-btn text-brand font-medium" data-action="switchAuthMode" data-mode="${isLogin ? 'register' : 'login'}">${isLogin ? '立即註冊' : '返回登入'}</button></p>
                    </div>
                </div>
            `;
        }


        // 步驟 2: 選擇角色
        function renderStep2Role() {
            return `
                <div class="flex flex-col items-center justify-center h-full p-8 text-center bg-gradient-to-b from-[#FFF8F0] to-[#FFE5D0] animate-fadeIn">
                    <div class="w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-lg mb-6">
                        <i class="fa-solid fa-star text-5xl text-brand"></i>
                    </div>
                    <h1 class="bs-text-4xl font-bold text-gray-800 mb-2 tracking-wider">星喚</h1>
                    <p class="bs-text-lg text-gray-600 mb-10">Beckon Stars</p>
                    
                    <h2 class="bs-text-xl font-medium text-gray-700 mb-6">請選擇您的身份</h2>
                    
                    <button class="action-btn w-full bg-brand text-white bs-text-xl font-bold py-4 px-6 rounded-2xl shadow-md mb-4 hover:bg-brand-dark transition-colors" data-action="setRole" data-role="senior">
                        <i class="fa-solid fa-person-cane mr-2"></i> 我是長者
                    </button>
                    <button class="action-btn w-full bg-white text-brand border-2 border-brand bs-text-xl font-bold py-4 px-6 rounded-2xl shadow-sm hover:bg-orange-50 transition-colors" data-action="setRole" data-role="child">
                        <i class="fa-solid fa-children mr-2"></i> 我是子女
                    </button>
                </div>
            `;
        }


        // 步驟 2: 設定檔案
        function renderStep3Profile() {
            const avatarOptions = state.role === 'senior' ? avatars.senior : avatars.child;
            if (!state.userAvatar || !avatarOptions.includes(state.userAvatar)) {
                state.userAvatar = avatarOptions[0]; // 設置預設頭像
            }

            return `
                <div class="flex flex-col h-full p-8 bg-[#FFF8F0] animate-fadeIn">
                    <button class="action-btn self-start text-gray-400 mb-6 bs-text-xl" data-action="backStep" data-step="1">
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    <h2 class="bs-text-3xl font-bold text-gray-800 mb-2">設定個人檔案</h2>
                    <p class="text-gray-500 mb-8">選擇一個喜歡的頭像並輸入稱呼</p>
                    
                    <!-- 頭像選擇 -->
                    <div class="grid grid-cols-3 gap-4 mb-8">
                        ${avatarOptions.map(avatar => `
                            <button class="action-btn bs-text-4xl p-3 rounded-2xl transition-all ${state.userAvatar === avatar ? 'bg-brand shadow-md transform scale-105' : 'bg-white border border-gray-200 opacity-60'}" data-action="selectAvatar" data-avatar="${avatar}">
                                ${avatar}
                            </button>
                        `).join('')}
                    </div>

                    <!-- 稱呼輸入 -->
                    <div class="mb-8 relative">
                        <label class="block text-gray-700 font-bold mb-2">您的稱呼</label>
                        <input type="text" id="nameInput" value="${state.userName}" placeholder="例如: ${state.role === 'senior' ? '媽媽, 爺爺' : '阿強, 妹妹'}" class="w-full bs-text-xl p-4 rounded-2xl border-2 ${state.errorMsg ? 'border-red-400' : 'border-gray-200'} focus:border-brand outline-none bg-white">
                        ${state.errorMsg ? `<p class="text-red-500 bs-text-sm mt-2 absolute -bottom-6 animate-shake">${state.errorMsg}</p>` : ''}
                    </div>

                    <div class="flex-1"></div>
                    <button class="action-btn w-full bg-brand text-white bs-text-xl font-bold py-4 rounded-2xl shadow-lg hover:bg-brand-dark transition-colors" data-action="submitProfile">
                        下一步 <i class="fa-solid fa-arrow-right ml-2"></i>
                    </button>
                </div>
            `;
        }
