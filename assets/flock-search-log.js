/**
 * Crossville PD Flock search-log table (records.html#search-log).
 * Works in the browser and under Node (CommonJS) for unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FlockSearchLog = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CSV_URL = "docs/TPRA_Flock_Query_Records.csv";
  var DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  var MONTH_RE = /^(\d{2})\/(\d{4})$/;
  var TS_RE =
    /^(\d{2})\/(\d{2})\/(\d{4}),\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)\s+UTC$/i;
  var OFFICER_RE = /^Officer-(\d+)$/i;
  var HASH_RE = /^[0-9a-f]{64}$/i;
  var SOURCE_HASH_FIELDS = [
    "name",
    "org_name",
    "time_frame",
    "reason",
    "case_number",
    "search_time",
    "search_type",
  ];

  function parseCsv(text) {
    var rows = [];
    var field = "";
    var row = [];
    var inQuotes = false;
    var i;
    var ch;
    var next;
    var src = String(text || "").replace(/^\uFEFF/, "");

    function endField() {
      row.push(field);
      field = "";
    }

    function endRow() {
      endField();
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
        rows.push(row);
      }
      row = [];
    }

    for (i = 0; i < src.length; i += 1) {
      ch = src.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          next = src.charAt(i + 1);
          if (next === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        endField();
      } else if (ch === "\n") {
        endRow();
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field !== "" || row.length) {
      endRow();
    }
    return rows;
  }

  function csvToRecords(text) {
    var table = parseCsv(text);
    if (!table.length) {
      return [];
    }
    var header = table[0].map(function (h) {
      return String(h || "").trim();
    });
    var idx = {};
    header.forEach(function (name, i) {
      idx[headerKey(name)] = i;
    });
    return table.slice(1).map(function (cells) {
      return {
        row_id: normalizeRowId(
          idx.row_id == null ? "" : cells[idx.row_id]
        ),
        officer_id: String(cells[idx.officer_id] || "").trim(),
        timestamp: String(cells[idx.timestamp] || "").trim(),
        reason: String(cells[idx.reason] || "").trim(),
        case_number_present: normalizeCaseFlag(
          idx.case_number_present == null
            ? ""
            : cells[idx.case_number_present]
        ),
        sha256_hash: normalizeSourceHash(
          idx.sha256_hash == null ? "" : cells[idx.sha256_hash]
        ),
      };
    });
  }

  function headerKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function normalizeRowId(value) {
    var n = parseInt(String(value || "").trim(), 10);
    if (!n || n < 1) {
      return 0;
    }
    return n;
  }

  function normalizeSourceHash(value) {
    var raw = String(value || "").trim().toLowerCase();
    return HASH_RE.test(raw) ? raw : "";
  }

  function canonicalSourcePayload(fields) {
    var src = fields || {};
    return JSON.stringify(
      SOURCE_HASH_FIELDS.map(function (key) {
        return src[key] == null ? "" : String(src[key]);
      })
    );
  }

  function normalizeCaseFlag(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "yes" || raw === "y" || raw === "true" || raw === "1") {
      return "yes";
    }
    if (raw === "no" || raw === "n" || raw === "false" || raw === "0") {
      return "no";
    }
    if (
      raw === "unknown" ||
      raw === "unk" ||
      raw === "u" ||
      raw === "?"
    ) {
      return "unknown";
    }
    return "";
  }

  function caseFlagLabel(value) {
    var flag = normalizeCaseFlag(value);
    if (flag === "yes") {
      return "Yes";
    }
    if (flag === "no") {
      return "No";
    }
    if (flag === "unknown") {
      return "Unknown";
    }
    return "";
  }

  function parseTimestamp(value) {
    var raw = String(value || "").trim();
    var day = raw.match(DATE_RE);
    if (day) {
      return Date.UTC(Number(day[3]), Number(day[1]) - 1, Number(day[2]));
    }
    var monthOnly = raw.match(MONTH_RE);
    if (monthOnly) {
      return Date.UTC(Number(monthOnly[2]), Number(monthOnly[1]) - 1, 1);
    }
    var m = raw.match(TS_RE);
    if (!m) {
      return 0;
    }
    var month = Number(m[1]);
    var date = Number(m[2]);
    var year = Number(m[3]);
    var hour = Number(m[4]);
    var minute = Number(m[5]);
    var second = Number(m[6]);
    var ampm = m[7].toUpperCase();
    if (ampm === "PM" && hour !== 12) {
      hour += 12;
    }
    if (ampm === "AM" && hour === 12) {
      hour = 0;
    }
    return Date.UTC(year, month - 1, date, hour, minute, second);
  }

  function officerNumber(value) {
    var m = String(value || "").trim().match(OFFICER_RE);
    return m ? Number(m[1]) : 0;
  }

  function uniqueOfficers(records) {
    var seen = {};
    var out = [];
    (records || []).forEach(function (row) {
      var id = row.officer_id;
      if (id && !seen[id]) {
        seen[id] = true;
        out.push(id);
      }
    });
    out.sort(function (a, b) {
      return officerNumber(a) - officerNumber(b);
    });
    return out;
  }

  function officerCounts(records) {
    var map = {};
    (records || []).forEach(function (row) {
      var id = row.officer_id;
      if (!id) {
        return;
      }
      map[id] = (map[id] || 0) + 1;
    });
    var out = Object.keys(map).map(function (id) {
      return { officer_id: id, count: map[id] };
    });
    out.sort(function (a, b) {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return officerNumber(a.officer_id) - officerNumber(b.officer_id);
    });
    return out;
  }

  function medianCount(counts) {
    var vals = (counts || []).map(function (row) {
      return row.count;
    });
    if (!vals.length) {
      return 0;
    }
    vals.sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(vals.length / 2);
    if (vals.length % 2) {
      return vals[mid];
    }
    return (vals[mid - 1] + vals[mid]) / 2;
  }

  function volumeStats(records, topN) {
    var counts = officerCounts(records);
    var total = (records || []).length;
    var n = Math.max(1, Number(topN) || 5);
    var top = counts.slice(0, n);
    var topSum = 0;
    top.forEach(function (row) {
      topSum += row.count;
    });
    return {
      officers: counts.length,
      total: total,
      median: medianCount(counts),
      top: top,
      topShare: total ? topSum / total : 0,
    };
  }

  function formatCount(n) {
    return Number(n).toLocaleString("en-US");
  }

  function timesMedianLabel(count, median) {
    if (!median) {
      return "";
    }
    return "about " + Math.round(count / median) + "×";
  }

  function filterRows(records, query, officerId, casePresent) {
    var q = String(query || "").trim().toLowerCase();
    var officer = String(officerId || "").trim();
    var caseFlag = normalizeCaseFlag(casePresent);
    return (records || []).filter(function (row) {
      if (officer && row.officer_id !== officer) {
        return false;
      }
      if (caseFlag && normalizeCaseFlag(row.case_number_present) !== caseFlag) {
        return false;
      }
      if (!q) {
        return true;
      }
      var rowId = String(row.row_id || "");
      var hash = String(row.sha256_hash || "").toLowerCase();
      return (
        rowId === q ||
        hash.indexOf(q) !== -1 ||
        row.officer_id.toLowerCase().indexOf(q) !== -1 ||
        row.timestamp.toLowerCase().indexOf(q) !== -1 ||
        row.reason.toLowerCase().indexOf(q) !== -1 ||
        normalizeCaseFlag(row.case_number_present).indexOf(q) !== -1 ||
        caseFlagLabel(row.case_number_present).toLowerCase().indexOf(q) !== -1
      );
    });
  }

  function sortRows(records, newestFirst) {
    var copy = (records || []).slice();
    copy.sort(function (a, b) {
      var diff = parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp);
      if (diff === 0) {
        var idDiff = (a.row_id || 0) - (b.row_id || 0);
        if (idDiff !== 0) {
          return idDiff;
        }
        return officerNumber(a.officer_id) - officerNumber(b.officer_id);
      }
      return newestFirst === false ? diff : -diff;
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

  function setText(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  function fillSelect(doc, select, counts) {
    if (!select) {
      return;
    }
    var current = select.value;
    select.innerHTML = "";
    var all = doc.createElement("option");
    all.value = "";
    all.textContent = "All officers";
    select.appendChild(all);
    (counts || []).forEach(function (item) {
      var id = item.officer_id;
      var opt = doc.createElement("option");
      opt.value = id;
      opt.textContent = id + " (" + formatCount(item.count) + ")";
      select.appendChild(opt);
    });
    if (current && (counts || []).some(function (item) { return item.officer_id === current; })) {
      select.value = current;
    }
  }

  function markVolumeActive(root, officerId) {
    if (!root) {
      return;
    }
    var buttons = root.querySelectorAll("[data-audit-volume-officer]");
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      var active = btn.getAttribute("data-audit-volume-officer") === officerId;
      if (active) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function renderVolume(doc, el, stats, onOfficer) {
    if (!el) {
      return;
    }
    el.textContent = "";
    if (!stats || !stats.top || !stats.top.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var lead = stats.top[0];
    var sharePct = Math.round(stats.topShare * 100);
    var p = doc.createElement("p");
    p.className = "audit-log-volume-copy";
    p.textContent =
      stats.top.length +
      " of " +
      stats.officers +
      " officers ran " +
      sharePct +
      "% of these lookups. " +
      lead.officer_id +
      " ran " +
      formatCount(lead.count) +
      " — " +
      timesMedianLabel(lead.count, stats.median) +
      " a typical officer (median " +
      formatCount(stats.median) +
      "). High volume can mean a detective, a busy assignment, or a shared login. It is not, by itself, a finding of misuse. Click a token to filter the table.";
    el.appendChild(p);
    var list = doc.createElement("div");
    list.className = "audit-log-volume-list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Officers with the most lookups");
    stats.top.forEach(function (item) {
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "audit-log-volume-btn";
      btn.setAttribute("data-audit-volume-officer", item.officer_id);
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute(
        "aria-label",
        "Filter to " + item.officer_id + ", " + formatCount(item.count) + " lookups"
      );
      btn.textContent = item.officer_id + " · " + formatCount(item.count);
      btn.addEventListener("click", function () {
        onOfficer(item.officer_id);
      });
      list.appendChild(btn);
    });
    el.appendChild(list);
  }

  function renderTable(doc, tbody, rows, onOfficer) {
    tbody.textContent = "";
    if (!rows.length) {
      var empty = doc.createElement("tr");
      var cell = doc.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No lookups match those filters.";
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      var idTd = doc.createElement("td");
      idTd.textContent = row.row_id ? String(row.row_id) : "—";
      var officerTd = doc.createElement("td");
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "audit-log-officer";
      btn.textContent = row.officer_id;
      btn.setAttribute("aria-label", "Filter to " + row.officer_id);
      btn.addEventListener("click", function () {
        onOfficer(row.officer_id);
      });
      officerTd.appendChild(btn);
      var ts = doc.createElement("td");
      ts.textContent = row.timestamp;
      var reason = doc.createElement("td");
      reason.textContent = row.reason;
      var caseTd = doc.createElement("td");
      caseTd.textContent = caseFlagLabel(row.case_number_present) || "—";
      var hashTd = doc.createElement("td");
      var hashBtn = doc.createElement("button");
      hashBtn.type = "button";
      hashBtn.className = "audit-log-hash";
      hashBtn.textContent = row.sha256_hash || "—";
      if (row.row_id && row.sha256_hash) {
        hashBtn.title = "Copy row ID " + row.row_id + " and SHA-256 hash";
        hashBtn.setAttribute(
          "aria-label",
          "Copy SHA-256 hash for row ID " + row.row_id
        );
        hashBtn.addEventListener("click", function () {
          var receipt = String(row.row_id) + " " + row.sha256_hash;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(receipt);
          }
        });
      }
      hashTd.appendChild(hashBtn);
      tr.appendChild(idTd);
      tr.appendChild(officerTd);
      tr.appendChild(ts);
      tr.appendChild(reason);
      tr.appendChild(caseTd);
      tr.appendChild(hashTd);
      tbody.appendChild(tr);
    });
  }

  function recordsFromBundle(data) {
    if (!data || !data.rows || !data.rows.length) {
      return [];
    }
    return data.rows.map(function (cells) {
      return {
        row_id: normalizeRowId(cells && cells[0]),
        officer_id: String((cells && cells[1]) || "").trim(),
        timestamp: String((cells && cells[2]) || "").trim(),
        reason: String((cells && cells[3]) || "").trim(),
        case_number_present: normalizeCaseFlag(cells && cells[4]),
        sha256_hash: normalizeSourceHash(cells && cells[5]),
      };
    });
  }

  function initSearchLog(doc, options) {
    doc = doc || document;
    options = options || {};
    var root = doc.querySelector("[data-audit-log]");
    if (!root) {
      return null;
    }

    var search = root.querySelector("[data-audit-search]");
    var officerSelect = root.querySelector("[data-audit-officer]");
    var caseSelect = root.querySelector("[data-audit-case]");
    var pageSizeSelect = root.querySelector("[data-audit-page-size]");
    var status = root.querySelector("[data-audit-status]");
    var tbody = root.querySelector("[data-audit-body]");
    var prevBtn = root.querySelector("[data-audit-prev]");
    var nextBtn = root.querySelector("[data-audit-next]");
    var clearBtn = root.querySelector("[data-audit-clear]");
    var volumeEl = root.querySelector("[data-audit-volume]");
    var csvUrl = root.getAttribute("data-csv-url") || DEFAULT_CSV_URL;

    var records = [];
    var page = 1;
    var debounce = null;

    function currentPageSize() {
      return Number((pageSizeSelect && pageSizeSelect.value) || 15);
    }

    function draw() {
      var filtered = sortRows(
        filterRows(
          records,
          search ? search.value : "",
          officerSelect ? officerSelect.value : "",
          caseSelect ? caseSelect.value : ""
        ),
        true
      );
      var sliced = pageRows(filtered, page, currentPageSize());
      page = sliced.page;
      if (tbody) {
        renderTable(doc, tbody, sliced.rows, function (officerId) {
          if (officerSelect) {
            officerSelect.value = officerId;
          }
          page = 1;
          draw();
        });
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
              " lookups"
          : "No lookups match those filters."
      );
      if (prevBtn) {
        prevBtn.disabled = sliced.page <= 1;
      }
      if (nextBtn) {
        nextBtn.disabled = sliced.page >= sliced.pageCount;
      }
      markVolumeActive(volumeEl, officerSelect ? officerSelect.value : "");
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
    if (officerSelect) {
      officerSelect.addEventListener("change", onFilterChange);
    }
    if (caseSelect) {
      caseSelect.addEventListener("change", onFilterChange);
    }
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener("change", onFilterChange);
    }
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
        if (search) {
          search.value = "";
        }
        if (officerSelect) {
          officerSelect.value = "";
        }
        if (caseSelect) {
          caseSelect.value = "";
        }
        page = 1;
        draw();
      });
    }

    function applyRecords(list) {
      records = list || [];
      var counts = officerCounts(records);
      fillSelect(doc, officerSelect, counts);
      renderVolume(doc, volumeEl, volumeStats(records, 5), function (officerId) {
        if (officerSelect) {
          if (officerSelect.value === officerId) {
            officerSelect.value = "";
          } else {
            officerSelect.value = officerId;
          }
        }
        page = 1;
        draw();
      });
      draw();
    }

    setText(status, "Loading log…");

    if (options.data) {
      applyRecords(recordsFromBundle(options.data));
      return { records: records, draw: draw };
    }

    var LOAD_ERROR =
      "Could not load the search log. Serve the site over http://localhost (file:// cannot read the CSV) or use the CSV download.";

    var fetchFn = Object.prototype.hasOwnProperty.call(options, "fetch")
      ? options.fetch
      : typeof fetch === "function"
        ? fetch
        : null;
    if (!fetchFn) {
      setText(status, LOAD_ERROR);
      return { records: records, draw: draw };
    }

    fetchFn(csvUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.text();
      })
      .then(function (text) {
        applyRecords(csvToRecords(text));
      })
      .catch(function () {
        setText(status, LOAD_ERROR);
      });

    return { records: records, draw: draw };
  }

  return {
    DEFAULT_CSV_URL: DEFAULT_CSV_URL,
    parseCsv: parseCsv,
    csvToRecords: csvToRecords,
    normalizeRowId: normalizeRowId,
    normalizeSourceHash: normalizeSourceHash,
    canonicalSourcePayload: canonicalSourcePayload,
    parseTimestamp: parseTimestamp,
    officerNumber: officerNumber,
    uniqueOfficers: uniqueOfficers,
    officerCounts: officerCounts,
    volumeStats: volumeStats,
    normalizeCaseFlag: normalizeCaseFlag,
    caseFlagLabel: caseFlagLabel,
    filterRows: filterRows,
    sortRows: sortRows,
    pageRows: pageRows,
    recordsFromBundle: recordsFromBundle,
    initSearchLog: initSearchLog,
  };
});
