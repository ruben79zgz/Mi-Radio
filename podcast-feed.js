(function () {
  'use strict';

  var DB_NAME = 'mi-radio-podcast-feeds-v1';
  var STORE = 'feeds';
  var DEFAULT_MAX_AGE = 30 * 60 * 1000;

  function openDb() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        try { req.result.createObjectStore(STORE, { keyPath: 'key' }); } catch (e) {}
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  async function cacheGet(key) {
    var db = await openDb();
    if (!db) return null;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  async function cachePut(key, show) {
    var db = await openDb();
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key: key, updatedAt: Date.now(), show: show });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  function timeoutFetch(url, ms) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, ms || 15000);

    return fetch(url, {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
    }).then(function (response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  async function fetchFeedText(feedUrl) {
    var encoded = encodeURIComponent(feedUrl);
    var candidates = [
      feedUrl,
      'https://api.allorigins.win/raw?url=' + encoded,
      'https://corsproxy.io/?url=' + encoded,
      'https://api.codetabs.com/v1/proxy/?quest=' + encoded
    ];
    var lastError = null;

    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var text = await timeoutFetch(candidates[i], 16000);
        if (text && /<(rss|feed)[\s>]/i.test(text) && /<(item|entry)[\s>]/i.test(text)) return text;
        lastError = new Error('Respuesta sin episodios');
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('No se pudo leer el RSS');
  }

  function textOf(node, names) {
    if (!node) return '';
    for (var i = 0; i < names.length; i += 1) {
      var list = node.getElementsByTagName(names[i]);
      if (list && list[0] && list[0].textContent) return cleanText(list[0].textContent);
    }
    return '';
  }

  function attrOf(node, names, attr) {
    if (!node) return '';
    for (var i = 0; i < names.length; i += 1) {
      var list = node.getElementsByTagName(names[i]);
      if (list && list[0] && list[0].getAttribute(attr)) return list[0].getAttribute(attr).trim();
    }
    return '';
  }

  function cleanText(value) {
    if (!value) return '';
    var doc;
    try {
      doc = new DOMParser().parseFromString('<div>' + value + '</div>', 'text/html');
      value = doc.body ? doc.body.textContent : value;
    } catch (e) {}
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function durationToSeconds(value) {
    if (!value) return null;
    value = String(value).trim();
    if (/^\d+$/.test(value)) return Number(value);
    var parts = value.split(':').map(Number);
    if (parts.some(function (n) { return !isFinite(n); })) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  function isoDate(value) {
    if (!value) return '';
    var t = Date.parse(value);
    return isFinite(t) ? new Date(t).toISOString() : value;
  }

  function hashString(value) {
    var str = String(value || '');
    var h = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  function findImage(node) {
    return attrOf(node, ['itunes:image'], 'href') ||
      attrOf(node, ['media:thumbnail'], 'url') ||
      attrOf(node, ['media:content'], 'url') ||
      textOf(node, ['url']);
  }

  function findAudio(item) {
    var enclosures = item.getElementsByTagName('enclosure');
    for (var i = 0; i < enclosures.length; i += 1) {
      var url = enclosures[i].getAttribute('url') || '';
      var type = (enclosures[i].getAttribute('type') || '').toLowerCase();
      if (url && (!type || type.indexOf('audio/') === 0)) return url.trim();
    }

    var media = item.getElementsByTagName('media:content');
    for (var j = 0; j < media.length; j += 1) {
      var mediaUrl = media[j].getAttribute('url') || '';
      var mediaType = (media[j].getAttribute('type') || '').toLowerCase();
      var medium = (media[j].getAttribute('medium') || '').toLowerCase();
      if (mediaUrl && (mediaType.indexOf('audio/') === 0 || medium === 'audio')) return mediaUrl.trim();
    }

    var links = item.getElementsByTagName('link');
    for (var k = 0; k < links.length; k += 1) {
      var rel = (links[k].getAttribute('rel') || '').toLowerCase();
      var href = links[k].getAttribute('href') || '';
      var linkType = (links[k].getAttribute('type') || '').toLowerCase();
      if (href && (rel === 'enclosure' || linkType.indexOf('audio/') === 0)) return href.trim();
    }
    return '';
  }

  function parseFeed(xmlText, feedUrl, meta) {
    var xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('RSS inválido');

    var channel = xml.getElementsByTagName('channel')[0] || xml.documentElement;
    var entries = Array.prototype.slice.call(xml.getElementsByTagName('item'));
    if (!entries.length) entries = Array.prototype.slice.call(xml.getElementsByTagName('entry'));

    var feedImage = findImage(channel) || (meta && meta.image) || '';
    var episodes = [];

    for (var i = 0; i < entries.length; i += 1) {
      var item = entries[i];
      var audio = findAudio(item);
      if (!audio) continue;

      var title = textOf(item, ['title']) || 'Episodio';
      var description = textOf(item, ['description', 'content:encoded', 'summary', 'content']);
      var publishedAt = isoDate(textOf(item, ['pubDate', 'published', 'updated', 'dc:date']));
      var duration = durationToSeconds(textOf(item, ['itunes:duration']));
      var link = textOf(item, ['link']);
      if (!link) {
        var linkNodes = item.getElementsByTagName('link');
        if (linkNodes[0]) link = linkNodes[0].getAttribute('href') || '';
      }
      var guid = textOf(item, ['guid', 'id']) || link || audio || (title + publishedAt);
      var image = findImage(item) || feedImage;

      episodes.push({
        id: 'rss-' + hashString(guid),
        title: title,
        description: description,
        publishedAt: publishedAt,
        duration: duration,
        audio: audio,
        image: image,
        link: link
      });
    }

    episodes.sort(function (a, b) {
      return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    });

    var title = textOf(channel, ['title']) || (meta && meta.name) || 'Podcast';
    var author = textOf(channel, ['itunes:author', 'author']) || (meta && meta.author) || 'Podcast';
    var description = textOf(channel, ['description', 'subtitle']) || (meta && meta.description) || '';
    var site = textOf(channel, ['link']) || (meta && meta.site) || '';

    return {
      id: meta && meta.id,
      appleCollectionId: meta && meta.appleCollectionId,
      sourceType: meta && meta.sourceType,
      name: title,
      author: author,
      description: description,
      image: feedImage,
      site: site,
      feed: feedUrl,
      episodes: episodes,
      episodeCount: episodes.length,
      latestPublishedAt: episodes.length ? episodes[0].publishedAt : ''
    };
  }

  async function load(feedUrl, meta, options) {
    options = options || {};
    if (!feedUrl) throw new Error('Podcast sin RSS');
    var maxAge = Number(options.maxAge || DEFAULT_MAX_AGE);
    var cached = await cacheGet(feedUrl);

    if (!options.force && cached && cached.show && Date.now() - Number(cached.updatedAt || 0) < maxAge) {
      return cached.show;
    }

    try {
      var text = await fetchFeedText(feedUrl);
      var show = parseFeed(text, feedUrl, meta || {});
      await cachePut(feedUrl, show);
      return show;
    } catch (error) {
      if (cached && cached.show) return cached.show;
      throw error;
    }
  }

  window.PodcastFeed = {
    load: load,
    parseFeed: parseFeed
  };
})();