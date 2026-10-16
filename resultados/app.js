(() => {
  "use strict";

  const API_BASES = [
    "https://api.sofascore.com/api/v1",
    "https://www.sofascore.com/api/v1"
  ];
  const FALLBACK_URL = "data/scores.json";
  const FAVORITES_KEY = "mi-resultados-favorites-v1";
  const CACHE_PREFIX = "mi-resultados-day-v1:";
  const NOTIFY_KEY = "mi-resultados-notify-v1";
  const LIVE_INTERVAL_VISIBLE = 15000;
  const LIVE_INTERVAL_HIDDEN = 60000;

  const els = {
    tabs:[...document.querySelectorAll("[data-view]")],
    matches:document.getElementById("matches"),
    status:document.getElementById("statusText"),
    updated:document.getElementById("updatedText"),
    liveBadge:document.getElementById("liveBadge"),
    dateMain:document.getElementById("dateMain"),
    dateSub:document.getElementById("dateSub"),
    prev:document.getElementById("prevDayBtn"),
    next:document.getElementById("nextDayBtn"),
    dateBtn:document.getElementById("dateBtn"),
    search:document.getElementById("matchSearch"),
    refresh:document.getElementById("refreshBtn"),
    notify:document.getElementById("notifyBtn"),
    favEmpty:document.getElementById("favoritesEmpty"),
    teamToggle:document.getElementById("teamSearchToggle"),
    teamPanel:document.getElementById("teamSearchPanel"),
    teamInput:document.getElementById("teamSearchInput"),
    teamStatus:document.getElementById("teamSearchStatus"),
    teamResults:document.getElementById("teamSearchResults"),
    dialog:document.getElementById("matchDialog"),
    closeDialog:document.getElementById("closeMatchBtn"),
    dialogCompetition:document.getElementById("dialogCompetition"),
    dialogStatus:document.getElementById("dialogStatus"),
    dialogFavorite:document.getElementById("dialogFavoriteBtn"),
    homeLogo:document.getElementById("dialogHomeLogo"),
    awayLogo:document.getElementById("dialogAwayLogo"),
    homeName:document.getElementById("dialogHomeName"),
    awayName:document.getElementById("dialogAwayName"),
    dialogScore:document.getElementById("dialogScore"),
    dialogClock:document.getElementById("dialogClock"),
    detailTabs:[...document.querySelectorAll("[data-detail]")],
    detailSummary:document.getElementById("detailSummary"),
    detailStats:document.getElementById("detailStats"),
    detailLineups:document.getElementById("detailLineups")
  };

  let view = "scores";
  let selectedDate = todayIso();
  let dayEvents = [];
  let liveEvents = [];
  let query = "";
  let favorites = new Map(loadJson(FAVORITES_KEY, []).map(x => [Number(x.id), x]));
  let liveTimer = null;
  let selectedEvent = null;
  let liveSnapshot = new Map();
  let liveSnapshotInitialized = false;
  let teamSearchTimer = null;
  let notificationEnabled = localStorage.getItem(NOTIFY_KEY) === "1";

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites.values()]));
  }

  function todayIso() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  }

  function shiftDate(iso, days) {
    const p = iso.split("-").map(Number);
    const d = new Date(p[0], p[1]-1, p[2], 12);
    d.setDate(d.getDate()+days);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  }

  function dateObj(iso) {
    const p = iso.split("-").map(Number);
    return new Date(p[0], p[1]-1, p[2], 12);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function teamLogo(team) {
    if (team && typeof team === "object" && team.logo) return team.logo;
    const id = team && typeof team === "object" ? team.id : team;
    return id ? "https://img.sofascore.com/api/v1/team/" + encodeURIComponent(id) + "/image" : "icon.svg";
  }

  function normalizeTeamName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function favoriteTeam(team) {
    if (!team) return null;
    const id = Number(team.id);
    if (Number.isFinite(id) && favorites.has(id)) return favorites.get(id);
    const name = normalizeTeamName(team.name || team.shortName);
    if (!name) return null;
    return [...favorites.values()].find(item => normalizeTeamName(item.name) === name) || null;
  }

  function countryFlag(alpha2) {
    if (!alpha2 || alpha2.length !== 2) return "⚽";
    try {
      return String.fromCodePoint(...alpha2.toUpperCase().split("").map(c => 127397 + c.charCodeAt()));
    } catch {
      return "⚽";
    }
  }

  async function fetchJson(path, options) {
    let lastErr;
    for (const base of API_BASES) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const res = await fetch(base + path, {
          cache:"no-store",
          mode:"cors",
          signal:controller.signal,
          headers:{"Accept":"application/json"},
          ...(options || {})
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No se pudo acceder al proveedor");
  }

  async function loadFallback() {
    const res = await fetch(FALLBACK_URL + "?t=" + Date.now(), {cache:"no-store"});
    if (!res.ok) throw new Error("Fallback " + res.status);
    return await res.json();
  }

  function eventDate(event) {
    return new Date(Number(event.startTimestamp || 0)*1000);
  }

  function eventStatusType(event) {
    return String(event?.status?.type || "");
  }

  function isLive(event) {
    return eventStatusType(event) === "inprogress";
  }

  function isFinished(event) {
    return eventStatusType(event) === "finished";
  }

  function scoreValue(score) {
    const v = score?.current ?? score?.display ?? score?.normaltime;
    return Number.isFinite(Number(v)) ? Number(v) : null;
  }

  function scoreText(event) {
    const h = scoreValue(event.homeScore);
    const a = scoreValue(event.awayScore);
    return h == null || a == null ? "–" : h + " - " + a;
  }

  function clockText(event) {
    const type = eventStatusType(event);
    const desc = String(event?.status?.description || "").toLowerCase();

    if (type === "notstarted") {
      return new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit"}).format(eventDate(event));
    }
    if (type === "finished") return "FIN";
    if (type === "canceled") return "CANC";
    if (type === "postponed") return "APL";
    if (type === "interrupted") return "INT";
    if (type !== "inprogress") return String(event?.status?.description || "").toUpperCase().slice(0,7);

    if (desc.includes("halftime") || desc.includes("half time")) return "DESC";
    if (desc.includes("penalt")) return "PEN";
    if (desc.includes("extra time")) return "PRÓR";

    const start = Number(event?.time?.currentPeriodStartTimestamp || event?.currentPeriodStartTimestamp || 0);
    if (!start) return "EN VIVO";

    let base = 0;
    if (desc.includes("2nd") || desc.includes("second")) base = 45;
    else if (desc.includes("extra time first")) base = 90;
    else if (desc.includes("extra time second")) base = 105;

    let minute = base + Math.floor(Date.now()/1000 - start)/60;
    minute = Math.max(1, Math.floor(minute));
    if (base === 0) minute = Math.min(minute, 45);
    if (base === 45) minute = Math.min(minute, 90);
    return minute + "'";
  }

  function favoriteInEvent(event) {
    return Boolean(favoriteTeam(event?.homeTeam) || favoriteTeam(event?.awayTeam));
  }

  function eventSearchText(event) {
    const t = event?.tournament || {};
    const u = t?.uniqueTournament || {};
    const c = t?.category || {};
    return [
      event?.homeTeam?.name,event?.awayTeam?.name,
      t?.name,u?.name,c?.name
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function tournamentData(event) {
    const t = event?.tournament || {};
    const u = t?.uniqueTournament || {};
    const c = t?.category || {};
    return {
      key:String(u.id || t.id || t.name || "other") + ":" + String(c.id || c.name || ""),
      tournament:u.name || t.name || "Otros",
      country:c.name || event?.homeTeam?.country?.name || "Internacional",
      alpha2:c?.country?.alpha2 || c?.alpha2 || event?.homeTeam?.country?.alpha2 || "",
      priority:Number(t.priority ?? u.priority ?? 9999)
    };
  }

  function mergeLiveIntoDay(events) {
    if (!liveEvents.length) return events.slice();
    const map = new Map(events.map(e => [Number(e.id), e]));
    for (const e of liveEvents) {
      if (selectedDate === todayIso() || map.has(Number(e.id))) map.set(Number(e.id), e);
    }
    return [...map.values()];
  }

  function visibleEvents() {
    let events = mergeLiveIntoDay(dayEvents);
    if (view === "live") events = liveEvents.slice();
    if (view === "favorites") events = events.filter(favoriteInEvent);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      events = events.filter(e => eventSearchText(e).includes(q));
    }
    return events.sort((a,b) => {
      const al = isLive(a) ? 0 : (isFinished(a) ? 2 : 1);
      const bl = isLive(b) ? 0 : (isFinished(b) ? 2 : 1);
      return al-bl || Number(a.startTimestamp||0)-Number(b.startTimestamp||0);
    });
  }

  function renderDate() {
    const d = dateObj(selectedDate);
    const today = todayIso();
    const tomorrow = shiftDate(today,1);
    const yesterday = shiftDate(today,-1);
    let main = new Intl.DateTimeFormat("es-ES",{weekday:"long"}).format(d);
    if (selectedDate === today) main = "Hoy";
    if (selectedDate === tomorrow) main = "Mañana";
    if (selectedDate === yesterday) main = "Ayer";
    els.dateMain.textContent = main.charAt(0).toUpperCase()+main.slice(1);
    els.dateSub.textContent = new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric"}).format(d);
  }

  function render() {
    renderDate();
    els.tabs.forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    els.favEmpty.classList.toggle("hidden", !(view === "favorites" && favorites.size === 0));

    const events = visibleEvents();
    if (view === "favorites" && favorites.size === 0) {
      els.matches.innerHTML = "";
      return;
    }
    if (!events.length) {
      els.matches.innerHTML = '<div class="empty-card"><div class="empty-icon">⚽</div><h2>No hay partidos</h2><p>No encuentro partidos con estos filtros para la fecha seleccionada.</p></div>';
      return;
    }

    const groups = new Map();
    for (const event of events) {
      const meta = tournamentData(event);
      if (!groups.has(meta.key)) groups.set(meta.key,{...meta,events:[]});
      groups.get(meta.key).events.push(event);
    }
    const sortedGroups = [...groups.values()].sort((a,b) => a.priority-b.priority || a.country.localeCompare(b.country,"es") || a.tournament.localeCompare(b.tournament,"es"));

    els.matches.innerHTML = sortedGroups.map(group => {
      const rows = group.events.map(event => {
        const live = isLive(event);
        const finished = isFinished(event);
        const home = event.homeTeam || {};
        const away = event.awayTeam || {};
        const h = scoreValue(event.homeScore);
        const a = scoreValue(event.awayScore);
        const fav = favoriteInEvent(event);
        const stateClass = live ? "live" : (finished ? "finished" : "");
        const scoreClass = live ? "live-score" : "";
        return '<button class="match-row ' + (live?'live ':'') + (fav?'favorite':'') + '" type="button" data-event-id="' + esc(event.id) + '">' +
          '<div class="match-state ' + stateClass + '">' + esc(clockText(event)) + '</div>' +
          '<div class="teams">' +
            '<div class="team-line"><img src="' + teamLogo(home) + '" alt="" loading="lazy" onerror="this.src=\'icon.svg\'"><span>' + esc(home.name || "Local") + '</span></div>' +
            '<div class="team-line"><img src="' + teamLogo(away) + '" alt="" loading="lazy" onerror="this.src=\'icon.svg\'"><span>' + esc(away.name || "Visitante") + '</span></div>' +
          '</div>' +
          '<div class="score ' + scoreClass + '"><span>' + (h==null?'':h) + '</span><span>' + (a==null?'':a) + '</span></div>' +
          '<span class="row-star ' + (fav?'active':'') + '" data-star-event="' + esc(event.id) + '">★</span>' +
        '</button>';
      }).join("");

      return '<section class="league-block">' +
        '<div class="league-head"><div class="flag">' + countryFlag(group.alpha2) + '</div><div><strong>' + esc(group.tournament) + '</strong><span>' + esc(group.country) + '</span></div><div class="league-count">' + group.events.length + '</div></div>' +
        rows +
      '</section>';
    }).join("");

    els.matches.querySelectorAll("[data-event-id]").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.closest("[data-star-event]")) return;
        const id = Number(row.dataset.eventId);
        const event = events.find(x => Number(x.id) === id);
        if (event) openMatch(event);
      });
    });

    els.matches.querySelectorAll("[data-star-event]").forEach(star => {
      star.addEventListener("click", e => {
        e.stopPropagation();
        const id = Number(star.dataset.starEvent);
        const event = events.find(x => Number(x.id) === id);
        if (!event) return;
        const homeFav = favoriteTeam(event.homeTeam);
        const awayFav = favoriteTeam(event.awayTeam);
        if (homeFav || awayFav) {
          if (homeFav) favorites.delete(Number(homeFav.id));
          if (awayFav) favorites.delete(Number(awayFav.id));
        } else if (event.homeTeam?.id) {
          addFavorite(event.homeTeam);
        }
        saveFavorites();
        render();
      });
    });
  }

  function addFavorite(team) {
    if (!team?.id) return;
    favorites.set(Number(team.id),{
      id:Number(team.id),
      name:team.name || team.shortName || "Equipo",
      country:team.country?.name || ""
    });
    saveFavorites();
  }

  function removeFavorite(teamId) {
    favorites.delete(Number(teamId));
    saveFavorites();
  }

  function removeFavoriteTeam(team) {
    const match = favoriteTeam(team);
    if (!match) return;
    favorites.delete(Number(match.id));
    saveFavorites();
  }

  async function loadDay(force) {
    els.status.textContent = "Cargando partidos…";
    if (!force) {
      const cached = loadJson(CACHE_PREFIX + selectedDate, null);
      const ttl = selectedDate === todayIso() ? 2*60*1000 : 30*60*1000;
      if (cached && Date.now()-Number(cached.savedAt||0) < ttl && Array.isArray(cached.events)) {
        dayEvents = cached.events;
        render();
      }
    }

    try {
      const data = await fetchJson("/sport/football/scheduled-events/" + selectedDate);
      dayEvents = Array.isArray(data.events) ? data.events : [];
      localStorage.setItem(CACHE_PREFIX + selectedDate, JSON.stringify({savedAt:Date.now(),events:dayEvents}));
      els.status.textContent = dayEvents.length + " partidos";
      els.updated.textContent = "Actualizado " + new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());
      render();
      return;
    } catch (err) {
      console.warn("Proveedor directo no disponible",err);
    }

    try {
      const fallback = await loadFallback();
      const block = fallback.days?.[selectedDate] || [];
      dayEvents = Array.isArray(block) ? block : [];
      els.status.textContent = "Datos de respaldo · " + dayEvents.length + " partidos";
      render();
    } catch (err) {
      console.warn("Fallback no disponible",err);
      els.status.textContent = "No se han podido cargar los partidos.";
      render();
    }
  }

  async function loadLive() {
    try {
      const data = await fetchJson("/sport/football/events/live");
      const next = Array.isArray(data.events) ? data.events : [];
      processNotifications(next);
      liveEvents = next;
      els.liveBadge.textContent = String(next.length);
      els.liveBadge.classList.toggle("hidden", next.length === 0);
      if (selectedDate === todayIso() || view === "live" || view === "favorites") render();
      return;
    } catch (err) {
      console.warn("Directo no disponible",err);
    }

    try {
      const fallback = await loadFallback();
      const next = Array.isArray(fallback.live) ? fallback.live : [];
      processNotifications(next);
      liveEvents = next;
      els.liveBadge.textContent = String(next.length);
      els.liveBadge.classList.toggle("hidden", next.length === 0);
      if (selectedDate === todayIso() || view === "live" || view === "favorites") render();
    } catch {}
  }

  function snapshotEvent(event) {
    return {
      home:scoreValue(event.homeScore),
      away:scoreValue(event.awayScore),
      status:eventStatusType(event)
    };
  }

  function processNotifications(next) {
    const nextMap = new Map(next.map(e => [Number(e.id),snapshotEvent(e)]));
    if (!liveSnapshotInitialized) {
      liveSnapshot = nextMap;
      liveSnapshotInitialized = true;
      return;
    }

    for (const event of next) {
      if (!favoriteInEvent(event)) continue;
      const id = Number(event.id);
      const before = liveSnapshot.get(id);
      const after = nextMap.get(id);
      if (!before || !after) continue;

      if ((after.home ?? 0) > (before.home ?? 0) || (after.away ?? 0) > (before.away ?? 0)) {
        notify("⚽ GOL · " + scoreText(event), (event.homeTeam?.name||"Local") + " - " + (event.awayTeam?.name||"Visitante"), event);
      } else if (before.status !== "finished" && after.status === "finished") {
        notify("✅ Final · " + scoreText(event), (event.homeTeam?.name||"Local") + " - " + (event.awayTeam?.name||"Visitante"), event);
      } else if (before.status !== "inprogress" && after.status === "inprogress") {
        notify("▶ Ha comenzado", (event.homeTeam?.name||"Local") + " - " + (event.awayTeam?.name||"Visitante"), event);
      }
    }
    liveSnapshot = nextMap;
  }

  async function notify(title, body, event) {
    if (!notificationEnabled || Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title,{
        body,
        icon:teamLogo(event?.homeTeam),
        badge:"icon.svg",
        tag:"match-" + String(event?.id || Date.now()),
        data:{eventId:event?.id || null,url:"./"}
      });
    } catch (err) {
      console.warn("No se pudo notificar",err);
    }
  }

  async function toggleNotifications() {
    if (!("Notification" in window)) {
      alert("Este navegador no admite notificaciones.");
      return;
    }
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notificationEnabled = false;
        localStorage.setItem(NOTIFY_KEY,"0");
        updateNotifyButton();
        return;
      }
    }
    notificationEnabled = !notificationEnabled;
    localStorage.setItem(NOTIFY_KEY, notificationEnabled ? "1" : "0");
    updateNotifyButton();
    if (notificationEnabled) notify("🔔 Avisos activados","Te avisaré de cambios en tus equipos favoritos.",{});
  }

  function updateNotifyButton() {
    els.notify.classList.toggle("enabled", notificationEnabled && Notification.permission === "granted");
    els.notify.title = notificationEnabled ? "Notificaciones activadas" : "Activar notificaciones";
  }

  function scheduleLive() {
    clearTimeout(liveTimer);
    const delay = document.hidden ? LIVE_INTERVAL_HIDDEN : LIVE_INTERVAL_VISIBLE;
    liveTimer = setTimeout(async () => {
      await loadLive();
      scheduleLive();
    },delay);
  }

  async function searchTeams(term) {
    const q = term.trim();
    if (q.length < 2) {
      els.teamResults.innerHTML = "";
      els.teamStatus.textContent = "";
      return;
    }
    els.teamStatus.textContent = "Buscando…";
    let teams = [];
    try {
      const data = await fetchJson("/search/all?q=" + encodeURIComponent(q));
      const results = Array.isArray(data.results) ? data.results : [];
      teams = results.map(item => item.entity || item).filter(item => {
        const sport = String(item?.sport?.slug || item?.sport?.name || item?.sport || "").toLowerCase();
        const type = String(item?.type || item?.entityType || "").toLowerCase();
        return item?.id && (type === "team" || sport === "football");
      });
    } catch (err) {
      const byId = new Map();
      [...dayEvents,...liveEvents].forEach(e => [e.homeTeam,e.awayTeam].forEach(t => {
        if (t?.id && String(t.name||"").toLowerCase().includes(q.toLowerCase())) byId.set(Number(t.id),t);
      }));
      teams = [...byId.values()];
    }

    const unique = [...new Map(teams.map(t => [Number(t.id),t])).values()].slice(0,12);
    els.teamStatus.textContent = unique.length ? unique.length + " resultados" : "No encuentro equipos.";
    els.teamResults.innerHTML = unique.map(team => {
      const active = favorites.has(Number(team.id));
      const country = team?.country?.name || "";
      return '<div class="team-search-item">' +
        '<img src="' + teamLogo(team) + '" alt="" onerror="this.src=\'icon.svg\'">' +
        '<div><strong>' + esc(team.name || team.shortName || "Equipo") + '</strong><span>' + esc(country) + '</span></div>' +
        '<button class="star-btn" type="button" data-team-id="' + esc(team.id) + '">' + (active?"★":"☆") + '</button>' +
      '</div>';
    }).join("");

    els.teamResults.querySelectorAll("[data-team-id]").forEach(btn => {
      btn.addEventListener("click",() => {
        const id = Number(btn.dataset.teamId);
        const team = unique.find(t => Number(t.id) === id);
        if (!team) return;
        if (favorites.has(id)) removeFavorite(id); else addFavorite(team);
        searchTeams(els.teamInput.value);
        render();
      });
    });
  }

  function incidentIcon(item) {
    if (item.incidentType === "goal") return "⚽";
    if (item.incidentType === "card") return item.incidentClass === "red" ? "🟥" : "🟨";
    if (item.incidentType === "substitution") return "🔄";
    if (item.incidentType === "period") return "⏱";
    if (item.incidentType === "varDecision") return "📺";
    return "•";
  }

  function incidentTitle(item) {
    return item.player?.name || item.playerName || item.text || item.incidentType || "Incidencia";
  }

  function renderSummary(data) {
    const incidents = Array.isArray(data?.incidents) ? data.incidents.slice().sort((a,b) => Number(a.time||0)-Number(b.time||0)) : [];
    if (!incidents.length) {
      els.detailSummary.innerHTML = '<div class="muted">No hay incidencias disponibles todavía.</div>';
      return;
    }
    els.detailSummary.innerHTML = '<div class="timeline">' + incidents.map(item => {
      const time = item.time != null ? item.time + (item.addedTime ? "+"+item.addedTime : "") + "'" : "";
      const sub = [item.incidentClass,item.reason,item.assist1?.name].filter(Boolean).join(" · ");
      return '<div class="incident"><div class="incident-time">' + esc(time) + '</div><div class="incident-icon">' + incidentIcon(item) + '</div><div><strong>' + esc(incidentTitle(item)) + '</strong><span>' + esc(sub) + '</span></div></div>';
    }).join("") + '</div>';
  }

  function renderStats(data) {
    const periods = Array.isArray(data?.statistics) ? data.statistics : [];
    const all = periods.find(p => String(p.period||"").toUpperCase() === "ALL") || periods[0];
    const groups = Array.isArray(all?.groups) ? all.groups : [];
    const items = groups.flatMap(g => Array.isArray(g.statisticsItems) ? g.statisticsItems : []);
    if (!items.length) {
      els.detailStats.innerHTML = '<div class="muted">No hay estadísticas disponibles para este partido.</div>';
      return;
    }
    els.detailStats.innerHTML = '<div class="stats-list">' + items.slice(0,18).map(item => {
      const hv = item.home ?? item.homeValue ?? "";
      const av = item.away ?? item.awayValue ?? "";
      const hn = Number(item.homeValue ?? parseFloat(String(hv).replace("%",""))) || 0;
      const an = Number(item.awayValue ?? parseFloat(String(av).replace("%",""))) || 0;
      const total = Math.max(1,hn+an);
      const hp = Math.round(hn/total*100);
      const ap = 100-hp;
      return '<div><div class="stat-row"><div class="stat-value">' + esc(hv) + '</div><strong>' + esc(item.name||"") + '</strong><div class="stat-value">' + esc(av) + '</div></div><div class="stat-bars"><i style="width:' + hp + '%"></i><i style="width:' + ap + '%"></i></div></div>';
    }).join("") + '</div>';
  }

  function renderLineups(data) {
    const home = data?.home;
    const away = data?.away;
    if (!home && !away) {
      els.detailLineups.innerHTML = '<div class="muted">Alineaciones aún no disponibles.</div>';
      return;
    }
    function column(block,name) {
      const players = Array.isArray(block?.players) ? block.players : [];
      return '<div class="lineup-col"><h3>' + esc(name) + '</h3>' + players.map(x => {
        const p = x.player || x;
        return '<div class="player"><span class="player-num">' + esc(x.shirtNumber || p.jerseyNumber || "") + '</span><span>' + esc(p.name || p.shortName || "Jugador") + '</span></div>';
      }).join("") + '</div>';
    }
    els.detailLineups.innerHTML = '<div class="lineups">' + column(home,selectedEvent?.homeTeam?.name||"Local") + column(away,selectedEvent?.awayTeam?.name||"Visitante") + '</div>';
  }

  async function openMatch(event) {
    selectedEvent = event;
    const meta = tournamentData(event);
    els.dialogCompetition.textContent = meta.tournament + " · " + meta.country;
    els.dialogStatus.textContent = new Intl.DateTimeFormat("es-ES",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(eventDate(event));
    els.homeName.textContent = event.homeTeam?.name || "Local";
    els.awayName.textContent = event.awayTeam?.name || "Visitante";
    els.homeLogo.src = teamLogo(event.homeTeam);
    els.awayLogo.src = teamLogo(event.awayTeam);
    els.dialogScore.textContent = scoreText(event);
    els.dialogClock.textContent = clockText(event);
    els.dialogFavorite.textContent = favoriteInEvent(event) ? "★" : "☆";
    els.detailSummary.innerHTML = '<div class="muted">Cargando resumen…</div>';
    els.detailStats.innerHTML = '<div class="muted">Cargando estadísticas…</div>';
    els.detailLineups.innerHTML = '<div class="muted">Cargando alineaciones…</div>';
    setDetail("summary");
    els.dialog.showModal();

    if (event.provider === "thesportsdb") {
      els.detailSummary.innerHTML = '<div class="muted">Este partido se está mostrando desde el proveedor de respaldo. El marcador y horario están disponibles, pero los detalles avanzados se cargarán cuando vuelva el proveedor principal.</div>';
      els.detailStats.innerHTML = '<div class="muted">Estadísticas avanzadas no disponibles en el respaldo gratuito.</div>';
      els.detailLineups.innerHTML = '<div class="muted">Alineaciones no disponibles en el respaldo gratuito.</div>';
      return;
    }

    const id = Number(event.id);
    const jobs = await Promise.allSettled([
      fetchJson("/event/" + id + "/incidents"),
      fetchJson("/event/" + id + "/statistics"),
      fetchJson("/event/" + id + "/lineups")
    ]);
    renderSummary(jobs[0].status === "fulfilled" ? jobs[0].value : {});
    renderStats(jobs[1].status === "fulfilled" ? jobs[1].value : {});
    renderLineups(jobs[2].status === "fulfilled" ? jobs[2].value : {});
  }

  function setDetail(name) {
    els.detailTabs.forEach(btn => btn.classList.toggle("active",btn.dataset.detail===name));
    els.detailSummary.classList.toggle("hidden",name!=="summary");
    els.detailStats.classList.toggle("hidden",name!=="stats");
    els.detailLineups.classList.toggle("hidden",name!=="lineups");
  }

  els.tabs.forEach(btn => btn.addEventListener("click",() => {
    view = btn.dataset.view || "scores";
    if (view === "live") selectedDate = todayIso();
    render();
  }));
  els.prev.addEventListener("click",() => { selectedDate=shiftDate(selectedDate,-1); view="scores"; loadDay(false); });
  els.next.addEventListener("click",() => { selectedDate=shiftDate(selectedDate,1); view="scores"; loadDay(false); });
  els.dateBtn.addEventListener("click",() => { selectedDate=todayIso(); view="scores"; loadDay(false); });
  els.search.addEventListener("input",() => { query=els.search.value; render(); });
  els.refresh.addEventListener("click",async() => { await Promise.all([loadDay(true),loadLive()]); });
  els.notify.addEventListener("click",toggleNotifications);
  els.teamToggle.addEventListener("click",() => {
    els.teamPanel.classList.toggle("hidden");
    if (!els.teamPanel.classList.contains("hidden")) els.teamInput.focus();
  });
  els.teamInput.addEventListener("input",() => {
    clearTimeout(teamSearchTimer);
    teamSearchTimer=setTimeout(() => searchTeams(els.teamInput.value),300);
  });
  els.closeDialog.addEventListener("click",() => els.dialog.close());
  els.detailTabs.forEach(btn => btn.addEventListener("click",() => setDetail(btn.dataset.detail)));
  els.dialogFavorite.addEventListener("click",() => {
    if (!selectedEvent) return;
    const home = selectedEvent.homeTeam;
    const away = selectedEvent.awayTeam;
    if (favoriteInEvent(selectedEvent)) {
      removeFavoriteTeam(home);
      removeFavoriteTeam(away);
    } else if (home?.id) {
      addFavorite(home);
    }
    els.dialogFavorite.textContent = favoriteInEvent(selectedEvent) ? "★" : "☆";
    render();
  });

  document.addEventListener("visibilitychange",() => {
    scheduleLive();
    if (!document.hidden) loadLive();
  });

  window.addEventListener("online",() => {
    loadDay(true);
    loadLive();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load",() => navigator.serviceWorker.register("sw.js?v=1.0.1").catch(console.warn));
  }

  updateNotifyButton();
  renderDate();
  els.matches.innerHTML = document.getElementById("loadingTemplate").innerHTML.repeat(2);
  Promise.all([loadDay(false),loadLive()]).finally(scheduleLive);
})();