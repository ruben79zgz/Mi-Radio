(function () {
  'use strict';

  var initialized = false;
  var suppressHistory = false;
  var tvShouldResume = false;
  var tvResumeTimer = null;

  function byId(id) { return document.getElementById(id); }

  function currentState() {
    return history.state && history.state.miRadio ? history.state : { miRadio: true, screen: 'radio', depth: 0 };
  }

  function writeState(mode, method, extra) {
    if (suppressHistory) return;
    var state = { miRadio: true, screen: mode, depth: mode === 'radio' ? 0 : (mode === 'podcast-detail' ? 2 : 1) };
    if (extra) {
      for (var key in extra) state[key] = extra[key];
    }
    if (method === 'replace') history.replaceState(state, '', location.href);
    else history.pushState(state, '', location.href);
  }

  function isPodcastDetailOpen() {
    var detail = byId('podcastDetailView');
    return !!detail && !detail.classList.contains('hidden');
  }

  function applyState(state) {
    state = state && state.miRadio ? state : { miRadio: true, screen: 'radio', depth: 0 };
    suppressHistory = true;
    try {
      if (state.screen === 'radio') {
        byId('radioModeBtn').click();
        return;
      }

      if (state.screen === 'tv') {
        byId('tvModeBtn').click();
        return;
      }

      if (state.screen === 'podcasts') {
        byId('podcastModeBtn').click();
        if (isPodcastDetailOpen()) byId('podcastBackBtn').click();
        return;
      }

      if (state.screen === 'podcast-detail') {
        byId('podcastModeBtn').click();
        if (isPodcastDetailOpen()) byId('podcastBackBtn').click();
        window.setTimeout(function () {
          var card = document.querySelector('[data-show-id="' + String(state.showId || '').replace(/"/g, '\\"') + '"]');
          if (card) {
            suppressHistory = true;
            card.click();
            suppressHistory = false;
          }
        }, 0);
      }
    } finally {
      suppressHistory = false;
    }
  }

  function installHistoryNavigation() {
    var activeScreen = 'radio';
    if (byId('podcastModeBtn') && byId('podcastModeBtn').classList.contains('active')) activeScreen = 'podcasts';
    else if (byId('tvModeBtn') && byId('tvModeBtn').classList.contains('active')) activeScreen = 'tv';

    history.replaceState({ miRadio: true, screen: 'radio', depth: 0 }, '', location.href);
    if (activeScreen !== 'radio') {
      history.pushState({ miRadio: true, screen: activeScreen, depth: 1 }, '', location.href);
    }

    document.addEventListener('click', function (event) {
      if (suppressHistory) return;
      var target = event.target;
      if (!target || !target.closest) return;

      var radioBtn = target.closest('#radioModeBtn');
      var podcastBtn = target.closest('#podcastModeBtn');
      var tvBtn = target.closest('#tvModeBtn');
      var podcastCard = target.closest('[data-show-id]');
      var podcastBack = target.closest('#podcastBackBtn');

      if (podcastBack && currentState().screen === 'podcast-detail') {
        event.preventDefault();
        event.stopImmediatePropagation();
        history.back();
        return;
      }

      if (radioBtn) {
        var state = currentState();
        if (state.depth > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          history.go(-state.depth);
        }
        return;
      }

      if (podcastBtn) {
        var current = currentState();
        if (current.screen === 'radio') writeState('podcasts', 'push');
        else if (current.screen !== 'podcasts') writeState('podcasts', 'replace');
        return;
      }

      if (tvBtn) {
        var currentTv = currentState();
        if (currentTv.screen === 'radio') writeState('tv', 'push');
        else if (currentTv.screen !== 'tv') writeState('tv', 'replace');
        return;
      }

      if (podcastCard) {
        var id = podcastCard.getAttribute('data-show-id');
        if (id) writeState('podcast-detail', 'push', { showId: id });
      }
    }, true);

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
        navigator.mediaSession.setActionHandler('play', function () { video.play().catch(function () {}); });
        navigator.mediaSession.setActionHandler('pause', function () { video.pause(); });
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
        try { navigator.mediaSession.playbackState = tvShouldResume ? 'paused' : 'none'; } catch (e) {}
      }
    });

    video.addEventListener('ended', function () { tvShouldResume = false; });

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
    if (!byId('radioModeBtn') || !byId('podcastModeBtn') || !byId('tvModeBtn')) return;
    initialized = true;
    installHistoryNavigation();
    installTvBackgroundHandling();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
