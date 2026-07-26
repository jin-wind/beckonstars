
        function getMemoryImageSrc(memory, preferThumbnail = false) {
            const primary = memory?.imgUrl || memory?.imageUrl || memory?.img || '';
            const thumbnail = memory?.thumbnailUrl || memory?.thumbnail || '';
            return resolveMediaUrl(preferThumbnail ? (thumbnail || primary) : (primary || thumbnail));
        }


        function getMemoryAudioSrc(memory) {
            return resolveMediaUrl(memory?.audioUrl || memory?.audio || '');
        }


        function initVideoPlayer() {
            const video = document.getElementById('memVideo');
            const overlay = document.getElementById('videoOverlay');
            const playBtn = document.getElementById('videoPlayBtn');
            const playIcon = document.getElementById('videoPlayIcon');
            const progressFill = document.getElementById('videoProgressFill');
            const progressBar = document.getElementById('videoProgressBar');
            const timeDisplay = document.getElementById('videoTime');
            if (!video) return;

            let hideTimer = null;

            function formatTime(s) {
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60);
                return m + ':' + String(sec).padStart(2, '0');
            }

            function showOverlay() {
                overlay.classList.remove('opacity-0');
                overlay.classList.add('opacity-100');
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => {
                    if (!video.paused) {
                        overlay.classList.add('opacity-0');
                        overlay.classList.remove('opacity-100');
                    }
                }, 2500);
            }

            overlay.style.transition = 'opacity 0.3s ease';
            overlay.classList.add('opacity-100');

            video.addEventListener('play', () => {
                playIcon.className = 'fa-solid fa-pause text-white bs-text-3xl';
                showOverlay();
            });

            video.addEventListener('pause', () => {
                playIcon.className = 'fa-solid fa-play text-white bs-text-3xl ml-1';
                overlay.classList.remove('opacity-0');
                overlay.classList.add('opacity-100');
            });

            video.addEventListener('timeupdate', () => {
                if (video.duration) {
                    const pct = (video.currentTime / video.duration) * 100;
                    progressFill.style.width = pct + '%';
                    timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
                }
            });

            video.addEventListener('ended', () => {
                playIcon.className = 'fa-solid fa-play text-white bs-text-3xl ml-1';
                overlay.classList.remove('opacity-0');
                overlay.classList.add('opacity-100');
            });

            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (video.paused) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });

            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                if (video.paused) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });

            progressBar.addEventListener('click', (e) => {
                const rect = progressBar.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                video.currentTime = pct * video.duration;
            });

            video.addEventListener('click', () => {
                if (video.paused) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });

            video.play().catch(() => {});
        }


        async function refreshServerMemories(familyId) {
            const result = await serverApi(`/api/families/${encodeURIComponent(familyId)}/memories`);
            const incoming = (result.memories || []).map(memory => normalizeCloudMemory(memory.id, memory));
            const knownIds = new Set(state.memories.map(memory => String(memory.id)));
            if (hasLoadedCloudMemories) {
                incoming.forEach(memory => {
                    if (!knownIds.has(String(memory.id)) && memory.uid !== state.authUid) {
                        showLocalNotification(`星喚新回憶：${memory.childName}`, memory.content || '有人記錄了新回憶');
                        if (!document.hidden) {
                            showMessage(`${memory.childName} 剛記錄了新回憶！`);
                        }
                    }
                });
            }
            const changed = incoming.length !== state.memories.length || (incoming.length > 0 && incoming[incoming.length - 1].id !== state.memories[state.memories.length - 1]?.id);
            if (changed) state.memories = incoming;
            hasLoadedCloudMemories = true;
            if (changed) refreshVisibleContent();
        }


        function subscribeFamilyMemories(familyId) {
            if (unsubscribeMemories) unsubscribeMemories();
            refreshServerMemories(familyId).catch(error => {
                console.warn('Server memory sync failed', error);
            });
            const timer = setInterval(() => refreshServerMemories(familyId).catch(error => {
                console.warn('Server memory sync failed', error);
            }), 5000);
            unsubscribeMemories = () => clearInterval(timer);
        }


        function normalizeCloudMemory(id, data) {
            const date = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
            const imageUrl = data.imgUrl || data.imageUrl || data.image_url || data.img || null;
            const thumbnailUrl = data.thumbnailUrl || data.thumbnail || data.thumbnail_url || null;
            const audioUrl = data.audioUrl || data.audio_url || null;
            return {
                id,
                date: data.date || date.getDate(),
                month: data.month || (date.getMonth() + 1),
                year: data.year || date.getFullYear(),
                uid: data.uid || '',
                childId: data.childId || data.uid || 'member',
                childName: data.childName || '家庭成員',
                type: data.type || 'text',
                content: data.content || '',
                img: data.img || imageUrl,
                imgUrl: imageUrl,
                imageUrl,
                thumbnailUrl,
                audioUrl,
                duration: data.duration || 0
            };
        }
