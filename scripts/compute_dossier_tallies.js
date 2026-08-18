#!/usr/bin/env node
"use strict";

/**
 * Write docs/dossier-tallies.json from the three dossier JSON files.
 * Run after editing a dossier: node scripts/compute_dossier_tallies.js
 */

var fs = require("fs");
var path = require("path");
var tallies = require("../assets/dossier-tallies.js");

var root = path.join(__dirname, "..");
var docs = path.join(root, "docs");
var out = path.join(docs, "dossier-tallies.json");

var misuse = JSON.parse(
  fs.readFileSync(path.join(docs, "Flock_Safety_ALPR_Misuse_Master_Database.json"), "utf8")
);
var cancel = JSON.parse(
  fs.readFileSync(path.join(docs, "Flock_Municipal_Cancellations_Database.json"), "utf8")
);
var wrongful = JSON.parse(
  fs.readFileSync(path.join(docs, "AI_Wrongful_Enforcement_Database.json"), "utf8")
);

var payload = tallies.computeTallies(misuse, cancel, wrongful);
payload.source_files = {
  misuse: "Flock_Safety_ALPR_Misuse_Master_Database.json",
  cancel: "Flock_Municipal_Cancellations_Database.json",
  wrongful: "AI_Wrongful_Enforcement_Database.json",
};

fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
process.stdout.write("Wrote " + path.relative(root, out) + "\n");
