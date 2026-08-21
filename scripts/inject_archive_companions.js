#!/usr/bin/env node
"use strict";

/**
 * Insert dated Wayback companions beside live citation <a> tags.
 * Reads docs/source-archives.json. Idempotent.
 *
 *   node scripts/inject_archive_companions.js
 */

var fs = require("fs");
var path = require("path");
var archives = require("../assets/source-archives.js");

var root = path.join(__dirname, "..");
var catalog = JSON.parse(fs.readFileSync(path.join(root, "docs", "source-archives.json"), "utf8"));

fs.readdirSync(root)
  .filter(function (name) {
    return name.endsWith(".html");
  })
  .forEach(function (name) {
    var file = path.join(root, name);
    var raw = fs.readFileSync(file, "utf8");
    var result = archives.injectIntoHtml(raw, catalog);
    if (result.added) {
      fs.writeFileSync(file, result.html);
    }
    process.stdout.write(name + ": +" + result.added + "\n");
  });
