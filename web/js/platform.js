        const isAndroidApk = () => typeof window !== 'undefined' && !!window.BeckonStarsAndroid;

        const getRuntimeNotificationPermission = () => {
            if (isAndroidApk()) {
                try {
                    return window.BeckonStarsAndroid.getNotificationPermission();
                } catch (error) {
                    return 'default';
                }
            }
            return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
        };


        function playRewardHaptic() {
            try {
                if (isAndroidApk() && window.BeckonStarsAndroid?.playRewardHaptic) {
                    window.BeckonStarsAndroid.playRewardHaptic();
                    return;
                }
            } catch (error) {
                console.warn('Reward haptic bridge failed', error);
            }
            try {
                navigator.vibrate?.([35, 45, 70]);
            } catch (error) {
                // Haptics are optional.
            }
        }

        const CURRENT_VERSION_CODE = window.BeckonStarsAndroid?.getVersionCode?.() || 0;


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
