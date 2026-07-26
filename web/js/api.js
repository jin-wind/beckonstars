
        const selfHostedApiBase = 'http://144.79.170.102:8787';

        const useSelfHostedServer = true;


        async function serverApi(path, options = {}) {
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            if (state.authToken) {
                headers['Authorization'] = `Bearer ${state.authToken}`;
            }
            const response = await fetch(`${selfHostedApiBase}${path}`, {
                ...options,
                headers
            });
            const payload = response.status === 204 ? null : await response.json().catch(() => null);
            if (!response.ok) {
                const error = new Error(`server-${response.status}`);
                error.status = response.status;
                error.code = payload?.error || '';
                error.serverMessage = payload?.message || '';
                throw error;
            }
            return payload;
        }


        function refreshServerLogs() {
            serverLogsLoading = true;
            serverLogsError = '';
            serverApi('/api/logs?limit=80')
                .then(data => {
                    serverLogEntries = Array.isArray(data?.logs) ? data.logs : [];
                })
                .catch(error => {
                    serverLogsError = error?.message || 'server-log-fetch-failed';
                })
                .finally(() => {
                    serverLogsLoading = false;
                    if (state.showModal === 'logs') render();
                });
        }


        async function initServerBackend() {
            try {
                state.authUid = state.authUid || getOrCreateServerUid();
                console.log('[beckon] Trying server:', selfHostedApiBase + '/api/health');
                await serverApi('/api/health');
                state.backendMode = 'server';
                console.log('[beckon] Server connected! Mode:', state.backendMode);
                return true;
            } catch (error) {
                console.warn('[beckon] Self-hosted server connection failed', error);
                return false;
            }
        }


        async function uploadMediaFile(file) {
            if (!file || state.backendMode !== 'server') return null;
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const result = await serverApi('/api/media/upload', {
                    method: 'POST',
                    body: JSON.stringify({
                        data: dataUrl,
                        mime: file.type,
                        filename: file.name
                    })
                });
                return {
                    mediaUrl: result.mediaUrl,
                    thumbnailUrl: result.thumbnailUrl || result.mediaUrl,
                    width: result.width,
                    height: result.height
                };
            } catch (error) {
                console.warn('Media upload failed', error);
                throw error;
            }
        }


        async function initCloudBackend() {
            return initServerBackend();
        }
