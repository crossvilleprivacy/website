#!/usr/bin/env node
"use strict";

/**
 * Add Wayback companions to structured cite items (home news cards and
 * <p class="sources"> lines) that have a snapshot in docs/source-archives.json
 * but no archive link yet. Only touches items that are missing one.
 *
 *   node scripts/fill_structured_cite_archives.js          # write
 *   node scripts/fill_structured_cite_archives.js --check  # list gaps, exit 1 if any
 */

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var catalog = JSON.parse(fs.readFileSync(path.join(root, "docs", "source-archives.json"), "utf8")).archives || {};
var check = process.argv.indexOf("--check") !== -1;
var MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

function record(href) {
  var key = String(href).replace(/&amp;/g, "&").replace(/\/$/, "");
  var rec = catalog[key] || catalog[key + "/"];
  return rec && (rec.wayback || rec.archive_today) ? rec : null;
}

function label(iso) {
  var d = new Date(iso);
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
}

function companion(rec) {
  var href = rec.wayback || rec.archive_today;
  var title = rec.wayback ? "Wayback Machine snapshot" : "archive.today snapshot";
  return '<a class="source-archive" href="' + href + '" target="_blank" rel="noopener" title="' + title + '"><time datetime="' + rec.captured + '">';
}

var ITEM_RE = /<span class="source-cite-item"><a href="(https?:\/\/[^"]+)"([^>]*)>([^<]*)<\/a><\/span>/g;
var gaps = 0;

fs.readdirSync(root).filter(function (n) { return n.endsWith(".html"); }).forEach(function (name) {
  var file = path.join(root, name);
  var html = fs.readFileSync(file, "utf8");
  var added = 0;
  var out = html.replace(ITEM_RE, function (m, href, attrs, text) {
    var rec = record(href);
    if (!rec || !rec.captured) {
      return m;
    }
    gaps += 1;
    if (check) {
      process.stdout.write(name + ": " + href + "\n");
      return m;
    }
    added += 1;
    var open = '<span class="source-cite-item"><a href="' + href + '"' + attrs + ">" + text + "</a> ";
    if (/news-cite-outlet/.test(attrs)) {
      return open + '<span class="source-cite-archived">(' + companion(rec) + "Archived on " + label(rec.captured) + "</time></a>)</span></span>";
    }
    return open + companion(rec) + "archived " + label(rec.captured) + "</time></a></span>";
  });
  if (!check && added) {
    fs.writeFileSync(file, out);
  }
  if (!check) {
    process.stdout.write(name + ": +" + added + "\n");
  }
});

if (check && gaps) {
  process.stdout.write(gaps + " structured cite(s) missing an archive link\n");
  process.exit(1);
}
