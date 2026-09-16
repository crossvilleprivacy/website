#!/usr/bin/env node
"use strict";

/**
 * Collect cited http(s) URLs and snapshot them (Wayback first, archive.today fallback).
 * Writes docs/source-archives.json (resume-safe).
 *
 *   node scripts/archive_sources.js
 *   node scripts/archive_sources.js --save-missing
 *   node scripts/archive_sources.js --save-missing --skip-wayback-save
 *   node scripts/archive_sources.js --archive-today-only
 *   node scripts/archive_sources.js --save-missing --skip-archive-today --skip-wayback-lookup
 *   node scripts/archive_sources.js --url https://example.com/story
 */

var dns = require("dns");
var fs = require("fs");
var path = require("path");
var archives = require("../assets/source-archives.js");

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

var root = path.join(__dirname, "..");
var outPath = path.join(root, "docs", "source-archives.json");
var UA = "CrossvillePrivacy.org source-archives (https://crossvilleprivacy.org/)";
var ARCHIVE_TODAY_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var AVAIL_URL = "https://archive.org/wayback/available?url=";
var SAVE_PREFIX = "https://web.archive.org/save/";
var ARCHIVE_TODAY = "https://archive.today";
var HREF_RE = /https?:\/\/[^\s"'<>]+/g;
var archiveTodayCookie = "";

function cleanHref(raw) {
  return String(raw || "").trim().replace(/[).,;:\]]+$/g, "").replace(/&amp;/g, "&");
}

function collectFromText(text, found) {
  var match;
  var href;
  var key;
  HREF_RE.lastIndex = 0;
  while ((match = HREF_RE.exec(String(text || "")))) {
    href = cleanHref(match[0]);
    if (!archives.shouldArchiveUrl(href)) {
      continue;
    }
    key = archives.normalizeUrl(href) || href;
    if (!found[key]) {
      found[key] = href;
    }
  }
}

function collectUrls() {
  var found = {};
  var htmlFiles = fs.readdirSync(root).filter(function (name) {
    return name.endsWith(".html");
  });
  htmlFiles.forEach(function (name) {
    collectFromText(fs.readFileSync(path.join(root, name), "utf8"), found);
  });
  fs.readdirSync(path.join(root, "docs")).forEach(function (name) {
    if (!name.endsWith(".json") || name === "source-archives.json") {
      return;
    }
    collectFromText(fs.readFileSync(path.join(root, "docs", name), "utf8"), found);
  });
  return Object.keys(found)
    .sort()
    .map(function (key) {
      return { key: key, url: found[key] };
    });
}

function loadCatalog() {
  if (!fs.existsSync(outPath)) {
    return { title: "Archive snapshots of cited sources (Wayback Machine and archive.today)", as_of: "", count: 0, archives: {} };
  }
  return JSON.parse(fs.readFileSync(outPath, "utf8"));
}

