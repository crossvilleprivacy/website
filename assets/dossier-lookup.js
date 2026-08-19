/**
 * Officer-misuse and wrongful-stop lookups (national.html).
 * Fetches the matching dossier JSON. Do not inline a second copy.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DossierLookup = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MISUSE_JSON_URL = "docs/Flock_Safety_ALPR_Misuse_Master_Database.json";
  var WRONGFUL_JSON_URL = "docs/AI_Wrongful_Enforcement_Database.json";
  var MISUSE_ID_RE = /(?:FLK|ALPR)-\d{4}-\d{3}/g;
  var WRONGFUL_ID_RE = /wrongful ID\s+(\d+)/gi;
  var FILE_FETCH_HINT =
    "Serve the site over http://localhost (file:// cannot read the JSON).";
  var MONTH_LABELS = [
    "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
    "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
  ];
  var MONTH_NUM = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12,
  };
  var MONTH_TOKEN =
    "(January|February|March|April|May|June|July|August|September|October|November|December|" +
    "Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept\\.?|Sep\\.?|Oct\\.?|Nov\\.?|Dec\\.?)";
  var STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
    MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  function stateName(code) {
    return STATE_NAMES[String(code || "").trim().toUpperCase()] || "";
  }

  function formatCount(n) {
    if (n == null || n === "" || Number.isNaN(Number(n))) {
      return "—";
    }
    return Number(n).toLocaleString("en-US");
  }

  function normalizeSourceUrl(raw) {
    var url = String(raw || "").trim().replace(/[).,;:\]]+$/g, "");
    if (!/^https?:\/\//i.test(url)) {
      return "";
    }
    return url;
  }

  function extractHttpUrls(text) {
    var re = /https?:\/\/[^\s"'<>]+/gi;
    var out = [];
    var match;
    while ((match = re.exec(String(text || "")))) {
      out.push(match[0]);
    }
    return out;
  }

  function uniqueHttpUrls(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (raw) {
      var url = normalizeSourceUrl(raw);
      if (!url) {
        return;
      }
      var key = url.replace(/\/$/, "").toLowerCase();
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      out.push(url);
    });
    return out;
  }

  function collectSourceUrls() {
    var out = [];
    var i;
    var val;
    for (i = 0; i < arguments.length; i += 1) {
      val = arguments[i];
      if (val == null || val === "") {
        continue;
      }
      if (Array.isArray(val)) {
        val.forEach(function (item) {
          out = out.concat(extractHttpUrls(String(item)));
        });
      } else {
        out = out.concat(extractHttpUrls(String(val)));
      }
    }
    return uniqueHttpUrls(out);
  }

  function sourceLabel(url, seenHosts) {
    var host = "Source";
    try {
      host = new URL(url).hostname.replace(/^www\./i, "");
    } catch (err) {
      host = "Source";
    }
    seenHosts = seenHosts || {};
    if (!seenHosts[host]) {
      seenHosts[host] = 1;
      return host;
    }
    seenHosts[host] += 1;
    return host + " (" + seenHosts[host] + ")";
  }

  function articleSourceUrls(doc, hash) {
    var id = String(hash || "").replace(/^#/, "");
    var article = null;
    var nodes;
    var href;
    var i;
    var urls = [];
    if (!doc || !id) {
      return [];
    }
    if (typeof doc.getElementById === "function") {
      article = doc.getElementById(id);
    }
    if (!article && doc.querySelector) {
      article = doc.querySelector("#" + id);
    }
    if (!article || !article.querySelectorAll) {
      return [];
    }
    nodes = article.querySelectorAll(".sources a[href], p.sources a[href]");
    for (i = 0; i < nodes.length; i += 1) {
      href = nodes[i].getAttribute ? nodes[i].getAttribute("href") : "";
      if (/^https?:\/\//i.test(href || "")) {
        urls.push(href);
      }
    }
    return uniqueHttpUrls(urls);
  }

  function mergeArticleSources(records, doc, anchors, keyFn) {
    keyFn = keyFn || function (row) {
      return row && row.Case_ID;
    };
    return (records || []).map(function (row) {
      var hash = anchors && anchors[keyFn(row)];
      var merged = uniqueHttpUrls((row.Source_URLs || []).concat(articleSourceUrls(doc, hash)));
      row.Source_URLs = merged;
      if (!row.Source_URL && merged[0]) {
        row.Source_URL = merged[0];
      }
      return row;
    });
  }

  function monthNumber(token) {
    var key = String(token || "").replace(/\./g, "").toLowerCase();
    return MONTH_NUM[key] || 0;
  }

  function monthLabel(n) {
    var i = Number(n) || 0;
    return i >= 1 && i <= 12 ? MONTH_LABELS[i - 1] : "—";
  }

  function latestMonthInYear(text, year) {
    var y = Number(year);
    if (!y) {
      return 0;
    }
    var re = new RegExp(
      "\\b" + MONTH_TOKEN +
        "(?:\\s*[\\u2013\\u2014-]\\s*" + MONTH_TOKEN + ")?" +
        "(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?,?\\s+(" + y + ")\\b",
      "gi"
    );
    var blob = String(text || "");
    var best = 0;
    var match;
    while ((match = re.exec(blob))) {
      var first = monthNumber(match[1]);
      var second = monthNumber(match[2]);
      if (first > best) {
        best = first;
      }
      if (second > best) {
        best = second;
      }
    }
    return best;
  }

  function monthFromMisuseRow(row) {
    var blob = [
      row && row.Year_Note,
      row && row.Outcome_Disciplinary_Action,
      row && row.Detailed_Summary,
    ].join(" ");
    return latestMonthInYear(blob, row && row.Year);
  }

  function recordsFromMisuse(data) {
    var list = (data && data.verified_incidents) || [];
    return list.map(function (row) {
      var month = monthFromMisuseRow(row);
      var urls = collectSourceUrls(
        row && row.Source_URL,
        row && row.Detailed_Summary,
        row && row.Verification_Notes
      );
      return {
        Case_ID: String((row && row.Case_ID) || "").trim(),
        Agency: String((row && row.Agency_Jurisdiction) || "").trim(),
        State: String((row && row.State) || "").trim().toUpperCase(),
        Outcome: String((row && row.Outcome_Bucket) || "").trim(),
        Month: month,
        Month_Label: monthLabel(month),
        Year: row && row.Year != null && row.Year !== "" ? Number(row.Year) : 0,
        Source_URL: urls[0] || "",
        Source_URLs: urls,
        Verification: String((row && row.Verification_Status) || "").trim(),
      };
    });
  }

  function recordsFromWrongful(data) {
    var list = Array.isArray(data) ? data : [];
    return list.map(function (row) {
      var id = row && row.ID != null ? String(row.ID) : "";
      var urls = collectSourceUrls(
        row && row.Primary_Source_URL,
        row && row.Secondary_Source_URL,
        row && row.Additional_URLs
      );
      return {
        Case_ID: id ? "ID " + id : "",
        Wrongful_ID: id,
        City: String((row && row.City) || "").trim(),
        State: String((row && row.State) || "").trim().toUpperCase(),
        Technology: String((row && (row.Technology_Category || row.Technology)) || "").trim(),
        Lawsuit: String((row && row.Lawsuit_Filed) || "").trim(),
        Settlement: typeof (row && row.Settlement_Amount) === "number" ? row.Settlement_Amount : null,
        Year: row && row.Incident_Year != null && row.Incident_Year !== ""
          ? Number(row.Incident_Year)
          : 0,
        Source_URL: urls[0] || "",
        Source_URLs: urls,
      };
    });
  }

  function outcomeKind(row) {
    var bucket = String((row && row.Outcome) || "");
    if (/Terminated|Resigned/.test(bucket)) {
      return "fired";
    }
    if (/Criminally Charged|Indicted/.test(bucket)) {
      return "charged";
    }
    return "other";
  }

  function haystack(row) {
    return Object.keys(row)
      .map(function (key) {
        return row[key];
      })
      .join(" ")
      .toLowerCase();
  }

  function filterMisuse(records, query, state, kind) {
    var q = String(query || "").trim().toLowerCase();
    var st = String(state || "").trim().toUpperCase();
    var bucket = String(kind || "").trim();
    return (records || []).filter(function (row) {
      if (st && row.State !== st) {
        return false;
      }
      var fired = /Terminated|Resigned/.test(row.Outcome);
      var charged = /Criminally Charged|Indicted/.test(row.Outcome);
      if (bucket === "fired" && !fired) {
        return false;
      }
      if (bucket === "charged" && !charged) {
        return false;
      }
      if (bucket === "other" && (fired || charged)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return haystack(row).indexOf(q) !== -1;
    });
  }

  function wrongfulSearchText(row) {
    return [
      row && row.City,
      row && row.State,
      row && row.Technology,
      row && row.Case_ID,
      row && row.Wrongful_ID,
      row && row.Year,
      row && row.Lawsuit,
    ]
      .join(" ")
      .toLowerCase();
  }

  function filterWrongful(records, query, state, lawsuit) {
    var q = String(query || "").trim().toLowerCase();
    var st = String(state || "").trim().toUpperCase();
    var suit = String(lawsuit || "").trim();
    return (records || []).filter(function (row) {
      if (st && row.State !== st) {
        return false;
      }
      if (suit && row.Lawsuit !== suit) {
        return false;
      }
      if (!q) {
        return true;
      }
      return wrongfulSearchText(row).indexOf(q) !== -1;
    });
  }

  function sortRows(records) {
    var copy = (records || []).slice();
    copy.sort(function (a, b) {
      if (b.Year !== a.Year) {
        return b.Year - a.Year;
      }
      var monthDiff = (Number(b.Month) || 0) - (Number(a.Month) || 0);
      if (monthDiff) {
        return monthDiff;
      }
      return String(a.Case_ID).localeCompare(String(b.Case_ID));
    });
    return copy;
  }

  function pageRows(records, page, pageSize) {
    var size = Math.max(1, Number(pageSize) || 15);
    var total = (records || []).length;
    var pageCount = Math.max(1, Math.ceil(total / size));
    var current = Math.min(Math.max(1, Number(page) || 1), pageCount);
    var start = (current - 1) * size;
    return {
      page: current,
      pageSize: size,
      pageCount: pageCount,
      total: total,
      start: total ? start + 1 : 0,
      end: Math.min(start + size, total),
      rows: (records || []).slice(start, start + size),
    };
  }

  function stateCounts(records) {
    var map = {};
    (records || []).forEach(function (row) {
      if (!row.State) {
        return;
      }
      map[row.State] = (map[row.State] || 0) + 1;
    });
    return Object.keys(map)
      .map(function (code) {
        return { state: code, name: stateName(code), count: map[code] };
      })
      .sort(function (a, b) {
        return b.count - a.count || a.state.localeCompare(b.state);
      });
  }

  function caseAnchorsFromDoc(doc, sectionId, regex, keyFn) {
    var map = {};
    if (!doc || !doc.querySelector) {
      return map;
    }
    var scope = doc.querySelector(sectionId) || doc;
    if (!scope.querySelectorAll) {
      return map;
    }
    var nodes = scope.querySelectorAll("article[id]");
    var i;
    var match;
    var re;
    for (i = 0; i < nodes.length; i += 1) {
      re = new RegExp(regex.source, regex.flags);
      match = re.exec(String(nodes[i].textContent || ""));
      while (match) {
        var key = keyFn ? keyFn(match) : match[0];
        if (key && !map[key]) {
          map[key] = "#" + nodes[i].id;
        }
        match = re.exec(String(nodes[i].textContent || ""));
      }
    }
    return map;
  }

  function setText(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  function fillSelect(doc, select, items, allLabel, valueKey, labelFn) {
    if (!select) {
      return;
    }
    var current = select.value;
    select.innerHTML = "";
    var all = doc.createElement("option");
    all.value = "";
    all.textContent = allLabel;
    select.appendChild(all);
    (items || []).forEach(function (item) {
      var opt = doc.createElement("option");
      opt.value = item[valueKey];
      opt.textContent = labelFn(item);
      select.appendChild(opt);
    });
    if (current && (items || []).some(function (item) { return item[valueKey] === current; })) {
      select.value = current;
    }
  }

  function el(doc, tag, attrs, text) {
    var node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  function addSourceCell(doc, tr, urls) {
    var td = doc.createElement("td");
    var list = uniqueHttpUrls(Array.isArray(urls) ? urls : urls ? [urls] : []);
    var seen = {};
    td.className = "lookup-source-cell";
    if (!list.length) {
      td.textContent = "—";
      tr.appendChild(td);
      return;
    }
    list.forEach(function (url, i) {
      if (i) {
        td.appendChild(doc.createTextNode(" · "));
      }
      td.appendChild(el(doc, "a", { href: url, target: "_blank", rel: "noopener" }, sourceLabel(url, seen)));
    });
    tr.appendChild(td);
  }

  function addIdCell(doc, tr, label, href) {
    var td = doc.createElement("td");
    if (href) {
      td.appendChild(el(doc, "a", { href: href }, label));
    } else {
      td.textContent = label || "—";
    }
    tr.appendChild(td);
  }

  function renderMisuseTable(doc, tbody, rows, anchors) {
    tbody.textContent = "";
    if (!rows.length) {
      var empty = doc.createElement("tr");
      var cell = el(doc, "td", { colspan: "6" }, "No records match those filters.");
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      var href = (anchors && anchors[row.Case_ID]) || "";
      var agency = doc.createElement("td");
      if (href) {
        agency.appendChild(el(doc, "a", { href: href }, row.Agency || row.Case_ID));
      } else {
        agency.textContent = row.Agency || row.Case_ID;
      }
      if (row.State) {
        var st = el(doc, "div", { class: "cancel-lookup-meta" }, row.State);
        agency.appendChild(st);
      }
      tr.appendChild(agency);
      tr.appendChild(el(doc, "td", {}, row.Outcome || "—"));
      tr.appendChild(el(doc, "td", {}, row.Month_Label || "—"));
      tr.appendChild(el(doc, "td", {}, row.Year ? String(row.Year) : "—"));
      addIdCell(doc, tr, row.Case_ID, href);
      addSourceCell(doc, tr, row.Source_URLs && row.Source_URLs.length ? row.Source_URLs : row.Source_URL);
      tbody.appendChild(tr);
    });
  }

  function renderWrongfulTable(doc, tbody, rows, anchors) {
    tbody.textContent = "";
    if (!rows.length) {
      var empty = doc.createElement("tr");
      empty.appendChild(el(doc, "td", { colspan: "4" }, "No records match those filters."));
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      var href = (anchors && anchors[row.Wrongful_ID]) || "";
      var city = doc.createElement("td");
      var label = row.City || row.Case_ID;
      if (href) {
        city.appendChild(el(doc, "a", { href: href }, label));
      } else {
        city.textContent = label;
      }
      if (row.State) {
        city.appendChild(el(doc, "div", { class: "cancel-lookup-meta" }, row.State));
      }
      tr.appendChild(city);
      tr.appendChild(el(doc, "td", {}, row.Technology || "—"));
      addIdCell(doc, tr, row.Case_ID, href);
      addSourceCell(doc, tr, row.Source_URLs && row.Source_URLs.length ? row.Source_URLs : row.Source_URL);
      tbody.appendChild(tr);
    });
  }

  function bindLookup(doc, spec) {
    var root = doc.querySelector(spec.root);
    if (!root) {
      return null;
    }
    var search = root.querySelector("[data-case-search]");
    var stateSelect = root.querySelector("[data-case-state]");
    var extraSelect = root.querySelector("[data-case-extra]");
    var pageSizeSelect = root.querySelector("[data-case-page-size]");
    var status = root.querySelector("[data-case-status]");
    var tbody = root.querySelector("[data-case-body]");
    var prevBtn = root.querySelector("[data-case-prev]");
    var nextBtn = root.querySelector("[data-case-next]");
    var clearBtn = root.querySelector("[data-case-clear]");
    var jsonUrl = root.getAttribute("data-json-url") || spec.defaultUrl;
    var anchors = spec.anchors(doc);
    var records = [];
    var page = 1;
    var debounce = null;
    var options = spec.options || {};

    function currentPageSize() {
      return Number((pageSizeSelect && pageSizeSelect.value) || 15);
    }

    function draw() {
      var filtered = sortRows(
        spec.filter(
          records,
          search ? search.value : "",
          stateSelect ? stateSelect.value : "",
          extraSelect ? extraSelect.value : ""
        )
      );
      var sliced = pageRows(filtered, page, currentPageSize());
      page = sliced.page;
      if (tbody) {
        spec.render(doc, tbody, sliced.rows, anchors);
      }
      setText(
        status,
        sliced.total
          ? "Showing " +
              sliced.start +
              "–" +
              sliced.end +
              " of " +
              sliced.total.toLocaleString("en-US") +
              " records"
          : "No records match those filters."
      );
      if (prevBtn) prevBtn.disabled = sliced.page <= 1;
      if (nextBtn) nextBtn.disabled = sliced.page >= sliced.pageCount;
    }

    function onFilterChange() {
      page = 1;
      draw();
    }

    if (search) {
      search.addEventListener("input", function () {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(onFilterChange, 150);
      });
    }
    if (stateSelect) stateSelect.addEventListener("change", onFilterChange);
    if (extraSelect) extraSelect.addEventListener("change", onFilterChange);
    if (pageSizeSelect) pageSizeSelect.addEventListener("change", onFilterChange);
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        page -= 1;
        draw();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        page += 1;
        draw();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (search) search.value = "";
        if (stateSelect) stateSelect.value = "";
        if (extraSelect) extraSelect.value = "";
        page = 1;
        draw();
      });
    }

    function applyRecords(list) {
      records = mergeArticleSources(list || [], doc, anchors, spec.anchorKey);
      fillSelect(doc, stateSelect, stateCounts(records), "All states", "state", function (item) {
        return item.state + " (" + formatCount(item.count) + ")";
      });
      draw();
      if (typeof CrossvilleCampaign !== "undefined" && typeof CrossvilleCampaign.notifyLayout === "function") {
        CrossvilleCampaign.notifyLayout(doc);
      }
    }

    setText(status, spec.loading);
    if (options.data) {
      applyRecords(spec.map(options.data));
      return { records: records, draw: draw };
    }
    var fetchFn = Object.prototype.hasOwnProperty.call(options, "fetch")
      ? options.fetch
      : typeof fetch === "function"
        ? fetch
        : null;
    if (!fetchFn) {
      setText(status, spec.error);
      return { records: records, draw: draw };
    }
    fetchFn(jsonUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        applyRecords(spec.map(data));
      })
      .catch(function () {
        setText(status, spec.error);
      });
    return { records: records, draw: draw };
  }

  function initMisuseLookup(doc, options) {
    doc = doc || document;
    return bindLookup(doc, {
      root: "[data-misuse-lookup]",
      defaultUrl: MISUSE_JSON_URL,
      loading: "Loading misuse records…",
      error: "Could not load the misuse list. " + FILE_FETCH_HINT,
      map: recordsFromMisuse,
      filter: filterMisuse,
      render: renderMisuseTable,
      options: options || {},
      anchors: function (d) {
        return caseAnchorsFromDoc(d, "#nationwide-misuse", MISUSE_ID_RE, function (match) {
          return match[0];
        });
      },
    });
  }

  function initWrongfulLookup(doc, options) {
    doc = doc || document;
    return bindLookup(doc, {
      root: "[data-wrongful-lookup]",
      defaultUrl: WRONGFUL_JSON_URL,
      loading: "Loading wrongful-stop records…",
      error: "Could not load the wrongful-stop list. " + FILE_FETCH_HINT,
      map: recordsFromWrongful,
      filter: filterWrongful,
      render: renderWrongfulTable,
      options: options || {},
      anchorKey: function (row) {
        return row && row.Wrongful_ID;
      },
      anchors: function (d) {
        return caseAnchorsFromDoc(d, "#nationwide-misuse", WRONGFUL_ID_RE, function (match) {
          return match[1];
        });
      },
    });
  }

  return {
    MISUSE_JSON_URL: MISUSE_JSON_URL,
    WRONGFUL_JSON_URL: WRONGFUL_JSON_URL,
    recordsFromMisuse: recordsFromMisuse,
    recordsFromWrongful: recordsFromWrongful,
    monthFromMisuseRow: monthFromMisuseRow,
    monthLabel: monthLabel,
    filterMisuse: filterMisuse,
    filterWrongful: filterWrongful,
    sortRows: sortRows,
    pageRows: pageRows,
    stateCounts: stateCounts,
    outcomeKind: outcomeKind,
    caseAnchorsFromDoc: caseAnchorsFromDoc,
    collectSourceUrls: collectSourceUrls,
    uniqueHttpUrls: uniqueHttpUrls,
    sourceLabel: sourceLabel,
    articleSourceUrls: articleSourceUrls,
    mergeArticleSources: mergeArticleSources,
    renderWrongfulTable: renderWrongfulTable,
    initMisuseLookup: initMisuseLookup,
    initWrongfulLookup: initWrongfulLookup,
  };
});
