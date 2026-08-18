/**
 * Wayback Machine companions for cited sources.
 * Catalog: docs/source-archives.json (fetched; do not inline a second copy).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SourceArchives = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_JSON_URL = "docs/source-archives.json";
  var FILE_FETCH_HINT =
    "Serve the site over http://localhost (file:// cannot read the archive catalog).";
  var MONTH_LABELS = [
    "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
    "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
  ];
  var SKIP_HOSTS = {
    "crossvilleprivacy.org": true,
    "www.crossvilleprivacy.org": true,
    "web.archive.org": true,
    "archive.org": true,
    "www.archive.org": true,
    "facebook.com": true,
    "www.facebook.com": true,
    "twitter.com": true,
    "www.twitter.com": true,
    "x.com": true,
    "t.co": true,
  };

  function hostOf(href) {
    try {
      return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
    } catch (err) {
      return "";
    }
  }

  function shouldArchiveUrl(href) {
    var raw = String(href || "").trim();
    var url;
    var host;
    var path;
    if (!/^https?:\/\//i.test(raw)) {
      return false;
    }
    try {
      url = new URL(raw);
    } catch (err) {
      return false;
    }
    host = (url.hostname || "").toLowerCase();
    path = String(url.pathname || "");
    if (SKIP_HOSTS[host]) {
      return false;
    }
    if (host === "i.ytimg.com" || host === "img.youtube.com") {
      return false;
    }
    if (host === "google.com" || host === "www.google.com" || /\.google\.com$/i.test(host)) {
      return false;
    }
    if (/\/intent\//.test(path) || /\/sharer/.test(path)) {
      return false;
    }
    return true;
  }

  function normalizeUrl(href) {
    var url;
    try {
      url = new URL(String(href || "").trim());
    } catch (err) {
      return "";
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    if (url.pathname.length > 1 && url.pathname.charAt(url.pathname.length - 1) === "/") {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  }

  function formatArchiveLabel(stamp) {
    var raw = String(stamp || "");
    if (!/^\d{14}$/.test(raw)) {
      return "";
    }
    var month = Number(raw.slice(4, 6));
    var day = Number(raw.slice(6, 8));
    var year = raw.slice(0, 4);
    var monthLabel = MONTH_LABELS[month - 1];
    if (!monthLabel || !day) {
      return "";
    }
    return monthLabel + " " + day + ", " + year;
  }

  function isoFromTimestamp(stamp) {
    var raw = String(stamp || "");
    if (!/^\d{14}$/.test(raw)) {
      return "";
    }
    return (
      raw.slice(0, 4) +
      "-" +
      raw.slice(4, 6) +
      "-" +
      raw.slice(6, 8) +
      "T" +
      raw.slice(8, 10) +
      ":" +
      raw.slice(10, 12) +
      ":" +
      raw.slice(12, 14) +
      "Z"
    );
  }

  function waybackUrl(liveUrl, stamp) {
    var live = String(liveUrl || "").trim();
    var ts = String(stamp || "").trim();
    if (!live || !/^\d{14}$/.test(ts)) {
      return "";
    }
    return "https://web.archive.org/web/" + ts + "/" + live;
  }

  function httpsWayback(url) {
    return String(url || "").replace(/^http:\/\/web\.archive\.org/i, "https://web.archive.org");
  }

  function parseAvailability(liveUrl, payload) {
    var closest = payload && payload.archived_snapshots && payload.archived_snapshots.closest;
    var stamp;
    var snap;
    if (!closest || closest.available === false) {
      return null;
    }
    stamp = String(closest.timestamp || "").trim();
    snap = httpsWayback(closest.url || "");
    if (!/^\d{14}$/.test(stamp)) {
      var match = snap.match(/\/web\/(\d{14})\//);
      stamp = match ? match[1] : "";
    }
    if (!stamp) {
      return null;
    }
    return {
      url: liveUrl,
      wayback: snap || waybackUrl(liveUrl, stamp),
      timestamp: stamp,
      captured: isoFromTimestamp(stamp),
      method: "existing",
    };
  }

  function lookupRecord(catalog, href) {
    var map = (catalog && catalog.archives) || {};
    var raw = String(href || "").trim();
    var key = normalizeUrl(raw);
    if (map[raw]) {
      return map[raw];
    }
    if (key && map[key]) {
      return map[key];
    }
    if (key) {
      var withSlash = key.charAt(key.length - 1) === "/" ? key : key + "/";
      var noSlash = key.charAt(key.length - 1) === "/" ? key.slice(0, -1) : key;
      if (map[withSlash]) {
        return map[withSlash];
      }
      if (map[noSlash]) {
        return map[noSlash];
      }
    }
    return null;
  }

  function archiveCompanion(rec) {
    if (!rec || !rec.wayback || !rec.timestamp) {
      return null;
    }
    var label = formatArchiveLabel(rec.timestamp);
    if (!label) {
      return null;
    }
    return {
      href: rec.wayback,
      label: "archived " + label,
      datetime: rec.captured || isoFromTimestamp(rec.timestamp),
    };
  }

  function classOf(node) {
    if (!node) {
      return "";
    }
    if (node.getAttribute) {
      return String(node.getAttribute("class") || node.className || "");
    }
    return String(node.className || "");
  }

  function isCardLink(a) {
    var own;
    var parent;
    if (!a) {
      return false;
    }
    own = classOf(a);
    parent = classOf(a.parentNode);
    if (/(?:^|\s)proof-strip(?:\s|$)/.test(parent)) {
      return true;
    }
    if (/(?:^|\s)(tn-glance-card|tn-glance-grid)(?:\s|$)/.test(own + " " + parent)) {
      return true;
    }
    if (a.querySelector && a.querySelector(".label, .title, .meta, .kicker, .tn-glance-label")) {
      return true;
    }
    return false;
  }

  function decorateLink(doc, a, catalog) {
    var rec;
    var companion;
    var wrap;
    var time;
    if (!doc || !a || a.getAttribute("data-archive-linked")) {
      return false;
    }
    if ((a.getAttribute("class") || "").indexOf("source-archive") !== -1) {
      return false;
    }
    if (a.getAttribute("data-archive-skip")) {
      a.setAttribute("data-archive-linked", "1");
      return false;
    }
    if (isCardLink(a)) {
      a.setAttribute("data-archive-linked", "1");
      return false;
    }
    rec = lookupRecord(catalog, a.getAttribute("href") || a.href || "");
    companion = archiveCompanion(rec);
    if (!companion) {
      return false;
    }
    a.setAttribute("data-archive-linked", "1");
    wrap = doc.createElement("a");
    wrap.className = "source-archive";
    wrap.href = companion.href;
    wrap.target = "_blank";
    wrap.rel = "noopener";
    wrap.setAttribute("title", "Wayback Machine snapshot");
    time = doc.createElement("time");
    time.setAttribute("datetime", companion.datetime);
    time.textContent = companion.label;
    wrap.appendChild(time);
    if (a.parentNode) {
      var next = a.nextSibling;
      var space = doc.createTextNode(" ");
      if (next) {
        a.parentNode.insertBefore(space, next);
        a.parentNode.insertBefore(wrap, next);
      } else {
        a.parentNode.appendChild(space);
        a.parentNode.appendChild(wrap);
      }
    }
    return true;
  }

  function decorate(doc, catalog, root) {
    var scope = root || doc;
    var links;
    var i;
    if (!scope || !scope.querySelectorAll) {
      return 0;
    }
    links = scope.querySelectorAll("a[href]");
    for (i = 0; i < links.length; i += 1) {
      decorateLink(doc, links[i], catalog);
    }
    return links.length;
  }

  function initSourceArchives(doc, options) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    options = options || {};
    if (!doc) {
      return null;
    }
    var jsonUrl = options.jsonUrl || DEFAULT_JSON_URL;
    var fetchFn = Object.prototype.hasOwnProperty.call(options, "fetch")
      ? options.fetch
      : typeof fetch === "function"
        ? fetch
        : null;
    var catalog = options.catalog || null;

    function apply(data) {
      catalog = data;
      decorate(doc, catalog, doc);
      if (doc.body && typeof MutationObserver === "function") {
        var observer = new MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            var n;
            for (n = 0; n < mutation.addedNodes.length; n += 1) {
              var node = mutation.addedNodes[n];
              if (!node) {
                continue;
              }
              if (node.nodeType === 1 && node.tagName === "A") {
                decorateLink(doc, node, catalog);
              } else if (node.querySelectorAll) {
                decorate(doc, catalog, node);
              }
            }
          });
        });
        observer.observe(doc.body, { childList: true, subtree: true });
      }
    }

    if (catalog) {
      apply(catalog);
      return { catalog: catalog };
    }
    if (!fetchFn) {
      return null;
    }
    fetchFn(jsonUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then(apply)
      .catch(function () {
        return null;
      });
    return { catalog: catalog };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        initSourceArchives(document);
      });
    } else {
      initSourceArchives(document);
    }
  }

  return {
    DEFAULT_JSON_URL: DEFAULT_JSON_URL,
    FILE_FETCH_HINT: FILE_FETCH_HINT,
    shouldArchiveUrl: shouldArchiveUrl,
    normalizeUrl: normalizeUrl,
    formatArchiveLabel: formatArchiveLabel,
    isoFromTimestamp: isoFromTimestamp,
    waybackUrl: waybackUrl,
    parseAvailability: parseAvailability,
    lookupRecord: lookupRecord,
    archiveCompanion: archiveCompanion,
    isCardLink: isCardLink,
    decorateLink: decorateLink,
    decorate: decorate,
    initSourceArchives: initSourceArchives,
  };
});
