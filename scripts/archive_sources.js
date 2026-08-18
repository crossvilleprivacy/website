#!/usr/bin/env node
"use strict";

/**
 * Collect cited http(s) URLs and snapshot them on the Wayback Machine.
 * Writes docs/source-archives.json (resume-safe).
 *
 *   node scripts/archive_sources.js
 *   node scripts/archive_sources.js --save-missing
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
var AVAIL_URL = "https://archive.org/wayback/available?url=";
var SAVE_PREFIX = "https://web.archive.org/save/";
var HREF_RE = /https?:\/\/[^\s"'<>]+/g;

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
    return { title: "Wayback Machine snapshots of cited sources", as_of: "", count: 0, archives: {} };
  }
  return JSON.parse(fs.readFileSync(outPath, "utf8"));
}

function writeCatalog(catalog, count) {
  var keys = Object.keys(catalog.archives || {}).sort();
  catalog.title = "Wayback Machine snapshots of cited sources";
  catalog.as_of = new Date().toISOString().slice(0, 10);
  catalog.count = keys.length;
  catalog.source_count = count || catalog.source_count || keys.length;
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

async function fetchCdx(liveUrl, fetchFn) {
  var cdx =
    "https://web.archive.org/cdx/search/cdx?url=" +
    encodeURIComponent(liveUrl) +
    "&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&limit=1&fastLatest=true";
  var res = await fetchFn(cdx, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
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

async function fetchAvailability(liveUrl, fetchFn) {
  try {
    var cdx = await fetchCdx(liveUrl, fetchFn);
    if (cdx) {
      return cdx;
    }
  } catch (err) {
    cdx = null;
  }
  try {
    var res = await fetchFn(AVAIL_URL + encodeURIComponent(liveUrl), {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return null;
    }
    var payload = await res.json();
    return archives.parseAvailability(liveUrl, payload);
  } catch (err) {
    return null;
  }
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
  if (opts && opts.save) {
    try {
      rec = await saveSnapshot(item.url, fetchFn);
      if (rec) {
        return rec;
      }
    } catch (err) {
      rec = null;
    }
  }
  try {
    rec = await fetchAvailability(item.url, fetchFn);
    if (rec) {
      return rec;
    }
  } catch (err) {
    rec = null;
  }
  if (opts && opts.saveMissing) {
    rec = await saveSnapshot(item.url, fetchFn);
  }
  return rec;
}

async function main(argv) {
  var args = argv || process.argv.slice(2);
  var saveAll = args.indexOf("--save-all") !== -1;
  var saveMissing = args.indexOf("--save-missing") !== -1 || saveAll;
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
  catalog.source_count = items.length;

  var pending = items.filter(function (item) {
    var existing = catalog.archives[item.key];
    if (!existing || !existing.timestamp) {
      return true;
    }
    if (saveAll) {
      return true;
    }
    return false;
  });

  process.stdout.write(
    "Cited sources: " + items.length + ". Need snapshots: " + pending.length + ".\n"
  );

  var done = 0;
  var failed = 0;
  var concurrent = saveMissing || oneUrl ? 1 : 6;
  var slow = saveMissing || saveAll || oneUrl;
  await mapPool(pending, concurrent, async function (item) {
    try {
      var rec = await snapshotOne(item, fetchFn, {
        save: saveAll,
        saveMissing: saveMissing || Boolean(oneUrl),
      });
      if (!rec || !rec.timestamp) {
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
      await sleep(1200);
    }
  });

  writeCatalog(catalog, items.length);
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
  snapshotOne: snapshotOne,
};
