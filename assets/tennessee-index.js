/**
 * Build the skinny Tennessee Flock / ALPR index from the three national
 * catalogs (State = TN) plus optional extras that are not catalog cases.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      typeof require === "function" ? require("./dossier-lookup.js") : root.DossierLookup,
      typeof require === "function" ? require("./dossier-tallies.js") : root.DossierTallies
    );
  } else {
    root.TennesseeIndex = factory(root.DossierLookup, root.DossierTallies);
  }
})(typeof self !== "undefined" ? self : this, function (DossierLookup, DossierTallies) {
  "use strict";

  var KIND_LABELS = {
    misuse: "Misuse",
    cancel: "Exit",
    wrongful: "Wrongful stop",
    watch: "Watch",
  };

  var WRITEUPS = {
    "FLK-2025-027": "#gauthier",
    "ALPR-2024-030": "#gordon",
    "CAN-2026-100": "#sullivan-flock-suspend",
    "CAN-2026-113": "#white-county-flock-rescind",
    "CAN-2026-114": "#kingston-flock-nonrenew",
    "CAN-2026-115": "#monterey-flock-axon",
    "ID 31": "#morristown-misread",
    "ID 32": "#elizabethton-frt",
  };

  function lookup() {
    return DossierLookup || {};
  }

  function tallies() {
    return DossierTallies || {};
  }

  function monthYearLabel(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length < 2) {
      return String(iso || "—");
    }
    var months = [
      "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
      "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
    ];
    var month = months[Number(parts[1]) - 1] || "";
    var year = parts[0] || "";
    if (parts[2] && Number(parts[2])) {
      return month + " " + Number(parts[2]) + ", " + year;
    }
    return (month + " " + year).trim() || "—";
  }

  function sortKey(iso) {
    var s = String(iso || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
    if (/^\d{4}-\d{2}$/.test(s)) {
      return s + "-01";
    }
    if (/^\d{4}$/.test(s)) {
      return s + "-01-01";
    }
    return "0000-00-00";
  }

  function uniqueUrls(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (raw) {
      var url = String(raw || "").trim();
      if (!url || seen[url]) {
        return;
      }
      seen[url] = true;
      out.push(url);
    });
    return out;
  }

  function misuseRows(misuse) {
    var fmt = lookup().formatMisuseOutcome;
    var incidents = (misuse && misuse.verified_incidents) || [];
    return incidents
      .filter(function (row) {
        return String((row && row.State) || "").toUpperCase() === "TN";
      })
      .map(function (row) {
        var id = String(row.Case_ID || "");
        var what = fmt
          ? fmt(row.Outcome_Bucket, row.Subject_Officer_Involved, row.Agency_Jurisdiction)
          : String(row.Outcome_Bucket || "—");
        var date =
          (row.Resolution_Year ? String(row.Resolution_Year) : "") ||
          (row.Incident_Year ? String(row.Incident_Year) : "") ||
          (row.Year ? String(row.Year) : "");
        return {
          Kind: "misuse",
          Kind_Label: KIND_LABELS.misuse,
          Place: row.Agency_Jurisdiction || id,
          State: "TN",
          What: what,
          Date: date,
          Date_Label: date.length === 4 ? date : monthYearLabel(date),
          ID: id,
          Case_ID: id,
          Writeup: WRITEUPS[id] || "",
          Source_URL: row.Source_URL || "",
          Source_URLs: uniqueUrls([row.Source_URL]),
        };
      });
  }

  function cancelRows(cancel) {
    var records = (cancel && cancel.records) || [];
    return records
      .filter(function (row) {
        return String((row && row.State) || "").toUpperCase() === "TN";
      })
      .map(function (row) {
        var id = String(row.Case_ID || "");
        var what = String(row.Action_Type || "—");
        return {
          Kind: "cancel",
          Kind_Label: KIND_LABELS.cancel,
          Place: row.Jurisdiction || id,
          State: "TN",
          What: what,
          Date: row.Action_Date || "",
          Date_Label: monthYearLabel(row.Action_Date),
          ID: id,
          Case_ID: id,
          Writeup: WRITEUPS[id] || "",
          Source_URL: row.Primary_Source_URL || "",
          Source_URLs: uniqueUrls([row.Primary_Source_URL, row.Secondary_Source_URL]),
        };
      });
  }

  function wrongfulRows(wrongful) {
    var records = Array.isArray(wrongful) ? wrongful : [];
    return records
      .filter(function (row) {
        return String((row && row.State) || "").toUpperCase() === "TN";
      })
      .map(function (row) {
        var n = String(row.ID || "");
        var id = n ? "ID " + n : "";
        var tech = String(row.Technology || row.Technology_Category || "Wrongful stop");
        var what = tech;
        var place = row.City || id;
        if (Number(row.ID) === 31) {
          what = "Flock plate misread / gunpoint stop";
        }
        if (Number(row.ID) === 32) {
          what = "Facial-recognition mismatch (not Flock ALPR)";
          place = "Elizabethton / Fargo";
        }
        var date = row.Incident_Date || (row.Incident_Year ? String(row.Incident_Year) : "");
        return {
          Kind: "wrongful",
          Kind_Label: KIND_LABELS.wrongful,
          Place: place,
          State: "TN",
          What: what,
          Date: date,
          Date_Label: monthYearLabel(date),
          ID: id,
          Wrongful_ID: n,
          Writeup: WRITEUPS[id] || "",
          Source_URL: row.Primary_Source_URL || "",
          Source_URLs: uniqueUrls([row.Primary_Source_URL, row.Secondary_Source_URL]),
        };
      });
  }

  function extraRows(extras) {
    var records = (extras && extras.records) || [];
    return records.map(function (row) {
      var kind = String(row.Kind || "watch");
      var writeup = String(row.Writeup || "");
      if (writeup && writeup.charAt(0) !== "#") {
        writeup = "#" + writeup.replace(/^.*#/, "");
      }
      return {
        Kind: kind,
        Kind_Label: KIND_LABELS[kind] || "Watch",
        Place: row.Place || "—",
        State: "TN",
        What: row.What || row.Action || "—",
        Date: row.Date || "",
        Date_Label: monthYearLabel(row.Date),
        ID: row.ID || "—",
        Writeup: writeup,
        Source_URL: row.Source_URL || "",
        Source_URLs: uniqueUrls([row.Source_URL]),
      };
    });
  }

  function buildTennesseeIndex(misuse, cancel, wrongful, extras, meta) {
    meta = meta || {};
    var rows = misuseRows(misuse)
      .concat(cancelRows(cancel))
      .concat(wrongfulRows(wrongful))
      .concat(extraRows(extras));
    rows.sort(function (a, b) {
      var diff = sortKey(b.Date).localeCompare(sortKey(a.Date));
      if (diff) {
        return diff;
      }
      return String(a.Place || "").localeCompare(String(b.Place || ""));
    });
    return {
      as_of: meta.as_of || "",
      as_of_long: meta.as_of_long || "",
      as_of_short: meta.as_of_short || "",
      record_count: rows.length,
      records: rows,
    };
  }

  function filterRows(records, query, kind) {
    var q = String(query || "").trim().toLowerCase();
    var k = String(kind || "").trim();
    return (records || []).filter(function (row) {
      if (k && row.Kind !== k) {
        return false;
      }
      if (!q) {
        return true;
      }
      var hay =
        (row.Place || "") +
        " " +
        (row.What || "") +
        " " +
        (row.ID || "") +
        " " +
        (row.Kind_Label || "") +
        " " +
        (row.Date_Label || "");
      return hay.toLowerCase().indexOf(q) !== -1;
    });
  }

  return {
    KIND_LABELS: KIND_LABELS,
    WRITEUPS: WRITEUPS,
    monthYearLabel: monthYearLabel,
    buildTennesseeIndex: buildTennesseeIndex,
    filterRows: filterRows,
    misuseRows: misuseRows,
    cancelRows: cancelRows,
    wrongfulRows: wrongfulRows,
    extraRows: extraRows,
    tallies: tallies,
  };
});
