        function syncAppViewportHeight() {
            const height = window.visualViewport?.height || window.innerHeight;
            if (height) document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
        }


        function normalizeDailyCardMode(mode) {
            return mode === 'bible' ? 'bible' : 'encouragement';
        }


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


        function resolveMediaUrl(value) {
            const url = String(value || '').trim();
            if (!url) return '';
            if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file:')) return url;
            if (url.startsWith('/')) return `${selfHostedApiBase}${url}`;
            return url;
        }


        function isRemoteUrl(value) {
            const url = String(value || '').trim();
            return url.startsWith('http://') || url.startsWith('https://');
        }


        function isImageDataUrl(value) {
            return String(value || '').trim().startsWith('data:image/');
        }


        function createDefaultDailyMessageReward() {
            return {
                count: 0,
                threshold: 20,
                remaining: 20,
                active: false,
                frameId: null,
                frameUrl: 'avatar-frame-daily.png',
                members: {},
                dateKey: ''
            };
        }


        function escapeAttribute(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }


        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }


        const appLogEntries = [];
        let serverLogEntries = [];
        let serverLogsLoading = false;
        let serverLogsError = '';


        function formatLogValue(value) {
            if (value instanceof Error) return value.stack || value.message;
            if (typeof value === 'string') return value;
            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        }


        function pushAppLog(level, args) {
            appLogEntries.push({
                time: new Date().toISOString().slice(11, 19),
                level,
                message: args.map(formatLogValue).join(' ')
            });
            if (appLogEntries.length > 120) appLogEntries.shift();
        }


        ['log', 'warn', 'error'].forEach(level => {
            const original = console[level]?.bind(console);
            console[level] = (...args) => {
                pushAppLog(level, args);
                if (original) original(...args);
            };
        });


        function formatDisplayLogLine(entry) {
            const rawTime = entry?.time ? String(entry.time) : '';
            const time = rawTime ? (rawTime.includes('T') ? rawTime.slice(11, 19) : rawTime) : '--:--:--';
            const level = String(entry?.level || 'log').toUpperCase().padEnd(5, ' ');
            return `[${time}] ${level} ${entry?.message || ''}`;
        }


        async function fetchCachedDateResource(dateStr, cache, requests, loadResource) {
            const key = dateStr || 'today';
            if (cache[key]) return cache[key];
            if (requests[key]) return requests[key];
            requests[key] = (async () => {
                try {
                    const data = await loadResource(key);
                    if (data) cache[key] = data;
                    return data;
                } finally {
                    delete requests[key];
                }
            })();
            return requests[key];
        }


        function readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }


        function compressImage(file, maxSize = 256, quality = 0.8) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const img = new Image();
                    img.onload = () => {
                        let w = img.width, h = img.height;
                        if (w > maxSize || h > maxSize) {
                            const ratio = Math.min(maxSize / w, maxSize / h);
                            w = Math.round(w * ratio);
                            h = Math.round(h * ratio);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = reject;
                    img.src = reader.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
