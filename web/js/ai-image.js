
        function extractAIImageUrls(content) {
            const text = String(content || '');
            const images = [];
            const seen = new Set();
            const addImage = url => {
                const value = String(url || '').trim();
                if (!value || seen.has(value)) return;
                if (!isRemoteUrl(value) && !isImageDataUrl(value)) return;
                seen.add(value);
                images.push(value);
            };

            const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)]+)\)/g;
            let match;
            while ((match = markdownImageRegex.exec(text)) !== null) {
                addImage(match[1]);
            }

            const directUrlRegex = /(https?:\/\/[^\s)]+|data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
            while ((match = directUrlRegex.exec(text)) !== null) {
                addImage(match[1]);
            }

            return images;
        }


        function downloadImage(url) {
            const imageUrl = String(url || '').trim();
            if (!imageUrl) return;

            if (Platform.supports('saveImageToGallery')) {
                Platform.saveImageToGallery(imageUrl);
                return;
            }

            try {
                const link = document.createElement('a');
                link.href = imageUrl;
                link.download = `ai-generated-${Date.now()}.jpg`;
                link.rel = 'noopener';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showMessage('✅ 圖片已開始下載到您的設備。');
            } catch (err) {
                console.error('Download failed', err);
                showMessage('下載失敗，請長按圖片保存。');
            }
        }


        async function shareGeneratedImageUrl(url) {
            const imageUrl = String(url || '').trim();
            if (!imageUrl) return;

            if (Platform.supports('shareAIImage')) {
                Platform.shareAIImage(imageUrl);
                return;
            }

            if (navigator.share) {
                try {
                    if (isRemoteUrl(imageUrl)) {
                        await navigator.share({
                            title: 'AI 生成圖片',
                            url: imageUrl
                        });
                        return;
                    }

                    if (isImageDataUrl(imageUrl)) {
                        const base64Data = imageUrl.split(',')[1];
                        const byteCharacters = atob(base64Data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const mime = imageUrl.match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
                        const blob = new Blob([byteArray], { type: mime });
                        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
                        const file = new File([blob], `ai-image-${Date.now()}.${ext}`, { type: mime });

                        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: 'AI 生成圖片'
                            });
                            return;
                        }
                    }
                } catch (err) {
                    if (err?.name === 'AbortError') return;
                    console.error('Share failed', err);
                }
            }

            if (isRemoteUrl(imageUrl) && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(imageUrl);
                    showMessage('已複製圖片鏈接，可以貼到其他 App 分享。');
                    return;
                } catch (err) {
                    console.warn('Copy image URL failed', err);
                }
            }

            showMessage('分享失敗，請先保存圖片後再分享。');
        }


        // AI 圖片專用壓縮：800px 寬、質量 0.7，約 100-200KB
        function compressAIRefImage(file, maxSize = 800, quality = 0.7) {
            return compressImage(file, maxSize, quality);
        }


        // --- AI 圖片生成視圖 ---
        function renderAIImageGen() {
            const styles = [
                { id: 'random', name: '隨機風格', icon: 'fa-shuffle' },
                { id: 'garden', name: '懷舊膠片', icon: 'fa-film', prompt: 'e2.txt' },
                { id: 'explosion', name: '爆炸動作', icon: 'fa-fire', prompt: 'e4.txt' },
                { id: 'studio', name: '影樓風格', icon: 'fa-building', prompt: 'e1.txt' },
                { id: 'vintage', name: '復古照片', icon: 'fa-camera-retro', prompt: 'e3.txt' },
                { id: 'lotus', name: '荷花問候', icon: 'fa-leaf', prompt: 'e5.txt' },
                { id: 'premium', name: '高級影樓', icon: 'fa-gem', prompt: 'e6.txt' },
                { id: 'corporate', name: '商務肖像', icon: 'fa-user-tie', prompt: 'e7.txt' },
                { id: 'korean', name: '韓系早安海報', icon: 'fa-sun', prompt: 'e8.txt' }
            ];

            return `
                <div class="flex flex-col h-full bg-[#FFF8F0]">
                    <!-- 頂部標題欄 -->
                    <div class="shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
                        <button class="action-btn w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-full transition-colors" data-action="closeAIImageGen">
                            <i class="fa-solid fa-arrow-left bs-text-lg"></i>
                        </button>
                        <h1 class="bs-text-xl font-bold text-gray-800">AI 圖片生成</h1>
                    </div>

                    <!-- 主內容區 -->
                    <div class="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                        <!-- 上傳參考圖片 -->
                        <div class="bg-white rounded-3xl shadow-sm p-6">
                            <h3 class="bs-text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <i class="fa-solid fa-image text-brand"></i>參考圖片
                            </h3>

                            ${state.aiImageRefImage ? `
                                <div class="relative rounded-2xl overflow-hidden bg-gray-100 mb-4">
                                    <img src="${state.aiImageRefImage}" class="w-full h-auto" alt="參考圖片">
                                    <button class="action-btn absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors" data-action="removeRefImage">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                            ` : `
                                <div class="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center">
                                    <i class="fa-solid fa-cloud-arrow-up bs-text-4xl text-gray-400 mb-3"></i>
                                    <p class="bs-text-sm text-gray-600 mb-4">上傳或拍攝圖片</p>
                                    <div class="flex gap-3 justify-center">
                                        <button class="action-btn px-4 py-2 bg-brand text-white rounded-xl bs-text-sm font-bold shadow-md hover:bg-brand-dark transition-colors" data-action="uploadRefImage">
                                            <i class="fa-solid fa-upload mr-1"></i>上傳圖片
                                        </button>
                                        <button class="action-btn px-4 py-2 bg-gray-600 text-white rounded-xl bs-text-sm font-bold shadow-md hover:bg-gray-700 transition-colors" data-action="captureRefImage">
                                            <i class="fa-solid fa-camera mr-1"></i>拍照
                                        </button>
                                    </div>
                                </div>
                            `}
                        </div>

                        <!-- 選擇風格 -->
                        <div class="bg-white rounded-3xl shadow-sm p-6">
                            <h3 class="bs-text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <i class="fa-solid fa-palette text-brand"></i>選擇風格
                            </h3>
                            <div class="grid grid-cols-2 gap-3">
                                ${styles.map(style => `
                                    <button class="action-btn p-4 rounded-2xl border-2 transition-all ${state.aiImageStyle === style.id ? 'border-brand bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'}" data-action="selectStyle" data-style="${style.id}">
                                        <i class="fa-solid ${style.icon} bs-text-2xl ${state.aiImageStyle === style.id ? 'text-brand' : 'text-gray-400'} mb-2"></i>
                                        <p class="bs-text-sm font-bold ${state.aiImageStyle === style.id ? 'text-brand' : 'text-gray-700'}">${style.name}</p>
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 生成數量 -->
                        <div class="bg-white rounded-3xl shadow-sm p-6">
                            <h3 class="bs-text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <i class="fa-solid fa-images text-brand"></i>生成數量
                            </h3>
                            <div class="flex gap-3">
                                ${[1,2,3,4].map(n => `
                                    <button class="action-btn flex-1 py-3 rounded-2xl border-2 transition-all ${(state.aiImageCount || 4) === n ? 'border-brand bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'}" data-action="selectImageCount" data-count="${n}">
                                        <p class="bs-text-lg font-bold ${(state.aiImageCount || 4) === n ? 'text-brand' : 'text-gray-700'}">${n}</p>
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 生成結果 -->
                        ${state.aiImageGenerating ? `
                            <div class="bg-white rounded-3xl shadow-sm p-6">
                                <div class="flex flex-col items-center justify-center py-12">
                                    <div class="w-20 h-20 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p class="bs-text-lg font-bold text-gray-800 mb-2">AI 正在生成圖片...</p>
                                    <p class="bs-text-sm text-gray-500">這可能需要 10-30 秒</p>
                                </div>
                            </div>
                        ` : state.aiImageResults.length > 0 ? `
                            <div class="bg-white rounded-3xl shadow-sm p-6">
                                <h3 class="bs-text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
                                    <span class="flex items-center gap-2">
                                        <i class="fa-solid fa-sparkles text-brand"></i>生成結果 (${state.aiImageResults.length} 張)
                                    </span>
                                    <button class="action-btn px-4 py-2 bg-brand text-white rounded-xl bs-text-sm font-bold shadow-md hover:bg-brand-dark transition-colors" data-action="downloadAllGeneratedImages">
                                        <i class="fa-solid fa-download mr-1"></i>全部保存
                                    </button>
                                </h3>

                                <!-- 圖片網格 -->
                                <div class="grid ${state.aiImageResults.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-3">
                                    ${state.aiImageResults.map((img, idx) => `
                                        <div class="relative rounded-2xl overflow-hidden bg-gray-100">
                                            <img src="${img}" class="w-full h-auto" alt="生成的圖片 ${idx + 1}">
                                            <div class="absolute bottom-2 right-2 flex gap-2">
                                                <button class="action-btn w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-black/70 transition-colors" data-action="downloadGeneratedImage" data-url="${escapeAttribute(img)}">
                                                    <i class="fa-solid fa-download bs-text-xs"></i>
                                                </button>
                                                <button class="action-btn w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-black/70 transition-colors" data-action="viewGeneratedImageFullscreen" data-url="${escapeAttribute(img)}">
                                                    <i class="fa-solid fa-expand bs-text-xs"></i>
                                                </button>
                                                <button class="action-btn w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-black/70 transition-colors" data-action="showQrCode" data-url="${escapeAttribute(img)}">
                                                    <i class="fa-solid fa-qrcode bs-text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>

                                <!-- 操作按鈕 -->
                                <div class="flex gap-3 mt-4">
                                    <button class="action-btn flex-1 py-3 bg-gray-600 text-white rounded-xl font-bold shadow-md hover:bg-gray-700 transition-colors" data-action="shareGeneratedImage" data-url="${escapeAttribute(state.aiImageResults[0])}">
                                        <i class="fa-solid fa-share-nodes mr-2"></i>分享圖片
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- 底部生成按鈕 -->
                    <div class="shrink-0 bg-white border-t border-gray-100 p-4">
                        <button class="action-btn w-full py-4 rounded-2xl font-bold bs-text-lg shadow-lg transition-colors disabled:opacity-50 ${state.aiImageGenerating ? 'bg-gray-400 text-white' : 'bg-brand text-white hover:bg-brand-dark'}" data-action="generateAIImage" ${!state.aiImageRefImage || state.aiImageGenerating ? 'disabled' : ''}>
                            ${state.aiImageGenerating ? '<i class="fa-solid fa-spinner fa-spin mr-2"></i>生成中...' : '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>開始生成'}
                        </button>
                    </div>

                    <!-- 隱藏的文件輸入 -->
                    <input type="file" id="aiImageFileInput" accept="image/*" class="hidden">
                    <input type="file" id="aiImageCameraInput" accept="image/*" capture="environment" class="hidden">
                </div>
            `;
        }


        function closeAIImageGen() {
            state.aiImageGenView = false;
            state.aiImageRefImage = null;
            state.aiImageResults = [];
            render();
        }


        window.handleAndroidImageSaveResult = function(success, message) {
            showMessage(message || (success ? '✅ 圖片已保存到手機相簿。' : '圖片保存失敗，請稍後再試。'));
        };


        // --- AI 圖片生成 ---
        async function requestSingleAIImage(prompt, refImage) {
            const result = await serverApi('/api/ai-image/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt,
                    referenceImage: refImage,
                    count: 1
                })
            });

            const images = Array.isArray(result?.images) ? result.images.filter(url => isRemoteUrl(url) || isImageDataUrl(url)) : [];
            if (images.length === 0) throw new Error('響應中未找到圖片數據');
            return images[0];
        }


        async function requestMultipleAIImages(promptProvider, refImage, count = 4) {
            console.log(`[AI Image] Requesting ${count} images sequentially...`);
            const images = [];
            for (let i = 0; i < count; i++) {
                console.log(`[AI Image] Generating image ${i + 1}/${count}...`);
                try {
                    const prompt = typeof promptProvider === 'function' ? promptProvider(i) : promptProvider;
                    const image = await requestSingleAIImage(prompt, refImage);
                    images.push(image);
                    console.log(`[AI Image] Image ${i + 1} done`);
                    if (i < count - 1) await new Promise(r => setTimeout(r, 1000));
                } catch (err) {
                    console.warn(`[AI Image] Image ${i + 1} failed:`, err);
                }
            }
            console.log(`[AI Image] Got ${images.length}/${count} images`);
            if (images.length === 0) throw new Error('所有圖片生成請求都失敗了');
            return images;
        }


        function isFatalAIImageError(error) {
            const status = Number(error?.status);
            const message = String(error?.message || '').toLowerCase();
            return status === 401 ||
                status === 403 ||
                status === 429 ||
                status >= 500 ||
                message.includes('captcha') ||
                message.includes('recaptcha') ||
                message.includes('沒有可用') ||
                message.includes('token');
        }


        async function handleGenerateAIImage() {
            console.log('[AI Image] handleGenerateAIImage called');
            if (!state.aiImageRefImage || state.aiImageGenerating) return;

            state.aiImageGenerating = true;
            state.aiImageResults = [];
            state.aiImageProgress = 0;
            render();
            showMessage('正在連接 AI 服務器，生成圖片中...');

            try {
                let prompt = '基於參考圖片，保持圖片中主體人物的面部特徵、姿勢和構圖，進行藝術風格轉換';

                const stylePrompts = {
                    "studio": "A high-resolution, full-body portrait photograph of a single person (the character, described below, but from a neutral gender template) standing against a plain, light-grey wall. The character has a sincere, pleasant, but slightly practiced smile. They are standing alone, facing forward, wearing the identical grey short-sleeve t-shirt with the green leaf and white flower patterns on the shoulders, and holding their hands joined at the waist, forming a downward-pointing triangle, exactly as seen in image_0.png. The pose is precise. The person's face is new (placeholder for image_1.png relative), but has the same expression.  All the Chinese text from image_0.png is precisely overlaid in its original positions and colors:  Top-left (Large, Red, Horizontal): \"早安\"  Far-left (Vertical, Red): \"笑口常開\"  Inner-left (Vertical, Red): \"开心微微笑\"  Middle-left (Vertical, Red): \"甜美要大方\"  Inner-right (Vertical, Red): \"甜甜笑一笑\"  Far-right (Vertical, Yellow with dark outline): \"人人都喜愛\"  The scene is lit with bright, even studio light, giving it a slightly institutional feel. The background wall is otherwise bare, except for a small, out-of-focus brass plaque in the far distance reading 'OFFICIAL GREETING DEPT.' to add to the forced-institutional humor. The entire image has a high-quality, sharp finish. This prompt is designed as a template to accept a specific person (male or female) in place of the character and to fit them into this exact visual, text-heavy frame. The character described is a neutral, pleasant individual.  \n--嚴格參考參考圖人物\n-ar3:4",
                    "garden": "A scanned analog photograph (vintage film grain, warm faded colors) of the smiling [主體] (based on image_1.png), posing exactly like the woman in image_0.png with joined hands in a downward triangle. The subject is wearing the identical light grey short-sleeve t-shirt with green leaf and white flower embroidery on the shoulders, standing against a subtly faded studio background.  All six lines of Chinese text from image_0.png are precisely overlaid in the same positions, using the exact traditional fonts and colors, but appearing slightly aged and part of the photograph's print:  Top-left large horizontal red text: \"早安\"  Far-left vertical red text: \"笑口常開\"  Inner-left vertical red text: \"开心微微笑\"  Middle-left vertical red text: \"甜美要大方\"  Inner-right vertical red text: \"甜甜笑一笑\"  Far-right vertical yellow text with black outline: \"人人都喜愛\"  The overall aesthetic is nostalgic and comforting, like an old family keepsake.  \n--ar 3:4  \n--嚴格參考參考圖人物",
                    "vintage": "Aspect ratio 3:4. A scanned analog photograph (vintage film grain, warm faded colors) of a smiling young woman with closed eyes (based on image_7f1fee.jpg), posing with both hands raised near the face making the \"OK\" gesture. The subject is wearing a light purple ribbed mock-neck short-sleeve top, standing against a subtly faded studio background. The overall aesthetic is nostalgic and comforting, like an old family keepsake.  TYPOGRAPHY (STRICTLY CHINESE CHARACTERS):\nAll six lines of Chinese text are precisely overlaid in the same positions, using the exact traditional fonts and colors, but appearing slightly aged and part of the photograph's print:  Top-left large horizontal red text: \"早安\"  Far-left vertical red text: \"笑口常開\"  Inner-left vertical red text: \"开心微微笑\"  Middle-left vertical red text: \"甜美要大方\"  Inner-right vertical red text: \"甜甜笑一笑\"  Far-right vertical yellow text with black outline: \"人人都喜愛\"\n--ar 3:4  \n--嚴格參考參考圖人物",
                    "explosion": "Aspect ratio 3:4. A professional, hyper-realistic photo of the smiling young woman with closed eyes from image_7f1fee.jpg, maintaining the exact same serene expression and pose with both hands raised near the face making the \"OK\" gesture. She is wearing her identical light purple ribbed mock-neck short-sleeve top. The entire scene around her, however, is a chaotic action movie explosion. Huge fireballs are blooming behind her from a multi-car pileup, debris is flying, and smoke fills the air. She stands perfectly still and peaceful.  TYPOGRAPHY (STRICTLY CHINESE CHARACTERS):\nThe text is precisely overlaid in its original positions, colors, and fonts, making the wholesome messages look ridiculous in the fiery chaos:  Top-left (Large Red): \"早安\"  Left Side (Vertical Red): \"笑口常開\", \"开心微微笑\", \"甜美要大方\"  Right Side (Vertical): \"甜甜笑一笑\" (Red), \"人人都喜愛\" (Yellow with black outline)\n--ar 3:4",
                    "lotus": "A soft-lit greeting card.\n\nSubject: [替換為您的參考圖特徵], wearing a light purple ribbed mock-neck top. Hands raised near face, making \"OK\" gestures.\n\nEnvironment: Weeping willow branches top-left. Misty blue mountains background. Bottom foreground: green lotus leaves, pink lotus flowers, a red dragonfly, and a blue dragonfly.\n\nTYPOGRAPHY (STRICTLY CHINESE CHARACTERS / HANZI):\nYou must generate exact Chinese text. DO NOT USE ENGLISH.\n\nTop-right (Vertical, large, yellow with black outline, exact Chinese text): \"早安\"\n\nLeft side (Vertical, green with black outline, exact Chinese text): \"您好又是美好的一天\"\n--ar 3:4  \n--嚴格參考參考圖人物",
                    "premium": "A premium, highly formal minimalist studio portrait of a single person (unisex) against a seamless dark charcoal-grey backdrop. The subject is wearing a crisp, high-quality, light grey designer top. They have a dignified, serene smile and are posing with hands perfectly joined at the waist in a downward triangle. Dramatic, professional studio lighting (Rembrandt lighting) highlighting their facial features while casting elegant shadows.\n\nAll original Chinese text from the reference image is overlaid exactly in its original positions, maintaining the original color scheme, creating a striking contrast against the dark background:\n\nTop-left: \"早安\" (Large Red)\n\nLeft side vertical columns: \"笑口常開\", \"开心微微笑\", \"甜美要大方\" (All Red)\n\nRight side vertical columns: \"甜甜笑一笑\" (Red), \"人人都喜愛\" (Yellow with dark outline)\n--ar 3:4  \n--嚴格參考參考圖人物",
                    "corporate": "A high-end, formal corporate portrait photo of a single professional person (unisex) standing in a luxurious, modern glass-walled office. A blurred city skyline is visible in the background. The person is wearing a well-tailored, dark formal business suit, smiling confidently and warmly at the camera. They are maintaining the exact hand pose from the reference: hands joined at the waist, fingers pointing down in a triangle. Cinematic, soft diffused lighting.\n\nThe exact Chinese text is elegantly overlaid in its original precise positions and colors, but using a refined, professional font:\n\nTop-left (Large, Red, Horizontal): \"早安\"\n\nFar-left (Vertical, Red): \"笑口常開\"\n\nInner-left (Vertical, Red): \"开心微微笑\"\n\nMiddle-left (Vertical, Red): \"甜美要大方\"\n\nInner-right (Vertical, Red): \"甜甜笑一笑\"\n\nFar-right (Vertical, Yellow with black outline): \"人人都喜愛\"\n--ar 3:4  \n--嚴格參考參考圖人物",
                    "korean": "A masterpiece with highest image quality, 8K resolution, cinematic lighting. A Korean-style morning greeting poster (Morning greeting poster) fused with avant-garde fashion photography. The subject from image_0.png is captured with extreme dynamic perspective (ultra-wide angle or slight fisheye lens distortion creating dramatic low-angle or high-angle compression). The subject is positioned within a bright, warm, minimalist geometric solid-color background composed of large blocks of high-key yellow, sky blue, or pure white, presenting a strong modern minimalist typography aesthetic.\n\nBold, graphic-design-forward Korean morning greeting typography is seamlessly integrated into the composition and negative space as pop-art visual symbols. Large Korean text \"좋은 아침\" is prominently placed as a dominant typographic element. Additional Korean text \"좋은 하루 되세요\" is elegantly positioned as a secondary greeting. The Korean typography serves as both decorative pop-art signage and functional morning greeting communication.\n\nLighting uses high-contrast studio hard light interwoven with clear, transparent morning dawn rays. Contours are razor-sharp with crisp, well-defined hard shadows. The subject displays an energetic, vibrant instantaneous dynamic pose with strong camera interaction and a positive, uplifting morning emotional tone.\n\nKorean fashion magazine cover-level quality (Korean Fashion Editorial). Visual information density is highly condensed between the subject and Korean typographic elements. The large solid-color background provides a premium sense of breathing space. Commercial-grade post-processing color mapping, extreme clarity in material textures, stripped of extraneous clutter. The overall image is filled with contemporary pop-culture context, flawless digital poster quality, and immense visual tension with a morning greeting atmosphere.\n--ar 3:4  \n--嚴格參考參考圖人物"
                };

                const styleIds = Object.keys(stylePrompts);
                const pickRandomStyleId = () => styleIds[Math.floor(Math.random() * styleIds.length)];
                const getPromptForRequest = imageIndex => {
                    if (state.aiImageStyle === 'random') {
                        const randomStyleId = pickRandomStyleId();
                        console.log(`[AI Image] Random style for image ${imageIndex + 1}:`, randomStyleId);
                        return stylePrompts[randomStyleId];
                    }
                    return stylePrompts[state.aiImageStyle] || prompt;
                };

                console.log('[AI Image] Starting request with style:', state.aiImageStyle, 'count:', state.aiImageCount || 4);

                const images = await requestMultipleAIImages(getPromptForRequest, state.aiImageRefImage, state.aiImageCount || 4);
                state.aiImageResults = images;
                state.aiImageProgress = 100;
                render();

                showMessage(`🎉 成功生成 ${images.length} 張圖片！`);
            } catch (error) {
                console.error('[AI Image] Generation error:', error);
                let errorMsg = '請檢查網絡連接或稍後再試';
                if (error.message?.includes('Unauthorized')) {
                    errorMsg = '服務器認證失敗，請聯系管理員更新賬號憑證';
                } else if (error.message?.includes('沒有可用賬號')) {
                    errorMsg = '服務器賬號憑證已過期，請聯系管理員重新登錄 Google Flow';
                } else if (error.serverMessage) {
                    errorMsg = error.serverMessage;
                } else if (error.message) {
                    errorMsg = error.message;
                }
                showMessage(`❌ 圖片生成失敗：${errorMsg}`);
            }

            state.aiImageGenerating = false;
            render();
        }
