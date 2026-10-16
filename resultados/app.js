(() => {
  "use strict";

  const SOFA_BASES = [
    "https://api.sofascore.com/api/v1",
    "https://www.sofascore.com/api/v1"
  ];
  const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";
  const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
  const ESPN_STANDINGS_BASE = "https://site.api.espn.com/apis/v2/sports/soccer";
  const FALLBACK_URL = "data/scores.json";
  const CATALOG_URL = "data/catalog.json";
  const ENGINE_URL = "data/engine.json";
  const FAVORITES_KEY = "mi-resultados-favorites-v1";
  const DATA_CACHE_PREFIX = "mi-resultados-data-v1:";
  const LEAGUE_FAVORITES_KEY = "mi-resultados-league-favorites-v1";
  const LEAGUES = Array.isArray(window.MR_LEAGUES) ? window.MR_LEAGUES : [];
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
    detailLineups:document.getElementById("detailLineups"),
    favoriteLeagues:document.getElementById("favoriteLeagues"),
    allLeagues:document.getElementById("allLeagues"),
    leagueSearchInput:document.getElementById("leagueSearchInput"),
    leagueDialog:document.getElementById("leagueDialog"),
    closeLeagueBtn:document.getElementById("closeLeagueBtn"),
    leagueDialogFlag:document.getElementById("leagueDialogFlag"),
    leagueDialogCountry:document.getElementById("leagueDialogCountry"),
    leagueDialogTitle:document.getElementById("leagueDialogTitle"),
    leagueFavoriteBtn:document.getElementById("leagueFavoriteBtn"),
    leagueTabs:[...document.querySelectorAll("[data-league-tab]")],
    leagueMatchesView:document.getElementById("leagueMatchesView"),
    leagueStandingsView:document.getElementById("leagueStandingsView"),
    teamDialog:document.getElementById("teamDialog"),
    closeTeamBtn:document.getElementById("closeTeamBtn"),
    teamDialogLogo:document.getElementById("teamDialogLogo"),
    teamDialogLeague:document.getElementById("teamDialogLeague"),
    teamDialogTitle:document.getElementById("teamDialogTitle"),
    teamFavoriteBtn:document.getElementById("teamFavoriteBtn"),
    teamScheduleView:document.getElementById("teamScheduleView")
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
  let catalogTeams = [];
  let catalogLoaded = false;
  let engineData = null;
  let engineLoaded = false;
  let leagueFavorites = new Set(loadJson(LEAGUE_FAVORITES_KEY, LEAGUES.filter(x => x.pinned).map(x => x.code)));
  let selectedLeague = null;
  let selectedTeam = null;

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

  function saveLeagueFavorites() {
    localStorage.setItem(LEAGUE_FAVORITES_KEY, JSON.stringify([...leagueFavorites]));
  }

  function leagueByCode(code) {
    return LEAGUES.find(item => item.code === code) || null;
  }

  function normalizeLabel(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  }

  async function fetchPublicJson(url, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url,{cache:"no-store",mode:"cors",signal:controller.signal,headers:{"Accept":"application/json"}});
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function readDataCache(key) {
    try {
      const raw=localStorage.getItem(DATA_CACHE_PREFIX+key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeDataCache(key,data,ttlMs) {
    try {
      localStorage.setItem(DATA_CACHE_PREFIX+key,JSON.stringify({
        savedAt:Date.now(),
        expiresAt:Date.now()+ttlMs,
        data
      }));
    } catch {}
  }

  async function fetchCachedJson(key,url,ttlMs,force=false,timeout=12000) {
    const cached=readDataCache(key);
    if(!force && cached && Number(cached.expiresAt||0)>Date.now()) return cached.data;
    try{
      const data=await fetchPublicJson(url,timeout);
      writeDataCache(key,data,ttlMs);
      return data;
    }catch(err){
      if(cached?.data) return cached.data;
      throw err;
    }
  }

  async function loadEngine(force=false) {
    if(engineLoaded && !force) return engineData;
    try{
      const res=await fetch(ENGINE_URL+"?t="+Date.now(),{cache:"no-store"});
      if(!res.ok) throw new Error("HTTP "+res.status);
      engineData=await res.json();
      engineLoaded=true;
      return engineData;
    }catch(err){
      console.warn("Motor de datos no disponible",err);
      return engineData;
    }
  }

  function engineDataset(key) {
    return engineData?.datasets?.[key] || null;
  }

  function engineEventsForDate(iso) {
    if(!engineData?.datasets) return [];
    const result=[];
    for(const [key,ds] of Object.entries(engineData.datasets)){
      if(!key.startsWith("schedule:") || !Array.isArray(ds?.data)) continue;
      for(const event of ds.data){
        const d=eventDate(event);
        const eventIso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
        if(eventIso===iso) result.push(event);
      }
    }
    return result;
  }

  function datasetMetaHtml(ds) {
    if(!ds) return "";
    const updated=ds.updatedAt ? new Date(ds.updatedAt) : null;
    const text=updated && !Number.isNaN(updated.getTime())
      ? new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(updated)
      : "";
    return '<div class="muted tiny" style="margin-top:8px">Fuente: '+esc(ds.source||"")+" · caché "+esc(String(ds.ttlMinutes||""))+" min"+(text?" · actualizada "+esc(text):"")+'</div>';
  }

  async function loadCatalog(force = false) {
    if (catalogLoaded && !force) return catalogTeams;
    const merged=[];
    try {
      const res = await fetch(CATALOG_URL + "?t=" + Date.now(),{cache:"no-store"});
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if(Array.isArray(data.teams)) merged.push(...data.teams);
    } catch (err) {
      console.warn("Catálogo ESPN no disponible",err);
    }

    const engine=await loadEngine(force);
    if(Array.isArray(engine?.teams)) merged.push(...engine.teams);

    const byKey=new Map();
    for(const team of merged){
      if(!team?.name) continue;
      const key=normalizeLabel(team.name)+"|"+String(team.leagueCode||"");
      const current=byKey.get(key);
      if(!current || (!current.logo && team.logo)) byKey.set(key,team);
    }
    catalogTeams=[...byKey.values()];

    if (!catalogTeams.length) {
      const byName = new Map();
      [...dayEvents,...liveEvents].forEach(e => [e.homeTeam,e.awayTeam].forEach(t => {
        if (t?.id && t?.name) byName.set(normalizeLabel(t.name),t);
      }));
      catalogTeams = [...byName.values()];
    }
    catalogLoaded=true;
    return catalogTeams;
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
    for (const base of SOFA_BASES) {
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

  function espnCompactDate(iso) {
    return String(iso || "").replaceAll("-","");
  }

  function espnLeagueName(slug) {
    let value = String(slug || "").replace(/^\d{4}(?:-\d{2,4})?-/, "").replaceAll("-"," ").trim();
    if (!value) return "Fútbol";
    if (value === "laliga") return "LaLiga";
    if (value.startsWith("laliga ")) return "LaLiga " + value.slice(7);
    const acronyms = new Map([
      ["uefa","UEFA"],["fifa","FIFA"],["afc","AFC"],["concacaf","CONCACAF"],
      ["mls","MLS"],["nwsl","NWSL"]
    ]);
    return value.split(/\s+/).map(word => acronyms.get(word.toLowerCase()) || (word.charAt(0).toUpperCase()+word.slice(1))).join(" ")
      .replace(/\bLiga Mx\b/g,"Liga MX");
  }

  function espnCountry(slug) {
    const low = String(slug || "").toLowerCase();
    if (low.includes("laliga") || low.includes("copa-del-rey") || low.includes("liga-f")) return "España";
    const pairs = [
      ["english","Inglaterra"],["spanish","España"],["german","Alemania"],["italian","Italia"],
      ["french","Francia"],["portuguese","Portugal"],["dutch","Países Bajos"],["belgian","Bélgica"],
      ["scottish","Escocia"],["turkish","Turquía"],["greek","Grecia"],["swiss","Suiza"],
      ["austrian","Austria"],["polish","Polonia"],["danish","Dinamarca"],["swedish","Suecia"],
      ["norwegian","Noruega"],["russian","Rusia"],["ukrainian","Ucrania"],["argentine","Argentina"],
      ["brazilian","Brasil"],["mexican","México"],["colombian","Colombia"],["chilean","Chile"],
      ["peruvian","Perú"],["uruguayan","Uruguay"],["paraguayan","Paraguay"],["ecuadorian","Ecuador"],
      ["american","Estados Unidos"],["canadian","Canadá"],["australian","Australia"],["japanese","Japón"],
      ["chinese","China"],["saudi","Arabia Saudí"],["indian","India"],["korean","Corea del Sur"]
    ];
    for (const [needle,country] of pairs) if (low.includes(needle)) return country;
    return "Internacional";
  }

  function inferLeagueCode(slug, name) {
    const s = normalizeLabel(slug);
    const n = normalizeLabel(name);
    const checks = [
      ["uefa.champions",["champions league","uefa champions"]],
      ["uefa.europa.conf",["conference league","europa conference"]],
      ["uefa.europa",["europa league"]],
      ["esp.2",["laliga 2","laliga hypermotion","segunda division","spanish segunda"]],
      ["esp.1",["laliga","spanish laliga"]],
      ["esp.copa_del_rey",["copa del rey"]],
      ["eng.2",["english league championship","championship"]],
      ["eng.1",["english premier league","premier league"]],
      ["ger.2",["german 2 bundesliga","2 bundesliga"]],
      ["ger.1",["german bundesliga","bundesliga"]],
      ["ita.1",["italian serie a","serie a"]],
      ["fra.1",["french ligue 1","ligue 1"]],
      ["ned.1",["dutch eredivisie","eredivisie"]],
      ["por.1",["portuguese primeira liga","primeira liga"]],
      ["bel.1",["belgian pro league","jupiler pro league"]],
      ["sco.1",["scottish premiership","premiership"]],
      ["tur.1",["turkish super lig","super lig"]],
      ["usa.1",["major league soccer","mls"]],
      ["mex.1",["liga mx"]],
      ["arg.1",["argentine liga profesional","argentine primera","primera division argentina"]],
      ["bra.1",["brazilian serie a","brasileirao"]],
      ["ksa.1",["saudi pro league"]],
      ["aus.1",["a league"]],
      ["jpn.1",["j1 league"]]
    ];
    for (const [code,needles] of checks) {
      if (needles.some(x => s.includes(normalizeLabel(x)) || n.includes(normalizeLabel(x)))) return code;
    }
    return "";
  }

  function espnStatus(raw) {
    const info = raw?.status?.type || {};
    const state = String(info.state || "").toLowerCase();
    const detail = String(info.detail || info.shortDetail || info.description || "");
    if (info.completed || state === "post") return {type:"finished",description:detail || "Final"};
    if (state === "in") return {type:"inprogress",description:detail || "En directo"};
    const low = detail.toLowerCase();
    if (low.includes("postpon")) return {type:"postponed",description:detail};
    if (low.includes("cancel")) return {type:"canceled",description:detail};
    if (low.includes("suspend") || low.includes("interrupt")) return {type:"interrupted",description:detail};
    return {type:"notstarted",description:detail || "Programado"};
  }

  function espnScore(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeEspnEvent(raw) {
    const comp = raw?.competitions?.[0];
    if (!comp) return null;
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const home = competitors.find(x => x.homeAway === "home");
    const away = competitors.find(x => x.homeAway === "away");
    if (!home || !away) return null;

    const makeTeam = side => {
      const team = side?.team || {};
      const logo = team.logo || team?.logos?.[0]?.href || "";
      return {
        id:Number(team.id) || team.id,
        name:team.displayName || team.shortDisplayName || team.name || "Equipo",
        logo,
        country:{}
      };
    };

    const slug = String(raw?.season?.slug || "");
    const leagueName = espnLeagueName(slug);
    const leagueCode = inferLeagueCode(slug, leagueName);
    const leagueMeta = leagueByCode(leagueCode);
    const country = leagueMeta?.country || espnCountry(slug);
    const homeTeam = makeTeam(home);
    const awayTeam = makeTeam(away);
    if (country !== "Internacional") {
      homeTeam.country = {name:country};
      awayTeam.country = {name:country};
    }

    return {
      id:Number(raw.id) || raw.id,
      provider:"espn",
      startTimestamp:Math.floor(new Date(raw.date || 0).getTime()/1000) || 0,
      status:espnStatus(raw),
      leagueCode,
      tournament:{
        id:slug || leagueName,
        name:leagueMeta?.name || leagueName,
        priority:500,
        uniqueTournament:{id:slug || leagueName,name:leagueMeta?.name || leagueName},
        category:{name:country,alpha2:leagueMeta?.alpha2 || ""}
      },
      homeTeam,
      awayTeam,
      homeScore:{current:espnScore(home.score)},
      awayScore:{current:espnScore(away.score)},
      time:{
        displayClock:raw?.status?.displayClock || "",
        period:raw?.status?.period ?? null
      }
    };
  }

  async function fetchEspnDay(iso) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),9000);
    try {
      const url = ESPN_SCOREBOARD + "?dates=" + encodeURIComponent(espnCompactDate(iso)) + "&limit=1000&t=" + Date.now();
      const res = await fetch(url,{cache:"no-store",mode:"cors",signal:controller.signal,headers:{"Accept":"application/json"}});
      if (!res.ok) throw new Error("ESPN HTTP " + res.status);
      const data = await res.json();
      return (Array.isArray(data.events) ? data.events : []).map(normalizeEspnEvent).filter(Boolean);
    } finally {
      clearTimeout(timer);
    }
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

  function eventScoreValue(event,score) {
    if(eventStatusType(event)==="notstarted") return null;
    return scoreValue(score);
  }

  function scoreText(event) {
    const h = eventScoreValue(event,event.homeScore);
    const a = eventScoreValue(event,event.awayScore);
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
    const code = event?.leagueCode || inferLeagueCode(String(u.id || t.id || ""),u.name || t.name || "");
    const meta = leagueByCode(code);
    return {
      key:code || (String(u.id || t.id || t.name || "other") + ":" + String(c.id || c.name || "")),
      leagueCode:code,
      tournament:meta?.name || u.name || t.name || "Otros",
      country:meta?.country || c.name || event?.homeTeam?.country?.name || "Internacional",
      alpha2:meta?.alpha2 || c?.country?.alpha2 || c?.alpha2 || event?.homeTeam?.country?.alpha2 || "",
      priority:Number(t.priority ?? u.priority ?? 9999)
    };
  }

  function mergeEventLists(base, fresh) {
    const map = new Map();
    for (const event of [...(base || []), ...(fresh || [])]) {
      if (!event) continue;
      const provider = String(event.provider || "unknown");
      const id = String(event.id ?? "");
      const home = normalizeTeamName(event?.homeTeam?.name);
      const away = normalizeTeamName(event?.awayTeam?.name);
      const stamp = String(event.startTimestamp || "");
      const key = id ? provider + ":" + id : provider + ":" + home + ":" + away + ":" + stamp;
      map.set(key,event);
    }
    return [...map.values()];
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
    let events = mergeEventLists(mergeLiveIntoDay(dayEvents),engineEventsForDate(selectedDate));
    if (view === "live") events = liveEvents.slice();
    if (view === "favorites") events = events.filter(e => favoriteInEvent(e) || leagueFavorites.has(tournamentData(e).leagueCode));
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


  function toggleLeagueFavorite(code) {
    if (!code) return;
    if (leagueFavorites.has(code)) leagueFavorites.delete(code);
    else leagueFavorites.add(code);
    saveLeagueFavorites();
    renderLeagueSidebar();
    if (selectedLeague?.code === code && els.leagueFavoriteBtn) {
      els.leagueFavoriteBtn.textContent = leagueFavorites.has(code) ? "★" : "☆";
    }
  }

  function leagueRowHtml(league) {
    const active = leagueFavorites.has(league.code);
    return '<div class="sidebar-league-row">' +
      '<button class="league-star ' + (active?'active':'') + '" type="button" data-star-league="' + esc(league.code) + '">' + (active?'★':'☆') + '</button>' +
      '<button class="sidebar-league-open" type="button" data-open-league="' + esc(league.code) + '"><strong>' + esc(league.name) + '</strong><span>' + esc(league.country) + '</span></button>' +
      '<button class="league-table-link" type="button" data-standings-league="' + esc(league.code) + '">Tabla</button>' +
    '</div>';
  }

  function bindLeagueButtons(root) {
    if (!root) return;
    root.querySelectorAll("[data-star-league]").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleLeagueFavorite(btn.dataset.starLeague);
    }));
    root.querySelectorAll("[data-open-league]").forEach(btn => btn.addEventListener("click", () => openLeague(btn.dataset.openLeague,"matches")));
    root.querySelectorAll("[data-standings-league]").forEach(btn => btn.addEventListener("click", () => openLeague(btn.dataset.standingsLeague,"standings")));
  }

  function renderLeagueSidebar() {
    if (!els.favoriteLeagues || !els.allLeagues) return;
    const filter = normalizeLabel(els.leagueSearchInput?.value || "");
    const pinned = LEAGUES.filter(l => leagueFavorites.has(l.code));
    const all = LEAGUES.filter(l => !filter || normalizeLabel(l.name+" "+l.country).includes(filter));

    els.favoriteLeagues.innerHTML = pinned.length
      ? pinned.map(leagueRowHtml).join("")
      : '<div class="muted tiny">Pulsa ☆ en una liga para fijarla.</div>';
    els.allLeagues.innerHTML = all.map(leagueRowHtml).join("");
    bindLeagueButtons(els.favoriteLeagues);
    bindLeagueButtons(els.allLeagues);
  }

  function compactRange(startIso,endIso) {
    return espnCompactDate(startIso) + "-" + espnCompactDate(endIso);
  }

  async function fetchLeagueEvents(code,startIso,endIso) {
    const league=leagueByCode(code);
    if(league?.provider==="thesportsdb"){
      await loadEngine(false);
      const ds=engineDataset("schedule:"+code);
      return Array.isArray(ds?.data) ? ds.data.slice() : [];
    }

    const url = ESPN_SITE_BASE + "/" + encodeURIComponent(code) + "/scoreboard?dates=" +
      encodeURIComponent(compactRange(startIso,endIso)) + "&limit=1000";
    const data = await fetchCachedJson(
      "schedule:"+code+":"+startIso+":"+endIso,
      url,
      60*60*1000,
      false,
      12000
    );
    return (Array.isArray(data.events) ? data.events : []).map(raw => {
      const event = normalizeEspnEvent(raw);
      if (!event) return null;
      const meta = leagueByCode(code);
      event.leagueCode = code;
      event.tournament.name = meta?.name || event.tournament.name;
      event.tournament.uniqueTournament.name = meta?.name || event.tournament.uniqueTournament.name;
      event.tournament.category = {name:meta?.country || event.tournament.category?.name || "Internacional",alpha2:meta?.alpha2 || ""};
      return event;
    }).filter(Boolean);
  }

  function leagueMatchHtml(event) {
    const home=event.homeTeam||{}, away=event.awayTeam||{};
    const h=eventScoreValue(event,event.homeScore), a=eventScoreValue(event,event.awayScore);
    return '<div class="league-match" data-league-event="' + esc(event.id) + '">' +
      '<div class="match-state ' + (isLive(event)?'live':(isFinished(event)?'finished':'')) + '">' + esc(clockText(event)) + '</div>' +
      '<div class="league-match-teams">' +
        '<div class="league-match-team"><img src="' + teamLogo(home) + '" alt="" onerror="this.src=\'icon.svg\'"><span>' + esc(home.name||"Local") + '</span></div>' +
        '<div class="league-match-team"><img src="' + teamLogo(away) + '" alt="" onerror="this.src=\'icon.svg\'"><span>' + esc(away.name||"Visitante") + '</span></div>' +
      '</div>' +
      '<div class="score"><span>' + (h==null?'':h) + '</span><span>' + (a==null?'':a) + '</span></div>' +
    '</div>';
  }

  function renderLeagueSchedule(events) {
    if (!events.length) {
      els.leagueMatchesView.innerHTML='<div class="empty-card"><div class="empty-icon">📅</div><h2>Sin partidos</h2><p>No encuentro partidos en las próximas semanas.</p></div>';
      return;
    }
    const groups=new Map();
    for(const event of events.sort((a,b)=>Number(a.startTimestamp)-Number(b.startTimestamp))){
      const d=eventDate(event);
      const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(event);
    }
    els.leagueMatchesView.innerHTML='<div class="league-schedule">' + [...groups.entries()].map(([iso,list]) => {
      const label=new Intl.DateTimeFormat("es-ES",{weekday:"long",day:"numeric",month:"long"}).format(dateObj(iso));
      return '<section class="league-day"><div class="league-day-title">' + esc(label.charAt(0).toUpperCase()+label.slice(1)) + '</div>' + list.map(leagueMatchHtml).join("") + '</section>';
    }).join("") + '</div>';
    els.leagueMatchesView.querySelectorAll("[data-league-event]").forEach(row => {
      row.addEventListener("click",() => {
        const id=String(row.dataset.leagueEvent);
        const event=events.find(e=>String(e.id)===id);
        if(event) openMatch(event);
      });
    });
  }

  function standingStat(entry,names) {
    const stats=Array.isArray(entry?.stats)?entry.stats:[];
    for(const name of names){
      const found=stats.find(s => String(s.name||s.abbreviation||"").toLowerCase()===String(name).toLowerCase());
      if(found) return found.displayValue ?? found.value ?? "";
    }
    return "";
  }

  function extractStandingEntries(data) {
    const out=[];
    const walk=value=>{
      if(!value || typeof value!=="object") return;
      if(Array.isArray(value?.standings?.entries)) out.push(...value.standings.entries);
      else if(Array.isArray(value?.entries) && value.entries.some(x=>x?.team)) out.push(...value.entries);
      if(Array.isArray(value.children)) value.children.forEach(walk);
    };
    walk(data);
    const unique=new Map();
    out.forEach(x=>{ if(x?.team?.id) unique.set(String(x.team.id),x); });
    return [...unique.values()];
  }

  function renderStandings(data) {
    const entries=extractStandingEntries(data);
    if(!entries.length){
      els.leagueStandingsView.innerHTML='<div class="muted">La clasificación no está disponible para esta competición.</div>';
      return;
    }
    els.leagueStandingsView.innerHTML='<div class="standings-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead><tbody>' +
      entries.map((entry,index)=>{
        const t=entry.team||{};
        const logo=t.logos?.[0]?.href || t.logo || "";
        return '<tr><td>' + esc(standingStat(entry,["rank","playoffSeed"]) || (index+1)) + '</td><td><span class="standings-team"><img src="' + esc(logo||"icon.svg") + '" alt="" onerror="this.src=\'icon.svg\'"><strong>' + esc(t.displayName||t.name||"Equipo") + '</strong></span></td><td>' + esc(standingStat(entry,["gamesPlayed"])) + '</td><td>' + esc(standingStat(entry,["wins"])) + '</td><td>' + esc(standingStat(entry,["ties","draws"])) + '</td><td>' + esc(standingStat(entry,["losses"])) + '</td><td>' + esc(standingStat(entry,["pointDifferential","goalDifference"])) + '</td><td><strong>' + esc(standingStat(entry,["points"])) + '</strong></td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  function renderEngineStandings(ds) {
    const rows=Array.isArray(ds?.data)?ds.data:[];
    if(!rows.length){
      els.leagueStandingsView.innerHTML='<div class="muted">La clasificación todavía no está disponible desde esta fuente.</div>'+datasetMetaHtml(ds);
      return;
    }
    els.leagueStandingsView.innerHTML='<div class="standings-wrap"><table class="standings-table"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead><tbody>' +
      rows.map((row,index)=>'<tr><td>'+esc(row.rank ?? index+1)+'</td><td><span class="standings-team"><img src="'+esc(row.logo||"icon.svg")+'" alt="" onerror="this.src=\'icon.svg\'"><strong>'+esc(row.team||"Equipo")+'</strong></span></td><td>'+esc(row.played ?? "")+'</td><td>'+esc(row.wins ?? "")+'</td><td>'+esc(row.draws ?? "")+'</td><td>'+esc(row.losses ?? "")+'</td><td>'+esc(row.goalDifference ?? "")+'</td><td><strong>'+esc(row.points ?? "")+'</strong></td></tr>').join("") +
      '</tbody></table></div>'+datasetMetaHtml(ds);
  }

  function setLeagueTab(tab) {
    els.leagueTabs.forEach(btn=>btn.classList.toggle("active",btn.dataset.leagueTab===tab));
    els.leagueMatchesView.classList.toggle("hidden",tab!=="matches");
    els.leagueStandingsView.classList.toggle("hidden",tab!=="standings");
  }

  async function openLeague(code,tab="matches") {
    const league=leagueByCode(code);
    if(!league) return;
    selectedLeague=league;
    els.leagueDialogFlag.textContent=countryFlag(league.alpha2);
    els.leagueDialogCountry.textContent=league.country;
    els.leagueDialogTitle.textContent=league.name;
    els.leagueFavoriteBtn.textContent=leagueFavorites.has(code)?"★":"☆";
    els.leagueMatchesView.innerHTML='<div class="muted">Cargando próximos partidos…</div>';
    els.leagueStandingsView.innerHTML='<div class="muted">Cargando clasificación…</div>';
    setLeagueTab(tab);
    els.leagueDialog.showModal();

    const start=shiftDate(todayIso(),-45);
    const end=shiftDate(todayIso(),90);

    if(league.provider==="thesportsdb"){
      await loadEngine(false);
      const schedule=engineDataset("schedule:"+code);
      const standings=engineDataset("standings:"+code);
      if(Array.isArray(schedule?.data)) {
        const now=Date.now()/1000;
        const min=now-45*86400, max=now+90*86400;
        renderLeagueSchedule(schedule.data.filter(e=>Number(e.startTimestamp||0)>=min && Number(e.startTimestamp||0)<=max));
        els.leagueMatchesView.insertAdjacentHTML("beforeend",datasetMetaHtml(schedule));
      } else {
        els.leagueMatchesView.innerHTML='<div class="error-card">No se ha podido cargar el calendario cacheado de esta competición.</div>';
      }
      renderEngineStandings(standings);
      return;
    }

    const season=new Date().getFullYear();
    const standingsUrl=ESPN_STANDINGS_BASE+"/"+encodeURIComponent(code)+"/standings?season="+season;
    const [eventsResult,standingsResult]=await Promise.allSettled([
      fetchLeagueEvents(code,start,end),
      fetchCachedJson("standings:"+code+":"+season,standingsUrl,6*60*60*1000,false,12000)
    ]);
    if(eventsResult.status==="fulfilled") renderLeagueSchedule(eventsResult.value);
    else els.leagueMatchesView.innerHTML='<div class="error-card">No se han podido cargar los partidos de esta competición.</div>';
    if(standingsResult.status==="fulfilled") renderStandings(standingsResult.value);
    else els.leagueStandingsView.innerHTML='<div class="error-card">No se ha podido cargar la clasificación.</div>';
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
    els.favEmpty.classList.toggle("hidden", !(view === "favorites" && favorites.size === 0 && leagueFavorites.size === 0));

    const events = visibleEvents();
    if (view === "favorites" && favorites.size === 0 && leagueFavorites.size === 0) {
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
        const h = eventScoreValue(event,event.homeScore);
        const a = eventScoreValue(event,event.awayScore);
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

      const leagueCode=group.leagueCode || "";
      const leagueActive=leagueCode && leagueFavorites.has(leagueCode);
      const headAction=leagueCode
        ? '<button class="league-table-link" type="button" data-group-standings="' + esc(leagueCode) + '">Clasificación</button>'
        : '<div class="league-count">' + group.events.length + '</div>';
      const star=leagueCode
        ? '<button class="league-star ' + (leagueActive?'active':'') + '" type="button" data-group-star="' + esc(leagueCode) + '">' + (leagueActive?'★':'☆') + '</button>'
        : '<div class="league-count">' + group.events.length + '</div>';
      return '<section class="league-block">' +
        '<div class="league-head"><div class="flag">' + countryFlag(group.alpha2) + '</div><button class="league-head-link" type="button" ' + (leagueCode?'data-group-league="'+esc(leagueCode)+'"':'') + '><strong>' + esc(group.country) + ': ' + esc(group.tournament) + '</strong><span>' + group.events.length + ' partido' + (group.events.length===1?'':'s') + '</span></button>' + headAction + star + '</div>' +
        rows +
      '</section>';
    }).join("");

    els.matches.querySelectorAll("[data-group-league]").forEach(btn => btn.addEventListener("click",()=>openLeague(btn.dataset.groupLeague,"matches")));
    els.matches.querySelectorAll("[data-group-standings]").forEach(btn => btn.addEventListener("click",e=>{e.stopPropagation();openLeague(btn.dataset.groupStandings,"standings");}));
    els.matches.querySelectorAll("[data-group-star]").forEach(btn => btn.addEventListener("click",e=>{e.stopPropagation();toggleLeagueFavorite(btn.dataset.groupStar);render();}));

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
      country:team.country?.name || team.country || "",
      logo:team.logo || "",
      leagueCode:team.leagueCode || "",
      leagueName:team.leagueName || ""
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
    let backupEvents = [];

    if (!force) {
      const cached = loadJson(CACHE_PREFIX + selectedDate, null);
      const ttl = selectedDate === todayIso() ? 90*1000 : 20*60*1000;
      if (cached && Date.now()-Number(cached.savedAt||0) < ttl && Array.isArray(cached.events)) {
        dayEvents = cached.events;
        render();
      }
    }

    try {
      const fallback = await loadFallback();
      const block = fallback.days?.[selectedDate] || [];
      if (Array.isArray(block) && block.length) {
        backupEvents = block;
        dayEvents = block;
        const leagues = new Set(dayEvents.map(e => tournamentData(e).key)).size;
        els.status.textContent = "Copia ESPN · " + dayEvents.length + " partidos · " + leagues + " competiciones";
        if (fallback.updatedAt) {
          const d = new Date(fallback.updatedAt);
          if (!Number.isNaN(d.getTime())) els.updated.textContent = "Copia " + new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit"}).format(d);
        }
        render();
      }
    } catch (err) {
      console.warn("Copia local no disponible",err);
    }

    try {
      const espnEvents = await fetchEspnDay(selectedDate);
      if (espnEvents.length) {
        dayEvents = mergeEventLists(backupEvents,espnEvents);
        localStorage.setItem(CACHE_PREFIX + selectedDate, JSON.stringify({savedAt:Date.now(),events:dayEvents}));
        const leagues = new Set(dayEvents.map(e => tournamentData(e).key)).size;
        els.status.textContent = "ESPN · " + dayEvents.length + " partidos · " + leagues + " competiciones";
        els.updated.textContent = "Actualizado " + new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());
        render();
        return;
      }
    } catch (err) {
      console.warn("ESPN directo no disponible",err);
    }

    try {
      const data = await fetchJson("/sport/football/scheduled-events/" + selectedDate);
      dayEvents = Array.isArray(data.events) ? data.events : [];
      if (dayEvents.length) {
        localStorage.setItem(CACHE_PREFIX + selectedDate, JSON.stringify({savedAt:Date.now(),events:dayEvents}));
        els.status.textContent = "Proveedor secundario · " + dayEvents.length + " partidos";
        els.updated.textContent = "Actualizado " + new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());
        render();
        return;
      }
    } catch (err) {
      console.warn("Proveedor secundario no disponible",err);
    }

    if (backupEvents.length) {
      dayEvents = backupEvents;
      render();
      return;
    }

    try {
      const fallback = await loadFallback();
      const block = fallback.days?.[selectedDate] || [];
      dayEvents = Array.isArray(block) ? block : [];
      const source = fallback.source ? String(fallback.source).replace(" public scoreboard","") : "respaldo";
      els.status.textContent = source + " · " + dayEvents.length + " partidos";
      if (fallback.updatedAt) {
        const d = new Date(fallback.updatedAt);
        if (!Number.isNaN(d.getTime())) els.updated.textContent = "Copia " + new Intl.DateTimeFormat("es-ES",{hour:"2-digit",minute:"2-digit"}).format(d);
      }
      render();
    } catch (err) {
      console.warn("Fallback no disponible",err);
      els.status.textContent = "No se han podido cargar los partidos.";
      render();
    }
  }

  async function loadLive() {
    try {
      let backupLive = [];
      let backupDay = [];
      try {
        const fallback = await loadFallback();
        backupLive = Array.isArray(fallback.live) ? fallback.live : [];
        backupDay = Array.isArray(fallback.days?.[todayIso()]) ? fallback.days[todayIso()] : [];
      } catch {}

      const allToday = await fetchEspnDay(todayIso());
      const next = mergeEventLists(backupLive,allToday.filter(isLive)).filter(isLive);
      processNotifications(next);
      liveEvents = next;
      els.liveBadge.textContent = String(next.length);
      els.liveBadge.classList.toggle("hidden", next.length === 0);
      if (selectedDate === todayIso() || view === "live" || view === "favorites") {
        if (selectedDate === todayIso() && allToday.length) dayEvents = mergeEventLists(backupDay,allToday);
        render();
      }
      return;
    } catch (err) {
      console.warn("ESPN directo no disponible",err);
    }

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
      console.warn("Directo secundario no disponible",err);
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

  function normalizedCatalogTeam(team) {
    if(!team) return null;
    const countryName=typeof team.country==="object" ? (team.country?.name || "") : (team.country || "");
    return {
      id:Number(team.id) || team.id,
      name:team.name || team.shortName || "Equipo",
      shortName:team.shortName || team.name || "Equipo",
      logo:team.logo || "",
      leagueCode:team.leagueCode || "",
      leagueName:team.leagueName || "",
      country:{name:countryName},
      alpha2:team.alpha2 || "",
      provider:team.provider || ""
    };
  }

  async function openTeam(team) {
    const normalized=normalizedCatalogTeam(team) || team;
    if(!normalized?.id) return;
    selectedTeam=normalized;
    const catalogMatch=catalogTeams.find(x=>String(x.id)===String(normalized.id) || normalizeLabel(x.name)===normalizeLabel(normalized.name));
    if(catalogMatch){
      normalized.leagueCode=normalized.leagueCode || catalogMatch.leagueCode || "";
      normalized.leagueName=normalized.leagueName || catalogMatch.leagueName || "";
      normalized.logo=normalized.logo || catalogMatch.logo || "";
      if(!normalized.country?.name) normalized.country={name:catalogMatch.country || ""};
    }

    els.teamDialogLogo.src=teamLogo(normalized);
    els.teamDialogTitle.textContent=normalized.name || "Equipo";
    els.teamDialogLeague.textContent=[normalized.country?.name,normalized.leagueName].filter(Boolean).join(" · ");
    els.teamFavoriteBtn.textContent=favoriteTeam(normalized)?"★":"☆";
    els.teamScheduleView.innerHTML='<div class="muted">Cargando partidos del equipo…</div>';
    els.teamDialog.showModal();

    const code=normalized.leagueCode;

    try{
      let events=[];
      if(code){
        const start=shiftDate(todayIso(),-45);
        const end=shiftDate(todayIso(),60);
        events=await fetchLeagueEvents(code,start,end);
      }else{
        const data=await fetchPublicJson(ESPN_SITE_BASE+"/all/teams/"+encodeURIComponent(normalized.id)+"/schedule?t="+Date.now(),12000);
        events=(Array.isArray(data.events)?data.events:[]).map(normalizeEspnEvent).filter(Boolean);
      }
      const name=normalizeLabel(normalized.name);
      const teamEvents=events.filter(e =>
        String(e.homeTeam?.id)===String(normalized.id) ||
        String(e.awayTeam?.id)===String(normalized.id) ||
        normalizeLabel(e.homeTeam?.name)===name ||
        normalizeLabel(e.awayTeam?.name)===name
      );
      const past=teamEvents.filter(e=>Number(e.startTimestamp)<Date.now()/1000).sort((a,b)=>Number(b.startTimestamp)-Number(a.startTimestamp)).slice(0,6).reverse();
      const future=teamEvents.filter(e=>Number(e.startTimestamp)>=Date.now()/1000).sort((a,b)=>Number(a.startTimestamp)-Number(b.startTimestamp)).slice(0,10);

      const block=(title,list)=>'<div class="team-schedule-group"><h3>'+esc(title)+'</h3>'+(list.length?list.map(leagueMatchHtml).join(""):'<div class="muted tiny">Sin partidos disponibles.</div>')+'</div>';
      els.teamScheduleView.innerHTML=block("Próximos partidos",future)+block("Últimos partidos",past);
      els.teamScheduleView.querySelectorAll("[data-league-event]").forEach(row=>{
        row.addEventListener("click",()=>{
          const event=teamEvents.find(e=>String(e.id)===String(row.dataset.leagueEvent));
          if(event) openMatch(event);
        });
      });
    }catch(err){
      console.warn("No se pudo cargar el equipo",err);
      els.teamScheduleView.innerHTML='<div class="error-card">No se han podido cargar los partidos de este equipo ahora mismo.</div>';
    }
  }

  function collectEspnSearchTeams(value,out,seen=new Set()) {
    if(value==null) return;
    if(Array.isArray(value)){
      value.forEach(item=>collectEspnSearchTeams(item,out,seen));
      return;
    }
    if(typeof value!=="object") return;
    if(seen.has(value)) return;
    seen.add(value);

    const type=normalizeLabel(value.type || value.entityType || value.contentType || value.subtype || "");
    const sport=normalizeLabel(value?.sport?.slug || value?.sport?.name || value.sport || "");
    const name=value.displayName || value.shortDisplayName || value.name || value.title || "";
    const id=value.id || value.teamId || value.entityId || "";
    const uid=String(value.uid || "");
    const teamish=type.includes("team") || uid.includes("~t:") || Boolean(value.team);
    const soccerish=!sport || sport.includes("soccer") || sport.includes("football");

    if(teamish && soccerish && id && name){
      const logo=value.logo || value?.image?.href || value?.image?.url || value?.images?.[0]?.url || value?.images?.[0]?.href || "";
      const leagueRaw=value?.league?.abbreviation || value?.league?.slug || value?.league?.name || value?.league || "";
      const leagueCode=LEAGUES.find(l=>normalizeLabel(l.code)===normalizeLabel(leagueRaw))?.code ||
        inferLeagueCode(String(leagueRaw),String(leagueRaw));
      const meta=leagueByCode(leagueCode);
      out.push({
        id:Number(id)||id,
        name:String(name),
        shortName:value.shortDisplayName || value.name || String(name),
        logo,
        leagueCode:leagueCode || "",
        leagueName:meta?.name || String(value?.league?.name || ""),
        country:meta?.country || "",
        alpha2:meta?.alpha2 || ""
      });
    }

    for(const child of Object.values(value)) {
      if(child && typeof child==="object") collectEspnSearchTeams(child,out,seen);
    }
  }

  async function searchEspnGlobalTeams(term) {
    const url="https://site.web.api.espn.com/apis/search/v2?query="+encodeURIComponent(term)+"&limit=40&sport=soccer";
    try{
      const data=await fetchPublicJson(url,9000);
      const found=[];
      collectEspnSearchTeams(data,found);
      return [...new Map(found.map(t=>[String(t.id),t])).values()];
    }catch(err){
      console.warn("Búsqueda global ESPN no disponible",err);
      return [];
    }
  }

  async function searchTeams(term) {
    const q=normalizeLabel(term);
    if(q.length<2){
      els.teamResults.innerHTML="";
      els.teamStatus.textContent="";
      return;
    }
    els.teamStatus.textContent="Buscando en el catálogo…";
    await loadCatalog(false);

    const candidates=[...catalogTeams];
    [...dayEvents,...liveEvents].forEach(e=>[e.homeTeam,e.awayTeam].forEach(t=>{
      if(t?.id && t?.name && !candidates.some(x=>String(x.id)===String(t.id))) candidates.push(t);
    }));

    const scored=candidates.map(team=>{
      const hay=normalizeLabel((team.name||"")+" "+(team.shortName||"")+" "+(team.leagueName||"")+" "+(team.country||team.country?.name||""));
      let score=hay===q?100:(hay.startsWith(q)?70:(hay.includes(q)?40:0));
      if(normalizeLabel(team.name||"").includes(q)) score+=30;
      return {team,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || String(a.team.name).localeCompare(String(b.team.name),"es"));

    let unique=[...new Map(scored.map(x=>[String(x.team.id)+":"+String(x.team.leagueCode||""),x.team])).values()].slice(0,20);

    if(unique.length<12){
      const global=await searchEspnGlobalTeams(term);
      const merged=[...unique,...global];
      unique=[...new Map(merged.map(t=>[String(t.id)+":"+String(t.leagueCode||""),t])).values()].slice(0,20);
    }

    els.teamStatus.textContent=unique.length ? unique.length+" resultados" : "No encuentro equipos.";

    els.teamResults.innerHTML=unique.map(team=>{
      const normalized=normalizedCatalogTeam(team) || team;
      const active=Boolean(favoriteTeam(normalized));
      const country=normalized.country?.name || team.country || "";
      const league=normalized.leagueName || team.leagueName || "";
      return '<div class="team-search-item">' +
        '<img src="'+teamLogo(normalized)+'" alt="" onerror="this.src=\'icon.svg\'">' +
        '<div><strong>'+esc(normalized.name||"Equipo")+'</strong><span>'+esc([country,league].filter(Boolean).join(" · "))+'</span></div>' +
        '<button class="team-open-btn" type="button" data-open-team="'+esc(normalized.id)+'" data-open-code="'+esc(normalized.leagueCode||"")+'">Ver</button>' +
        '<button class="star-btn" type="button" data-team-id="'+esc(normalized.id)+'" data-team-code="'+esc(normalized.leagueCode||"")+'">'+(active?"★":"☆")+'</button>' +
      '</div>';
    }).join("");

    const findTeam=(id,code)=>unique.find(t=>String(t.id)===String(id) && String(t.leagueCode||"")===String(code||"")) || unique.find(t=>String(t.id)===String(id));

    els.teamResults.querySelectorAll("[data-open-team]").forEach(btn=>btn.addEventListener("click",()=>{
      const team=findTeam(btn.dataset.openTeam,btn.dataset.openCode);
      if(team) openTeam(team);
    }));

    els.teamResults.querySelectorAll("[data-team-id]").forEach(btn=>btn.addEventListener("click",()=>{
      const team=findTeam(btn.dataset.teamId,btn.dataset.teamCode);
      if(!team) return;
      const normalized=normalizedCatalogTeam(team) || team;
      const current=favoriteTeam(normalized);
      if(current) favorites.delete(Number(current.id)); else addFavorite(normalized);
      saveFavorites();
      searchTeams(els.teamInput.value);
      render();
    }));
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

  function espnSummaryInfo(data) {
    const gameInfo=data?.gameInfo || {};
    const competition=data?.header?.competitions?.[0] || {};
    const venue=gameInfo?.venue?.fullName || gameInfo?.venue?.name || competition?.venue?.fullName || "";
    const attendance=gameInfo?.attendance || competition?.attendance || "";
    const officials=(gameInfo?.officials || []).map(x=>x?.displayName || x?.fullName || x?.name).filter(Boolean);
    const broadcasts=[];
    const addBroadcasts=value=>{
      if(!Array.isArray(value)) return;
      value.forEach(item=>{
        const names=[];
        if(Array.isArray(item?.names)) names.push(...item.names);
        if(item?.name) names.push(item.name);
        if(item?.shortName) names.push(item.shortName);
        names.forEach(name=>{if(name && !broadcasts.includes(name)) broadcasts.push(name);});
      });
    };
    addBroadcasts(competition?.broadcasts);
    addBroadcasts(data?.broadcasts);

    const weather=gameInfo?.weather;
    const weatherText=weather ? [weather.displayValue || weather.conditionId,weather.temperature!=null?weather.temperature+"°":""].filter(Boolean).join(" · ") : "";
    const info=[];
    if(venue) info.push(["Estadio",venue]);
    if(attendance) info.push(["Asistencia",String(attendance)]);
    if(officials.length) info.push(["Árbitro",officials.join(", ")]);
    if(broadcasts.length) info.push(["TV / emisión",broadcasts.join(", ")]);
    if(weatherText) info.push(["Tiempo",weatherText]);
    return info;
  }

  function renderEspnSummary(data) {
    const info=espnSummaryInfo(data);
    const infoHtml=info.length
      ? '<div class="match-info-grid">'+info.map(([k,v])=>'<div class="match-info-item"><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+'</div>'
      : "";

    const plays=Array.isArray(data?.plays)?data.plays:(Array.isArray(data?.keyEvents)?data.keyEvents:[]);
    let incidentsHtml="";
    if(plays.length){
      incidentsHtml='<div class="timeline">'+plays.slice(-40).map(item=>{
        const clock=item?.clock?.displayValue || item?.clock || item?.time || "";
        const text=item?.text || item?.shortText || item?.type?.text || item?.type?.description || "Incidencia";
        const low=normalizeLabel(text);
        const icon=low.includes("goal")||low.includes("gol")?"⚽":low.includes("yellow")||low.includes("amar")?"🟨":low.includes("red")||low.includes("roja")?"🟥":low.includes("substitut")||low.includes("sustit")?"🔄":"•";
        return '<div class="incident"><div class="incident-time">'+esc(clock)+'</div><div class="incident-icon">'+icon+'</div><div><strong>'+esc(text)+'</strong></div></div>';
      }).join("")+'</div>';
    }

    const injuries=Array.isArray(data?.injuries)?data.injuries:[];
    let injuriesHtml="";
    if(injuries.length){
      const names=injuries.flatMap(group=>Array.isArray(group?.injuries)?group.injuries:[group]).map(x=>x?.athlete?.displayName || x?.athlete?.fullName || x?.name).filter(Boolean);
      if(names.length) injuriesHtml='<div class="match-info-item"><span>Bajas / lesiones</span><strong>'+esc(names.slice(0,12).join(", "))+'</strong></div>';
    }

    els.detailSummary.innerHTML=infoHtml + injuriesHtml + (incidentsHtml || '<div class="muted">No hay incidencias disponibles todavía.</div>');
  }

  function renderEspnStats(data) {
    const teams=Array.isArray(data?.boxscore?.teams)?data.boxscore.teams:[];
    if(teams.length<2){
      els.detailStats.innerHTML='<div class="muted">No hay estadísticas disponibles para este partido.</div>';
      return;
    }
    const left=teams[0], right=teams[1];
    const leftStats=Array.isArray(left.statistics)?left.statistics:[];
    const rightStats=Array.isArray(right.statistics)?right.statistics:[];
    const rows=[];
    for(const stat of leftStats){
      const key=String(stat.name||stat.label||stat.abbreviation||"");
      const other=rightStats.find(x=>String(x.name||x.label||x.abbreviation||"")===key);
      rows.push({
        name:stat.label||stat.name||key,
        home:stat.displayValue ?? stat.value ?? "",
        away:other?.displayValue ?? other?.value ?? ""
      });
    }
    if(!rows.length){
      els.detailStats.innerHTML='<div class="muted">No hay estadísticas disponibles para este partido.</div>';
      return;
    }
    els.detailStats.innerHTML='<div class="stats-list">'+rows.slice(0,24).map(row=>{
      const hn=parseFloat(String(row.home).replace("%",""))||0;
      const an=parseFloat(String(row.away).replace("%",""))||0;
      const total=Math.max(1,hn+an), hp=Math.round(hn/total*100), ap=100-hp;
      return '<div><div class="stat-row"><div class="stat-value">'+esc(row.home)+'</div><strong>'+esc(row.name)+'</strong><div class="stat-value">'+esc(row.away)+'</div></div><div class="stat-bars"><i style="width:'+hp+'%"></i><i style="width:'+ap+'%"></i></div></div>';
    }).join("")+'</div>';
  }

  function renderEspnLineups(data) {
    const rosters=Array.isArray(data?.rosters)?data.rosters:[];
    if(!rosters.length){
      els.detailLineups.innerHTML='<div class="muted">Alineaciones aún no disponibles.</div>';
      return;
    }
    const columns=rosters.slice(0,2).map(group=>{
      const team=group?.team || {};
      const entries=Array.isArray(group?.roster)?group.roster:(Array.isArray(group?.athletes)?group.athletes:[]);
      const starters=entries.filter(x=>x?.starter || x?.status?.type==="starter" || x?.subbedIn===false);
      const list=starters.length?starters:entries;
      return '<div class="lineup-col"><h3>'+esc(team.displayName||team.name||"Equipo")+'</h3>'+list.slice(0,18).map(item=>{
        const p=item?.athlete || item?.player || item;
        const number=item?.jersey || p?.jersey || p?.jerseyNumber || "";
        const pos=item?.position?.abbreviation || p?.position?.abbreviation || "";
        return '<div class="player"><span class="player-num">'+esc(number)+'</span><span>'+esc(p?.displayName||p?.fullName||p?.name||"Jugador")+(pos?' · '+esc(pos):'')+'</span></div>';
      }).join("")+'</div>';
    }).join("");
    els.detailLineups.innerHTML='<div class="lineups">'+columns+'</div>';
  }

  function matchSummaryTtl(event) {
    if(isFinished(event)) return 365*24*60*60*1000;
    if(isLive(event)) return 20*1000;
    const delta=Number(event.startTimestamp||0)*1000-Date.now();
    if(delta>2*60*60*1000) return 30*60*1000;
    return 5*60*1000;
  }

  async function loadEspnMatchSummary(event) {
    const code=event?.leagueCode || tournamentData(event).leagueCode;
    if(!code) throw new Error("Competición ESPN no identificada");
    const url=ESPN_SITE_BASE+"/"+encodeURIComponent(code)+"/summary?event="+encodeURIComponent(event.id);
    const data=await fetchCachedJson("summary:espn:"+code+":"+event.id,url,matchSummaryTtl(event),false,12000);
    renderEspnSummary(data);
    if(isLive(event) || isFinished(event)) {
      renderEspnStats(data);
    } else {
      els.detailStats.innerHTML='<div class="muted">Las estadísticas de este partido aparecerán cuando comience. Los datos acumulados de temporada no se mostrarán aquí como si fueran estadísticas del encuentro.</div>';
    }
    renderEspnLineups(data);
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
    const statsTab=els.detailTabs.find(btn=>btn.dataset.detail==="stats");
    if(statsTab) statsTab.textContent=(isLive(event)||isFinished(event)) ? "Estadísticas" : "Previa";
    els.detailSummary.innerHTML = '<div class="muted">Cargando resumen…</div>';
    els.detailStats.innerHTML = (isLive(event)||isFinished(event))
      ? '<div class="muted">Cargando estadísticas…</div>'
      : '<div class="muted">Cargando información previa…</div>';
    els.detailLineups.innerHTML = '<div class="muted">Cargando alineaciones…</div>';
    setDetail("summary");
    els.dialog.showModal();

    if (event.provider === "espn") {
      try {
        await loadEspnMatchSummary(event);
      } catch (err) {
        console.warn("Resumen ESPN no disponible",err);
        els.detailSummary.innerHTML = '<div class="muted">El partido está disponible, pero ESPN no ha proporcionado todavía el resumen detallado.</div>';
        els.detailStats.innerHTML = '<div class="muted">Estadísticas no disponibles todavía.</div>';
        els.detailLineups.innerHTML = '<div class="muted">Alineaciones no disponibles todavía.</div>';
      }
      return;
    }

    if (event.provider === "thesportsdb") {
      const extra=event.extra || {};
      const info=[
        extra.venue ? ["Estadio",extra.venue] : null,
        extra.round ? ["Jornada",extra.round] : null,
        extra.tv ? ["TV / emisión",extra.tv] : null
      ].filter(Boolean);
      els.detailSummary.innerHTML = (info.length
        ? '<div class="match-info-grid">'+info.map(([k,v])=>'<div class="match-info-item"><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+'</div>'
        : '') + '<div class="muted">Datos de calendario cacheados. La información rápida del partido se completará con otros proveedores cuando esté disponible.</div>';
      els.detailStats.innerHTML = (isLive(event)||isFinished(event))
        ? '<div class="muted">Todavía no tenemos estadísticas fiables de este encuentro desde este proveedor.</div>'
        : '<div class="muted">Las estadísticas reales aparecerán cuando comience el partido; no mostramos datos de temporada como si fueran del encuentro.</div>';
      els.detailLineups.innerHTML = '<div class="muted">Alineaciones pendientes de una fuente fiable para esta competición.</div>';
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
  els.leagueSearchInput?.addEventListener("input",renderLeagueSidebar);
  els.closeLeagueBtn?.addEventListener("click",()=>els.leagueDialog.close());
  els.leagueTabs.forEach(btn=>btn.addEventListener("click",()=>setLeagueTab(btn.dataset.leagueTab)));
  els.leagueFavoriteBtn?.addEventListener("click",()=>{
    if(selectedLeague) toggleLeagueFavorite(selectedLeague.code);
  });
  els.closeTeamBtn?.addEventListener("click",()=>els.teamDialog.close());
  els.teamFavoriteBtn?.addEventListener("click",()=>{
    if(!selectedTeam) return;
    const current=favoriteTeam(selectedTeam);
    if(current) favorites.delete(Number(current.id)); else addFavorite(selectedTeam);
    saveFavorites();
    els.teamFavoriteBtn.textContent=favoriteTeam(selectedTeam)?"★":"☆";
    render();
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
    window.addEventListener("load",() => navigator.serviceWorker.register("sw.js?v=1.3").catch(console.warn));
  }

  updateNotifyButton();
  renderDate();
  renderLeagueSidebar();
  els.matches.innerHTML = document.getElementById("loadingTemplate").innerHTML.repeat(2);
  Promise.all([loadCatalog(false),loadDay(false),loadLive()])
    .then(()=>render())
    .finally(scheduleLive);
})();