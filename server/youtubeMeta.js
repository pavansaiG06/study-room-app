const metaCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

const MUSIC_TITLE_REGEX =
  /\b(official\s*(music\s*)?(video|audio|lyric\s*video|visualizer)|lyrics?|music\s*video|lyric\s*video|visualizer|lofi|lo-fi|beats\s*to|ost|soundtrack|instrumental|acoustic\s*version|remix|feat\.?|ft\.?|\[mv\]|\(mv\)|full\s*album|slowed|reverb)\b/i;

const STRICT_RELEASE_REGEX =
  /\b(official\s*(audio|music\s*video|lyric\s*video|visualizer)|lyric\s*video|\[mv\]|prod\.?\s*by)\b/i;

const NON_MUSIC_TITLE_REGEX =
  /\b(lecture|tutorial|course|crash\s*course|podcast|interview|documentary|vlog|gameplay|walkthrough|coding|programming|unboxing|review|explained|study\s*with\s*me\s*#?\d*)\b/i;

function extractYoutubeVideoId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/)|music\.youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

function parseSongTitleAndArtist(title, fallbackAuthor = '') {
  const cleanTitle = String(title || '')
    .replace(/\s*[\(\[]\s*(official\s*(music\s*)?(video|audio|lyric\s*video|visualizer)|lyrics?|4k|hd|hq|audio\s*only|mv)\s*[\)\]]/gi, '')
    .trim();

  const cleanAuthor = String(fallbackAuthor || '').replace(/\s*-\s*Topic$/i, '').trim();

  const dashParts = cleanTitle.split(/\s+[-–—]\s+/);
  if (dashParts.length >= 2 && dashParts[0].length <= 45) {
    return {
      artistName: dashParts[0].trim(),
      trackTitle: dashParts.slice(1).join(' - ').trim()
    };
  }

  return {
    artistName: cleanAuthor || 'YouTube',
    trackTitle: cleanTitle || String(title || 'Untitled Track')
  };
}

function classifyYoutubeHeuristic({ url = '', title = '', author = '', category = '', musicVideoType = '' }) {
  const lowerUrl = String(url).toLowerCase();
  const isMusicDomain = lowerUrl.includes('music.youtube.com');
  const isRadioMix = /[?&]list=rd/i.test(lowerUrl);
  const cleanCategory = String(category || '').trim();
  const cleanMusicType = String(musicVideoType || '').trim();
  const lowerAuthor = String(author || '').toLowerCase();

  let isSong = false;
  let confidence = 'heuristic';

  // Tier 1: Authoritative YouTube player/URL metadata
  if (
    isMusicDomain ||
    isRadioMix ||
    cleanCategory.toLowerCase() === 'music' ||
    cleanMusicType.startsWith('MUSIC_VIDEO_TYPE_')
  ) {
    isSong = true;
    confidence = 'verified';
  } else if (cleanCategory) {
    // YouTube explicitly reported another non-Music category (e.g., Education, Gaming, Science & Tech)
    isSong = STRICT_RELEASE_REGEX.test(title);
    confidence = 'verified';
  } else {
    // Tier 2: oEmbed author + title heuristics when watch HTML metadata is unavailable
    const isTopicOrVevo = /\s-\s*topic$/i.test(author) || /vevo$/i.test(author) || /\b(records|music)\b/i.test(lowerAuthor);
    const hasMusicKeyword = MUSIC_TITLE_REGEX.test(title);
    const hasNonMusicKeyword = NON_MUSIC_TITLE_REGEX.test(title);

    if (isTopicOrVevo || (hasMusicKeyword && !hasNonMusicKeyword)) {
      isSong = true;
    } else if (!hasNonMusicKeyword && /\s+[-–—]\s+/.test(title) && /official/i.test(title)) {
      isSong = true;
    }
  }

  const { artistName, trackTitle } = parseSongTitleAndArtist(title, author);
  return {
    isSong,
    mediaKind: isSong ? 'song' : 'video',
    category: cleanCategory || (isSong ? 'Music' : 'Video'),
    confidence,
    artistName,
    trackTitle
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'StudyHub/2.0' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWatchCategoryAndType(videoId, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return {};
    const html = await res.text();

    const categoryMatch =
      html.match(/"category":"([^"]{2,40})"/) ||
      html.match(/<meta\s+itemprop="genre"\s+content="([^"]{2,40})"/i);
    const musicTypeMatch = html.match(/"musicVideoType":"(MUSIC_VIDEO_TYPE_[A-Z_]+)"/);
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);

    return {
      category: categoryMatch ? categoryMatch[1] : '',
      musicVideoType: musicTypeMatch ? musicTypeMatch[1] : '',
      ogTitle: ogTitleMatch ? ogTitleMatch[1] : ''
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYoutubeMetadata(rawUrl) {
  const videoId = extractYoutubeVideoId(rawUrl);
  if (!videoId) {
    throw new Error('Please paste a valid YouTube or YouTube Music URL.');
  }

  const normalizedUrl = String(rawUrl).trim();
  const isMusicUrl = normalizedUrl.toLowerCase().includes('music.youtube.com');
  const cacheKey = `${videoId}:${isMusicUrl ? 'ytm' : 'yt'}`;

  const cached = metaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, url: normalizedUrl };
  }

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const [oembed, watchMeta] = await Promise.all([
    fetchJsonWithTimeout(oembedUrl, 3500),
    fetchWatchCategoryAndType(videoId, 3500)
  ]);

  if (!oembed && !watchMeta?.ogTitle) {
    throw new Error('Could not read YouTube metadata. Make sure the video link is public.');
  }

  const title = oembed?.title || watchMeta.ogTitle || 'YouTube Track';
  const author = oembed?.author_name || 'YouTube';
  const thumbnailUrl = oembed?.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const classification = classifyYoutubeHeuristic({
    url: normalizedUrl,
    title,
    author,
    category: watchMeta.category,
    musicVideoType: watchMeta.musicVideoType
  });

  const payload = {
    videoId,
    url: normalizedUrl,
    title,
    author,
    thumbnailUrl,
    ...classification,
    updatedAt: Date.now()
  };

  if (metaCache.size >= MAX_CACHE_SIZE) {
    const firstKey = metaCache.keys().next().value;
    if (firstKey) metaCache.delete(firstKey);
  }
  metaCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });

  return payload;
}

module.exports = {
  extractYoutubeVideoId,
  classifyYoutubeHeuristic,
  fetchYoutubeMetadata
};
