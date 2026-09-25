(() => {
  'use strict';

  const stations = window.RADIO_STATIONS || [];
  const audio = document.getElementById('audio');
  const grid = document.getElementById('stationsGrid');
  const filtersEl = document.getElementById('filters');
  const searchInput = document.getElementById('searchInput');
  const playerBar = document.getElementById('playerBar');
  const playerLogo = document.getElementById('playerLogo');
  const playerName = document.getElementById('playerName');
  const playerStatus = document.getElementById('playerStatus');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const muteBtn = document.getElementById('muteBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialog = document.getElementById('settingsDialog');
  const detailsDialog = document.getElementById('detailsDialog');
  const detailsTitle = document.getElementById('detailsTitle');
  const detailsLogo = document.getElementById('detailsLogo');
  const detailsDesc = document.getElementById('detailsDesc');
  const detailsSource = document.getElementById('detailsSource');
  const streamField = document.getElementById('streamField');
  const copyStreamBtn = document.getElementById('copyStreamBtn');
  const sleepSelect = document.getElementById('sleepSelect');
  const toast = document.getElementById('toast');

  const TDT_URL = 'https://raw.githubusercontent.com/LaQuay/TDTChannels/master/RADIO.md';
  const RB_MIRRORS = [
    'https://de1.api.radio-browser.info',
    'https://fi1.api.radio-browser.info',
    'https://at1.api.radio-browser.info'
  ];

  // IMPORTANTE: stations.js manda siempre. Este almacén solo guarda respaldos
  // encontrados automáticamente y NUNCA se coloca por delante de station.streams.
  const FALLBACK_KEY = 'mi-radio-fallback-v1';
  const SLEEP_KEY = 'mi-radio-sleep-v1';
  const VOLUME_KEY = 'mi-radio-volume-v1';
  const MUTED_KEY = 'mi-radio-muted-v1';

  // Elimina preferencias antiguas que podían sustituir a stations.js.
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('mi-radio-manual-') || key.startsWith('mi-radio-resolved-')) {
      localStorage.removeItem(key);
    }
  }

  let currentFilter = 'Todas';
  let query = '';
  let currentStation = null;
  let currentStream = '';
  let currentCandidates = [];
  let candidateIndex = 0;
  let hls = null;
  let repairing = false;
  let repairAttemptedForPlay = false;
  let detailsStation = null;
  let sleepTimer = null;
  let toastTimer = null;
  let lastAudibleVolume = 0.85;

  const fallbackCache = safeJson(localStorage.getItem(FALLBACK_KEY), {});

  function safeJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function saveFallbacks() {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallbackCache));
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
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

  function stationStreams(station) {
    return [...new Set((station.streams || []).filter(Boolean))];
  }

  function streamList(station) {
    // ORDEN OBLIGATORIO: stations.js primero, respaldo automático al final.
    const list = [...stationStreams(station)];
    const fallback = fallbackCache[station.id]?.stream;
    if (fallback && !list.includes(fallback)) list.push(fallback);
    return list;
  }

  function primaryStream(station) {
    return stationStreams(station)[0] || 'Sin enlace definido en stations.js';
  }

  function normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
    muteBtn.title = audio.muted || audio.volume === 0 ? 'Activar sonido' : 'Silenciar';
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

  function renderFilters() {
    const groups = ['Todas', 'Zaragoza', 'Nacional', 'Música', 'Lipetsk'];
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
      const matchesGroup = currentFilter === 'Todas' || station.group === currentFilter;
      const haystack = normalize(`${station.name} ${station.subtitle} ${station.group}`);
      return matchesGroup && (!q || haystack.includes(q));
    });

    if (!visible.length) {
      grid.innerHTML = '<div class="empty">No hay emisoras que coincidan.</div>';
      return;
    }

    grid.innerHTML = visible.map(station => {
      const isPlaying = currentStation?.id === station.id && !audio.paused;
      const usingFallback = currentStation?.id === station.id && currentStream && !stationStreams(station).includes(currentStream);
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
            <button class="more-card" data-more="${station.id}" type="button" aria-label="Detalles de ${escapeAttr(station.name)}">•••</button>
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
      if (currentStation?.id === station.id && !audio.paused) pause(); else playStation(station);
    }));

    grid.querySelectorAll('[data-more]').forEach(btn => btn.addEventListener('click', () => {
      const station = stations.find(s => s.id === btn.dataset.more);
      if (station) openDetails(station);
    }));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  const escapeAttr = escapeHtml;

  async function playStation(station) {
    currentStation = station;
    currentCandidates = streamList(station);
    candidateIndex = 0;
    repairAttemptedForPlay = false;
    playerBar.classList.remove('hidden');
    setStationImage(playerLogo, station);
    playerName.textContent = station.name;
    playerStatus.textContent = 'Conectando…';
    playPauseBtn.textContent = '❚❚';
    renderStations();

    if (!currentCandidates.length) {
      await tryAutomaticFallback();
      return;
    }
    await tryCandidate();
  }

  async function tryCandidate() {
    if (!currentStation) return;

    if (candidateIndex >= currentCandidates.length) {
      await tryAutomaticFallback();
      return;
    }

    currentStream = currentCandidates[candidateIndex];
    destroyHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    try {
      if (isHls(currentStream) && window.Hls?.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 45,
          backBufferLength: 30
        });
        hls.loadSource(currentStream);
        hls.attachMedia(audio);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 12000);
          hls.once(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(timeout); resolve(); });
          hls.once(Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) { clearTimeout(timeout); reject(new Error(data.type || 'hls')); }
          });
        });
      } else {
        audio.src = currentStream;
      }

      await audio.play();
      playerStatus.textContent = streamSourceText(currentStation);
      playPauseBtn.textContent = '❚❚';
      updateMediaSession(currentStation);
      renderStations();
    } catch (err) {
      console.warn('Stream failed', currentStream, err);
      candidateIndex += 1;
      await tryCandidate();
    }
  }

  async function tryAutomaticFallback() {
    if (!currentStation || repairAttemptedForPlay || repairing) {
      playerStatus.textContent = 'No se pudo reproducir';
      playPauseBtn.textContent = '▶';
      showToast('Los enlaces de stations.js han fallado y no hay respaldo válido.');
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
      playPauseBtn.textContent = '▶';
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

  function isHls(url) { return /\.m3u8(?:$|\?)/i.test(url || ''); }
  function destroyHls() { if (hls) { try { hls.destroy(); } catch {} hls = null; } }

  function pause() {
    audio.pause();
    playPauseBtn.textContent = '▶';
    playerStatus.textContent = 'Pausado';
    renderStations();
  }

  function resume() {
    if (!currentStation) return;
    audio.play().then(() => {
      playPauseBtn.textContent = '❚❚';
      playerStatus.textContent = streamSourceText(currentStation);
      renderStations();
    }).catch(() => playStation(currentStation));
  }

  function stop() {
    audio.pause();
    destroyHls();
    audio.removeAttribute('src');
    audio.load();
    playPauseBtn.textContent = '▶';
    if (currentStation) playerStatus.textContent = 'Detenido';
    renderStations();
  }

  function streamSourceText(station) {
    return stationStreams(station).includes(currentStream)
      ? 'Reproduciendo · stations.js'
      : `Reproduciendo · respaldo automático${fallbackCache[station.id]?.source ? ' (' + fallbackCache[station.id].source + ')' : ''}`;
  }

  function updateMediaSession(station) {
    if (!('mediaSession' in navigator)) return;
    try {
      const logo = logoCandidates(station)[0];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.subtitle,
        album: 'Mi Radio',
        artwork: logo ? [{ src: logo, sizes: '200x200' }] : []
      });
      navigator.mediaSession.setActionHandler('play', resume);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('stop', stop);
    } catch {}
  }

  audio.addEventListener('playing', () => {
    playPauseBtn.textContent = '❚❚';
    if (currentStation) playerStatus.textContent = streamSourceText(currentStation);
    renderStations();
  });
  audio.addEventListener('pause', () => renderStations());
  audio.addEventListener('error', () => {
    if (!currentStation || repairing) return;
    candidateIndex += 1;
    tryCandidate();
  });
  audio.addEventListener('stalled', () => {
    if (currentStation && !audio.paused) playerStatus.textContent = 'Reconectando…';
  });
  // Sincroniza el deslizador si el navegador cambia el volumen del elemento.
  // En Android, los botones físicos suelen modificar el volumen multimedia del sistema
  // y ese nivel no se expone a las PWA, por lo que no siempre generan este evento.
  audio.addEventListener('volumechange', () => {
    if (!audio.muted && audio.volume > 0) {
      lastAudibleVolume = audio.volume;
      localStorage.setItem(VOLUME_KEY, String(audio.volume));
    }
    localStorage.setItem(MUTED_KEY, audio.muted ? '1' : '0');
    syncVolumeUi();
  });

  async function repairStation(station) {
    // Solo se llama DESPUÉS de que fallen todos los streams de stations.js.
    if (station.tdtName) {
      try {
        const response = await fetch(`${TDT_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const markdown = await response.text();
          const found = parseTdtStation(markdown, station.tdtName);
          if (found?.stream && !stationStreams(station).includes(found.stream)) {
            return { stream: found.stream, source: 'TDTChannels' };
          }
        }
      } catch (err) { console.warn('TDT fallback failed', err); }
    }

    if (station.radioBrowser) {
      const rb = await radioBrowserLookup(station);
      if (rb?.url && !stationStreams(station).includes(rb.url)) {
        return { stream: rb.url, source: 'Radio Browser' };
      }
    }

    return null;
  }

  function parseTdtStation(markdown, stationName) {
    const target = stationName.trim().toLowerCase();
    const lines = markdown.split(/\r?\n/);
    for (const line of lines) {
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

  function openDetails(station) {
    detailsStation = station;
    detailsTitle.textContent = station.name;
    setStationImage(detailsLogo, station);
    detailsDesc.textContent = station.description;
    streamField.value = primaryStream(station);
    const fb = fallbackCache[station.id];
    detailsSource.textContent = fb
      ? `Prioridad: stations.js. Respaldo automático guardado: ${fb.source || 'alternativo'}. Sitio oficial/referencia: ${station.site}`
      : `Prioridad: stations.js. Solo se buscará un respaldo si esos enlaces fallan. Sitio oficial/referencia: ${station.site}`;
    detailsDialog.showModal();
  }

  function setSleepTimer(minutes) {
    clearTimeout(sleepTimer);
    localStorage.setItem(SLEEP_KEY, String(minutes));
    if (!minutes) { showToast('Temporizador desactivado.'); return; }
    sleepTimer = setTimeout(() => {
      stop();
      sleepSelect.value = '0';
      localStorage.setItem(SLEEP_KEY, '0');
      showToast('Temporizador terminado: radio detenida.');
    }, minutes * 60 * 1000);
    showToast(`La radio se detendrá en ${minutes} minutos.`);
  }

  searchInput.addEventListener('input', () => { query = searchInput.value; renderStations(); });
  playPauseBtn.addEventListener('click', () => { if (!currentStation) return; audio.paused ? resume() : pause(); });
  stopBtn.addEventListener('click', stop);
  volumeSlider.addEventListener('input', () => setAppVolume(volumeSlider.value));
  muteBtn.addEventListener('click', toggleMute);
  settingsBtn.addEventListener('click', () => settingsDialog.showModal());
  copyStreamBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(streamField.value); showToast('Enlace copiado.'); }
    catch { streamField.select(); document.execCommand('copy'); showToast('Enlace copiado.'); }
  });
  sleepSelect.addEventListener('change', () => setSleepTimer(Number(sleepSelect.value)));

  window.addEventListener('online', () => {
    if (currentStation && (audio.paused || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
      playerStatus.textContent = 'Conexión recuperada · reconectando…';
      playStation(currentStation);
    }
  });
  window.addEventListener('offline', () => {
    if (currentStation) playerStatus.textContent = 'Sin conexión a Internet';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=6').catch(console.warn));
  }

  // Volumen propio de la app. En escritorio controla el audio directamente.
  // En móvil, el volumen físico del teléfono sigue siendo un control adicional del sistema.
  const storedVolume = clampVolume(localStorage.getItem(VOLUME_KEY) ?? 0.85);
  lastAudibleVolume = storedVolume > 0 ? storedVolume : 0.85;
  audio.volume = storedVolume;
  audio.muted = localStorage.getItem(MUTED_KEY) === '1';
  syncVolumeUi();

  renderFilters();
  renderStations();
  sleepSelect.value = localStorage.getItem(SLEEP_KEY) || '0';
})();
