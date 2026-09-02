/**
 * Election 2026 scorecard (election.html#scorecard).
 * Fetches docs/Election_2026_Scorecard.json. Do not inline a second copy.
 * Works in the browser and under Node (CommonJS) for unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ElectionScorecard = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_JSON_URL = "docs/Election_2026_Scorecard.json";
  var DEFAULT_BODY = "city";
  var LOAD_ERROR = "Could not load this table. Try again on the live site.";
  var STANCE_LABELS = {
    cancel: "Cancel and remove",
    keep: "Keep cameras",
    hedge: "Extra rules, not cancel",
    no_answer: "No public answer",
  };
  var COUNTY_STANCE_LABELS = {
    cancel: "Ban ALPRs",
    keep: "No ban",
    hedge: "Extra rules, not a ban",
    no_answer: "No public answer",
  };

  function trim(value) {
    return String(value == null ? "" : value).trim();
  }

  function bodyLabel(body) {
    return trim(body) === "county" ? "County" : "City";
  }

  function stanceLabel(row) {
    var key = trim(row && row.Stance ? row.Stance : "no_answer");
    if (trim(row && row.Body) === "county") {
      return COUNTY_STANCE_LABELS[key] || COUNTY_STANCE_LABELS.no_answer;
    }
    return STANCE_LABELS[key] || STANCE_LABELS.no_answer;
  }

  function isAnswered(row) {
    var key = trim(row && row.Stance);
    return Boolean(key) && key !== "no_answer";
  }

  function decorate(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (key) {
      out[key] = row[key];
    });
    out.Stance_Label = stanceLabel(row);
    out.Body_Label = bodyLabel(row && row.Body);
    return out;
  }

  function recordsFromIndex(data) {
    var rows = (data && data.records) || [];
    return rows.map(decorate);
  }

  function haystack(row) {
    return [
      row.Name,
      row.Office,
      row.Race,
      row.Body_Label,
      row.Stance_Label,
      row.Answer,
    ]
      .join(" ")
      .toLowerCase();
  }

  function filterRows(records, query, body, stance) {
    var q = trim(query).toLowerCase();
    var bodyKey = trim(body);
    var stanceKey = trim(stance);
    return (records || []).filter(function (row) {
      if (bodyKey && row.Body !== bodyKey) {
        return false;
      }
      if (stanceKey && trim(row.Stance) !== stanceKey) {
        return false;
      }
      if (!q) {
        return true;
      }
      return haystack(row).indexOf(q) !== -1;
    });
  }

  function sortRows(records) {
    var copy = (records || []).slice();
    copy.sort(function (a, b) {
      var as = Number(a.Sort) || 0;
      var bs = Number(b.Sort) || 0;
      if (as !== bs) {
        return as - bs;
      }
      return trim(a.Name).localeCompare(trim(b.Name));
    });
    return copy;
  }

  function tally(records) {
    var city = [];
    var county = [];
    (records || []).forEach(function (row) {
      if (row.Body === "county") {
        county.push(row);
      } else {
        city.push(row);
      }
    });
    return {
      city_total: city.length,
      city_answered: city.filter(isAnswered).length,
      county_total: county.length,
      county_answered: county.filter(isAnswered).length,
    };
  }

  function tallyLine(counts) {
    counts = counts || tally([]);
    return (
      "City: " +
      counts.city_answered +
      " of " +
      counts.city_total +
      " have answered. County: " +
      counts.county_answered +
      " of " +
      counts.county_total +
      " have answered."
    );
  }

  function setText(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  function sourceHref(row) {
    return trim(row && row.Source_URL);
  }

  function renderTable(doc, tbody, rows) {
    tbody.textContent = "";
    if (!rows.length) {
      var empty = doc.createElement("tr");
      var cell = doc.createElement("td");
      cell.setAttribute("colspan", "5");
      cell.textContent = "No names match those filters.";
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      if (row.Slug) {
        tr.id = "score-" + row.Slug;
      }

      var nameTd = doc.createElement("td");
      var nameStrong = doc.createElement("strong");
      nameStrong.textContent = row.Name || "—";
      nameTd.appendChild(nameStrong);
      if (row.Incumbent) {
        nameTd.appendChild(doc.createTextNode(" (incumbent)"));
      }
      tr.appendChild(nameTd);

      var raceTd = doc.createElement("td");
      raceTd.textContent = (row.Body_Label ? row.Body_Label + " · " : "") + (row.Race || row.Office || "—");
      tr.appendChild(raceTd);

      var stanceTd = doc.createElement("td");
      var stanceEl = doc.createElement("span");
      stanceEl.className = "election-stance election-stance-" + (trim(row.Stance) || "no_answer");
      stanceEl.textContent = row.Stance_Label || stanceLabel(row);
      stanceTd.appendChild(stanceEl);
      tr.appendChild(stanceTd);

      var answerTd = doc.createElement("td");
      answerTd.textContent = row.Answer || "—";
      tr.appendChild(answerTd);

      var srcTd = doc.createElement("td");
      var href = sourceHref(row);
      if (href) {
        var src = doc.createElement("a");
        src.href = href;
        src.target = "_blank";
        src.rel = "noopener";
        src.textContent = row.Source_Label || "Source";
        srcTd.appendChild(src);
      } else {
        srcTd.textContent = "—";
      }
      tr.appendChild(srcTd);

      tbody.appendChild(tr);
    });
  }

  function initElectionScorecard(doc, options) {
    doc = doc || document;
    options = options || {};
    var root = doc.querySelector("[data-election-scorecard]");
    if (!root) {
      return null;
    }

    var search = root.querySelector("[data-scorecard-search]");
    var bodySelect = root.querySelector("[data-scorecard-body]");
    var stanceSelect = root.querySelector("[data-scorecard-stance]");
    var status = root.querySelector("[data-scorecard-status]");
    var tbody = root.querySelector("[data-scorecard-body-rows]");
    var clearBtn = root.querySelector("[data-scorecard-clear]");
    var tallyEl = options.tallyEl || doc.querySelector("[data-scorecard-tally]");
    var asOfEl = options.asOfEl || doc.querySelector("[data-scorecard-as-of]");
    var jsonUrl = root.getAttribute("data-json-url") || DEFAULT_JSON_URL;

    var records = [];
    var debounce = null;

    function draw() {
      var filtered = sortRows(
        filterRows(
          records,
          search ? search.value : "",
          bodySelect ? bodySelect.value : "",
          stanceSelect ? stanceSelect.value : ""
        )
      );
      if (tbody) {
        renderTable(doc, tbody, filtered);
      }
      setText(
        status,
        filtered.length
          ? "Showing " + filtered.length + " of " + records.length + "."
          : "No names match those filters."
      );
      jumpToHash();
    }

    function jumpToHash() {
      var hash = "";
      if (doc.location && doc.location.hash) {
        hash = doc.location.hash;
      }
      if (hash.indexOf("#score-") !== 0) {
        return;
      }
      var el = doc.getElementById(hash.slice(1));
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ block: "center" });
      }
    }

    function scheduleDraw() {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(draw, 40);
    }

    function applyRecords(rows, meta) {
      records = rows || [];
      var counts = tally(records);
      setText(tallyEl, tallyLine(counts));
      if (asOfEl && meta && meta.as_of_long) {
        asOfEl.textContent = meta.as_of_long;
      }
      draw();
    }

    if (search) {
      search.addEventListener("input", scheduleDraw);
    }
    [bodySelect, stanceSelect].forEach(function (el) {
      if (el) {
        el.addEventListener("change", scheduleDraw);
        el.addEventListener("input", scheduleDraw);
      }
    });
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (search) {
          search.value = "";
        }
        if (bodySelect) {
          bodySelect.value = DEFAULT_BODY;
        }
        if (stanceSelect) {
          stanceSelect.value = "";
        }
        draw();
      });
    }

    if (options.records) {
      applyRecords(options.records.map(decorate), options.meta || {});
      return { records: records, draw: draw, tally: tally(records) };
    }

    if (typeof fetch !== "function") {
      setText(status, LOAD_ERROR);
      return { records: records, draw: draw };
    }

    fetch(jsonUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("bad status");
        }
        return res.json();
      })
      .then(function (data) {
        applyRecords(recordsFromIndex(data), data);
      })
      .catch(function () {
        setText(status, LOAD_ERROR);
      });

    return { records: records, draw: draw };
  }

  return {
    DEFAULT_JSON_URL: DEFAULT_JSON_URL,
    DEFAULT_BODY: DEFAULT_BODY,
    STANCE_LABELS: STANCE_LABELS,
    COUNTY_STANCE_LABELS: COUNTY_STANCE_LABELS,
    bodyLabel: bodyLabel,
    stanceLabel: stanceLabel,
    isAnswered: isAnswered,
    decorate: decorate,
    recordsFromIndex: recordsFromIndex,
    filterRows: filterRows,
    sortRows: sortRows,
    tally: tally,
    tallyLine: tallyLine,
    sourceHref: sourceHref,
    renderTable: renderTable,
    initElectionScorecard: initElectionScorecard,
  };
});
