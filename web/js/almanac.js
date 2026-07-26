
        const almanacCache = {};
        const bibleVerseCache = {};
        const almanacRequests = {};
        const bibleVerseRequests = {};


        async function fetchAlmanac(dateStr) {
            return fetchCachedDateResource(dateStr, almanacCache, almanacRequests, async () => {
                try {
                    const dateParam = dateStr ? `?date=${dateStr}` : '';
                    const data = await serverApi(`/api/almanac${dateParam}`);
                    if (!dateStr) state.almanac = data;
                    return data;
                } catch (e) {
                    console.warn('Almanac fetch failed', e);
                    return null;
                }
            });
        }
