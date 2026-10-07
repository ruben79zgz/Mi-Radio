(() => {
  'use strict';

  const stations = window.RADIO_STATIONS || [];
  const podcastSources = window.PODCAST_SOURCES || [];
  const tvConfig = window.TV_CONFIG || { spanish: [] };

  const audio = document.getElementById('audio');
  const grid = document.getElementById('stationsGrid');
  const filtersEl = document.getElementById('filters');
  const searchInput = document.getElementById('searchInput');
  const radioView = document.getElementById('radioView');
  const podcastView = document.getElementById('podcastView');
  const tvView = document.getElementById('tvView');
  const radioModeBtn = document.getElementById('radioModeBtn');
  const podcastModeBtn = document.getElementById('podcastModeBtn');
  const tvModeBtn = document.getElementById('tvModeBtn');
  const eyebrow = document.getElementById('eyebrow');

  const podcastShows = document.getElementById('podcastShows');
  const podcastUpdated = document.getElementById('podcastUpdated');
  const podcastDiscoveryInput = document.getElementById('podcastDiscoveryInput');
  const podcastDiscoveryBtn = document.getElementById('podcastDiscoveryBtn');
  const podcastDiscoveryStatus = document.getElementById('podcastDiscoveryStatus');
  const podcastSearchResults = document.getElementById('podcastSearchResults');
  const podcastLibraryView = document.getElementById('podcastLibraryView');
  const podcastDetailView = document.getElementById('podcastDetailView');
  const podcastBackBtn = document.getElementById('podcastBackBtn');
  const podcastRefreshBtn = document.getElementById('podcastRefreshBtn');
  const podcastShowImage = document.getElementById('podcastShowImage');
  const podcastShowAuthor = document.getElementById('podcastShowAuthor');
  const podcastShowName = document.getElementById('podcastShowName');
  const podcastShowDescription = document.getElementById('podcastShowDescription');
  const podcastUnsubscribeBtn = document.getElementById('podcastUnsubscribeBtn');
  const episodeSearchInput = document.getElementById('episodeSearchInput');
  const episodesList = document.getElementById('episodesList');

  const playerBar = document.getElementById('playerBar');
  const playerLogo = document.getElementById('playerLogo');
  const playerMetaButton = document.getElementById('playerMetaButton');
  const playerName = document.getElementById('playerName');
  const playerStatus = document.getElementById('playerStatus');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const radioPlayerActions = document.getElementById('radioPlayerActions');
  const podcastPlayerActions = document.getElementById('podcastPlayerActions');
  const podcastPlayPauseBtn = document.getElementById('podcastPlayPauseBtn');
  const back30CompactBtn = document.getElementById('back30CompactBtn');
  const forward30CompactBtn = document.getElementById('forward30CompactBtn');

  const muteBtn = document.getElementById('muteBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const volumeControl = document.getElementById('volumeControl');

  const podcastPlayerDialog = document.getElementById('podcastPlayerDialog');
  const closePodcastPlayerBtn = document.getElementById('closePodcastPlayerBtn');
  const podcastPlayerImage = document.getElementById('podcastPlayerImage');
  const podcastPlayerTitle = document.getElementById('podcastPlayerTitle');
  const podcastPlayerShow = document.getElementById('podcastPlayerShow');
  const podcastSeekSlider = document.getElementById('podcastSeekSlider');
  const podcastCurrentTime = document.getElementById('podcastCurrentTime');
  const podcastDuration = document.getElementById('podcastDuration');
  const podcastBigPlayPauseBtn = document.getElementById('podcastBigPlayPauseBtn');
  const back30Btn = document.getElementById('back30Btn');
  const forward30Btn = document.getElementById('forward30Btn');
  const playbackRateSelect = document.getElementById('playbackRateSelect');

  const radioPlayerDialog = document.getElementById('radioPlayerDialog');
  const closeRadioPlayerBtn = document.getElementById('closeRadioPlayerBtn');
  const radioPlayerImage = document.getElementById('radioPlayerImage');
  const radioPlayerFallback = document.getElementById('radioPlayerFallback');
  const radioPlayerTitle = document.getElementById('radioPlayerTitle');
  const radioPlayerSub = document.getElementById('radioPlayerSub');
  const radioStopBigBtn = document.getElementById('radioStopBigBtn');
  const radioBigPlayPauseBtn = document.getElementById('radioBigPlayPauseBtn');

  const tvRefreshBtn = document.getElementById('tvRefreshBtn');
  const tvChannelsGrid = document.getElementById('tvChannelsGrid');
  const tvPlayerPanel = document.getElementById('tvPlayerPanel');
  const tvVideo = document.getElementById('tvVideo');
  const tvPlayerName = document.getElementById('tvPlayerName');
  const tvPlayerStatus = document.getElementById('tvPlayerStatus');
  const tvCloseBtn = document.getElementById('tvCloseBtn');
  const tvWebFallback = document.getElementById('tvWebFallback');
  const tvFallbackLogo = document.getElementById('tvFallbackLogo');
  const tvFallbackTitle = document.getElementById('tvFallbackTitle');
  const tvOpenWebBtn = document.getElementById('tvOpenWebBtn');
  const tvCountryButtons = [...document.querySelectorAll('[data-tv-country]')];

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialog = document.getElementById('settingsDialog');
  const sleepSelect = document.getElementById('sleepSelect');
  const toast = document.getElementById('toast');

  const TDT_URL = 'https://raw.githubusercontent.com/LaQuay/TDTChannels/master/RADIO.md';
  const RB_MIRRORS = [
    'https://de1.api.radio-browser.info',
    'https://fi1.api.radio-browser.info',
    'https://at1.api.radio-browser.info'
  ];

  const FALLBACK_KEY = 'mi-radio-fallback-v1';
  const SLEEP_KEY = 'mi-radio-sleep-v1';
  const VOLUME_KEY = 'mi-radio-volume-v1';
  const MUTED_KEY = 'mi-radio-muted-v1';
  const FAVORITES_KEY = 'mi-radio-favorites-v1';
  const PODCAST_POS_PREFIX = 'mi-radio-podcast-pos-v1:';
  const PODCAST_RATE_KEY = 'mi-radio-podcast-rate-v1';
  const PODCAST_SUBS_KEY = 'mi-radio-podcast-subs-v1';
  const PODCAST_APPLE_CACHE_KEY = 'mi-radio-podcast-apple-cache-v1';
  const PODCAST_PLAY_STATE_KEY = 'mi-radio-podcast-play-state-v1';
  const LAST_PODCAST_KEY = 'mi-radio-last-podcast-v1';
  const LAST_UI_MODE_KEY = 'mi-radio-last-ui-mode-v1';
  const APPLE_CACHE_MAX_AGE = 30 * 60 * 1000;
  const EPISODE_PAGE_SIZE = 120;

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('mi-radio-manual-') || key.startsWith('mi-radio-resolved-')) {
      localStorage.removeItem(key);
    }
  }

  let currentUiMode = 'radio';
  let currentFilter = 'Todas';
  let query = '';
  let currentStation = null;
  let currentStream = '';
  let currentCandidates = [];
  let candidateIndex = 0;
  let hls = null;
  let repairing = false;
  let repairAttemptedForPlay = false;

  let podcastData = { updatedAt: null, podcasts: [] };
  let selectedPodcastId = null;
  let episodeQuery = '';
  let currentPodcastShow = null;
  let currentEpisode = null;
  let podcastSearchResultsData = [];
  let podcastSearchBusy = false;
  let podcastRefreshPromise = null;
  let episodeVisibleLimit = EPISODE_PAGE_SIZE;

  let tvCountry = 'España';
  let tvSpanishChannels = [];
  let tvRussianChannels = [];
  let tvLoaded = false;
  let currentTvChannel = null;
  let tvHls = null;
  let tvDash = null;

  let mediaKind = null; // radio | podcast
  let playIntent = false; // true mientras el usuario NO haya pulsado pausa/stop
  let sourceLoading = false;
  let reconnectTimer = null;
  let stallCheckTimer = null;
  let networkCheckTimer = null;
  let reconnectAttempt = 0;
  let lastProgressAt = Date.now();
  let lastAudioTime = 0;
  let lastPositionSaveAt = 0;

  let sleepTimer = null;
  let toastTimer = null;
  let lastAudibleVolume = 0.85;

  const fallbackCache = safeJson(localStorage.getItem(FALLBACK_KEY), {});
  const favorites = new Set(safeJson(localStorage.getItem(FAVORITES_KEY), []));
  let podcastSubscriptions = safeJson(localStorage.getItem(PODCAST_SUBS_KEY), []);
  let applePodcastCache = safeJson(localStorage.getItem(PODCAST_APPLE_CACHE_KEY), {});
  let podcastPlayStates = safeJson(localStorage.getItem(PODCAST_PLAY_STATE_KEY), {});
  let lastPodcastSnapshot = safeJson(localStorage.getItem(LAST_PODCAST_KEY), null);

  function safeJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  const escapeAttr = escapeHtml;

  function normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function setImage(img, src, fallback = 'icons/icon-192.png') {
    img.style.display = '';
    img.onerror = () => {
      img.onerror = null;
      if (fallback && img.src !== new URL(fallback, location.href).href) img.src = fallback;
    };
    img.src = src || fallback;
  }

  function logoCandidates(station) {
    return [...new Set([station.logo, ...(station.logoFallbacks || [])].filter(Boolean))];
  }

  function setStationImage(img, station) {
    const sources = logoCandidates(station);
    let index = 0;
    img.style.display = '';
    img.onerror = () => {
      index += 1;
      if (index < sources.length) {
        img.src = sources[index];
      } else {
        img.onerror = null;
        img.style.display = 'none';
        const fallback = img.nextElementSibling;
        if (fallback?.classList.contains('logo-fallback')) fallback.style.display = 'grid';
      }
    };
    if (sources.length) img.src = sources[0];
    else img.style.display = 'none';
  }

  function saveFallbacks() {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallbackCache));
  }

  function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }

  function isFavorite(stationId) { return favorites.has(stationId); }

  function toggleFavorite(stationId) {
    if (favorites.has(stationId)) favorites.delete(stationId);
    else favorites.add(stationId);
    saveFavorites();
    renderFilters();
    renderStations();
  }

  function stationStreams(station) {
    return [...new Set((station.streams || []).filter(Boolean))];
  }

  function streamList(station) {
    const list = [...stationStreams(station)];
    const fallback = fallbackCache[station.id]?.stream;
    if (fallback && !list.includes(fallback)) list.push(fallback);
    return list;
  }

  function isHls(url) { return /\.m3u8(?:$|\?)/i.test(url || ''); }

  function destroyHls() {
    if (hls) {
      try { hls.destroy(); } catch {}
      hls = null;
    }
  }

  function clampVolume(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.85;
  }

  function volumeIcon() {
    if (audio.muted || audio.volume === 0) return '🔇';
    if (audio.volume < 0.45) return '🔈';
    if (audio.volume < 0.8) return '🔉';
    return '🔊';
  }

  function syncVolumeUi() {
    const effective = audio.muted ? 0 : audio.volume;
    const percent = Math.round(effective * 100);
    volumeSlider.value = String(effective);
    volumeSlider.style.setProperty('--volume', `${percent}%`);
    volumeValue.textContent = `${percent}%`;
    muteBtn.textContent = volumeIcon();
    muteBtn.setAttribute('aria-label', audio.muted || audio.volume === 0 ? 'Activar sonido' : 'Silenciar');
  }

  function setAppVolume(value) {
    const next = clampVolume(value);
    audio.volume = next;
    audio.muted = false;
    if (next > 0) lastAudibleVolume = next;
    localStorage.setItem(VOLUME_KEY, String(next));
    localStorage.setItem(MUTED_KEY, '0');
    syncVolumeUi();
  }

  function toggleMute() {
    if (audio.muted || audio.volume === 0) {
      if (audio.volume === 0) audio.volume = lastAudibleVolume || 0.85;
      audio.muted = false;
      localStorage.setItem(MUTED_KEY, '0');
    } else {
      lastAudibleVolume = audio.volume || lastAudibleVolume;
      audio.muted = true;
      localStorage.setItem(MUTED_KEY, '1');
    }
    syncVolumeUi();
  }

  /* ---------------- Radio UI ---------------- */

  function renderFilters() {
    const groups = ['Todas', 'Favoritos', 'Zaragoza', 'Nacional', 'Música', 'Lipetsk'];
    filtersEl.innerHTML = groups.map(group => `
      <button class="filter-btn ${group === currentFilter ? 'active' : ''}" data-filter="${group}" type="button">${group}</button>
    `).join('');
    filtersEl.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        renderFilters();
        renderStations();
      });
    });
  }

  function renderStations() {
    const q = normalize(query);
    const visible = stations.filter(station => {
      const matchesGroup = currentFilter === 'Todas' || (currentFilter === 'Favoritos' ? isFavorite(station.id) : station.group === currentFilter);
      const haystack = normalize(`${station.name} ${station.subtitle} ${station.group}`);
      return matchesGroup && (!q || haystack.includes(q));
    });

    if (!visible.length) {
      grid.innerHTML = `<div class="empty">${currentFilter === 'Favoritos' && !query ? 'Todavía no tienes emisoras favoritas. Pulsa ☆ en una emisora para añadirla.' : 'No hay emisoras que coincidan.'}</div>`;
      return;
    }

    grid.innerHTML = visible.map(station => {
      const isPlaying = mediaKind === 'radio' && currentStation?.id === station.id && !audio.paused;
      const usingFallback = mediaKind === 'radio' && currentStation?.id === station.id && currentStream && !stationStreams(station).includes(currentStream);
      const favorite = isFavorite(station.id);
      const label = usingFallback ? 'respaldo automático' : 'stations.js';
      const initials = station.name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
      return `
        <article class="station-card ${isPlaying ? 'playing' : ''}" data-id="${station.id}">
          <div class="logo-wrap">
            <img class="station-logo" data-logo-id="${station.id}" alt="Logo de ${escapeAttr(station.name)}" loading="lazy" referrerpolicy="no-referrer" />
            <div class="logo-fallback" style="display:none">${escapeHtml(initials)}</div>
          </div>
          <div>
            <div class="station-name">${escapeHtml(station.name)}</div>
            <div class="station-sub">${escapeHtml(station.subtitle)}</div>
            <div class="station-status"><span class="dot ${usingFallback ? 'ok' : ''}"></span>${escapeHtml(label)}</div>
          </div>
          <div class="card-actions">
            <button class="play-card" data-play="${station.id}" type="button" aria-label="Reproducir ${escapeAttr(station.name)}">${isPlaying ? '❚❚' : '▶'}</button>
            <button class="favorite-card ${favorite ? 'active' : ''}" data-favorite="${station.id}" type="button" aria-label="${favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}: ${escapeAttr(station.name)}" aria-pressed="${favorite ? 'true' : 'false'}">${favorite ? '★' : '☆'}</button>
          </div>
        </article>`;
    }).join('');

    grid.querySelectorAll('[data-logo-id]').forEach(img => {
      const station = stations.find(s => s.id === img.dataset.logoId);
      if (station) setStationImage(img, station);
    });

    grid.querySelectorAll('[data-play]').forEach(btn => btn.addEventListener('click', () => {
      const station = stations.find(s => s.id === btn.dataset.play);
      if (!station) return;
      if (mediaKind === 'radio' && currentStation?.id === station.id && !audio.paused) pauseMedia();
      else playStation(station);
    }));

    grid.querySelectorAll('[data-favorite]').forEach(btn => btn.addEventListener('click', () => toggleFavorite(btn.dataset.favorite)));
  }

  /* ---------------- Descubrimiento y suscripciones de podcasts ---------------- */

  function savePodcastSubscriptions() {
    localStorage.setItem(PODCAST_SUBS_KEY, JSON.stringify(podcastSubscriptions));
  }

  function saveApplePodcastCache() {
    try {
      const compact = {};
      for (const [id, entry] of Object.entries(applePodcastCache)) {
        const show = entry?.show || {};
        const episodes = Array.isArray(show.episodes) ? show.episodes : [];
        compact[id] = {
          updatedAt: entry?.updatedAt || 0,
          show: {
            ...show,
            episodes: undefined,
            episodeCount: show.episodeCount || episodes.length || 0,
            latestPublishedAt: show.latestPublishedAt || episodes[0]?.publishedAt || ''
          }
        };
      }
      localStorage.setItem(PODCAST_APPLE_CACHE_KEY, JSON.stringify(compact));
    } catch {
      // Los catálogos grandes se guardan en IndexedDB por podcast-feed.js.
    }
  }

  function podcastStateKey(showId, episodeId) {
    return String(showId || '') + '::' + String(episodeId || '');
  }

  function savePodcastPlayStates() {
    try {
      const entries = Object.entries(podcastPlayStates);
      if (entries.length > 1500) {
        entries
          .sort((a, b) => Number(b[1]?.lastPlayedAt || 0) - Number(a[1]?.lastPlayedAt || 0))
          .slice(1500)
          .forEach(([key]) => delete podcastPlayStates[key]);
      }
      localStorage.setItem(PODCAST_PLAY_STATE_KEY, JSON.stringify(podcastPlayStates));
    } catch {}
  }

  function episodeListenState(show, episode) {
    const state = podcastPlayStates[podcastStateKey(show?.id, episode?.id)] || {};
    const legacyPosition = Number(localStorage.getItem(episodePositionKey(episode)) || 0);
    if (!state.position && legacyPosition > 0) return { ...state, position: legacyPosition, completed: false };
    return state;
  }

  function persistLastPodcast(show, episode, position = 0, duration = 0) {
    if (!show || !episode) return;
    lastPodcastSnapshot = {
      show: {
        id: show.id,
        appleCollectionId: show.appleCollectionId,
        sourceType: show.sourceType,
        name: show.name,
        author: show.author,
        image: show.image,
        feed: show.feed,
        site: show.site
      },
      episode: {
        id: episode.id,
        title: episode.title,
        publishedAt: episode.publishedAt,
        duration: episode.duration,
        audio: episode.audio,
        image: episode.image || show.image,
        link: episode.link || ''
      },
      position: Math.max(0, Math.floor(Number(position) || 0)),
      duration: Math.max(0, Math.floor(Number(duration) || Number(episode.duration) || 0)),
      savedAt: Date.now()
    };
    try { localStorage.setItem(LAST_PODCAST_KEY, JSON.stringify(lastPodcastSnapshot)); } catch {}
  }

  function updateEpisodePlayState(show, episode, position, duration, forceCompleted = false) {
    if (!show || !episode) return;
    const current = Math.max(0, Number(position) || 0);
    const total = Math.max(0, Number(duration) || Number(episode.duration) || 0);
    const completed = forceCompleted || (total > 0 && current >= Math.max(10, total - 10));
    if (current < 5 && !completed) {
      persistLastPodcast(show, episode, current, total);
      return;
    }
    podcastPlayStates[podcastStateKey(show.id, episode.id)] = {
      position: completed ? total : current,
      duration: total,
      progress: total > 0 ? Math.min(1, current / total) : 0,
      completed,
      lastPlayedAt: Date.now()
    };
    savePodcastPlayStates();
    persistLastPodcast(show, episode, current, total);
  }

  function feedOverrideFor(show) {
    if (normalize(show?.name) === 'solo documental') {
      return 'https://feeds.ivoox.com/feed_fg_f121483_filtro_1.xml';
    }
    return show?.feed || '';
  }

  function podcastLatestTimestamp(show) {
    const value = show?.latestPublishedAt || show?.episodes?.[0]?.publishedAt || show?.releaseDate || '';
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function podcastLatestLabel(show) {
    const value = show?.latestPublishedAt || show?.episodes?.[0]?.publishedAt || '';
    return value ? formatDate(value) : '';
  }

  function appleJsonp(baseUrl, params = {}, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const callback = 'miRadioApple_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = setTimeout(() => cleanup(new Error('Tiempo de espera agotado')), timeoutMs);

      function cleanup(error, data) {
        clearTimeout(timer);
        try { delete window[callback]; } catch { window[callback] = undefined; }
        script.remove();
        if (error) reject(error);
        else resolve(data);
      }

      window[callback] = data => cleanup(null, data);
      const search = new URLSearchParams({ ...params, callback });
      script.src = baseUrl + '?' + search.toString();
      script.async = true;
      script.onerror = () => cleanup(new Error('No se pudo consultar Apple Podcasts'));
      document.head.appendChild(script);
    });
  }

  function builtInPodcastNameSet() {
    return new Set(podcastSources.map(p => normalize(p.name)));
  }

  function subscribedCollectionIds() {
    return new Set(podcastSubscriptions.map(p => String(p.appleCollectionId || '')));
  }

  function isPodcastIncluded(result) {
    const collectionId = String(result.collectionId || result.appleCollectionId || '');
    if (collectionId && subscribedCollectionIds().has(collectionId)) return 'subscribed';
    if (builtInPodcastNameSet().has(normalize(result.collectionName || result.name || result.trackName))) return 'builtin';
    return '';
  }

  function subscriptionFromAppleResult(item) {
    const collectionId = item.collectionId || item.trackId;
    return {
      id: 'apple-' + collectionId,
      appleCollectionId: collectionId,
      sourceType: 'apple',
      name: item.collectionName || item.trackName || 'Podcast',
      author: item.artistName || 'Podcast',
      image: item.artworkUrl600 || item.artworkUrl100 || 'icons/icon-192.png',
      description: item.primaryGenreName ? 'Podcast · ' + item.primaryGenreName : 'Podcast',
      site: item.collectionViewUrl || item.trackViewUrl || '',
      feed: item.feedUrl || '',
      latestPublishedAt: item.releaseDate || '',
      episodeCount: Number(item.trackCount || 0)
    };
  }

  async function searchPodcasts() {
    const term = podcastDiscoveryInput.value.trim();
    if (term.length < 2 || podcastSearchBusy) return;
    podcastSearchBusy = true;
    podcastDiscoveryBtn.disabled = true;
    podcastDiscoveryStatus.textContent = 'Buscando…';
    podcastSearchResults.innerHTML = '';

    try {
      const data = await appleJsonp('https://itunes.apple.com/search', {
        term,
        country: 'ES',
        media: 'podcast',
        entity: 'podcast',
        limit: '20',
        explicit: 'Yes'
      });
      podcastSearchResultsData = Array.isArray(data?.results)
        ? data.results.filter(x => x.collectionId || x.trackId)
        : [];
      renderPodcastSearchResults();
      podcastDiscoveryStatus.textContent = podcastSearchResultsData.length
        ? podcastSearchResultsData.length + ' resultados'
        : 'No he encontrado podcasts con ese nombre.';
    } catch (err) {
      console.warn('Podcast search failed', err);
      podcastDiscoveryStatus.textContent = 'No se pudo completar la búsqueda. Prueba otra vez.';
    } finally {
      podcastSearchBusy = false;
      podcastDiscoveryBtn.disabled = false;
    }
  }

  function renderPodcastSearchResults() {
    if (!podcastSearchResultsData.length) {
      podcastSearchResults.innerHTML = '';
      return;
    }

    podcastSearchResults.innerHTML = podcastSearchResultsData.map((item, index) => {
      const included = isPodcastIncluded(item);
      const image = item.artworkUrl600 || item.artworkUrl100 || 'icons/icon-192.png';
      const title = item.collectionName || item.trackName || 'Podcast';
      const author = item.artistName || '';
      const count = item.trackCount ? item.trackCount + ' episodios' : (item.primaryGenreName || '');
      const buttonText = included === 'builtin' ? 'Incluido' : included === 'subscribed' ? 'Quitar' : 'Suscribirme';
      return `
        <article class="podcast-search-card">
          <img src="${escapeAttr(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='icons/icon-192.png'" />
          <div class="podcast-search-copy">
            <div class="podcast-search-name">${escapeHtml(title)}</div>
            <div class="podcast-search-author">${escapeHtml(author)}</div>
            <div class="podcast-search-meta">${escapeHtml(count)}</div>
          </div>
          <button class="podcast-subscribe-btn ${included ? 'is-subscribed' : ''}" type="button" data-podcast-result="${index}" ${included === 'builtin' ? 'disabled' : ''}>${buttonText}</button>
        </article>`;
    }).join('');

    podcastSearchResults.querySelectorAll('[data-podcast-result]').forEach(btn => {
      btn.addEventListener('click', () => togglePodcastSubscription(Number(btn.dataset.podcastResult)));
    });
  }

  function togglePodcastSubscription(resultIndex) {
    const item = podcastSearchResultsData[resultIndex];
    if (!item) return;
    const collectionId = String(item.collectionId || item.trackId || '');
    const existingIndex = podcastSubscriptions.findIndex(p => String(p.appleCollectionId) === collectionId);

    if (existingIndex >= 0) {
      const [removed] = podcastSubscriptions.splice(existingIndex, 1);
      delete applePodcastCache[removed.id];
      savePodcastSubscriptions();
      saveApplePodcastCache();
      showToast('Podcast eliminado de tu biblioteca.');
    } else {
      const sub = subscriptionFromAppleResult(item);
      podcastSubscriptions.push(sub);
      savePodcastSubscriptions();
      loadApplePodcast(sub, true).then(() => renderPodcastLibrary()).catch(console.warn);
      showToast('Podcast añadido a tu biblioteca.');
    }

    renderPodcastLibrary();
    renderPodcastSearchResults();
  }

  function unsubscribeCurrentPodcast() {
    const show = podcastById(selectedPodcastId);
    if (!show?.appleCollectionId) return;
    podcastSubscriptions = podcastSubscriptions.filter(p => p.id !== show.id);
    delete applePodcastCache[show.id];
    savePodcastSubscriptions();
    saveApplePodcastCache();
    closePodcastDetail();
    renderPodcastLibrary();
    renderPodcastSearchResults();
    showToast('Podcast eliminado de tu biblioteca.');
  }

  async function loadApplePodcast(show, force = false) {
    if (!show?.appleCollectionId) return show;

    const cached = applePodcastCache[show.id];
    if (!force && cached?.show?.episodes?.length && Date.now() - Number(cached.updatedAt || 0) < APPLE_CACHE_MAX_AGE) {
      return cached.show;
    }

    let showRow = {};
    let feedUrl = feedOverrideFor(show) || cached?.show?.feed || '';

    try {
      const metaData = await appleJsonp('https://itunes.apple.com/lookup', {
        id: String(show.appleCollectionId),
        country: 'ES',
        entity: 'podcastEpisode',
        limit: '1'
      }, 10000);
      const metaRows = Array.isArray(metaData?.results) ? metaData.results : [];
      showRow = metaRows.find(x => x.wrapperType === 'track' || x.kind === 'podcast') || {};
      feedUrl = feedOverrideFor(show) || showRow.feedUrl || feedUrl;
    } catch (err) {
      console.warn('Apple metadata refresh failed', show.name, err);
    }

    if (feedUrl && window.PodcastFeed?.load) {
      try {
        const rssShow = await window.PodcastFeed.load(feedUrl, {
          ...show,
          name: showRow.collectionName || showRow.trackName || show.name,
          author: showRow.artistName || show.author,
          image: showRow.artworkUrl600 || showRow.artworkUrl100 || show.image,
          site: showRow.collectionViewUrl || showRow.trackViewUrl || show.site,
          feed: feedUrl
        }, {
          force,
          maxAge: APPLE_CACHE_MAX_AGE
        });

        if (Array.isArray(rssShow?.episodes) && rssShow.episodes.length) {
          const loaded = {
            ...show,
            ...rssShow,
            appleCollectionId: show.appleCollectionId,
            sourceType: show.sourceType || 'apple',
            feed: feedUrl,
            episodeCount: rssShow.episodes.length,
            latestPublishedAt: rssShow.episodes[0]?.publishedAt || ''
          };
          applePodcastCache[show.id] = { updatedAt: Date.now(), show: loaded };
          saveApplePodcastCache();
          return loaded;
        }
      } catch (err) {
        console.warn('RSS real no disponible; se usará Apple como respaldo', show.name, err);
      }
    }

    const data = await appleJsonp('https://itunes.apple.com/lookup', {
      id: String(show.appleCollectionId),
      country: 'ES',
      entity: 'podcastEpisode',
      limit: '200'
    }, 15000);

    const rows = Array.isArray(data?.results) ? data.results : [];
    showRow = rows.find(x => x.wrapperType === 'track' || x.kind === 'podcast') || showRow || {};
    const episodes = rows
      .filter(x => x.wrapperType === 'podcastEpisode' || x.kind === 'podcast-episode')
      .filter(x => x.episodeUrl || x.previewUrl)
      .map((x, index) => ({
        id: 'apple-ep-' + (x.trackId || x.episodeGuid || (show.appleCollectionId + '-' + index)),
        title: x.trackName || 'Episodio',
        description: x.description || x.shortDescription || '',
        publishedAt: x.releaseDate || '',
        duration: Number.isFinite(Number(x.trackTimeMillis)) ? Math.round(Number(x.trackTimeMillis) / 1000) : null,
        audio: x.episodeUrl || x.previewUrl,
        image: x.artworkUrl600 || x.artworkUrl160 || x.artworkUrl100 || show.image,
        link: x.trackViewUrl || ''
      }))
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

    const loaded = {
      ...show,
      name: showRow.collectionName || showRow.trackName || show.name,
      author: showRow.artistName || show.author,
      image: showRow.artworkUrl600 || showRow.artworkUrl100 || show.image,
      site: showRow.collectionViewUrl || showRow.trackViewUrl || show.site,
      feed: feedUrl || showRow.feedUrl || show.feed,
      episodes,
      episodeCount: episodes.length,
      latestPublishedAt: episodes[0]?.publishedAt || show.latestPublishedAt || ''
    };

    applePodcastCache[show.id] = { updatedAt: Date.now(), show: loaded };
    saveApplePodcastCache();
    return loaded;
  }

  async function refreshSubscribedPodcasts(force = false) {
    if (podcastRefreshPromise && !force) return podcastRefreshPromise;
    const subscriptions = [...podcastSubscriptions];

    podcastRefreshPromise = (async () => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < subscriptions.length) {
          const index = cursor++;
          const sub = subscriptions[index];
          try {
            await loadApplePodcast(sub, force);
          } catch (err) {
            console.warn('No se pudo actualizar', sub.name, err);
          }
          if (currentUiMode === 'podcasts') renderPodcastLibrary();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      renderPodcastLibrary();
    })().finally(() => {
      podcastRefreshPromise = null;
    });

    return podcastRefreshPromise;
  }

  async function refreshAllPodcasts() {
    podcastUpdated.textContent = 'Actualizando todos los podcasts…';
    await Promise.allSettled([
      loadPodcastsData(true),
      refreshSubscribedPodcasts(true)
    ]);
    renderPodcastLibrary();
    if (selectedPodcastId) renderPodcastDetail();
    podcastUpdated.textContent = 'Biblioteca actualizada';
  }

  /* ---------------- Vistas Radio / Podcasts / TV ---------------- */

  function setUiMode(mode) {
    if (currentUiMode === 'tv' && mode !== 'tv') stopTvPlayback(true);

    currentUiMode = mode;
    const radio = mode === 'radio';
    const podcasts = mode === 'podcasts';
    const tv = mode === 'tv';

    radioView.classList.toggle('hidden', !radio);
    podcastView.classList.toggle('hidden', !podcasts);
    tvView.classList.toggle('hidden', !tv);

    radioModeBtn.classList.toggle('active', radio);
    podcastModeBtn.classList.toggle('active', podcasts);
    tvModeBtn.classList.toggle('active', tv);

    eyebrow.textContent = radio ? 'RADIO PERSONAL' : podcasts ? 'PODCASTS' : 'TELEVISIÓN';
    try { localStorage.setItem(LAST_UI_MODE_KEY, mode); } catch {}
    if (podcasts) {
      loadPodcastsData(false);
      refreshSubscribedPodcasts(false);
    }
    if (tv) loadTvChannels(false);
  }

  async function loadPodcastsData(force = false) {
    if (!force && podcastData.podcasts?.length) {
      renderPodcastLibrary();
      if (selectedPodcastId) renderPodcastDetail();
      return;
    }
    podcastUpdated.textContent = 'Actualizando biblioteca…';
    try {
      const response = await fetch(`podcasts-data.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.podcasts)) throw new Error('JSON inválido');
      podcastData = data;
      renderPodcastLibrary();
      if (selectedPodcastId) renderPodcastDetail();
    } catch (err) {
      console.warn('No se pudieron cargar los podcasts', err);
      renderPodcastLibrary();
      podcastUpdated.textContent = 'La lista todavía no se ha generado o no hay conexión. GitHub la actualizará automáticamente.';
    }
  }

  function podcastById(id) {
    const builtIn = podcastData.podcasts?.find(p => p.id === id) || podcastSources.find(p => p.id === id);
    if (builtIn) return builtIn;
    const cached = applePodcastCache[id]?.show;
    if (cached) return cached;
    return podcastSubscriptions.find(p => p.id === id) || null;
  }

  function podcastImage(show) {
    return show?.image || 'icons/icon-192.png';
  }

  function renderPodcastLibrary() {
    const dataById = new Map((podcastData.podcasts || []).map(p => [p.id, p]));
    const builtIns = podcastSources.map(source => ({ ...source, ...(dataById.get(source.id) || {}) }));
    const dynamic = podcastSubscriptions
      .filter(sub => !builtIns.some(show => normalize(show.name) === normalize(sub.name)))
      .map(sub => applePodcastCache[sub.id]?.show || sub);

    const shows = [...builtIns, ...dynamic]
      .sort((a, b) => podcastLatestTimestamp(b) - podcastLatestTimestamp(a));

    if (podcastData.updatedAt) {
      podcastUpdated.textContent = `Actualizado ${formatDateTime(podcastData.updatedAt)} · suscripciones por fecha del último episodio`;
    }
    if (!shows.length) {
      podcastShows.innerHTML = '<div class="empty">No hay podcasts configurados.</div>';
      return;
    }

    podcastShows.innerHTML = shows.map(show => {
      const count = Array.isArray(show.episodes) ? show.episodes.length : Number(show.episodeCount || 0);
      const latest = podcastLatestLabel(show);
      return `
        <button class="podcast-show-card" type="button" data-show-id="${escapeAttr(show.id)}">
          <img src="${escapeAttr(podcastImage(show))}" alt="${escapeAttr(show.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='icons/mi-radio.svg'" />
          <div class="show-name">${escapeHtml(show.name)}</div>
          <div class="show-author">${escapeHtml(show.author || '')}</div>
          <div class="show-count">${count ? `${count} episodios` : (show.appleCollectionId ? 'Actualizando…' : 'Pendiente de actualizar')}</div>
          ${latest ? `<div class="show-latest">Último: ${escapeHtml(latest)}</div>` : ''}
        </button>`;
    }).join('');

    podcastShows.querySelectorAll('[data-show-id]').forEach(btn => btn.addEventListener('click', () => openPodcast(btn.dataset.showId)));
  }

  async function openPodcast(id) {
    selectedPodcastId = id;
    episodeQuery = '';
    episodeVisibleLimit = EPISODE_PAGE_SIZE;
    episodeSearchInput.value = '';
    podcastLibraryView.classList.add('hidden');
    podcastDetailView.classList.remove('hidden');
    renderPodcastDetail();

    const show = podcastById(id);
    if (show?.appleCollectionId) {
      if (!Array.isArray(show.episodes)) {
        episodesList.innerHTML = '<div class="empty">Cargando RSS completo…</div>';
      }
      try {
        await loadApplePodcast(show, false);
        if (selectedPodcastId === id) renderPodcastDetail();
        renderPodcastLibrary();
      } catch (err) {
        console.warn('Podcast RSS load failed', err);
        if (selectedPodcastId === id && !Array.isArray(podcastById(id)?.episodes)) {
          episodesList.innerHTML = '<div class="empty">No se pudieron cargar los episodios. Prueba de nuevo más tarde.</div>';
        }
      }
    }
  }

  function closePodcastDetail() {
    selectedPodcastId = null;
    episodeVisibleLimit = EPISODE_PAGE_SIZE;
    podcastDetailView.classList.add('hidden');
    podcastLibraryView.classList.remove('hidden');
  }

  function renderPodcastDetail() {
    const show = podcastById(selectedPodcastId);
    if (!show) return;
    setImage(podcastShowImage, podcastImage(show), 'icons/mi-radio.svg');
    podcastShowAuthor.textContent = show.author || 'Podcast';
    podcastShowName.textContent = show.name || 'Podcast';
    podcastShowDescription.textContent = show.description || '';
    podcastUnsubscribeBtn.classList.toggle('hidden', !show.appleCollectionId);
    renderEpisodes(show);
  }

  function renderEpisodes(show = podcastById(selectedPodcastId)) {
    if (!show) return;
    if (!Array.isArray(show.episodes)) {
      episodesList.innerHTML = '<div class="empty">Cargando episodios…</div>';
      return;
    }

    const q = normalize(episodeQuery);
    const filtered = show.episodes.filter(ep => !q || normalize(`${ep.title} ${ep.description}`).includes(q));
    if (!filtered.length) {
      episodesList.innerHTML = `<div class="empty">${show.episodes.length ? 'No hay episodios que coincidan.' : 'No hay episodios disponibles.'}</div>`;
      return;
    }

    const visible = filtered.slice(0, episodeVisibleLimit);
    const cards = visible.map(ep => {
      const playing = mediaKind === 'podcast' && currentEpisode?.id === ep.id && !audio.paused;
      const state = episodeListenState(show, ep);
      const img = ep.image || show.image || 'icons/mi-radio.svg';
      const date = formatDate(ep.publishedAt);
      const duration = ep.duration ? formatTime(ep.duration) : '';
      const pct = state.duration > 0 ? Math.min(100, Math.round((Number(state.position || 0) / Number(state.duration)) * 100)) : 0;
      const stateLabel = state.completed
        ? '<span class="episode-state listened">✓ Escuchado</span>'
        : Number(state.position || 0) >= 5
          ? `<span class="episode-state progress">● En curso${pct ? ' · ' + pct + '%' : ''}</span>`
          : '';

      return `
        <article class="episode-card ${playing ? 'playing' : ''} ${state.completed ? 'listened' : (Number(state.position || 0) >= 5 ? 'in-progress' : '')}">
          <img class="episode-image" src="${escapeAttr(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='icons/mi-radio.svg'" />
          <div>
            <div class="episode-title">${escapeHtml(ep.title)}</div>
            <div class="episode-desc">${escapeHtml(ep.description || '')}</div>
            <div class="episode-meta"><span>${escapeHtml(date)}</span>${duration ? `<span>${duration}</span>` : ''}${stateLabel}</div>
          </div>
          <button class="episode-play" type="button" data-episode-id="${escapeAttr(ep.id)}" aria-label="Reproducir ${escapeAttr(ep.title)}">${playing ? '❚❚' : '▶'}</button>
        </article>`;
    }).join('');

    const remaining = filtered.length - visible.length;
    episodesList.innerHTML = cards + (remaining > 0
      ? `<button class="load-more-episodes" type="button" data-load-more-episodes>Mostrar ${Math.min(EPISODE_PAGE_SIZE, remaining)} más · quedan ${remaining}</button>`
      : '');

    episodesList.querySelectorAll('[data-episode-id]').forEach(btn => btn.addEventListener('click', () => {
      const ep = (show.episodes || []).find(x => x.id === btn.dataset.episodeId);
      if (!ep) return;
      if (mediaKind === 'podcast' && currentEpisode?.id === ep.id && !audio.paused) pauseMedia();
      else playEpisode(show, ep, true);
    }));

    const more = episodesList.querySelector('[data-load-more-episodes]');
    if (more) {
      more.addEventListener('click', () => {
        episodeVisibleLimit += EPISODE_PAGE_SIZE;
        renderEpisodes(show);
      });
    }
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(d);
  }

  function formatDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(d);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const totalMinutes = Math.floor(seconds / 60);
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    const h = Math.floor(totalMinutes / 60);
    return h ? `${h}:${m}:${s}` : `${m}:${s}`;
  }

  /* ---------------- Televisión ---------------- */

  function destroyTvEngines() {
    if (tvHls) {
      try { tvHls.destroy(); } catch {}
      tvHls = null;
    }
    if (tvDash) {
      try { tvDash.reset(); } catch {}
      tvDash = null;
    }
  }

  function flattenTdtChannels(data) {
    const result = [];
    for (const country of data?.countries || []) {
      for (const ambit of country?.ambits || []) {
        for (const channel of ambit?.channels || []) {
          result.push({ ...channel, ambit: ambit.name, country: country.name });
        }
      }
    }
    return result;
  }

  function normalizeTvStreams(options = []) {
    return options
      .filter(opt => opt?.url && ['m3u8','mpd','dash'].includes(String(opt.format || '').toLowerCase()))
      .map(opt => ({
        url: opt.url,
        format: String(opt.format || '').toLowerCase() === 'm3u8' ? 'hls' : 'dash'
      }));
  }

  function faviconFor(url) {
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    } catch {
      return 'icons/mi-radio.svg';
    }
  }

  async function loadTvChannels(force = false) {
    if (tvLoaded && !force) {
      renderTvChannels();
      return;
    }

    tvChannelsGrid.innerHTML = '<div class="empty">Actualizando canales…</div>';

    const spanishBase = (tvConfig.spanish || []).map(cfg => ({
      ...cfg,
      source: 'TDTChannels',
      streams: cfg.fallbackStreams || []
    }));

    try {
      const response = await fetch(`${tvConfig.tdtJson}?t=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const all = flattenTdtChannels(data);
        tvSpanishChannels = spanishBase.map(cfg => {
          const found = all.find(item => (cfg.matches || [cfg.name]).some(name => normalize(item.name) === normalize(name)));
          const direct = normalizeTvStreams(found?.options || []);
          return {
            ...cfg,
            name: found?.name || cfg.name,
            logo: found?.logo || cfg.logo,
            web: found?.web || cfg.web,
            streams: direct.length ? direct : (cfg.fallbackStreams || []),
            extraInfo: found?.extra_info || []
          };
        });
      } else {
        tvSpanishChannels = spanishBase;
      }
    } catch (err) {
      console.warn('No se pudo actualizar TDTChannels', err);
      tvSpanishChannels = spanishBase;
    }

    try {
      const response = await fetch(`${tvConfig.russianJson}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      tvRussianChannels = (data.channels || [])
        .filter(ch => ch.enabled !== false)
        .map(ch => {
          const streams = (ch.candidates || [])
            .filter(url => /^https:\/\//i.test(url))
            .map(url => ({ url, format: ch.format === 'dash' ? 'dash' : 'hls' }));
          const logo = /^https?:\/\//i.test(ch.logo || '') ? ch.logo : faviconFor(ch.official_page);
          return {
            id: ch.id,
            name: ch.name,
            logo,
            web: ch.official_page,
            source: 'Mi-TV',
            group: ch.group || 'Rusos',
            directOnly: true,
            streams
          };
        })
        .filter(ch => ch.streams.length > 0);
    } catch (err) {
      console.warn('No se pudo cargar Mi-TV', err);
      tvRussianChannels = [];
    }

    tvLoaded = true;
    renderTvChannels();
  }

  function activeTvChannels() {
    return tvCountry === 'Rusos' ? tvRussianChannels : tvSpanishChannels;
  }

  function renderTvChannels() {
    const channels = activeTvChannels();
    tvCountryButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tvCountry === tvCountry));

    if (!channels.length) {
      tvChannelsGrid.innerHTML = '<div class="empty">No se pudieron cargar canales de esta sección.</div>';
      return;
    }

    tvChannelsGrid.innerHTML = channels.map(channel => {
      const direct = channel.streams?.length > 0;
      const active = currentTvChannel?.id === channel.id && !tvVideo.paused;
      return `
        <article class="tv-channel-card ${active ? 'playing' : ''}">
          <div class="tv-logo-wrap">
            <img src="${escapeAttr(channel.logo || 'icons/mi-radio.svg')}" alt="Logo de ${escapeAttr(channel.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='icons/mi-radio.svg'" />
          </div>
          <div class="tv-card-name">${escapeHtml(channel.name)}</div>
          <div class="tv-card-source">${escapeHtml(channel.source || '')}</div>
          <button class="tv-play-card ${direct ? '' : 'web-only'}" type="button" data-tv-id="${escapeAttr(channel.id)}" aria-label="${direct ? 'Ver ' : 'Abrir web de '}${escapeAttr(channel.name)}">
            ${direct ? '▶' : '↗'}
          </button>
        </article>`;
    }).join('');

    tvChannelsGrid.querySelectorAll('[data-tv-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const channel = activeTvChannels().find(ch => ch.id === btn.dataset.tvId);
        if (channel) playTvChannel(channel);
      });
    });
  }

  function showTvWebFallback(channel, message = 'Este canal no ofrece ahora mismo un stream directo compatible para reproducir dentro de la app.') {
    destroyTvEngines();
    try { tvVideo.pause(); } catch {}
    tvVideo.removeAttribute('src');
    tvVideo.load();
    tvVideo.classList.add('hidden');
    tvWebFallback.classList.remove('hidden');
    setImage(tvFallbackLogo, channel.logo || 'icons/mi-radio.svg', 'icons/mi-radio.svg');
    tvFallbackTitle.textContent = channel.name;
    const text = tvWebFallback.querySelector('p');
    if (text) text.textContent = message;

    if (channel.directOnly) {
      tvOpenWebBtn.classList.add('hidden');
      tvOpenWebBtn.onclick = null;
      tvPlayerStatus.textContent = 'Señal directa no disponible';
    } else {
      tvOpenWebBtn.classList.remove('hidden');
      tvOpenWebBtn.disabled = !channel.web;
      tvOpenWebBtn.onclick = () => {
        if (channel.web) window.open(channel.web, '_blank', 'noopener');
      };
      tvPlayerStatus.textContent = 'Disponible en la web oficial';
    }
  }

  async function playTvChannel(channel) {
    currentTvChannel = channel;
    tvPlayerPanel.classList.remove('hidden');
    tvPlayerName.textContent = channel.name;
    tvPlayerStatus.textContent = 'Conectando…';
    tvWebFallback.classList.add('hidden');
    tvOpenWebBtn.classList.remove('hidden');
    tvVideo.classList.remove('hidden');

    if (mediaKind && !audio.paused) stopMedia();
    playerBar.classList.add('hidden');
    try { podcastPlayerDialog.close(); } catch {}
    try { radioPlayerDialog.close(); } catch {}

    if (!channel.streams?.length) {
      showTvWebFallback(channel);
      renderTvChannels();
      tvPlayerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    destroyTvEngines();
    for (let i = 0; i < channel.streams.length; i += 1) {
      const candidate = channel.streams[i];
      try {
        const result = await loadTvStream(candidate);
        if (result?.autoplay === false) {
          tvPlayerStatus.textContent = 'Señal cargada · pulsa ▶';
        } else {
          tvPlayerStatus.textContent = channel.source === 'Mi-TV' ? 'En directo · Mi-TV' : 'En directo · TDTChannels';
        }
        renderTvChannels();
        tvPlayerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      } catch (err) {
        console.warn('TV stream failed', channel.name, candidate.url, err);
        destroyTvEngines();
      }
    }

    showTvWebFallback(
      channel,
      channel.directOnly
        ? 'No se ha podido abrir ninguna de las señales directas de este canal. No te enviaré a otra página.'
        : 'La señal directa no ha podido reproducirse en este navegador. Puedes abrir la emisión oficial.'
    );
    renderTvChannels();
  }

  function loadTvStream(candidate) {
    return new Promise((resolve, reject) => {
      destroyTvEngines();
      try { tvVideo.pause(); } catch {}
      tvVideo.removeAttribute('src');
      tvVideo.load();

      const url = candidate.url;
      const format = candidate.format || (/\.mpd(?:$|\?)/i.test(url) ? 'dash' : 'hls');
      let settled = false;

      const finishOk = (autoplay = true) => {
        if (settled) return;
        settled = true;
        resolve({ autoplay });
      };
      const finishError = (error) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || 'TV')));
      };

      if (format === 'dash') {
        if (!window.dashjs?.MediaPlayer) {
          finishError(new Error('DASH no disponible'));
          return;
        }
        try {
          tvDash = dashjs.MediaPlayer().create();
          const events = dashjs.MediaPlayer.events || {};
          const readyEvent = events.STREAM_INITIALIZED || 'streamInitialized';
          const errorEvent = events.ERROR || 'error';
          const timer = setTimeout(() => finishError(new Error('Timeout DASH')), 15000);

          tvDash.on(readyEvent, async () => {
            clearTimeout(timer);
            try {
              await tvVideo.play();
              finishOk(true);
            } catch (err) {
              // En móvil el navegador puede perder el gesto del usuario mientras
              // carga el manifiesto. La señal está lista: dejamos el vídeo visible
              // para que un toque en ▶ la arranque, en vez de mandarlo a otra web.
              console.warn('Autoplay DASH bloqueado', err);
              finishOk(false);
            }
          });
          tvDash.on(errorEvent, event => {
            if (!settled) {
              clearTimeout(timer);
              finishError(new Error(event?.error || 'Error DASH'));
            }
          });
          tvDash.initialize(tvVideo, url, false);

          // Intento temprano para conservar la activación del toque del usuario.
          tvVideo.play().catch(() => {});
        } catch (err) {
          clearTimeout?.();
          finishError(err);
        }
        return;
      }

      if (tvVideo.canPlayType('application/vnd.apple.mpegurl')) {
        tvVideo.src = url;
        const timer = setTimeout(() => finishError(new Error('Timeout HLS nativo')), 15000);
        const onLoaded = async () => {
          clearTimeout(timer);
          try {
            await tvVideo.play();
            finishOk(true);
          } catch (err) {
            console.warn('Autoplay HLS nativo bloqueado', err);
            finishOk(false);
          }
        };
        const onError = () => {
          clearTimeout(timer);
          finishError(new Error('Error HLS nativo'));
        };
        tvVideo.addEventListener('loadedmetadata', onLoaded, { once: true });
        tvVideo.addEventListener('error', onError, { once: true });
        tvVideo.play().catch(() => {});
        return;
      }

      if (window.Hls?.isSupported()) {
        tvHls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 20,
          manifestLoadingTimeOut: 15000,
          levelLoadingTimeOut: 15000,
          fragLoadingTimeOut: 20000
        });

        const timer = setTimeout(() => finishError(new Error('Timeout HLS')), 16000);

        tvHls.on(Hls.Events.MANIFEST_PARSED, async () => {
          clearTimeout(timer);
          try {
            await tvVideo.play();
            finishOk(true);
          } catch (err) {
            console.warn('Autoplay HLS bloqueado', err);
            finishOk(false);
          }
        });

        tvHls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal && !settled) {
            clearTimeout(timer);
            finishError(new Error(data.details || data.type || 'HLS'));
          } else if (data?.fatal) {
            console.warn('Error HLS después de cargar', data);
            tvPlayerStatus.textContent = 'Problema con la señal · prueba de nuevo';
          }
        });

        tvHls.loadSource(url);
        tvHls.attachMedia(tvVideo);

        // Intento temprano: algunos móviles conservan así el gesto del toque.
        tvVideo.play().catch(() => {});
        return;
      }

      tvVideo.src = url;
      const timer = setTimeout(() => finishError(new Error('Timeout vídeo')), 15000);
      const onLoaded = async () => {
        clearTimeout(timer);
        try {
          await tvVideo.play();
          finishOk(true);
        } catch (err) {
          console.warn('Autoplay vídeo bloqueado', err);
          finishOk(false);
        }
      };
      const onError = () => {
        clearTimeout(timer);
        finishError(new Error('Error de vídeo'));
      };
      tvVideo.addEventListener('loadedmetadata', onLoaded, { once: true });
      tvVideo.addEventListener('error', onError, { once: true });
      tvVideo.play().catch(() => {});
    });
  }

  function stopTvPlayback(hidePanel = false) {
    destroyTvEngines();
    try { tvVideo.pause(); } catch {}
    tvVideo.removeAttribute('src');
    tvVideo.load();
    currentTvChannel = null;
    tvWebFallback.classList.add('hidden');
    tvVideo.classList.remove('hidden');
    if (hidePanel) tvPlayerPanel.classList.add('hidden');
    renderTvChannels();
  }

  /* ---------------- Reproductor de radio ---------------- */

  async function playStation(station) {
    if (currentTvChannel) stopTvPlayback(true);
    clearReconnect();
    mediaKind = 'radio';
    playIntent = true;
    currentStation = station;
    currentEpisode = null;
    currentPodcastShow = null;
    currentCandidates = streamList(station);
    candidateIndex = 0;
    repairAttemptedForPlay = false;
    configurePlayerForRadio(station);
    renderStations();
    if (!currentCandidates.length) return tryAutomaticFallback();
    await tryCandidate();
  }

  function configurePlayerForRadio(station) {
    playerBar.classList.remove('hidden', 'podcast-mode');
    radioPlayerActions.classList.remove('hidden');
    podcastPlayerActions.classList.add('hidden');
    volumeControl.classList.remove('hidden');
    playerMetaButton.classList.add('media-clickable');
    setStationImage(playerLogo, station);
    playerName.textContent = station.name;
    playerStatus.textContent = 'Conectando…';

    radioPlayerFallback.classList.add('hidden');
    setStationImage(radioPlayerImage, station);
    radioPlayerTitle.textContent = station.name;
    radioPlayerSub.textContent = station.subtitle || 'Radio en directo';
    syncPlayButtons();
  }

  function openRadioPlayer() {
    if (mediaKind !== 'radio' || !currentStation) return;
    if (!radioPlayerDialog.open) radioPlayerDialog.showModal();
  }

  async function tryCandidate() {
    if (!currentStation || !playIntent) return;
    if (candidateIndex >= currentCandidates.length) return tryAutomaticFallback();
    currentStream = currentCandidates[candidateIndex];
    playerStatus.textContent = reconnectAttempt ? 'Reconectando…' : 'Conectando…';
    try {
      await loadRadioUrl(currentStream);
      await audio.play();
      reconnectAttempt = 0;
      lastProgressAt = Date.now();
      playerStatus.textContent = streamSourceText(currentStation);
      updateMediaSessionRadio(currentStation);
      syncPlayButtons();
      renderStations();
    } catch (err) {
      console.warn('Stream failed', currentStream, err);
      if (!playIntent) return;
      if (!navigator.onLine) {
        playerStatus.textContent = 'Sin conexión · esperando Internet…';
        scheduleReconnect('sin conexión', 0);
        return;
      }
      candidateIndex += 1;
      await tryCandidate();
    }
  }

  async function loadRadioUrl(url) {
    sourceLoading = true;
    destroyHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    try {
      if (isHls(url) && window.Hls?.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 35,
          maxMaxBufferLength: 60,
          backBufferLength: 30
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout manifest')), 12000);
          hls.once(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(timeout); resolve(); });
          hls.once(Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) { clearTimeout(timeout); reject(new Error(data.type || 'hls')); }
          });
        });
      } else {
        audio.src = url;
      }
    } finally {
      sourceLoading = false;
    }
  }

  async function tryAutomaticFallback() {
    if (!currentStation || !playIntent || repairAttemptedForPlay || repairing) {
      playerStatus.textContent = navigator.onLine ? 'No se pudo reproducir' : 'Sin conexión a Internet';
      syncPlayButtons();
      renderStations();
      return;
    }
    repairAttemptedForPlay = true;
    repairing = true;
    playerStatus.textContent = 'Buscando respaldo automático…';
    const fallback = await repairStation(currentStation);
    repairing = false;
    if (!fallback) {
      playerStatus.textContent = 'No se pudo reproducir';
      syncPlayButtons();
      showToast('No se encontró un respaldo automático.');
      renderStations();
      return;
    }
    fallbackCache[currentStation.id] = { stream: fallback.stream, source: fallback.source, checkedAt: Date.now() };
    saveFallbacks();
    currentCandidates = streamList(currentStation);
    candidateIndex = Math.max(0, currentCandidates.indexOf(fallback.stream));
    await tryCandidate();
  }

  function streamSourceText(station) {
    return stationStreams(station).includes(currentStream)
      ? 'Reproduciendo · stations.js'
      : `Reproduciendo · respaldo automático${fallbackCache[station.id]?.source ? ' (' + fallbackCache[station.id].source + ')' : ''}`;
  }

  /* ---------------- Reproductor de podcasts ---------------- */

  function episodePositionKey(ep) { return `${PODCAST_POS_PREFIX}${ep.id}`; }

  function storedEpisodePosition(ep, show = currentPodcastShow) {
    const state = episodeListenState(show, ep);
    if (state.completed) return 0;
    const statePosition = Number(state.position || 0);
    if (statePosition > 0) return statePosition;
    const legacy = Number(localStorage.getItem(episodePositionKey(ep)) || 0);
    return Number.isFinite(legacy) && legacy > 0 ? legacy : 0;
  }

  function saveEpisodePosition() {
    if (mediaKind !== 'podcast' || !currentEpisode || !currentPodcastShow || !Number.isFinite(audio.currentTime)) return;
    const current = audio.currentTime;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (currentEpisode.duration || 0);
    const completed = duration > 0 && duration - current < 10;

    if (completed) {
      localStorage.removeItem(episodePositionKey(currentEpisode));
    } else if (current >= 3) {
      localStorage.setItem(episodePositionKey(currentEpisode), String(Math.floor(current)));
    }

    updateEpisodePlayState(currentPodcastShow, currentEpisode, current, duration, completed);
  }

  async function playEpisode(show, episode, openPlayer = false) {
    if (currentTvChannel) stopTvPlayback(true);
    if (!episode.audio) {
      showToast('Este episodio no tiene un audio reproducible en el RSS.');
      return;
    }
    clearReconnect();
    saveEpisodePosition();
    mediaKind = 'podcast';
    playIntent = true;
    currentPodcastShow = show;
    currentEpisode = episode;
    currentStation = null;
    destroyHls();
    configurePlayerForPodcast(show, episode);
    const resumeAt = storedEpisodePosition(episode, show);
    persistLastPodcast(show, episode, resumeAt, episode.duration || 0);
    try { localStorage.setItem(LAST_UI_MODE_KEY, 'podcasts'); } catch {}

    try {
      await loadPodcastUrl(episode.audio, resumeAt);
      await audio.play();
      reconnectAttempt = 0;
      lastProgressAt = Date.now();
      updateEpisodePlayState(show, episode, resumeAt || 5, episode.duration || audio.duration || 0, false);
      updateMediaSessionPodcast(show, episode);
      syncPlayButtons();
      renderStations();
      if (selectedPodcastId === show.id) renderEpisodes(show);
      if (openPlayer && matchMedia('(max-width: 760px)').matches) openPodcastPlayer();
    } catch (err) {
      console.warn('Podcast playback failed', err);
      playerStatus.textContent = navigator.onLine ? 'No se pudo reproducir · reintentando…' : 'Sin conexión · esperando Internet…';
      scheduleReconnect('podcast');
    }
  }

  function configurePlayerForPodcast(show, episode) {
    playerBar.classList.remove('hidden');
    playerBar.classList.add('podcast-mode');
    radioPlayerActions.classList.add('hidden');
    podcastPlayerActions.classList.remove('hidden');
    playerMetaButton.classList.add('media-clickable');
    setImage(playerLogo, episode.image || show.image);
    playerName.textContent = episode.title;
    playerStatus.textContent = show.name;
    setImage(podcastPlayerImage, episode.image || show.image);
    podcastPlayerTitle.textContent = episode.title;
    podcastPlayerShow.textContent = show.name;
    podcastSeekSlider.value = '0';
    podcastCurrentTime.textContent = '00:00';
    podcastDuration.textContent = episode.duration ? formatTime(episode.duration) : '00:00';
    const storedRate = Number(localStorage.getItem(PODCAST_RATE_KEY) || 1);
    audio.playbackRate = Number.isFinite(storedRate) ? storedRate : 1;
    playbackRateSelect.value = String(audio.playbackRate);
    syncPlayButtons();
  }

  async function loadPodcastUrl(url, resumeAt = 0) {
    sourceLoading = true;
    destroyHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.src = url;
    audio.load();
    if (resumeAt > 0) {
      const seek = () => {
        try {
          const max = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 3) : resumeAt;
          audio.currentTime = Math.min(resumeAt, max);
        } catch {}
      };
      if (audio.readyState >= 1) seek();
      else audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    sourceLoading = false;
  }

  function openPodcastPlayer() {
    if (mediaKind !== 'podcast' || !currentEpisode) return;
    if (!podcastPlayerDialog.open) podcastPlayerDialog.showModal();
  }

  function seekPodcast(delta) {
    if (mediaKind !== 'podcast' || !currentEpisode || !Number.isFinite(audio.currentTime)) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
    updatePodcastTimeUi();
    saveEpisodePosition();
  }

  function setPodcastPosition(value) {
    if (mediaKind !== 'podcast' || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const pct = Math.min(100, Math.max(0, Number(value)));
    audio.currentTime = (pct / 100) * audio.duration;
    updatePodcastTimeUi();
    saveEpisodePosition();
  }

  function updatePodcastTimeUi() {
    if (mediaKind !== 'podcast') return;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (currentEpisode?.duration || 0);
    podcastCurrentTime.textContent = formatTime(current);
    podcastDuration.textContent = duration ? formatTime(duration) : '00:00';
    podcastSeekSlider.value = duration ? String((current / duration) * 100) : '0';
    playerStatus.textContent = `${currentPodcastShow?.name || 'Podcast'} · ${formatTime(current)}${duration ? ` / ${formatTime(duration)}` : ''}`;
    updateMediaSessionPosition();
  }

  async function restoreLastPodcastSession() {
    const saved = lastPodcastSnapshot;
    if (!saved?.show || !saved?.episode?.audio) return false;

    mediaKind = 'podcast';
    playIntent = false;
    currentPodcastShow = saved.show;
    currentEpisode = saved.episode;
    currentStation = null;
    configurePlayerForPodcast(saved.show, saved.episode);

    const resumeAt = Math.max(0, Number(saved.position || 0));
    try {
      await loadPodcastUrl(saved.episode.audio, resumeAt);
      playerStatus.textContent = `${saved.show.name || 'Podcast'} · continuar en ${formatTime(resumeAt)}`;
      updateMediaSessionPodcast(saved.show, saved.episode);
      syncPlayButtons();
      return true;
    } catch (err) {
      console.warn('No se pudo preparar el último podcast', err);
      return false;
    }
  }

  /* ---------------- Controles comunes ---------------- */

  function syncPlayButtons() {
    const playing = !audio.paused && playIntent;
    const icon = playing ? '❚❚' : '▶';
    playPauseBtn.textContent = icon;
    podcastPlayPauseBtn.textContent = icon;
    podcastBigPlayPauseBtn.textContent = icon;
    radioBigPlayPauseBtn.textContent = icon;
  }

  function pauseMedia() {
    playIntent = false;
    clearReconnect();
    clearRecoveryChecks();
    saveEpisodePosition();
    audio.pause();
    if (mediaKind === 'radio') playerStatus.textContent = 'Pausado';
    else if (mediaKind === 'podcast') updatePodcastTimeUi();
    syncPlayButtons();
    renderStations();
    if (selectedPodcastId) renderPodcastDetail();
  }

  async function resumeMedia() {
    if (!mediaKind) return;
    playIntent = true;
    try {
      await audio.play();
      reconnectAttempt = 0;
      lastProgressAt = Date.now();
      syncPlayButtons();
      if (mediaKind === 'radio' && currentStation) playerStatus.textContent = streamSourceText(currentStation);
      if (mediaKind === 'podcast') updatePodcastTimeUi();
    } catch {
      scheduleReconnect('reanudar', 100);
    }
  }

  function stopMedia() {
    playIntent = false;
    clearReconnect();
    clearRecoveryChecks();
    saveEpisodePosition();
    audio.pause();
    destroyHls();
    audio.removeAttribute('src');
    audio.load();
    if (mediaKind === 'radio') playerStatus.textContent = 'Detenido';
    else if (mediaKind === 'podcast') playerStatus.textContent = 'Detenido';
    syncPlayButtons();
    renderStations();
    if (selectedPodcastId) renderPodcastDetail();
  }

  /* ---------------- Media Session ---------------- */

  function clearMediaHandlers() {
    if (!('mediaSession' in navigator)) return;
    for (const action of ['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack']) {
      try { navigator.mediaSession.setActionHandler(action, null); } catch {}
    }
  }

  function updateMediaSessionRadio(station) {
    if (!('mediaSession' in navigator)) return;
    try {
      clearMediaHandlers();
      const logo = logoCandidates(station)[0];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.subtitle,
        album: 'Mi Radio',
        artwork: logo ? [{ src: logo }] : []
      });
      navigator.mediaSession.setActionHandler('play', resumeMedia);
      navigator.mediaSession.setActionHandler('pause', pauseMedia);
      navigator.mediaSession.setActionHandler('stop', stopMedia);
    } catch {}
  }

  function updateMediaSessionPodcast(show, episode) {
    if (!('mediaSession' in navigator)) return;
    try {
      clearMediaHandlers();
      navigator.mediaSession.metadata = new MediaMetadata({
        title: episode.title,
        artist: show.name,
        album: show.author || 'Mi Radio',
        artwork: (episode.image || show.image) ? [{ src: episode.image || show.image }] : []
      });
      navigator.mediaSession.setActionHandler('play', resumeMedia);
      navigator.mediaSession.setActionHandler('pause', pauseMedia);
      navigator.mediaSession.setActionHandler('stop', stopMedia);
      navigator.mediaSession.setActionHandler('seekbackward', details => seekPodcast(-(details.seekOffset || 30)));
      navigator.mediaSession.setActionHandler('seekforward', details => seekPodcast(details.seekOffset || 30));
      // Algunos Android/Brave muestran mejor anterior/siguiente que los botones de salto.
      // Los mapeamos también a ±30 s para aumentar la probabilidad de que aparezcan.
      navigator.mediaSession.setActionHandler('previoustrack', () => seekPodcast(-30));
      navigator.mediaSession.setActionHandler('nexttrack', () => seekPodcast(30));
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
      });
      updateMediaSessionPosition();
    } catch {}
  }

  function updateMediaSessionPosition() {
    if (mediaKind !== 'podcast' || !('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || !Number.isFinite(audio.currentTime)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch {}
  }

  /* ---------------- Reconexión Wi‑Fi <-> datos ---------------- */

  function clearReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearRecoveryChecks() {
    clearTimeout(stallCheckTimer);
    clearTimeout(networkCheckTimer);
    stallCheckTimer = null;
    networkCheckTimer = null;
  }

  function markPlaybackHealthy() {
    lastProgressAt = Date.now();
    reconnectAttempt = 0;
    clearReconnect();
    clearRecoveryChecks();
  }

  function scheduleNetworkHealthCheck(reason = 'cambio de red', delay = 3500) {
    if (!playIntent || !mediaKind || !navigator.onLine) return;
    clearTimeout(networkCheckTimer);
    networkCheckTimer = setTimeout(() => {
      networkCheckTimer = null;
      if (!playIntent || !mediaKind || !navigator.onLine || sourceLoading) return;
      const staleFor = Date.now() - lastProgressAt;
      if (audio.paused || audio.readyState < 3 || staleFor > 5500) {
        scheduleReconnect(reason, 250);
      }
    }, delay);
  }

  function setReconnectStatus(text) {
    if (!playIntent) return;
    playerStatus.textContent = text;
  }

  function scheduleReconnect(reason = 'conexión', forcedDelay = null) {
    if (!playIntent || !mediaKind) return;
    clearReconnect();
    if (!navigator.onLine) {
      setReconnectStatus('Sin conexión · esperando Internet…');
      return;
    }
    const delays = [700, 1400, 2800, 5000, 9000, 15000];
    const delay = forcedDelay !== null ? forcedDelay : delays[Math.min(reconnectAttempt, delays.length - 1)];
    setReconnectStatus('Reconectando…');
    reconnectTimer = setTimeout(() => performReconnect(reason), Math.max(0, delay));
  }

  async function performReconnect(reason) {
    if (!playIntent || !mediaKind || !navigator.onLine || sourceLoading) return;
    reconnectAttempt += 1;
    setReconnectStatus(`Reconectando… intento ${reconnectAttempt}`);
    try {
      if (mediaKind === 'radio' && currentStation) {
        if (!currentStream) {
          await playStation(currentStation);
          return;
        }
        await loadRadioUrl(currentStream);
        await audio.play();
        updateMediaSessionRadio(currentStation);
      } else if (mediaKind === 'podcast' && currentEpisode && currentPodcastShow) {
        const resumeAt = Number.isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : storedEpisodePosition(currentEpisode);
        await loadPodcastUrl(currentEpisode.audio, resumeAt);
        audio.playbackRate = Number(playbackRateSelect.value || 1);
        await audio.play();
        updateMediaSessionPodcast(currentPodcastShow, currentEpisode);
      }
      reconnectAttempt = 0;
      lastProgressAt = Date.now();
      syncPlayButtons();
      if (mediaKind === 'radio' && currentStation) playerStatus.textContent = streamSourceText(currentStation);
      else updatePodcastTimeUi();
    } catch (err) {
      console.warn('Reconnect failed', reason, err);
      if (mediaKind === 'radio' && reconnectAttempt >= 3 && currentStation) {
        const currentIndex = currentCandidates.indexOf(currentStream);
        if (currentIndex >= 0 && currentIndex + 1 < currentCandidates.length) {
          candidateIndex = currentIndex + 1;
          reconnectAttempt = 0;
          await tryCandidate();
          return;
        }
      }
      scheduleReconnect(reason);
    }
  }

  function notePossibleStall() {
    if (!playIntent || sourceLoading) return;
    if (!navigator.onLine) {
      setReconnectStatus('Sin conexión · esperando Internet…');
      return;
    }

    // waiting/stalled puede ocurrir durante un pequeño relleno de buffer.
    // No reiniciamos el stream salvo que siga realmente parado varios segundos.
    clearTimeout(stallCheckTimer);
    const timeAtStall = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

    stallCheckTimer = setTimeout(() => {
      stallCheckTimer = null;
      if (!playIntent || !mediaKind || !navigator.onLine || sourceLoading) return;

      const nowTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const advanced = nowTime > timeAtStall + 0.15;
      const staleFor = Date.now() - lastProgressAt;

      if (advanced || staleFor < 7500) return;

      setReconnectStatus('Conexión detenida · reconectando…');
      scheduleReconnect('stream realmente detenido', 300);
    }, 8000);
  }

  /* ---------------- Respaldo automático de radio ---------------- */

  async function repairStation(station) {
    if (station.tdtName) {
      try {
        const response = await fetch(`${TDT_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const markdown = await response.text();
          const found = parseTdtStation(markdown, station.tdtName);
          if (found?.stream && !stationStreams(station).includes(found.stream)) return { stream: found.stream, source: 'TDTChannels' };
        }
      } catch (err) { console.warn('TDT fallback failed', err); }
    }
    if (station.radioBrowser) {
      const rb = await radioBrowserLookup(station);
      if (rb?.url && !stationStreams(station).includes(rb.url)) return { stream: rb.url, source: 'Radio Browser' };
    }
    return null;
  }

  function parseTdtStation(markdown, stationName) {
    const target = stationName.trim().toLowerCase();
    for (const line of markdown.split(/\r?\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map(x => x.trim()).filter(Boolean);
      if (!cells.length || cells[0].toLowerCase() !== target) continue;
      const streamMatches = [...line.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map(m => m[1]);
      if (streamMatches.length) return { stream: streamMatches[0] };
    }
    return null;
  }

  async function radioBrowserLookup(station) {
    const terms = station.radioBrowser || {};
    const params = new URLSearchParams({
      name: terms.name || station.name,
      countrycode: 'RU',
      city: terms.city || 'Липецк',
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
      limit: '20'
    });
    for (const mirror of RB_MIRRORS) {
      try {
        const response = await fetch(`${mirror}/json/stations/search?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) continue;
        const ranked = data
          .filter(x => x.url_resolved || x.url)
          .map(x => ({ ...x, chosenUrl: x.url_resolved || x.url, score: stationMatchScore(station, x) }))
          .filter(x => x.score >= 12)
          .sort((a, b) => b.score - a.score);
        const best = ranked.find(x => /^https:\/\//i.test(x.chosenUrl)) || ranked[0];
        if (best) return { url: best.chosenUrl };
      } catch (err) { console.warn('Radio Browser fallback failed', mirror, err); }
    }
    return null;
  }

  function stationMatchScore(station, item) {
    const wantedName = normalize(station.radioBrowser?.name || station.name);
    const name = normalize(item.name);
    const area = normalize(`${item.state || ''} ${item.tags || ''} ${item.name || ''}`);
    let score = 0;
    if (name.includes(wantedName) || wantedName.includes(name)) score += 10;
    if (area.includes('липец')) score += 10;
    if ((item.countrycode || '').toUpperCase() === 'RU') score += 5;
    if (/^https:\/\//i.test(item.url_resolved || item.url || '')) score += 2;
    return score;
  }

  /* ---------------- Temporizador ---------------- */

  function setSleepTimer(minutes) {
    clearTimeout(sleepTimer);
    localStorage.setItem(SLEEP_KEY, String(minutes));
    if (!minutes) { showToast('Temporizador desactivado.'); return; }
    sleepTimer = setTimeout(() => {
      stopMedia();
      sleepSelect.value = '0';
      localStorage.setItem(SLEEP_KEY, '0');
      showToast('Temporizador terminado: audio detenido.');
    }, minutes * 60 * 1000);
    showToast(`El audio se detendrá en ${minutes} minutos.`);
  }

  /* ---------------- Eventos ---------------- */

  searchInput.addEventListener('input', () => { query = searchInput.value; renderStations(); });
  radioModeBtn.addEventListener('click', () => setUiMode('radio'));
  podcastModeBtn.addEventListener('click', () => setUiMode('podcasts'));
  tvModeBtn.addEventListener('click', () => setUiMode('tv'));
  podcastBackBtn.addEventListener('click', closePodcastDetail);
  podcastRefreshBtn.addEventListener('click', refreshAllPodcasts);
  podcastDiscoveryBtn.addEventListener('click', searchPodcasts);
  podcastDiscoveryInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchPodcasts();
    }
  });
  podcastUnsubscribeBtn.addEventListener('click', unsubscribeCurrentPodcast);
  episodeSearchInput.addEventListener('input', () => {
    episodeQuery = episodeSearchInput.value;
    episodeVisibleLimit = EPISODE_PAGE_SIZE;
    renderPodcastDetail();
  });

  playPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  podcastPlayPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  podcastBigPlayPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  stopBtn.addEventListener('click', stopMedia);
  back30Btn.addEventListener('click', () => seekPodcast(-30));
  forward30Btn.addEventListener('click', () => seekPodcast(30));
  back30CompactBtn.addEventListener('click', () => seekPodcast(-30));
  forward30CompactBtn.addEventListener('click', () => seekPodcast(30));
  playerMetaButton.addEventListener('click', () => {
    if (mediaKind === 'podcast') openPodcastPlayer();
    else if (mediaKind === 'radio') openRadioPlayer();
  });
  closePodcastPlayerBtn.addEventListener('click', () => podcastPlayerDialog.close());
  closeRadioPlayerBtn.addEventListener('click', () => radioPlayerDialog.close());
  radioBigPlayPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  radioStopBigBtn.addEventListener('click', stopMedia);
  podcastSeekSlider.addEventListener('input', () => setPodcastPosition(podcastSeekSlider.value));
  playbackRateSelect.addEventListener('change', () => {
    const rate = Number(playbackRateSelect.value) || 1;
    audio.playbackRate = rate;
    localStorage.setItem(PODCAST_RATE_KEY, String(rate));
    updateMediaSessionPosition();
  });

  volumeSlider.addEventListener('input', () => setAppVolume(volumeSlider.value));
  muteBtn.addEventListener('click', toggleMute);
  settingsBtn.addEventListener('click', () => settingsDialog.showModal());
  sleepSelect.addEventListener('change', () => setSleepTimer(Number(sleepSelect.value)));

  tvRefreshBtn.addEventListener('click', () => loadTvChannels(true));
  tvCountryButtons.forEach(btn => btn.addEventListener('click', () => {
    tvCountry = btn.dataset.tvCountry;
    stopTvPlayback(true);
    renderTvChannels();
  }));
  tvCloseBtn.addEventListener('click', () => stopTvPlayback(true));
  tvVideo.addEventListener('playing', renderTvChannels);
  tvVideo.addEventListener('pause', renderTvChannels);

  audio.addEventListener('playing', () => {
    markPlaybackHealthy();
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'playing'; } catch {}
    }
    syncPlayButtons();
    if (mediaKind === 'radio' && currentStation) playerStatus.textContent = streamSourceText(currentStation);
    if (mediaKind === 'podcast') {
      updatePodcastTimeUi();
      updateEpisodePlayState(currentPodcastShow, currentEpisode, audio.currentTime || 5, audio.duration || currentEpisode?.duration || 0, false);
    }
    renderStations();
    if (selectedPodcastId) renderPodcastDetail();
  });

  audio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = playIntent ? 'paused' : 'none'; } catch {}
    }
    syncPlayButtons();
    renderStations();
    if (selectedPodcastId) renderPodcastDetail();
  });

  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (Math.abs(audio.currentTime - lastAudioTime) > 0.05) {
      lastAudioTime = audio.currentTime;
      lastProgressAt = now;
      reconnectAttempt = 0;
      clearReconnect();
      clearRecoveryChecks();
    }
    if (mediaKind === 'podcast') {
      updatePodcastTimeUi();
      if (now - lastPositionSaveAt > 5000) {
        lastPositionSaveAt = now;
        saveEpisodePosition();
      }
    }
  });

  audio.addEventListener('loadedmetadata', () => { if (mediaKind === 'podcast') updatePodcastTimeUi(); });
  audio.addEventListener('durationchange', () => { if (mediaKind === 'podcast') updatePodcastTimeUi(); });
  audio.addEventListener('canplay', () => {
    if (playIntent && !audio.paused) markPlaybackHealthy();
  });
  audio.addEventListener('waiting', notePossibleStall);
  audio.addEventListener('stalled', notePossibleStall);
  audio.addEventListener('error', () => {
    if (sourceLoading || repairing || !playIntent) return;
    scheduleReconnect('error de audio', 800);
  });
  audio.addEventListener('ended', () => {
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch {}
    }
    if (mediaKind === 'podcast') {
      const duration = Number.isFinite(audio.duration) ? audio.duration : (currentEpisode?.duration || 0);
      localStorage.removeItem(episodePositionKey(currentEpisode));
      updateEpisodePlayState(currentPodcastShow, currentEpisode, duration, duration, true);
      playIntent = false;
      syncPlayButtons();
      updatePodcastTimeUi();
      if (selectedPodcastId) renderPodcastDetail();
    }
  });
  audio.addEventListener('volumechange', () => {
    if (!audio.muted && audio.volume > 0) {
      lastAudibleVolume = audio.volume;
      localStorage.setItem(VOLUME_KEY, String(audio.volume));
    }
    localStorage.setItem(MUTED_KEY, audio.muted ? '1' : '0');
    syncVolumeUi();
  });

  window.addEventListener('online', () => {
    if (playIntent && mediaKind) {
      scheduleNetworkHealthCheck('Internet recuperado', 2500);
    }
  });
  window.addEventListener('offline', () => {
    clearReconnect();
    clearRecoveryChecks();
    if (playIntent && mediaKind) setReconnectStatus('Sin conexión · esperando Internet…');
  });

  if (navigator.connection?.addEventListener) {
    navigator.connection.addEventListener('change', () => {
      if (playIntent && mediaKind && navigator.onLine) {
        scheduleNetworkHealthCheck('cambio Wi-Fi/datos', 3000);
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playIntent && mediaKind && audio.paused) {
      scheduleReconnect('volver a la app', 300);
    }
  });
  window.addEventListener('pageshow', () => {
    if (playIntent && mediaKind && audio.paused && navigator.onLine) scheduleReconnect('pageshow', 300);
  });

  // Vigilante de último recurso. Solo interviene tras una parada real y prolongada.
  setInterval(() => {
    if (!playIntent || !mediaKind || !navigator.onLine || sourceLoading || audio.paused) return;
    if (Date.now() - lastProgressAt > 18000 && !reconnectTimer) {
      scheduleReconnect('sin progreso prolongado', 250);
    }
  }, 5000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=17').catch(console.warn));
  }

  /* ---------------- Inicio ---------------- */

  const storedVolume = clampVolume(localStorage.getItem(VOLUME_KEY) ?? 0.85);
  lastAudibleVolume = storedVolume > 0 ? storedVolume : 0.85;
  audio.volume = storedVolume;
  audio.muted = localStorage.getItem(MUTED_KEY) === '1';
  syncVolumeUi();

  const storedRate = Number(localStorage.getItem(PODCAST_RATE_KEY) || 1);
  playbackRateSelect.value = String(Number.isFinite(storedRate) ? storedRate : 1);
  audio.playbackRate = Number(playbackRateSelect.value);

  renderFilters();
  renderStations();
  renderPodcastLibrary();
  sleepSelect.value = localStorage.getItem(SLEEP_KEY) || '0';

  // La app siempre entra en Radio. Si había un podcast en curso,
  // dejamos ese episodio preparado en el reproductor, pausado y en su posición.
  setUiMode('radio');
  if (lastPodcastSnapshot?.episode?.audio) {
    restoreLastPodcastSession();
  }
})();
