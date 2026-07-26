
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
            if (!Platform.supports('startGoogleSignIn')) {
                state.errorMsg = 'Google 登入需要在 Android APK 內使用';
                render();
                return;
            }

            state.googleSignInLoading = true;
            state.errorMsg = '';
            render();
            try {
                if (!Platform.startGoogleSignIn()) throw new Error('native-bridge-failed');
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
                Platform.clearGoogleCredentialState();
            } catch (ignored) {}
            localStorage.removeItem('beckon-stars-auth-token');
            localStorage.removeItem('beckon-stars-user');
        }


        // 步驟 1: 登入/註冊
        function renderStep1Auth() {
            const isLogin = state.authMode === 'login';
            return `
                <div class="flex h-full overflow-y-auto bg-[var(--surface-0)] px-6 py-8 animate-fadeIn">
                    <div class="m-auto w-full max-w-sm">
                        <div class="mb-6 text-center">
                            <div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--brand-200)] bg-[var(--surface-1)] shadow-[var(--shadow-lg)] ring-8 ring-[var(--brand-50)]">
                                <i class="fa-solid fa-star bs-text-4xl text-brand"></i>
                            </div>
                            <h1 class="bs-text-4xl font-bold text-[var(--ink-900)]">星喚</h1>
                            <p class="mt-1 bs-text-base text-[var(--ink-500)]">Beckon Stars</p>
                        </div>

                        <div class="bs-card p-5">
                            <div class="mb-5 flex rounded-full bg-[var(--surface-2)] p-1">
                                <button class="action-btn flex-1 rounded-full py-2 bs-text-sm font-semibold transition-colors ${isLogin ? 'bg-[var(--surface-1)] text-[var(--ink-900)] shadow-[var(--shadow-sm)]' : 'text-[var(--ink-500)]'}" data-action="switchAuthMode" data-mode="login">登入</button>
                                <button class="action-btn flex-1 rounded-full py-2 bs-text-sm font-semibold transition-colors ${!isLogin ? 'bg-[var(--surface-1)] text-[var(--ink-900)] shadow-[var(--shadow-sm)]' : 'text-[var(--ink-500)]'}" data-action="switchAuthMode" data-mode="register">註冊</button>
                            </div>

                            <button class="action-btn bs-btn bs-btn-ghost w-full bg-[var(--surface-1)] shadow-[var(--shadow-sm)]" data-action="androidGoogleLogin" ${state.googleSignInLoading ? 'disabled' : ''}>
                                <i class="fa-brands fa-google text-[var(--brand-red)]"></i>
                                <span>${state.googleSignInLoading ? 'Google 登入中...' : '使用 Google 登入'}</span>
                            </button>

                            <div class="my-4 flex items-center gap-3">
                                <div class="h-px flex-1 bg-[var(--line)]"></div>
                                <span class="bs-text-xs text-[var(--ink-500)]">或使用電郵</span>
                                <div class="h-px flex-1 bg-[var(--line)]"></div>
                            </div>

                            <div class="space-y-3">
                                ${!isLogin ? `
                                <input id="authName" type="text" placeholder="用戶名稱" class="bs-input" autocomplete="name">
                                ` : ''}
                                <input id="authEmail" type="email" placeholder="電郵地址" class="bs-input" autocomplete="email">
                                <input id="authPassword" type="password" placeholder="密碼" class="bs-input" autocomplete="${isLogin ? 'current-password' : 'new-password'}">
                            </div>

                            <button class="action-btn bs-btn bs-btn-primary mt-4 w-full" data-action="${isLogin ? 'login' : 'register'}">
                                <i class="fa-solid ${isLogin ? 'fa-arrow-right-to-bracket' : 'fa-user-plus'}"></i>
                                <span>${isLogin ? '登入' : '註冊'}</span>
                            </button>

                            ${state.errorMsg ? `<p class="mt-3 text-center bs-text-sm text-[var(--brand-red)] animate-shake">${state.errorMsg}</p>` : ''}

                            <p class="mt-4 text-center bs-text-xs text-[var(--ink-500)]">${isLogin ? '還沒有帳號？' : '已有帳號？'} <button class="action-btn font-semibold text-brand" data-action="switchAuthMode" data-mode="${isLogin ? 'register' : 'login'}">${isLogin ? '立即註冊' : '返回登入'}</button></p>
                        </div>
                    </div>
                </div>
            `;
        }


        // 步驟 2: 選擇角色
        function renderStep2Role() {
            return `
                <div class="flex h-full overflow-y-auto bg-[var(--surface-0)] px-6 py-8 text-center animate-fadeIn">
                    <div class="m-auto w-full max-w-sm">
                        <div class="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--brand-200)] bg-[var(--surface-1)] shadow-[var(--shadow-lg)] ring-8 ring-[var(--brand-50)]">
                            <i class="fa-solid fa-star bs-text-4xl text-brand"></i>
                        </div>
                        <h1 class="bs-text-3xl font-bold text-[var(--ink-900)]">星喚</h1>
                        <p class="mb-8 mt-1 bs-text-base text-[var(--ink-500)]">Beckon Stars</p>

                        <h2 class="bs-section-title mb-4 text-left">請選擇您的身份</h2>

                        <div class="space-y-4">
                            <button class="action-btn group bs-card w-full p-5 text-left flex items-center gap-4 ring-1 ring-[var(--line)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)] focus:shadow-[var(--shadow-brand)]" data-action="setRole" data-role="senior">
                                <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] bs-text-2xl text-brand transition-colors group-focus:bg-[var(--brand-100)]">
                                    <i class="fa-solid fa-person-cane"></i>
                                </div>
                                <div class="flex-1 bs-text-xl font-bold text-[var(--ink-900)]">我是長者</div>
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--ink-300)] text-[var(--ink-300)] transition-colors group-focus:border-[var(--brand-500)] group-focus:bg-[var(--brand-500)] group-focus:text-white">
                                    <i class="fa-regular fa-circle group-focus:hidden"></i>
                                    <i class="fa-solid fa-check hidden group-focus:block"></i>
                                </div>
                            </button>
                            <button class="action-btn group bs-card w-full p-5 text-left flex items-center gap-4 ring-1 ring-[var(--line)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)] focus:shadow-[var(--shadow-brand)]" data-action="setRole" data-role="child">
                                <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] bs-text-2xl text-brand transition-colors group-focus:bg-[var(--brand-100)]">
                                    <i class="fa-solid fa-children"></i>
                                </div>
                                <div class="flex-1 bs-text-xl font-bold text-[var(--ink-900)]">我是子女</div>
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--ink-300)] text-[var(--ink-300)] transition-colors group-focus:border-[var(--brand-500)] group-focus:bg-[var(--brand-500)] group-focus:text-white">
                                    <i class="fa-regular fa-circle group-focus:hidden"></i>
                                    <i class="fa-solid fa-check hidden group-focus:block"></i>
                                </div>
                            </button>
                        </div>
                    </div>
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
                <div class="h-full overflow-y-auto bg-[var(--surface-0)] px-6 py-8 animate-fadeIn">
                    <div class="mx-auto flex min-h-full w-full max-w-sm flex-col">
                        <button class="action-btn mb-6 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-700)] shadow-[var(--shadow-sm)]" data-action="backStep" data-step="1">
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <h2 class="bs-text-3xl font-bold text-[var(--ink-900)]">設定個人檔案</h2>
                        <p class="mb-6 mt-2 bs-text-base text-[var(--ink-500)]">選擇一個喜歡的頭像並輸入稱呼</p>

                        <!-- 頭像選擇 -->
                        <div class="bs-card-flat mb-6 p-5">
                            <div class="grid grid-cols-3 gap-4">
                                ${avatarOptions.map(avatar => `
                                    <button class="action-btn aspect-square rounded-full flex items-center justify-center bs-text-4xl transition-all ${state.userAvatar === avatar ? 'bg-[var(--surface-1)] shadow-[var(--shadow-md)] ring-4 ring-[var(--brand-400)] ring-offset-2 ring-offset-[var(--surface-2)] scale-105' : 'bg-[var(--surface-1)] border border-[var(--line)] opacity-70'}" data-action="selectAvatar" data-avatar="${avatar}">
                                        ${avatar}
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 稱呼輸入 -->
                        <div class="relative mb-8">
                            <label class="mb-2 block bs-text-base font-bold text-[var(--ink-700)]">您的稱呼</label>
                            <input type="text" id="nameInput" value="${state.userName}" placeholder="例如: ${state.role === 'senior' ? '媽媽, 爺爺' : '阿強, 妹妹'}" class="bs-input ${state.errorMsg ? '!border-[var(--brand-red)]' : ''}" style="font-size: var(--font-xl);">
                            ${state.errorMsg ? `<p class="absolute -bottom-6 mt-2 bs-text-sm text-[var(--brand-red)] animate-shake">${state.errorMsg}</p>` : ''}
                        </div>

                        <div class="flex-1"></div>
                        <button class="action-btn bs-btn bs-btn-primary w-full" data-action="submitProfile">
                            <span>下一步</span><i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            `;
        }
