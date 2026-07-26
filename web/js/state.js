        // --- 核心狀態與數據 ---

        const today = new Date();

        syncAppViewportHeight();

        window.addEventListener('resize', syncAppViewportHeight);
        window.visualViewport?.addEventListener('resize', syncAppViewportHeight);
        window.visualViewport?.addEventListener('scroll', syncAppViewportHeight);

        const state = {
            appReady: false,         // 是否已完成引導流程
            onboardingStep: 1,       // 1:登入/註冊, 2:選擇角色, 3:設定檔案, 4:綁定日曆
            role: null,              // 'senior' 或 'child'
            userName: '',            // 使用者名稱
            userAvatar: null,        // 使用者頭像
            connectionMode: null,    // 'select', 'create', 'join'
            calendarCode: null,      // 系統生成的6位數邀請碼
            errorMsg: '',            // 介面錯誤提示
            authMode: 'login',       // 'login' 或 'register'

            // 用戶認證
            authToken: null,         // JWT Token
            currentUser: null,       // 用戶資訊 { userId, email, name, picture, families }
            googleSignInLoading: false,

            currentTab: 'calendar',  // 'calendar', 'chat', 'rewards', 'profile'
            calendarMode: 'tear-off',// 'tear-off', 'monthly'
            calendarYear: today.getFullYear(),
            calendarMonth: today.getMonth() + 1,
            calendarDay: today.getDate(),
            dailyCardMode: 'encouragement', // 'encouragement' 或 'bible'
            points: 240,
            dailyMessages: 0,
            claimedDailyReward: false,
            dailyMessageReward: {
                count: 0,
                threshold: 20,
                remaining: 20,
                active: false,
                frameUrl: 'avatar-frame-daily.png',
                members: {},
                dateKey: ''
            },
            redeemedRewards: [],
            dailyRewardCelebration: null,
            showModal: null,         // 'addMemory', 'memoryDetail', 'videoPlayer', 'messageBox', 'dailyRewardCelebration', 'confirmReset'
            videoGenerating: false,
            videoUrl: null,
            videoError: null,
            almanac: null,
            selectedDate: null,
            modalMessage: '',        // 通用彈窗訊息
            pendingMemoryType: 'text',
            pendingMemoryContent: '',
            pendingMemoryImage: '',
            pendingMemoryAudio: null,           // base64 data URL for recorded audio
            pendingMemoryAudioDuration: 0,      // duration in seconds
            recordingForMemory: false,          // flag to distinguish memory recording from chat
            isRecordingMemory: false,           // flag to show recording in progress UI
            voiceRecording: createIdleVoiceRecordingState(),
            transcribingMessageId: null,
            backendMode: 'server',
            authUid: null,
            familyId: null,
            notificationPermission: getRuntimeNotificationPermission(),
            canInstallApp: false,
            pushStatus: '未開啟推送',
            pushTokenCount: 0,
            pushTokenPreview: '',
            seniorMode: false,
            summarizingChat: false,
            chatSummaryContent: '',

            // AI 圖片生成
            aiImageGenView: false,           // 是否顯示 AI 圖片生成頁面
            aiImageRefImage: null,            // 參考圖片 (base64 data URL)
            aiImageStyle: 'random',           // 選擇的風格
            aiImageGenerating: false,         // 是否正在生成
            aiImageResults: [],               // 生成的圖片結果數組
            aiImageCount: 4,                  // 生成圖片數量 (1-4)
            selectedGeneratedImageIndex: 0,   // 查看的圖片索引
            selectedGeneratedImageUrl: null,  // 全屏查看的圖片 URL
            selectedQrImageUrl: '',           // QR Code 顯示的圖片 URL

            memories: [
                { id: 1, date: today.getDate(), month: today.getMonth() + 1, childId: 'child_1', childName: '大仔 (阿強)', type: 'photo', content: '今日去咗飲茶，啲點心好靚！', img: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=300&q=80' },
                { id: 2, date: today.getDate() - 2, month: today.getMonth() + 1, childId: 'child_2', childName: '細女 (阿妹)', type: 'text', content: '買咗件新衫俾媽咪，週末攞返去！', img: null },
                { id: 3, date: today.getDate() - 5, month: today.getMonth() + 1, childId: 'child_1', childName: '大仔 (阿強)', type: 'audio', content: '錄音分享：今日返工遇到嘅趣事', img: null },
            ],

            messages: [
                { id: 1, senderId: 'senior', senderName: '媽媽', type: 'text', content: '阿強，今晚返唔返嚟食飯呀？', time: '10:00', childId: 'child_1' },
                { id: 2, senderId: 'child_1', senderName: '我', type: 'text', content: '今晚要OT呀，你哋自己食先啦！', time: '10:15', childId: 'child_1' },
                { id: 3, senderId: 'senior', senderName: '媽媽', type: 'audio', content: '[長達2分鐘的錄音]', aiSummary: 'AI 摘要：提你記得著褸，同埋帶遮，唔好唔記得食夜晚。', time: '14:30', childId: 'child_1' },
                { id: 4, senderId: 'child_2', senderName: '細女 (阿妹)', type: 'text', content: '媽咪，週末不如去行山？', time: '昨天', childId: 'child_2' }
            ],

            rewards: [
                { id: 1, title: 'TMCSS超級市場 $50 優惠券', points: 500, icon: 'fa-shopping-cart', color: 'bg-blue-100 text-blue-600' },
                { id: 2, title: 'TMCSS茶樓 點心八折券', points: 300, icon: 'fa-mug-hot', color: 'bg-orange-100 text-orange-600' },
                { id: 3, title: 'TMCSS康樂設施 免費租借一次', points: 200, icon: 'fa-table-tennis', color: 'bg-green-100 text-green-600' }
            ]
        };


        const STORAGE_KEY = 'beckon-stars-demo-state-v1';
        const DAILY_CARD_MODE_KEY = 'beckon-stars-daily-card-mode';
        const DAILY_REWARD_CELEBRATED_DATE_KEY = 'beckon-stars-daily-reward-celebrated-date';

        const familyEncouragementMessages = [
            '今日適宜同屋企人去飲茶',
            '今日適宜同媽咪打個視像電話',
            '今日適宜一齊去行公園散步',
            '今日適宜分享一張靚靚風景相',
            '今日適宜同屋企人分享一件開心事 ✨'
        ];

        const initialState = JSON.parse(JSON.stringify(state));

        let unsubscribeMessages = null;
        let unsubscribeMemories = null;
        let hasLoadedCloudMessages = false;
        let hasLoadedCloudMemories = false;
        let shouldStickChatToBottom = false;
        let shouldRestoreChatInputFocus = false;
        let chatDraft = '';
        let lastRenderedMessageCount = state.messages.length;

        const voicePlayback = {
            audio: null,
            messageId: null,
            duration: 0,
            currentTime: 0,
            isPlaying: false
        };


        let voiceRecordingTimer = null;


        function mergeDailyMessageReward(patch = {}) {
            const previous = state.dailyMessageReward || createDefaultDailyMessageReward();
            const threshold = Number(patch.threshold ?? previous.threshold ?? 20);
            const count = Math.max(0, Number(patch.count ?? previous.count ?? 0));
            const active = count >= threshold || Boolean(patch.active);
            const frameUrl = patch.frameUrl ?? previous.frameUrl ?? 'avatar-frame-daily.png';
            const next = {
                ...previous,
                ...patch,
                count,
                threshold,
                remaining: Math.max(threshold - count, 0),
                active,
                frameUrl,
                frameId: patch.frameId ?? (active ? (previous.frameId || 'daily-message-avatar-frame') : null),
                members: patch.members ?? previous.members ?? {},
                dateKey: patch.dateKey ?? previous.dateKey ?? ''
            };
            state.dailyMessages = count;
            state.dailyMessageReward = next;
            return next;
        }


        function getRewardStatusForCurrentUser(status) {
            if (!status) return null;
            if (status.currentUser) return status.currentUser;
            if (state.authUid && status.members?.[state.authUid]) return status.members[state.authUid];
            return null;
        }


        function updateDailyMessageRewardStatus(status) {
            if (!status) return { activeChanged: false, countChanged: false };
            const previousActive = !!state.dailyMessageReward?.active;
            const previousCount = Number(state.dailyMessageReward?.count || 0);
            const previousDateKey = state.dailyMessageReward?.dateKey || '';
            const current = getRewardStatusForCurrentUser(status) || {};
            const reward = status.reward || {};
            const threshold = Number(current.threshold || reward.threshold || state.dailyMessageReward?.threshold || 20);
            const count = Number(current.count || 0);
            mergeDailyMessageReward({
                count,
                threshold,
                active: !!current.active,
                frameId: current.frameId || null,
                frameUrl: current.frameUrl || reward.frameUrl || state.dailyMessageReward?.frameUrl || 'avatar-frame-daily.png',
                members: status.members || {},
                dateKey: status.dateKey || ''
            });
            return {
                activeChanged: previousActive !== state.dailyMessageReward.active || previousDateKey !== state.dailyMessageReward.dateKey,
                countChanged: previousCount !== count
            };
        }


        function getDailyRewardCelebrationDateKey(reward = state.dailyMessageReward) {
            return reward?.dateKey || getDisplayedDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
        }


        function hasCelebratedDailyReward(reward = state.dailyMessageReward) {
            const dateKey = getDailyRewardCelebrationDateKey(reward);
            return !!dateKey && localStorage.getItem(DAILY_REWARD_CELEBRATED_DATE_KEY) === dateKey;
        }


        function getAvatarFrameForUser(userId) {
            if (!userId) return '';
            const memberStatus = state.dailyMessageReward?.members?.[userId];
            if (memberStatus?.active) return memberStatus.frameUrl || state.dailyMessageReward?.frameUrl || 'avatar-frame-daily.png';
            if (userId === state.authUid && state.dailyMessageReward?.active) return state.dailyMessageReward.frameUrl || 'avatar-frame-daily.png';
            return '';
        }


        function loadDemoData() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (!saved) {
                    state.dailyCardMode = normalizeDailyCardMode(localStorage.getItem(DAILY_CARD_MODE_KEY) || state.dailyCardMode);
                    return;
                }
                Object.assign(state, saved, {
                    errorMsg: '',
                    showModal: null,
                    modalMessage: '',
                    dailyRewardCelebration: null,
                    selectedDate: null,
                    aiImageGenView: false,
                    aiImageGenerating: false,
                    aiImageRefImage: null,
                    aiImageResults: [],
                    selectedGeneratedImageUrl: null,
                    pendingMemoryType: saved.pendingMemoryType || 'text',
                    dailyCardMode: normalizeDailyCardMode(localStorage.getItem(DAILY_CARD_MODE_KEY) || saved.dailyCardMode || 'encouragement'),
                    backendMode: 'server',
                    authUid: saved.authUid || null,
                    familyId: saved.familyId || saved.calendarCode || null,
                    dailyMessageReward: saved.dailyMessageReward || {
                        count: 0,
                        threshold: 20,
                        remaining: 20,
                        active: false,
                        frameUrl: 'avatar-frame-daily.png',
                        members: {},
                        dateKey: ''
                    },
                    notificationPermission: getRuntimeNotificationPermission(),
                    canInstallApp: false,
                    pushStatus: '未開啟推送',
                    pushTokenCount: saved.pushTokenCount || 0,
                    pushTokenPreview: saved.pushTokenPreview || '',
                    googleSignInLoading: false,
                    voiceRecording: createIdleVoiceRecordingState()
                });
                if (state.currentTab === 'leaderboard') state.currentTab = 'profile';
                mergeDailyMessageReward(state.dailyMessageReward);
            } catch (error) {
                console.warn('Unable to load demo data', error);
            }
        }


        let _saveTimer = null;

        function saveDemoData() {
            if (_saveTimer) return;
            _saveTimer = setTimeout(() => {
                _saveTimer = null;
                const data = JSON.parse(JSON.stringify(state));
                data.errorMsg = '';
                data.showModal = null;
                data.modalMessage = '';
                data.dailyRewardCelebration = null;
                data.selectedDate = null;
                data.pendingMemoryImage = '';
                data.pushStatus = '';
                data.googleSignInLoading = false;
                data.voiceRecording = createIdleVoiceRecordingState();
                data.dailyMessageReward = state.dailyMessageReward;
                // 保留最近的數據，避免 localStorage 過大
                data.messages = (state.messages || []).slice(-50).map(m => ({
                    id: m.id, senderId: m.senderId, senderName: m.senderName,
                    type: m.type, content: m.content, time: m.time, childId: m.childId,
                    uid: m.uid, img: m.img ? '(saved)' : null, audio: null,
                    transcript: m.transcript || '', aiSummary: m.aiSummary || null
                }));
                data.memories = (state.memories || []).slice(-20).map(m => ({
                    id: m.id, date: m.date, month: m.month, year: m.year,
                    uid: m.uid, childId: m.childId, childName: m.childName,
                    type: m.type, content: m.content, img: m.img ? '(saved)' : null
                }));
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }, 500);
        }


        function getOrCreateServerUid() {
            const key = 'beckon-stars-server-uid';
            let uid = localStorage.getItem(key);
            if (!uid) {
                uid = `apk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
                localStorage.setItem(key, uid);
            }
            return uid;
        }


        function resetDemoData() {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(DAILY_CARD_MODE_KEY);
            Object.assign(state, JSON.parse(JSON.stringify(initialState)));
            state.notificationPermission = getRuntimeNotificationPermission();
            state.canInstallApp = !!deferredInstallPrompt;
            state.pushStatus = '未開啟推送';
            state.pushTokenCount = 0;
            state.pushTokenPreview = '';
        }


        const avatars = {
            senior: ['👵', '👴', '🧓', '👨‍🦳', '🐶', '🐱'],
            child: ['👩', '👨', '👧', '👦', '🐼', '🐰']
        };