function writeCatalog(catalog, count) {
  var keys = Object.keys(catalog.archives || {}).sort();
  catalog.title = "Archive snapshots of cited sources (Wayback Machine and archive.today)";
  catalog.as_of = new Date().toISOString().slice(0, 10);
  catalog.count = keys.length;
  var nextCount = count || catalog.source_count || keys.length;
  if (nextCount < keys.length) {
    nextCount = keys.length;
  }
  catalog.source_count = nextCount;
  var payload = {
    title: catalog.title,
    as_of: catalog.as_of,
    count: catalog.count,
    source_count: catalog.source_count,
    archives: {},
  };
  keys.forEach(function (key) {
    payload.archives[key] = catalog.archives[key];
  });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function mapPool(items, limit, fn) {
  var i = 0;
  async function worker() {
    while (i < items.length) {
      var idx = i;
      i += 1;
      await fn(items[idx], idx);
    }
  }
  var n = Math.max(1, Math.min(limit, items.length || 1));
  var workers = [];
  var w;
  for (w = 0; w < n; w += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

function recordFromTimestamp(liveUrl, stamp, method, wayback) {
  return {
    url: liveUrl,
    wayback: wayback || archives.waybackUrl(liveUrl, stamp),
    timestamp: stamp,
    captured: archives.isoFromTimestamp(stamp),
    method: method,
  };
}

function timestampNow() {
  var d = new Date();
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function header(res, name) {
  if (!res || !res.headers || typeof res.headers.get !== "function") {
    return "";
  }
  return res.headers.get(name) || "";
}

function rememberArchiveTodayCookie(res) {
  var raw = header(res, "set-cookie");
  var match = String(raw).match(/qki=([^;]+)/);
  if (match) {
    archiveTodayCookie = "qki=" + match[1];
  }
}

function archiveTodayHeaders() {
  var headers = {
    "User-Agent": ARCHIVE_TODAY_UA,
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  };
  if (archiveTodayCookie) {
    headers.Cookie = archiveTodayCookie;
  }
  return headers;
}

function recordFromArchiveToday(liveUrl, parsed) {
  var stamp = (parsed && parsed.timestamp) || timestampNow();
  return {
    url: liveUrl,
    archive_today: parsed.href,
    timestamp: stamp,
    captured: archives.isoFromTimestamp(stamp),
    method: "archive.today",
  };
}

function mergeArchiveRecords(waybackRec, todayRec) {
  var rec = {};
  if (waybackRec) {
    Object.keys(waybackRec).forEach(function (key) {
      rec[key] = waybackRec[key];
    });
  }
  if (!todayRec) {
    return rec;
  }
  rec.url = todayRec.url || rec.url;
  rec.archive_today = todayRec.archive_today;
  if (!rec.timestamp) {
    rec.timestamp = todayRec.timestamp;
  }
  if (!rec.captured) {
    rec.captured = todayRec.captured;
  }
  if (!rec.wayback) {
    rec.method = todayRec.method || "archive.today";
  }
  return rec;
}

function archiveTodayLookupUrls(liveUrl) {
  var urls = [];
  function add(href) {
    var trimmed = String(href || "").trim();
    if (trimmed && urls.indexOf(trimmed) === -1) {
      urls.push(trimmed);
    }
  }
  add(liveUrl);
  try {
    var url = new URL(liveUrl);
    if (url.pathname.length > 1 && /\/$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      add(url.toString());
    } else if (url.pathname !== "/") {
      url.pathname = url.pathname + "/";
      add(url.toString());
    }
    url = new URL(liveUrl);
    if (/^eu\./i.test(url.hostname)) {
      url.hostname = url.hostname.replace(/^eu\./i, "www.");
      add(url.toString());
    }
    url = new URL(liveUrl);
    if (url.hostname.replace(/^www\./i, "").toLowerCase() === "youtu.be") {
      var video = String(url.pathname || "").replace(/^\//, "").split("/")[0];
      if (video) {
        add("https://www.youtube.com/watch?v=" + video);
      }
    }
  } catch (err) {
    return urls;
  }
  return urls;
}

async function fetchArchiveTodayNewestOnce(liveUrl, fetchFn) {
  var probe = ARCHIVE_TODAY + "/newest/" + liveUrl;
  var wait = 2000;
  var attempt;
  var res;
  var loc;
  var parsed;
  for (attempt = 0; attempt < 4; attempt += 1) {
    res = await fetchFn(probe, {
      headers: archiveTodayHeaders(),
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    rememberArchiveTodayCookie(res);
    if (res.status !== 429) {
      loc = header(res, "location");
      parsed = archives.parseArchiveTodayHref(loc) || archives.parseArchiveTodayHref(res.url || "");
      if (!parsed) {
        return null;
      }
      return recordFromArchiveToday(liveUrl, parsed);
    }
    if (attempt === 1) {
      throw new Error("archive.today HTTP 429");
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 20000);
  }
  return null;
}

async function fetchArchiveTodayNewest(liveUrl, fetchFn) {
  var candidates = archiveTodayLookupUrls(liveUrl);
  var i;
  var rec;
  for (i = 0; i < candidates.length; i += 1) {
    rec = await fetchArchiveTodayNewestOnce(candidates[i], fetchFn);
    if (rec) {
      rec.url = liveUrl;
      return rec;
    }
    if (i < candidates.length - 1) {
      await sleep(800);
    }
  }
  return null;
}

async function submitArchiveToday(liveUrl, fetchFn) {
  var submit = ARCHIVE_TODAY + "/submit/?url=" + encodeURIComponent(liveUrl);
  var res = await fetchFn(submit, {
    headers: archiveTodayHeaders(),
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  rememberArchiveTodayCookie(res);
  if (res.status === 429) {
    throw new Error("archive.today HTTP 429");
  }
  var loc = header(res, "location");
  var refresh = header(res, "refresh");
  var parsed = archives.parseArchiveTodayHref(loc);
  var wip;
  var body;
  var match;
  if (parsed) {
    return recordFromArchiveToday(liveUrl, parsed);
  }
  wip = String(loc || refresh || "").match(/\/wip\/([A-Za-z0-9_-]+)/);
  if (wip) {
    await sleep(8000);
    return fetchArchiveTodayNewest(liveUrl, fetchFn);
  }
  if (res.ok && typeof res.text === "function") {
    try {
      body = await res.text();
    } catch (err) {
      body = "";
    }
    match = String(body).match(/https?:\/\/archive\.(?:today|ph|is)\/(?:\d{14}\/[^\s"'<>]+|[A-Za-z0-9_-]{4,})/);
    parsed = archives.parseArchiveTodayHref(match && match[0]);
    if (parsed) {
      return recordFromArchiveToday(liveUrl, parsed);
    }
  }
  await sleep(5000);
  return fetchArchiveTodayNewest(liveUrl, fetchFn);
}

async function fetchCdx(liveUrl, fetchFn) {
  var cdx =
    "https://web.archive.org/cdx/search/cdx?url=" +
    encodeURIComponent(liveUrl) +
    "&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&limit=1&fastLatest=true";
  var res = await fetchFn(cdx, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error("cdx HTTP " + res.status);
  }
  var rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 2) {
    return null;
  }
  var row = rows[1];
  var stamp = String(row[0] || "");
  if (!/^\d{14}$/.test(stamp)) {
    return null;
  }
  return recordFromTimestamp(liveUrl, stamp, "existing");
}

async function fetchCalendarClosest(liveUrl, fetchFn) {
  var year = String(new Date().getUTCFullYear());
  var probe = "https://web.archive.org/web/" + year + "/" + liveUrl;
  var res = await fetchFn(probe, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  var loc = "";
  if (res.headers && typeof res.headers.get === "function") {
    loc = res.headers.get("location") || "";
  }
  var stamp = timestampFromWaybackHref(loc);
  if (!stamp) {
    var reason = "";
    if (res.headers && typeof res.headers.get === "function") {
      reason = res.headers.get("x-archive-redirect-reason") || "";
    }
    var match = String(reason).match(/(\d{14})/);
    stamp = match ? match[1] : "";
  }
  if (!stamp) {
    stamp = timestampFromWaybackHref(res.url || "");
  }
  if (!stamp) {
    return null;
  }
  var wayback = /web\.archive\.org\/web\/\d{14}\//.test(String(loc || res.url || ""))
    ? String(loc || res.url).replace(/^http:\/\//i, "https://")
    : archives.waybackUrl(liveUrl, stamp);
  return recordFromTimestamp(liveUrl, stamp, "existing", wayback);
}

async function fetchAvailability(liveUrl, fetchFn) {
  var aliases = archiveTodayLookupUrls(liveUrl);
  var i;
  var rec;
  for (i = 0; i < aliases.length; i += 1) {
    try {
      rec = await fetchCalendarClosest(aliases[i], fetchFn);
      if (rec && rec.wayback && rec.timestamp) {
        rec.url = liveUrl;
        return rec;
      }
    } catch (err) {
      rec = null;
    }
  }
  try {
    var avail = await fetchFn(AVAIL_URL + encodeURIComponent(liveUrl), {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (avail.ok) {
      var payload = await avail.json();
      var parsed = archives.parseAvailability(liveUrl, payload);
      if (parsed) {
        return parsed;
      }
    }
  } catch (err) {
    parsed = null;
  }
  try {
    rec = await fetchCdx(liveUrl, fetchFn);
    if (rec) {
      return rec;
    }
  } catch (err) {
    rec = null;
  }
  return null;
}

function timestampFromWaybackHref(href) {
  var match = String(href || "").match(/\/web\/(\d{14})\//);
  return match ? match[1] : "";
}

async function saveSnapshot(liveUrl, fetchFn) {
  var res = await fetchFn(SAVE_PREFIX + liveUrl, {
    headers: { "User-Agent": UA, Accept: "text/html,application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(45000),
  });
  var loc = "";
  if (res.headers && typeof res.headers.get === "function") {
    loc = res.headers.get("content-location") || res.headers.get("location") || "";
  }
  var finalUrl = res.url || loc;
  var stamp = timestampFromWaybackHref(finalUrl) || timestampFromWaybackHref(loc);
  if (!stamp && res.ok) {
    var body = "";
    try {
      body = await res.text();
    } catch (err) {
      body = "";
    }
    stamp = timestampFromWaybackHref(body);
    if (stamp) {
      var m = body.match(/https?:\/\/web\.archive\.org\/web\/\d{14}\/[^"'<\s]+/);
      finalUrl = m ? m[0] : archives.waybackUrl(liveUrl, stamp);
    }
  }
  if (!stamp) {
    throw new Error("save did not return a timestamp (HTTP " + (res.status || "?") + ")");
  }
  var wayback = /web\.archive\.org\/web\/\d{14}\//.test(String(finalUrl || loc))
    ? String(finalUrl || loc).replace(/^http:\/\//i, "https://")
    : archives.waybackUrl(liveUrl, stamp);
  return recordFromTimestamp(liveUrl, stamp, "save", wayback);
}

async function snapshotOne(item, fetchFn, opts) {
  var rec = null;
  var today = null;
  var todayError = "";
  opts = opts || {};
  if (opts.save && !opts.skipWaybackLookup) {
    try {
      rec = await saveSnapshot(item.url, fetchFn);
      if (archives.hasUsableArchive(rec)) {
        return rec;
      }
    } catch (err) {
      rec = null;
    }
  }
  if (!opts.skipWaybackLookup) {
    try {
      rec = await fetchAvailability(item.url, fetchFn);
      if (rec && rec.wayback && rec.timestamp) {
        return rec;
      }
    } catch (err) {
      rec = rec || null;
    }
  }
  if (!opts.skipArchiveToday) {
    try {
      today = await fetchArchiveTodayNewest(item.url, fetchFn);
      if (today) {
        return mergeArchiveRecords(rec, today);
      }
    } catch (err) {
      todayError = String((err && err.message) || err);
    }
  }
  if (opts.saveMissing && !opts.skipWaybackSave && !opts.save) {
    try {
      rec = await saveSnapshot(item.url, fetchFn);
      if (rec && rec.wayback && rec.timestamp) {
        return rec;
      }
    } catch (err) {
      rec = rec || null;
    }
  }
  if (!opts.skipArchiveToday && (opts.saveMissing || opts.submitArchiveToday) && todayError.indexOf("429") === -1) {
    try {
      today = await submitArchiveToday(item.url, fetchFn);
      if (today) {
        return mergeArchiveRecords(rec, today);
      }
    } catch (err) {
      today = null;
    }
  }
  return rec;
}

async function main(argv) {
  var args = argv || process.argv.slice(2);
  var saveAll = args.indexOf("--save-all") !== -1;
  var saveMissing = args.indexOf("--save-missing") !== -1 || saveAll;
  var skipWaybackSave = args.indexOf("--skip-wayback-save") !== -1;
  var archiveTodayOnly = args.indexOf("--archive-today-only") !== -1;
  var skipArchiveToday = args.indexOf("--skip-archive-today") !== -1;
  var skipWaybackLookup = args.indexOf("--skip-wayback-lookup") !== -1 || archiveTodayOnly;
  var urlFlag = args.indexOf("--url");
  var oneUrl = urlFlag !== -1 ? args[urlFlag + 1] : "";
  var fetchFn = global.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("Node fetch is required");
  }

  var items = oneUrl
    ? [{ key: archives.normalizeUrl(oneUrl) || oneUrl, url: oneUrl }]
    : collectUrls();
  var catalog = loadCatalog();
  catalog.archives = catalog.archives || {};
  if (!oneUrl) {
    catalog.source_count = items.length;
  }

  var pending = items.filter(function (item) {
    var existing = catalog.archives[item.key];
    if (saveAll) {
      return true;
    }
    return !archives.hasUsableArchive(existing);
  });

  process.stdout.write(
    "Cited sources: " + items.length + ". Need snapshots: " + pending.length + ".\n"
  );

  var done = 0;
  var failed = 0;
  var concurrent = saveMissing || oneUrl || archiveTodayOnly ? 1 : 6;
  var slow = saveMissing || saveAll || oneUrl || archiveTodayOnly;
  await mapPool(pending, concurrent, async function (item) {
    try {
      var rec = await snapshotOne(item, fetchFn, {
        save: saveAll,
        saveMissing: saveMissing || Boolean(oneUrl),
        skipWaybackSave: skipWaybackSave || archiveTodayOnly,
        skipWaybackLookup: skipWaybackLookup,
        skipArchiveToday: skipArchiveToday,
      });
      if (!archives.hasUsableArchive(rec)) {
        throw new Error("no snapshot");
      }
      rec.url = item.url;
      catalog.archives[item.key] = rec;
      done += 1;
    } catch (err) {
      failed += 1;
      process.stderr.write("fail " + item.url + " — " + (err && err.message) + "\n");
    }
    if ((done + failed) % 5 === 0 || done + failed === pending.length) {
      writeCatalog(catalog, items.length);
      process.stdout.write(
        "progress " + (done + failed) + "/" + pending.length + " (saved " + done + ", failed " + failed + ")\n"
      );
    }
    if (slow) {
      await sleep(2500);
    }
  });

  writeCatalog(catalog, oneUrl ? catalog.source_count : items.length);
  process.stdout.write(
    "Wrote " + path.relative(root, outPath) + " (" + catalog.count + " archives).\n"
  );
}

if (require.main === module) {
  main().catch(function (err) {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
}

module.exports = {
  collectUrls: collectUrls,
  collectFromText: collectFromText,
    fetchAvailability: fetchAvailability,
    fetchArchiveTodayNewest: fetchArchiveTodayNewest,
    archiveTodayLookupUrls: archiveTodayLookupUrls,
    snapshotOne: snapshotOne,
};
