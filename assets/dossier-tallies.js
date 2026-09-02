/**
 * Dossier tally helpers: compute public KPIs from the three case databases,
 * and fill [data-tally] spans from docs/dossier-tallies.json.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DossierTallies = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_JSON_URL = "docs/dossier-tallies.json";
  var CLEAR_EXIT_TYPES = [
    "Terminated",
    "Non-renewal",
    "Rescinded",
    "Pre-install cancel",
  ];
  var CONSTITUTIONAL_SUITS = 5;
  var MONTH_NAME =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  var FILE_FETCH_HINT =
    "Could not load this table. Try again on the live site.";

  function misuseIncidents(data) {
    return (data && data.verified_incidents) || [];
  }

  function cancelRecords(data) {
    return (data && data.records) || [];
  }

  function wrongfulRecords(data) {
    return Array.isArray(data) ? data : [];
  }

  function wordToCount(word) {
    var w = String(word || "").toLowerCase();
    if (w === "two") return 2;
    if (w === "three") return 3;
    if (w === "four") return 4;
    if (w === "five") return 5;
    var n = Number(w);
    return n > 0 ? n : 1;
  }

  function eachMultiplier(record) {
    var field = String((record && record.Documented_Search_Count_Frequency) || "");
    if (!/\beach\b/i.test(field)) {
      return 1;
    }
    var blob =
      String((record && record.Detailed_Summary) || "") + " " + field;
    var named = blob.match(/each of the (three|two|four|five|\d+)/i);
    if (named) {
      return wordToCount(named[1]);
    }
    if (/\bthree\b/i.test(blob)) {
      return 3;
    }
    return 1;
  }

  function shouldSkipLookupField(record) {
    var cat = String((record && record.Misuse_Abuse_Category) || "");
    var field = String((record && record.Documented_Search_Count_Frequency) || "");
    if (/Flawed AI/i.test(cat) || /AI Error/i.test(field)) {
      return true;
    }
    if (/Systemic/i.test(field) || /2,?600,000/.test(field)) {
      return true;
    }
    if (/Agency ran/i.test(field) || /Felony Count/i.test(field)) {
      return true;
    }
    if (/not public|not published|not fully public/i.test(field)) {
      return true;
    }
    if (/Unspecified/i.test(field) || /Overwhelming Use/i.test(field)) {
      return true;
    }
    if (/individual misuse counts not public/i.test(field)) {
      return true;
    }
    if (/Allegations under investigation/i.test(field)) {
      return true;
    }
    if (/booking record/i.test(field)) {
      return true;
    }
    return false;
  }

  function stripLookupNoise(field) {
    var s = String(field || "");
    s = s.replace(/\b20\d{2}\b/g, " ");
    s = s.replace(new RegExp("\\b" + MONTH_NAME + "\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?", "gi"), " ");
    s = s.replace(/over\s*~?\s*\d+\s*months?/gi, " ");
    s = s.replace(/~\s*\d+-day/gi, " ");
    s = s.replace(/\b\d+-day\b/gi, " ");
    return s;
  }

  function personalLookupCount(record) {
    if (record && typeof record.Personal_Lookup_Count === "number") {
      return record.Personal_Lookup_Count;
    }
    if (shouldSkipLookupField(record)) {
      return null;
    }
    var field = String((record && record.Documented_Search_Count_Frequency) || "");
    var cleaned = stripLookupNoise(field);
    var nums = [];
    var re = /(?:about|nearly|over|more than|at least|roughly|~)?\s*(\d[\d,]*)\+?/gi;
    var m;
    while ((m = re.exec(cleaned))) {
      var n = Number(String(m[1]).replace(/,/g, ""));
      if (n >= 1 && n < 100000) {
        nums.push(n);
      }
    }
    if (!nums.length) {
      if (/\bat least one\b/i.test(field) && /query|search/i.test(field)) {
        return 1;
      }
      return null;
    }
    if (/Flock-specific/i.test(field)) {
      return nums[0];
    }
    var base = nums.length > 1 ? nums.reduce(function (a, b) { return a + b; }, 0) : nums[0];
    return base * eachMultiplier(record);
  }

  function isFired(row) {
    var bucket = String((row && row.Outcome_Bucket) || "");
    return /Terminated|Resigned/.test(bucket);
  }

  function isCharged(row) {
    var bucket = String((row && row.Outcome_Bucket) || "");
    return /Criminally Charged|Indicted/.test(bucket);
  }

  function personnelCount(row, key) {
    var n = row && row[key];
    return typeof n === "number" && n > 0 ? n : 0;
  }

  function firedPeople(row) {
    var n = personnelCount(row, "Personnel_Terminated") +
      personnelCount(row, "Personnel_Resigned");
    if (n > 0) {
      return n;
    }
    return isFired(row) ? 1 : 0;
  }

  function chargedPeople(row) {
    var n = personnelCount(row, "Personnel_Charged");
    if (n > 0) {
      return n;
    }
    return isCharged(row) ? 1 : 0;
  }

  function formatLookupFloor(n) {
    var floor = Math.floor(Number(n) / 10) * 10;
    if (!floor) {
      return "0+";
    }
    return floor.toLocaleString("en-US") + "+";
  }

  function formatSettlement(total) {
    var millions = Number(total) / 1000000;
    var rounded = Math.round(millions * 100) / 100;
    var text = rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return "$" + text + "M";
  }

  function formatLongDate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) {
      return String(iso || "");
    }
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return months[Number(parts[1]) - 1] + " " + Number(parts[2]) + ", " + parts[0];
  }

  function formatShortDate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) {
      return String(iso || "");
    }
    var months = [
      "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
      "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
    ];
    return months[Number(parts[1]) - 1] + " " + Number(parts[2]) + ", " + parts[0];
  }

  function asOfDate(misuse, cancel) {
    var dates = [];
    if (misuse && misuse.meta && misuse.meta.generated_on) {
      dates.push(String(misuse.meta.generated_on));
    }
    if (cancel && cancel.compiled) {
      dates.push(String(cancel.compiled).slice(0, 10));
    }
    dates.sort();
    return dates.length ? dates[dates.length - 1] : "";
  }

  function filterMisuseByState(data, state) {
    var code = String(state || "").toUpperCase();
    var copy = Object.assign({}, data || {});
    copy.verified_incidents = misuseIncidents(data).filter(function (row) {
      return String((row && row.State) || "").toUpperCase() === code;
    });
    return copy;
  }

  function filterCancelByState(data, state) {
    var code = String(state || "").toUpperCase();
    var copy = Object.assign({}, data || {});
    copy.records = cancelRecords(data).filter(function (row) {
      return String((row && row.State) || "").toUpperCase() === code;
    });
    return copy;
  }

  function filterWrongfulByState(data, state) {
    var code = String(state || "").toUpperCase();
    return wrongfulRecords(data).filter(function (row) {
      return String((row && row.State) || "").toUpperCase() === code;
    });
  }

  function prefixTennessee(tn) {
    return {
      tn_misuse_count: tn.misuse_count,
      tn_verified_count: tn.verified_count,
      tn_aggregator_count: tn.aggregator_count,
      tn_fired_count: tn.fired_count,
      tn_charged_count: tn.charged_count,
      tn_lookup_floor: tn.lookup_floor,
      tn_lookup_rows: tn.lookup_rows,
      tn_lookup_floor_display: tn.lookup_floor_display,
      tn_lawsuit_count: tn.lawsuit_count,
      tn_constitutional_count: tn.constitutional_count,
      tn_settlement_total: tn.settlement_total,
      tn_settlement_cases: tn.settlement_cases,
      tn_settlement_display: tn.settlement_total ? tn.settlement_display : "$0",
      tn_wrongful_count: tn.wrongful_count,
      tn_cancel_count: tn.cancel_count,
      tn_clear_exits: tn.clear_exits,
      tn_other_cancels: tn.other_cancels,
      tn_catalog_line:
        tn.misuse_count + " + " + tn.wrongful_count + " + " + tn.cancel_count,
    };
  }

  function computeAllTallies(misuse, cancel, wrongful) {
    var national = computeTallies(misuse, cancel, wrongful);
    var tn = computeTallies(
      filterMisuseByState(misuse, "TN"),
      filterCancelByState(cancel, "TN"),
      filterWrongfulByState(wrongful, "TN"),
      { constitutional_count: 0 }
    );
    return Object.assign({}, national, prefixTennessee(tn));
  }

  function computeTallies(misuse, cancel, wrongful, options) {
    options = options || {};
    var incidents = misuseIncidents(misuse);
    var cancels = cancelRecords(cancel);
    var wrong = wrongfulRecords(wrongful);
    var lookupRows = 0;
    var lookupFloor = 0;
    incidents.forEach(function (row) {
      var n = personalLookupCount(row);
      if (n != null) {
        lookupRows += 1;
        lookupFloor += n;
      }
    });
    var verified = incidents.filter(function (row) {
      return row.Verification_Status === "Verified";
    }).length;
    var aggregator = incidents.filter(function (row) {
      return /aggregator/i.test(String(row.Verification_Status || ""));
    }).length;
    var lawsuits = wrong.filter(function (row) {
      return row.Lawsuit_Filed === "Y" && !row.Public_KPI_Exclude;
    }).length;
    var settlementCases = 0;
    var settlementTotal = 0;
    wrong.forEach(function (row) {
      if (row.Public_KPI_Exclude) {
        return;
      }
      if (typeof row.Settlement_Amount === "number") {
        settlementCases += 1;
        settlementTotal += row.Settlement_Amount;
      }
    });
    var clearExits = cancels.filter(function (row) {
      return CLEAR_EXIT_TYPES.indexOf(row.Action_Type) !== -1;
    }).length;
    var asOf = asOfDate(misuse, cancel);
    return {
      as_of: asOf,
      as_of_long: formatLongDate(asOf),
      as_of_short: formatShortDate(asOf),
      misuse_count: incidents.length,
      verified_count: verified,
      aggregator_count: aggregator,
      fired_count: incidents.reduce(function (sum, row) {
        return sum + firedPeople(row);
      }, 0),
      charged_count: incidents.reduce(function (sum, row) {
        return sum + chargedPeople(row);
      }, 0),
      lookup_floor: lookupFloor,
      lookup_rows: lookupRows,
      lookup_floor_display: formatLookupFloor(lookupFloor),
      lawsuit_count: lawsuits,
      constitutional_count:
        options.constitutional_count != null
          ? options.constitutional_count
          : CONSTITUTIONAL_SUITS,
      settlement_total: settlementTotal,
      settlement_cases: settlementCases,
      settlement_display: formatSettlement(settlementTotal),
      wrongful_count: wrong.length,
      cancel_count: cancels.length,
      clear_exits: clearExits,
      other_cancels: cancels.length - clearExits,
      catalog_line:
        incidents.length + " + " + wrong.length + " + " + cancels.length,
    };
  }

  function tallyText(data, key) {
    if (!data || data[key] == null) {
      return "";
    }
    var value = data[key];
    if (typeof value === "number") {
      return value.toLocaleString("en-US");
    }
    return String(value);
  }

  function applyTallies(doc, data) {
    var nodes = doc.querySelectorAll("[data-tally]");
    var i;
    var key;
    for (i = 0; i < nodes.length; i += 1) {
      key = nodes[i].getAttribute("data-tally");
      if (key) {
        nodes[i].textContent = tallyText(data, key);
      }
    }
    var times = doc.querySelectorAll("[data-tally-datetime]");
    for (i = 0; i < times.length; i += 1) {
      if (data.as_of) {
        times[i].setAttribute("datetime", data.as_of);
      }
      key = times[i].getAttribute("data-tally-datetime") || "as_of_long";
      if (data[key]) {
        times[i].textContent = data[key];
      }
    }
    var arias = doc.querySelectorAll("[data-tally-aria]");
    for (i = 0; i < arias.length; i += 1) {
      if (data.as_of_long) {
        arias[i].setAttribute(
          "aria-label",
          "Dossier tallies as of " + data.as_of_long
        );
      }
    }
  }

  function initDossierTallies(doc, options) {
    doc = doc || document;
    options = options || {};
    if (!doc.querySelector("[data-tally], [data-tally-datetime]")) {
      return null;
    }
    var holder = doc.querySelector("[data-tally-src]");
    var jsonUrl =
      (holder && holder.getAttribute("data-tally-src")) || DEFAULT_JSON_URL;
    var fetchFn = Object.prototype.hasOwnProperty.call(options, "fetch")
      ? options.fetch
      : typeof fetch === "function"
        ? fetch
        : null;

    if (options.data) {
      applyTallies(doc, options.data);
      return { data: options.data };
    }
    if (!fetchFn) {
      return { data: null, error: FILE_FETCH_HINT };
    }
    fetchFn(jsonUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        applyTallies(doc, data);
      })
      .catch(function () {
        return null;
      });
    return { data: null };
  }

  return {
    DEFAULT_JSON_URL: DEFAULT_JSON_URL,
    CLEAR_EXIT_TYPES: CLEAR_EXIT_TYPES,
    personalLookupCount: personalLookupCount,
    firedPeople: firedPeople,
    chargedPeople: chargedPeople,
    computeTallies: computeTallies,
    computeAllTallies: computeAllTallies,
    filterMisuseByState: filterMisuseByState,
    filterCancelByState: filterCancelByState,
    filterWrongfulByState: filterWrongfulByState,
    prefixTennessee: prefixTennessee,
    formatLookupFloor: formatLookupFloor,
    formatSettlement: formatSettlement,
    applyTallies: applyTallies,
    initDossierTallies: initDossierTallies,
  };
});
