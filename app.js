(() => {
  'use strict';

  const stations = window.RADIO_STATIONS || [];
  const podcastSources = window.PODCAST_SOURCES || [];

  const audio = document.getElementById('audio');
  const grid = document.getElementById('stationsGrid');
  const filtersEl = document.getElementById('filters');
  const searchInput = document.getElementById('searchInput');
  const radioView = document.getElementById('radioView');
  const podcastView = document.getElementById('podcastView');
  const radioModeBtn = document.getElementById('radioModeBtn');
  const podcastModeBtn = document.getElementById('podcastModeBtn');
  const eyebrow = document.getElementById('eyebrow');

  const podcastShows = document.getElementById('podcastShows');
  const podcastUpdated = document.getElementById('podcastUpdated');
  const podcastLibraryView = document.getElementById('podcastLibraryView');
  const podcastDetailView = document.getElementById('podcastDetailView');
  const podcastBackBtn = document.getElementById('podcastBackBtn');
  const podcastRefreshBtn = document.getElementById('podcastRefreshBtn');
  const podcastShowImage = document.getElementById('podcastShowImage');
  const podcastShowAuthor = document.getElementById('podcastShowAuthor');
  const podcastShowName = document.getElementById('podcastShowName');
  const podcastShowDescription = document.getElementById('podcastShowDescription');
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

  /* ---------------- Vistas Radio / Podcasts ---------------- */

  function setUiMode(mode) {
    currentUiMode = mode;
    const radio = mode === 'radio';
    radioView.classList.toggle('hidden', !radio);
    podcastView.classList.toggle('hidden', radio);
    radioModeBtn.classList.toggle('active', radio);
    podcastModeBtn.classList.toggle('active', !radio);
    eyebrow.textContent = radio ? 'RADIO PERSONAL' : 'PODCASTS';
    if (!radio) loadPodcastsData(false);
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
    return podcastData.podcasts?.find(p => p.id === id) || podcastSources.find(p => p.id === id) || null;
  }

  function podcastImage(show) {
    return show?.image || 'icons/icon-192.png';
  }

  function renderPodcastLibrary() {
    const dataById = new Map((podcastData.podcasts || []).map(p => [p.id, p]));
    const shows = podcastSources.map(source => ({ ...source, ...(dataById.get(source.id) || {}) }));
    if (podcastData.updatedAt) {
      podcastUpdated.textContent = `Actualizado ${formatDateTime(podcastData.updatedAt)}`;
    }
    if (!shows.length) {
      podcastShows.innerHTML = '<div class="empty">No hay podcasts configurados en podcasts.js.</div>';
      return;
    }
    podcastShows.innerHTML = shows.map(show => `
      <button class="podcast-show-card" type="button" data-show-id="${escapeAttr(show.id)}">
        <img src="${escapeAttr(podcastImage(show))}" alt="${escapeAttr(show.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='icons/icon-192.png'" />
        <div class="show-name">${escapeHtml(show.name)}</div>
        <div class="show-author">${escapeHtml(show.author || '')}</div>
        <div class="show-count">${Array.isArray(show.episodes) ? `${show.episodes.length} episodios cargados` : 'Pendiente de actualizar'}</div>
      </button>
    `).join('');
    podcastShows.querySelectorAll('[data-show-id]').forEach(btn => btn.addEventListener('click', () => openPodcast(btn.dataset.showId)));
  }

  function openPodcast(id) {
    selectedPodcastId = id;
    episodeQuery = '';
    episodeSearchInput.value = '';
    podcastLibraryView.classList.add('hidden');
    podcastDetailView.classList.remove('hidden');
    renderPodcastDetail();
  }

  function closePodcastDetail() {
    selectedPodcastId = null;
    podcastDetailView.classList.add('hidden');
    podcastLibraryView.classList.remove('hidden');
  }

  function renderPodcastDetail() {
    const show = podcastById(selectedPodcastId);
    if (!show) return;
    currentPodcastShow = mediaKind === 'podcast' && currentPodcastShow?.id === show.id ? currentPodcastShow : currentPodcastShow;
    setImage(podcastShowImage, podcastImage(show));
    podcastShowAuthor.textContent = show.author || 'Podcast';
    podcastShowName.textContent = show.name || 'Podcast';
    podcastShowDescription.textContent = show.description || '';
    renderEpisodes(show);
  }

  function renderEpisodes(show = podcastById(selectedPodcastId)) {
    if (!show) return;
    const q = normalize(episodeQuery);
    const episodes = (show.episodes || []).filter(ep => !q || normalize(`${ep.title} ${ep.description}`).includes(q));
    if (!episodes.length) {
      episodesList.innerHTML = `<div class="empty">${show.episodes?.length ? 'No hay episodios que coincidan.' : 'Todavía no hay episodios cargados. En GitHub ejecuta la acción “Actualizar podcasts” una vez.'}</div>`;
      return;
    }
    episodesList.innerHTML = episodes.map(ep => {
      const playing = mediaKind === 'podcast' && currentEpisode?.id === ep.id && !audio.paused;
      const img = ep.image || show.image || 'icons/icon-192.png';
      const date = formatDate(ep.publishedAt);
      const duration = ep.duration ? formatTime(ep.duration) : '';
      return `
        <article class="episode-card ${playing ? 'playing' : ''}">
          <img class="episode-image" src="${escapeAttr(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='icons/icon-192.png'" />
          <div>
            <div class="episode-title">${escapeHtml(ep.title)}</div>
            <div class="episode-desc">${escapeHtml(ep.description || '')}</div>
            <div class="episode-meta"><span>${escapeHtml(date)}</span>${duration ? `<span>${duration}</span>` : ''}</div>
          </div>
          <button class="episode-play" type="button" data-episode-id="${escapeAttr(ep.id)}" aria-label="Reproducir ${escapeAttr(ep.title)}">${playing ? '❚❚' : '▶'}</button>
        </article>`;
    }).join('');
    episodesList.querySelectorAll('[data-episode-id]').forEach(btn => btn.addEventListener('click', () => {
      const ep = (show.episodes || []).find(x => x.id === btn.dataset.episodeId);
      if (!ep) return;
      if (mediaKind === 'podcast' && currentEpisode?.id === ep.id && !audio.paused) pauseMedia();
      else playEpisode(show, ep, true);
    }));
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

  /* ---------------- Reproductor de radio ---------------- */

  async function playStation(station) {
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
    playerMetaButton.classList.remove('podcast-clickable');
    setStationImage(playerLogo, station);
    playerName.textContent = station.name;
    playerStatus.textContent = 'Conectando…';
    syncPlayButtons();
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

  function storedEpisodePosition(ep) {
    const n = Number(localStorage.getItem(episodePositionKey(ep)) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function saveEpisodePosition() {
    if (mediaKind !== 'podcast' || !currentEpisode || !Number.isFinite(audio.currentTime)) return;
    const current = audio.currentTime;
    const duration = audio.duration;
    if (current < 3 || (Number.isFinite(duration) && duration - current < 10)) {
      localStorage.removeItem(episodePositionKey(currentEpisode));
    } else {
      localStorage.setItem(episodePositionKey(currentEpisode), String(Math.floor(current)));
    }
  }

  async function playEpisode(show, episode, openPlayer = false) {
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
    const resumeAt = storedEpisodePosition(episode);
    try {
      await loadPodcastUrl(episode.audio, resumeAt);
      await audio.play();
      reconnectAttempt = 0;
      lastProgressAt = Date.now();
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
    playerMetaButton.classList.add('podcast-clickable');
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

  /* ---------------- Controles comunes ---------------- */

  function syncPlayButtons() {
    const playing = !audio.paused && playIntent;
    const icon = playing ? '❚❚' : '▶';
    playPauseBtn.textContent = icon;
    podcastPlayPauseBtn.textContent = icon;
    podcastBigPlayPauseBtn.textContent = icon;
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
    for (const action of ['play','pause','stop','seekbackward','seekforward','seekto']) {
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
  podcastBackBtn.addEventListener('click', closePodcastDetail);
  podcastRefreshBtn.addEventListener('click', () => loadPodcastsData(true));
  episodeSearchInput.addEventListener('input', () => { episodeQuery = episodeSearchInput.value; renderPodcastDetail(); });

  playPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  podcastPlayPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  podcastBigPlayPauseBtn.addEventListener('click', () => audio.paused ? resumeMedia() : pauseMedia());
  stopBtn.addEventListener('click', stopMedia);
  back30Btn.addEventListener('click', () => seekPodcast(-30));
  forward30Btn.addEventListener('click', () => seekPodcast(30));
  back30CompactBtn.addEventListener('click', () => seekPodcast(-30));
  forward30CompactBtn.addEventListener('click', () => seekPodcast(30));
  playerMetaButton.addEventListener('click', () => { if (mediaKind === 'podcast') openPodcastPlayer(); });
  closePodcastPlayerBtn.addEventListener('click', () => podcastPlayerDialog.close());
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

  audio.addEventListener('playing', () => {
    markPlaybackHealthy();
    syncPlayButtons();
    if (mediaKind === 'radio' && currentStation) playerStatus.textContent = streamSourceText(currentStation);
    if (mediaKind === 'podcast') updatePodcastTimeUi();
    renderStations();
    if (selectedPodcastId) renderPodcastDetail();
  });

  audio.addEventListener('pause', () => {
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
    if (mediaKind === 'podcast') {
      localStorage.removeItem(episodePositionKey(currentEpisode));
      playIntent = false;
      syncPlayButtons();
      updatePodcastTimeUi();
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
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=9').catch(console.warn));
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
  setUiMode('radio');
})();
