(function () {
  'use strict';

  var initialized = false;
  var applyingHistory = false;
  var tvShouldResume = false;
  var tvResumeTimer = null;

  function byId(id) { return document.getElementById(id); }

  function appState() {
    var state = history.state;
    return state && state.miRadio
      ? state
      : { miRadio: true, screen: 'radio', depth: 0, navVersion: 17 };
  }

  function writeState(screen, method, extra) {
    if (applyingHistory) return;
    var depth = screen === 'radio' ? 0 : (screen === 'podcast-detail' ? 2 : 1);
    var state = { miRadio: true, screen: screen, depth: depth, navVersion: 17 };
    var key;
    if (extra) {
      for (key in extra) state[key] = extra[key];
    }
    if (method === 'replace') history.replaceState(state, '', location.href);
    else history.pushState(state, '', location.href);
  }

  function detailOpen() {
    var detail = byId('podcastDetailView');
    return !!detail && !detail.classList.contains('hidden');
  }

  function applyState(state) {
    state = state && state.miRadio
      ? state
      : { miRadio: true, screen: 'radio', depth: 0, navVersion: 17 };

    applyingHistory = true;
    try {
      if (state.screen === 'radio') {
        if (detailOpen()) byId('podcastBackBtn').click();
        byId('radioModeBtn').click();
        return;
      }

      if (state.screen === 'tv') {
        if (detailOpen()) byId('podcastBackBtn').click();
        byId('tvModeBtn').click();
        return;
      }

      if (state.screen === 'podcasts') {
        byId('podcastModeBtn').click();
        if (detailOpen()) byId('podcastBackBtn').click();
        return;
      }

      if (state.screen === 'podcast-detail') {
        byId('podcastModeBtn').click();

        var wanted = String(state.showId || '');
        var currentDetail = byId('podcastDetailView');
        var currentCard = wanted
          ? document.querySelector('[data-show-id="' + wanted.replace(/"/g, '\\"') + '"]')
          : null;

        if (!detailOpen() && currentCard) currentCard.click();
        else if (detailOpen() && wanted && currentDetail) {
          // El detalle ya está abierto; no hacemos nada para no duplicar historial.
        }
      }
    } finally {
      applyingHistory = false;
    }
  }

  function installHistoryNavigation() {
    var radioBtn = byId('radioModeBtn');
    var podcastBtn = byId('podcastModeBtn');
    var tvBtn = byId('tvModeBtn');
    var backBtn = byId('podcastBackBtn');

    // Cada apertura de la app empieza con una base limpia en Radio.
    history.replaceState(
      { miRadio: true, screen: 'radio', depth: 0, navVersion: 17 },
      '',
      location.href
    );

    radioBtn.addEventListener('click', function (event) {
      if (applyingHistory) return;
      var state = appState();
      if (state.screen !== 'radio') {
        event.preventDefault();
        event.stopImmediatePropagation();
        history.go(-Math.max(1, Number(state.depth) || 1));
      }
    }, true);

    podcastBtn.addEventListener('click', function () {
      if (applyingHistory) return;
      var state = appState();
      if (state.screen === 'radio') writeState('podcasts', 'push');
      else if (state.screen !== 'podcasts') writeState('podcasts', 'replace');
    }, true);

    tvBtn.addEventListener('click', function () {
      if (applyingHistory) return;
      var state = appState();
      if (state.screen === 'radio') writeState('tv', 'push');
      else if (state.screen !== 'tv') writeState('tv', 'replace');
    }, true);

    document.addEventListener('click', function (event) {
      if (applyingHistory) return;
      var target = event.target;
      if (!target || !target.closest) return;

      var card = target.closest('[data-show-id]');
      if (!card) return;

      var id = card.getAttribute('data-show-id');
      if (!id) return;

      var state = appState();
      if (state.screen === 'podcasts') {
        writeState('podcast-detail', 'push', { showId: id });
      }
    }, true);

    // IMPORTANTE: app.js cierra primero el detalle de forma inmediata.
    // Después retiramos una sola entrada del historial. Así el botón Biblioteca
    // nunca depende del popstate para hacer visible la biblioteca.
    backBtn.addEventListener('click', function () {
      if (applyingHistory) return;
      var state = appState();
      if (state.screen === 'podcast-detail') {
        window.setTimeout(function () {
          history.back();
        }, 0);
      }
    });

    window.addEventListener('popstate', function (event) {
      applyState(event.state);
    });
  }

  function installTvBackgroundHandling() {
    var video = byId('tvVideo');
    var name = byId('tvPlayerName');
    if (!video) return;

    function setMediaSession() {
      if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: (name && name.textContent) || 'TV en directo',
          artist: 'Televisión en directo',
          album: 'Mi Radio'
        });
        navigator.mediaSession.setActionHandler('play', function () {
          video.play().catch(function () {});
        });
        navigator.mediaSession.setActionHandler('pause', function () {
          video.pause();
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch (e) {}
    }

    video.addEventListener('playing', function () {
      tvShouldResume = true;
      setMediaSession();
    });

    video.addEventListener('pause', function () {
      if (document.visibilityState === 'visible') tvShouldResume = false;
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = tvShouldResume ? 'paused' : 'none';
        } catch (e) {}
      }
    });

    video.addEventListener('ended', function () {
      tvShouldResume = false;
    });

    function resumeTvIfNeeded() {
      if (!tvShouldResume || !video.currentSrc || !video.paused) return;
      window.clearTimeout(tvResumeTimer);
      tvResumeTimer = window.setTimeout(function () {
        video.play().catch(function () {});
      }, 250);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (video.currentSrc && !video.paused && !video.ended) tvShouldResume = true;
      } else {
        resumeTvIfNeeded();
      }
    });

    window.addEventListener('pageshow', resumeTvIfNeeded);
    window.addEventListener('focus', resumeTvIfNeeded);
  }

  function init() {
    if (initialized) return;
    if (!byId('radioModeBtn') || !byId('podcastModeBtn') || !byId('tvModeBtn') || !byId('podcastBackBtn')) return;

    initialized = true;
    installHistoryNavigation();
    installTvBackgroundHandling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
