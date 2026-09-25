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
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshAllBtn = document.getElementById('refreshAllBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialog = document.getElementById('settingsDialog');
  const detailsDialog = document.getElementById('detailsDialog');
  const detailsTitle = document.getElementById('detailsTitle');
  const detailsLogo = document.getElementById('detailsLogo');
  const detailsDesc = document.getElementById('detailsDesc');
  const detailsSource = document.getElementById('detailsSource');
  const streamField = document.getElementById('streamField');
  const copyStreamBtn = document.getElementById('copyStreamBtn');
  const editStreamBtn = document.getElementById('editStreamBtn');
  const editBox = document.getElementById('editBox');
  const manualStreamInput = document.getElementById('manualStreamInput');
  const saveManualBtn = document.getElementById('saveManualBtn');
  const resetManualBtn = document.getElementById('resetManualBtn');
  const sleepSelect = document.getElementById('sleepSelect');
  const lastRefreshText = document.getElementById('lastRefreshText');
  const toast = document.getElementById('toast');
  const healthSummary = document.getElementById('healthSummary');

  const TDT_URL = 'https://raw.githubusercontent.com/LaQuay/TDTChannels/master/RADIO.md';
  const RB_MIRRORS = [
    'https://de1.api.radio-browser.info',
    'https://fi1.api.radio-browser.info',
    'https://at1.api.radio-browser.info'
  ];

  const STORAGE_KEY = 'mi-radio-resolved-v3';
  const MANUAL_KEY = 'mi-radio-manual-v2';
  const LAST_REFRESH_KEY = 'mi-radio-last-refresh-v2';
  const SLEEP_KEY = 'mi-radio-sleep-v1';
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let currentFilter = 'Todas';
  let query = '';
  let currentStation = null;
  let currentStream = '';
  let currentCandidates = [];
  let candidateIndex = 0;
  let hls = null;
  let retrying = false;
  let detailsStation = null;
  let sleepTimer = null;
  let toastTimer = null;

  const resolved = safeJson(localStorage.getItem(STORAGE_KEY), {});
  const manual = safeJson(localStorage.getItem(MANUAL_KEY), {});

  function safeJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function saveResolved() { localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved)); }
  function saveManual() { localStorage.setItem(MANUAL_KEY, JSON.stringify(manual)); }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function stationLogo(station) {
    return resolved[station.id]?.logo || station.logo || '';
  }

  function streamList(station) {
    const list = [];
    if (manual[station.id]) list.push(manual[station.id]);
    if (resolved[station.id]?.stream) list.push(resolved[station.id].stream);
    for (const url of station.streams || []) list.push(url);
    return [...new Set(list.filter(Boolean))];
  }

  function currentBestStream(station) {
    return streamList(station)[0] || 'Pendiente de resolver automáticamente';
  }

  function normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
      const sourceLabel = manual[station.id] ? 'enlace manual' : resolved[station.id]?.source || 'enlace incluido';
      const initials = station.name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
      return `
        <article class="station-card ${isPlaying ? 'playing' : ''}" data-id="${station.id}">
          <div class="logo-wrap">
            <img class="station-logo" src="${escapeAttr(stationLogo(station))}" alt="Logo de ${escapeAttr(station.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" />
            <div class="logo-fallback" style="display:none">${escapeHtml(initials)}</div>
          </div>
          <div>
            <div class="station-name">${escapeHtml(station.name)}</div>
            <div class="station-sub">${escapeHtml(station.subtitle)}</div>
            <div class="station-status"><span class="dot ${resolved[station.id]?.stream ? 'ok' : ''}"></span>${escapeHtml(sourceLabel)}</div>
          </div>
          <div class="card-actions">
            <button class="play-card" data-play="${station.id}" type="button" aria-label="Reproducir ${escapeAttr(station.name)}">${isPlaying ? '❚❚' : '▶'}</button>
            <button class="more-card" data-more="${station.id}" type="button" aria-label="Detalles de ${escapeAttr(station.name)}">•••</button>
          </div>
        </article>`;
    }).join('');

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

  async function playStation(station, startIndex = 0) {
    currentStation = station;
    currentCandidates = streamList(station);
    candidateIndex = Math.min(startIndex, Math.max(0, currentCandidates.length - 1));
    playerBar.classList.remove('hidden');
    playerLogo.src = stationLogo(station);
    playerName.textContent = station.name;
    playerStatus.textContent = 'Conectando…';
    playPauseBtn.textContent = '❚❚';
    renderStations();

    if (!currentCandidates.length) {
      playerStatus.textContent = 'Buscando un enlace…';
      const repaired = await repairStation(station, true);
      if (!repaired) {
        playerStatus.textContent = 'No se encontró ningún enlace';
        playPauseBtn.textContent = '▶';
        return;
      }
      currentCandidates = streamList(station);
      candidateIndex = 0;
    }

    await tryCandidate();
  }

  async function tryCandidate() {
    if (!currentStation || candidateIndex >= currentCandidates.length) {
      if (retrying) return;
      retrying = true;
      playerStatus.textContent = 'Revisando enlaces alternativos…';
      const ok = await repairStation(currentStation, true);
      retrying = false;
      if (ok) {
        currentCandidates = streamList(currentStation);
        candidateIndex = 0;
        return tryCandidate();
      }
      playerStatus.textContent = 'No se pudo reproducir';
      playPauseBtn.textContent = '▶';
      showToast('No se encontró un stream válido para esta emisora.');
      renderStations();
      return;
    }

    currentStream = currentCandidates[candidateIndex];
    destroyHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    try {
      if (isHls(currentStream) && window.Hls?.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
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
      tryCandidate();
    }
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
    if (manual[station.id]) return 'Reproduciendo · enlace manual';
    if (resolved[station.id]?.source) return `Reproduciendo · ${resolved[station.id].source}`;
    return 'Reproduciendo · enlace incluido';
  }

  function updateMediaSession(station) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.subtitle,
        album: 'Mi Radio',
        artwork: stationLogo(station) ? [{ src: stationLogo(station), sizes: '200x200' }] : []
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
    if (!currentStation || retrying) return;
    candidateIndex += 1;
    tryCandidate();
  });
  audio.addEventListener('stalled', () => {
    if (currentStation && !audio.paused) playerStatus.textContent = 'Reconectando…';
  });

  async function refreshAll(showMessages = true) {
    refreshBtn.disabled = true;
    if (refreshAllBtn) refreshAllBtn.disabled = true;
    if (healthSummary) healthSummary.textContent = 'Revisando enlaces…';
    if (showMessages) showToast('Revisando enlaces de emisoras…');

    let tdtMarkdown = '';
    try {
      const response = await fetch(`${TDT_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) tdtMarkdown = await response.text();
    } catch (err) { console.warn('TDT fetch failed', err); }

    let updated = 0;
    for (const station of stations) {
      try {
        const ok = await repairStation(station, false, tdtMarkdown);
        if (ok) updated += 1;
      } catch (err) { console.warn('Repair failed', station.name, err); }
    }

    const now = Date.now();
    localStorage.setItem(LAST_REFRESH_KEY, String(now));
    updateLastRefreshText();
    saveResolved();
    renderStations();
    if (healthSummary) healthSummary.textContent = `${updated}/${stations.length} contrastadas`;
    refreshBtn.disabled = false;
    if (refreshAllBtn) refreshAllBtn.disabled = false;
    if (showMessages) showToast(`Revisión terminada: ${updated} emisoras actualizadas.`);
  }

  async function repairStation(station, saveImmediately = true, tdtMarkdown = '') {
    let candidate = null;
    let logo = null;
    let source = null;

    if (station.tdtName) {
      let markdown = tdtMarkdown;
      if (!markdown) {
        try {
          const response = await fetch(`${TDT_URL}?t=${Date.now()}`, { cache: 'no-store' });
          if (response.ok) markdown = await response.text();
        } catch {}
      }
      if (markdown) {
        const found = parseTdtStation(markdown, station.tdtName);
        if (found?.stream) {
          candidate = found.stream;
          logo = found.logo;
          source = 'TDTChannels';
        }
      }
    }

    if (!candidate && station.radioBrowser) {
      const rb = await radioBrowserLookup(station);
      if (rb?.url) {
        candidate = rb.url;
        logo = rb.favicon || null;
        source = 'Radio Browser';
      }
    }

    if (candidate) {
      resolved[station.id] = {
        stream: candidate,
        logo: logo || resolved[station.id]?.logo || null,
        source,
        checkedAt: Date.now()
      };
      if (saveImmediately) saveResolved();
      if (detailsStation?.id === station.id) updateDetailsFields(station);
      return true;
    }

    return false;
  }

  function parseTdtStation(markdown, stationName) {
    const target = stationName.trim().toLowerCase();
    const lines = markdown.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map(x => x.trim()).filter(Boolean);
      if (!cells.length || cells[0].toLowerCase() !== target) continue;
      const streamMatches = [...line.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map(m => m[1]);
      if (!streamMatches.length) return null;
      const stream = streamMatches[0];
      const logoMatch = line.match(/\[logo\]\((https?:\/\/[^)]+)\)/i);
      return { stream, logo: logoMatch?.[1] || null };
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
      limit: '25'
    });

    for (const mirror of RB_MIRRORS) {
      try {
        const response = await fetch(`${mirror}/json/stations/search?${params.toString()}`, {
          cache: 'no-store'
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) continue;
        const ranked = data
          .filter(x => x.url_resolved || x.url)
          .map(x => ({
            ...x,
            chosenUrl: x.url_resolved || x.url,
            score: stationMatchScore(station, x)
          }))
          .sort((a,b) => b.score - a.score);
        const best = ranked.find(x => /^https:\/\//i.test(x.chosenUrl)) || ranked[0];
        if (best) return { url: best.chosenUrl, favicon: best.favicon || '' };
      } catch (err) { console.warn('RadioBrowser mirror failed', mirror, err); }
    }
    return null;
  }

  function stationMatchScore(station, item) {
    const target = normalize(station.name);
    const name = normalize(item.name);
    const city = normalize(item.state + ' ' + item.tags + ' ' + item.name);
    let score = 0;
    if (name.includes(normalize(station.radioBrowser?.name))) score += 8;
    if (city.includes('липец')) score += 10;
    if (target.includes(name) || name.includes(target)) score += 6;
    if (/^https:\/\//i.test(item.url_resolved || item.url || '')) score += 3;
    score += Math.min(3, Number(item.clickcount || 0) / 1000);
    return score;
  }

  function openDetails(station) {
    detailsStation = station;
    editBox.classList.add('hidden');
    updateDetailsFields(station);
    detailsDialog.showModal();
  }

  function updateDetailsFields(station) {
    detailsTitle.textContent = station.name;
    detailsLogo.src = stationLogo(station);
    detailsDesc.textContent = station.description;
    streamField.value = currentBestStream(station);
    manualStreamInput.value = manual[station.id] || '';
    const source = manual[station.id] ? 'Manual' : (resolved[station.id]?.source || 'Incluido en la app');
    detailsSource.textContent = `Origen del enlace: ${source}. Sitio oficial/referencia: ${station.site}`;
  }

  function updateLastRefreshText() {
    const value = Number(localStorage.getItem(LAST_REFRESH_KEY) || 0);
    if (!value) { lastRefreshText.textContent = 'Todavía no revisado.'; return; }
    lastRefreshText.textContent = `Última revisión: ${new Date(value).toLocaleString('es-ES')}`;
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
  refreshBtn.addEventListener('click', () => refreshAll(true));
  refreshAllBtn.addEventListener('click', () => refreshAll(true));
  settingsBtn.addEventListener('click', () => settingsDialog.showModal());
  copyStreamBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(streamField.value); showToast('Enlace copiado.'); }
    catch { streamField.select(); document.execCommand('copy'); showToast('Enlace copiado.'); }
  });
  editStreamBtn.addEventListener('click', () => editBox.classList.toggle('hidden'));
  saveManualBtn.addEventListener('click', () => {
    if (!detailsStation) return;
    const url = manualStreamInput.value.trim();
    if (!/^https?:\/\//i.test(url)) { showToast('Escribe un enlace http:// o https:// válido.'); return; }
    manual[detailsStation.id] = url;
    saveManual();
    updateDetailsFields(detailsStation);
    renderStations();
    showToast('Enlace manual guardado.');
  });
  resetManualBtn.addEventListener('click', () => {
    if (!detailsStation) return;
    delete manual[detailsStation.id];
    saveManual();
    updateDetailsFields(detailsStation);
    renderStations();
    showToast('Se vuelve a usar la actualización automática.');
  });
  sleepSelect.addEventListener('change', () => setSleepTimer(Number(sleepSelect.value)));

  window.addEventListener('online', () => {
    if (currentStation && audio.paused && currentStream) playerStatus.textContent = 'Conexión recuperada';
  });
  window.addEventListener('offline', () => {
    if (currentStation) playerStatus.textContent = 'Sin conexión a Internet';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
  }

  renderFilters();
  renderStations();
  updateLastRefreshText();
  sleepSelect.value = localStorage.getItem(SLEEP_KEY) || '0';

  const lastRefresh = Number(localStorage.getItem(LAST_REFRESH_KEY) || 0);
  if (navigator.onLine && (!lastRefresh || Date.now() - lastRefresh > ONE_DAY)) {
    setTimeout(() => refreshAll(false), 1200);
  }
})();
