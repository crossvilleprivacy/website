/**
 * Archive companions for cited sources (Wayback first, archive.today fallback).
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
    "archive.today": true,
    "archive.ph": true,
    "archive.is": true,
    "archive.md": true,
    "archive.vn": true,
    "archive.fo": true,
    "archive.li": true,
  };

  var ARCHIVE_TODAY_HOSTS = {
    "archive.today": true,
    "archive.ph": true,
    "archive.is": true,
    "archive.md": true,
    "archive.vn": true,
    "archive.fo": true,
    "archive.li": true,
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
      if (host !== "patents.google.com") {
        return false;
      }
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

  function formatCapturedLabel(iso) {
    var match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    var monthLabel;
    var day;
    if (!match) {
      return "";
    }
    monthLabel = MONTH_LABELS[Number(match[2]) - 1];
    day = Number(match[3]);
    if (!monthLabel || !day) {
      return "";
    }
    return monthLabel + " " + day + ", " + match[1];
  }

  function parseArchiveTodayHref(href) {
    var url;
    var host;
    var path;
    var dated;
    var shortId;
    try {
      url = new URL(String(href || "").trim());
    } catch (err) {
      return null;
    }
    host = (url.hostname || "").replace(/^www\./i, "").toLowerCase();
    if (!ARCHIVE_TODAY_HOSTS[host]) {
      return null;
    }
    path = String(url.pathname || "").replace(/\/+$/, "");
    if (/^\/(newest|submit|wip|timemap|timegate)\b/i.test(path)) {
      return null;
    }
    dated = path.match(/^\/(\d{14})(?:\/|$)/);
    shortId = path.match(/^\/([A-Za-z0-9_-]{4,})$/);
    if (!dated && !shortId) {
      return null;
    }
    url.hash = "";
    return {
      href: url.toString(),
      timestamp: dated ? dated[1] : "",
      id: dated ? dated[1] : shortId[1],
    };
  }

  function hasUsableArchive(rec) {
    if (!rec) {
      return false;
    }
    if (rec.wayback && rec.timestamp) {
      return true;
    }
    if (rec.archive_today) {
      return true;
    }
    return false;
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
    var label;
    if (!rec) {
      return null;
    }
    if (rec.wayback && rec.timestamp) {
      label = formatArchiveLabel(rec.timestamp);
      if (label) {
        return {
          href: rec.wayback,
          label: "archived " + label,
          datetime: rec.captured || isoFromTimestamp(rec.timestamp),
          title: "Wayback Machine snapshot",
        };
      }
    }
    if (rec.archive_today) {
      label = formatArchiveLabel(rec.timestamp) || formatCapturedLabel(rec.captured);
      return {
        href: rec.archive_today,
        label: label ? "archived " + label : "archived on archive.today",
        datetime: rec.captured || isoFromTimestamp(rec.timestamp) || "",
        title: "archive.today snapshot",
      };
    }
    return null;
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

  var SKIP_INJECT_CLASS =
    /(?:^|\s)(?:btn(?:-[\w-]+)?|ally-card|tn-glance-card|tn-glance-grid|council-meetings-place|tap-mail)(?:\s|$)/;

  function hasExistingArchiveCompanion(a) {
    var el;
    if (!a) {
      return false;
    }
    el = a.nextElementSibling || null;
    if (!el) {
      return false;
    }
    if (classOf(el).indexOf("source-archive") !== -1) {
      return true;
    }
    var href = String((el.getAttribute && el.getAttribute("href")) || el.href || "");
    if (/web\.archive\.org\/web\/\d{14}\//.test(href)) {
      return true;
    }
    return Boolean(parseArchiveTodayHref(href));
  }

  function archiveCompanionHtml(rec) {
    var companion = archiveCompanion(rec);
    var title;
    if (!companion) {
      return "";
    }
    title = companion.title || "Wayback Machine snapshot";
    return (
      ' <a class="source-archive" href="' +
      String(companion.href).replace(/&/g, "&amp;") +
      '" target="_blank" rel="noopener" title="' +
      title +
      '"><time datetime="' +
      companion.datetime +
      '">' +
      companion.label +
      "</time></a>"
    );
  }

  function trailingHasArchiveCompanion(after) {
    var slice = String(after || "").replace(/^\s+/, "");
    if (/^<a\b[^>]*\bsource-archive\b/i.test(slice)) {
      return true;
    }
    if (/^(?:·|&middot;|&#183;)\s*<a\b[^>]*web\.archive\.org\/web\/\d{14}\//i.test(slice)) {
      return true;
    }
    if (/^<a\b[^>]*web\.archive\.org\/web\/\d{14}\//i.test(slice)) {
      return true;
    }
    if (/^<a\b[^>]*https?:\/\/archive\.(?:today|ph|is|md|vn)\//i.test(slice)) {
      return true;
    }
    return false;
  }

  function hrefFromAnchorAttrs(attrs) {
    var match = String(attrs || "").match(/\bhref\s*=\s*(["'])([\s\S]*?)\1/i);
    if (!match) {
      return "";
    }
    return match[2].replace(/&amp;/g, "&");
  }

  function classFromAnchorAttrs(attrs) {
    var match = String(attrs || "").match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
    return match ? match[2] : "";
  }

  function precedingSkipsInject(before) {
    var tail = String(before || "").slice(-1200);
    var lower = tail.toLowerCase();
    var proof = lower.lastIndexOf("proof-strip");
    if (proof !== -1 && lower.indexOf("</div>", proof) === -1) {
      return true;
    }
    var glance = lower.lastIndexOf("tn-glance-grid");
    if (glance !== -1 && lower.indexOf("</div>", glance) === -1) {
      return true;
    }
    var nav = lower.lastIndexOf("<nav");
    if (nav !== -1 && lower.indexOf("</nav>", nav) === -1) {
      return true;
    }
    return false;
  }

  function injectIntoHtml(html, catalog) {
    var A_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    var source = String(html || "");
    var out = "";
    var last = 0;
    var added = 0;
    var match;
    var attrs;
    var href;
    var cls;
    var rec;
    var markup;
    while ((match = A_RE.exec(source))) {
      out += source.slice(last, match.index);
      out += match[0];
      last = match.index + match[0].length;
      attrs = match[1] || "";
      href = hrefFromAnchorAttrs(attrs);
      cls = classFromAnchorAttrs(attrs);
      if (!shouldArchiveUrl(href)) {
        continue;
      }
      if (/\bsource-archive\b/.test(cls) || /\bdata-archive-skip\b/.test(attrs)) {
        continue;
      }
      if (SKIP_INJECT_CLASS.test(cls)) {
        continue;
      }
      if (precedingSkipsInject(source.slice(0, match.index))) {
        continue;
      }
      if (trailingHasArchiveCompanion(source.slice(last))) {
        continue;
      }
      rec = lookupRecord(catalog, href);
      markup = archiveCompanionHtml(rec);
      if (!markup) {
        continue;
      }
      out += markup;
      added += 1;
    }
    out += source.slice(last);
    return { html: out, added: added };
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
    if (isCardLink(a) || hasExistingArchiveCompanion(a)) {
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
    wrap.setAttribute("title", companion.title || "Wayback Machine snapshot");
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
      if (typeof CrossvilleCampaign !== "undefined" && typeof CrossvilleCampaign.notifyLayout === "function") {
        CrossvilleCampaign.notifyLayout(doc);
      }
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
    formatCapturedLabel: formatCapturedLabel,
    isoFromTimestamp: isoFromTimestamp,
    waybackUrl: waybackUrl,
    parseAvailability: parseAvailability,
    parseArchiveTodayHref: parseArchiveTodayHref,
    hasUsableArchive: hasUsableArchive,
    lookupRecord: lookupRecord,
    archiveCompanion: archiveCompanion,
    archiveCompanionHtml: archiveCompanionHtml,
    hasExistingArchiveCompanion: hasExistingArchiveCompanion,
    injectIntoHtml: injectIntoHtml,
    isCardLink: isCardLink,
    decorateLink: decorateLink,
    decorate: decorate,
    initSourceArchives: initSourceArchives,
  };
});
