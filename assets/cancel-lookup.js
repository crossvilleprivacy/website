/**
 * Municipal cancellations lookup (national.html#cancel-lookup;
 * tennessee.html#cancel-lookup with data-state-lock="TN").
 * Works in the browser and under Node (CommonJS) for unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CancelLookup = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_JSON_URL = "docs/Flock_Municipal_Cancellations_Database.json";
  var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var MONTH_RE = /^(\d{4})-(\d{2})$/;
  var CASE_ID_RE = /CAN-\d{4}-\d{3}/g;
  var MONTHS = [
    "Jan.",
    "Feb.",
    "Mar.",
    "Apr.",
    "May",
    "June",
    "July",
    "Aug.",
    "Sept.",
    "Oct.",
    "Nov.",
    "Dec.",
  ];
  var CLEAR_EXIT_TYPES = [
    "Terminated",
    "Non-renewal",
    "Rescinded",
    "Pre-install cancel",
  ];
  var REASON_BUCKETS = [
    {
      id: "backlash",
      label: "Public opposition",
      re: /backlash|resident|community opposition|community pressure|community trust|public pressure|public opposition|organized opposition|testimony|petition|grassroots|advocacy|campaign|public demand|public scrutiny|not willing to accept|citizen/i,
    },
    {
      id: "privacy",
      label: "Privacy / surveillance",
      re: /privacy|surveillance|fourth amendment|civil liberties|constitutional/i,
    },
    {
      id: "ice",
      label: "ICE / immigration",
      re: /\bICE\b|immigration|sanctuary/i,
    },
    {
      id: "federal",
      label: "Federal / out-of-state access",
      re: /federal|out-of-state|outside agency|CBP|ATF|\bGSA\b|national lookup|nationwide sharing|data.?sharing|third-party|data ownership|local-control|local control/i,
    },
    {
      id: "vendor",
      label: "Vendor trust failure",
      re: /unauthorized|reactivat|misrepresentation|breach of trust|vendor trust|vendor swap|trust failure|installed without|origin unknown|replacement vendor|permitting/i,
    },
    {
      id: "audit",
      label: "Audit / state law",
      re: /audit|retention|compliance|liability|FOIA|oversight|state (?:alpr|law)|new state/i,
    },
    {
      id: "cost",
      label: "Cost / low use",
      re: /cost|ROI|fee|grant|low (?:local crime|officer use|utility)|taxpayer|fiscal|buyout|free trial|trial ending|alert volume|not the right time/i,
    },
    {
      id: "misuse",
      label: "Officer misuse",
      re: /misuse|inappropriate-use|officer database/i,
    },
  ];
  var STATE_NAMES = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    DC: "District of Columbia",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
  };

  function recordsFromDossier(data) {
    if (!data || !data.records || !data.records.length) {
      return [];
    }
    return data.records.map(function (row) {
      var reasons = String((row && row.Primary_Reasons) || "").trim();
      var mapped = {
        Case_ID: String((row && row.Case_ID) || "").trim(),
        Jurisdiction: String((row && row.Jurisdiction) || "").trim(),
        State: String((row && row.State) || "").trim().toUpperCase(),
        Action_Type: String((row && row.Action_Type) || "").trim(),
        Action_Date: String((row && row.Action_Date) || "").trim(),
        Camera_Count: row && row.Camera_Count != null && row.Camera_Count !== ""
          ? Number(row.Camera_Count)
          : null,
        Primary_Reasons: reasons,
        Public_Backlash_Cited: String((row && row.Public_Backlash_Cited) || "").trim().toUpperCase(),
        Reason_Tags: splitReasons(reasons),
        Summary: String((row && row.Summary) || "").trim(),
        Primary_Source_URL: String((row && row.Primary_Source_URL) || "").trim(),
        Secondary_Source_URL: String((row && row.Secondary_Source_URL) || "").trim(),
        Source_URLs: collectSourceUrls(
          row && row.Primary_Source_URL,
          row && row.Secondary_Source_URL
        ),
        Verification_Status: String((row && row.Verification_Status) || "").trim(),
        Incomplete_Exit_Notes: String((row && row.Incomplete_Exit_Notes) || "").trim(),
      };
      mapped.Reason_Buckets = reasonBucketsForRow(mapped);
      return mapped;
    });
  }

  function stateName(code) {
    var key = String(code || "").trim().toUpperCase();
    return STATE_NAMES[key] || "";
  }

  function isClearExit(row) {
    return CLEAR_EXIT_TYPES.indexOf(row && row.Action_Type) !== -1;
  }

  function splitReasons(text) {
    return String(text || "")
      .split(";")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  function reasonBucketsForRow(row) {
    var blob = String((row && row.Primary_Reasons) || "");
    var out = [];
    var i;
    if (String((row && row.Public_Backlash_Cited) || "").toUpperCase() === "Y") {
      blob += " public backlash";
    }
    for (i = 0; i < REASON_BUCKETS.length; i += 1) {
      if (REASON_BUCKETS[i].re.test(blob)) {
        out.push(REASON_BUCKETS[i].id);
      }
    }
    return out;
  }

  function parseActionDate(value) {
    var raw = String(value || "").trim();
    var day = raw.match(DAY_RE);
    if (day) {
      return Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    }
    var month = raw.match(MONTH_RE);
    if (month) {
      return Date.UTC(Number(month[1]), Number(month[2]) - 1, 1);
    }
    return 0;
  }

  function formatActionDate(value) {
    var raw = String(value || "").trim();
    var day = raw.match(DAY_RE);
    if (day) {
      return MONTHS[Number(day[2]) - 1] + " " + Number(day[3]) + ", " + day[1];
    }
    var month = raw.match(MONTH_RE);
    if (month) {
      return MONTHS[Number(month[2]) - 1] + " " + month[1];
    }
    return raw || "—";
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

  function mergeArticleSources(records, doc, anchors) {
    return (records || []).map(function (row) {
      var hash = anchors && row && anchors[row.Case_ID];
      var merged = uniqueHttpUrls((row.Source_URLs || []).concat(articleSourceUrls(doc, hash)));
      row.Source_URLs = merged;
      if (!row.Primary_Source_URL && merged[0]) {
        row.Primary_Source_URL = merged[0];
      }
      return row;
    });
  }

  function haystack(row) {
    return [
      row.Case_ID,
      row.Jurisdiction,
      row.State,
      stateName(row.State),
      row.Action_Type,
      row.Action_Date,
      row.Primary_Reasons,
      (row.Reason_Tags || []).join(" "),
      row.Summary,
      row.Verification_Status,
      row.Incomplete_Exit_Notes,
      row.Primary_Source_URL,
      (row.Source_URLs || []).join(" "),
    ]
      .join(" ")
      .toLowerCase();
  }

  function filterRows(records, query, state, actionType, kind, reason) {
    var q = String(query || "").trim().toLowerCase();
    var st = String(state || "").trim().toUpperCase();
    var action = String(actionType || "").trim();
    var bucket = String(kind || "").trim();
    var why = String(reason || "").trim();
    return (records || []).filter(function (row) {
      if (st && row.State !== st) {
        return false;
      }
      if (action && row.Action_Type !== action) {
        return false;
      }
      if (bucket === "ended" && !isClearExit(row)) {
        return false;
      }
      if (bucket === "other" && isClearExit(row)) {
        return false;
      }
      if (why && (row.Reason_Buckets || []).indexOf(why) === -1) {
        return false;
      }
      if (!q) {
        return true;
      }
      if (q.length === 2 && /^[a-z]{2}$/.test(q)) {
        return (
          row.State.toLowerCase() === q ||
          row.Jurisdiction.toLowerCase().indexOf(q) !== -1 ||
          row.Case_ID.toLowerCase().indexOf(q) !== -1
        );
      }
      return haystack(row).indexOf(q) !== -1;
    });
  }

  function lockedState(root) {
    return String((root && root.getAttribute && root.getAttribute("data-state-lock")) || "")
      .trim()
      .toUpperCase();
  }

  function applyStateLock(records, lock) {
    var code = String(lock || "").trim().toUpperCase();
    if (!code) {
      return records || [];
    }
    return (records || []).filter(function (row) {
      return String((row && row.State) || "").toUpperCase() === code;
    });
  }

  function hideLockedStateField(select) {
    if (!select) {
      return;
    }
    var field = select.parentNode;
    if (field && field.setAttribute) {
      field.setAttribute("hidden", "");
      field.hidden = true;
    }
  }

  function sortRows(records, newestFirst) {
    var copy = (records || []).slice();
    copy.sort(function (a, b) {
      var diff = parseActionDate(a.Action_Date) - parseActionDate(b.Action_Date);
      if (diff === 0) {
        var city = a.Jurisdiction.localeCompare(b.Jurisdiction);
        if (city !== 0) {
          return city;
        }
        return a.Case_ID.localeCompare(b.Case_ID);
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

  function stateCounts(records) {
    var map = {};
    (records || []).forEach(function (row) {
      var code = row.State;
      if (!code) {
        return;
      }
      map[code] = (map[code] || 0) + 1;
    });
    var out = Object.keys(map).map(function (code) {
      return { state: code, name: stateName(code), count: map[code] };
    });
    out.sort(function (a, b) {
      return a.state.localeCompare(b.state);
    });
    return out;
  }

  function statesForSelect(records) {
    return stateCounts(records)
      .slice()
      .sort(function (a, b) {
        return a.state.localeCompare(b.state);
      });
  }

  function actionCounts(records) {
    var map = {};
    (records || []).forEach(function (row) {
      var type = row.Action_Type;
      if (!type) {
        return;
      }
      map[type] = (map[type] || 0) + 1;
    });
    var out = Object.keys(map).map(function (type) {
      return { action: type, count: map[type] };
    });
    out.sort(function (a, b) {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.action.localeCompare(b.action);
    });
    return out;
  }

  function reasonCounts(records) {
    var map = {};
    var out;
    (records || []).forEach(function (row) {
      (row.Reason_Buckets || []).forEach(function (id) {
        map[id] = (map[id] || 0) + 1;
      });
    });
    out = REASON_BUCKETS.map(function (bucket) {
      return {
        reason: bucket.id,
        label: bucket.label,
        count: map[bucket.id] || 0,
      };
    }).filter(function (item) {
      return item.count > 0;
    });
    out.sort(function (a, b) {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.label.localeCompare(b.label);
    });
    return out;
  }

  function cancellationsRoot(doc) {
    if (!doc || !doc.querySelector) {
      return null;
    }
    var node =
      doc.querySelector("#cancellations-section") ||
      doc.querySelector("#cancellations");
    if (!node) {
      return null;
    }
    if (typeof node.closest === "function") {
      var section = node.closest("section");
      if (section) {
        return section;
      }
    }
    return node;
  }

  function notifyLayout(doc) {
    var api = typeof CrossvilleCampaign !== "undefined" ? CrossvilleCampaign : null;
    if (api && typeof api.notifyLayout === "function") {
      api.notifyLayout(doc);
    }
  }

  function caseAnchorsFromDoc(doc) {
    var map = {};
    if (!doc || !doc.querySelectorAll) {
      return map;
    }
    var scope =
      cancellationsRoot(doc) ||
      (doc.querySelector("#regional") || doc.querySelector("#tn-lookup"));
    var rootEl = scope || doc;
    if (!rootEl.querySelectorAll) {
      return map;
    }
    var nodes = rootEl.querySelectorAll("article[id]");
    var i;
    var text;
    var match;
    var id;
    for (i = 0; i < nodes.length; i += 1) {
      id = nodes[i].id;
      text = String(nodes[i].textContent || "");
      CASE_ID_RE.lastIndex = 0;
      match = CASE_ID_RE.exec(text);
      while (match) {
        if (!map[match[0]]) {
          map[match[0]] = "#" + id;
        }
        match = CASE_ID_RE.exec(text);
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
    if (
      current &&
      (items || []).some(function (item) {
        return item[valueKey] === current;
      })
    ) {
      select.value = current;
    }
  }

  function markStateActive(root, state) {
    if (!root) {
      return;
    }
    var buttons = root.querySelectorAll("[data-cancel-state-chip]");
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      var active = btn.getAttribute("data-cancel-state-chip") === state;
      if (active) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function renderStateChips(doc, el, counts, onState) {
    if (!el) {
      return;
    }
    el.textContent = "";
    if (!counts || !counts.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var p = doc.createElement("p");
    p.className = "audit-log-volume-copy";
    p.textContent =
      counts.length +
      " states in this dossier. Click a state to filter. Click again to show every state.";
    el.appendChild(p);
    var list = doc.createElement("div");
    list.className = "audit-log-volume-list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Filter cancellations by state");
    counts.forEach(function (item) {
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "audit-log-volume-btn";
      btn.setAttribute("data-cancel-state-chip", item.state);
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute(
        "aria-label",
        "Filter to " +
          (item.name || item.state) +
          ", " +
          formatCount(item.count) +
          " records"
      );
      btn.textContent = item.state + " · " + formatCount(item.count);
      btn.addEventListener("click", function () {
        onState(item.state);
      });
      list.appendChild(btn);
    });
    el.appendChild(list);
  }

  function setCellLabel(td, label) {
    if (td && label) {
      td.setAttribute("data-label", label);
    }
    return td;
  }

  function renderCityCell(doc, row, href, onState) {
    var td = doc.createElement("td");
    setCellLabel(td, "City");
    if (href && row.Jurisdiction) {
      var cityLink = doc.createElement("a");
      cityLink.href = href;
      cityLink.textContent = row.Jurisdiction;
      td.appendChild(cityLink);
    } else {
      td.appendChild(doc.createTextNode(row.Jurisdiction || row.Case_ID));
    }
    if (row.State) {
      td.appendChild(doc.createTextNode(", "));
      if (typeof onState === "function") {
        var stateBtn = doc.createElement("button");
        stateBtn.type = "button";
        stateBtn.className = "audit-log-officer";
        stateBtn.textContent = row.State;
        stateBtn.setAttribute("aria-label", "Filter to " + row.State);
        stateBtn.addEventListener("click", function () {
          onState(row.State);
        });
        td.appendChild(stateBtn);
      } else {
        td.appendChild(doc.createTextNode(row.State));
      }
    }
    if (row.Camera_Count != null && !Number.isNaN(row.Camera_Count)) {
      var cams = doc.createElement("div");
      cams.className = "cancel-lookup-meta";
      cams.textContent =
        formatCount(row.Camera_Count) +
        (row.Camera_Count === 1 ? " camera" : " cameras");
      td.appendChild(cams);
    }
    return td;
  }

  function renderTable(doc, tbody, rows, anchors, onState) {
    tbody.textContent = "";
    if (!rows.length) {
      var empty = doc.createElement("tr");
      var cell = doc.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No cities match those filters.";
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      var href = (anchors && anchors[row.Case_ID]) || "";
      tr.appendChild(renderCityCell(doc, row, href, onState));

      var actionTd = doc.createElement("td");
      setCellLabel(actionTd, "Action");
      actionTd.textContent = row.Action_Type || "—";
      tr.appendChild(actionTd);

      var dateTd = doc.createElement("td");
      setCellLabel(dateTd, "Date");
      var time = doc.createElement("time");
      if (row.Action_Date) {
        time.setAttribute("datetime", row.Action_Date);
      }
      time.textContent = formatActionDate(row.Action_Date);
      dateTd.appendChild(time);
      tr.appendChild(dateTd);

      var reasonTd = doc.createElement("td");
      reasonTd.className = "cancel-lookup-reasons";
      setCellLabel(reasonTd, "Reasons");
      reasonTd.textContent =
        row.Reason_Tags && row.Reason_Tags.length ? row.Reason_Tags.join(" · ") : "—";
      tr.appendChild(reasonTd);

      var idTd = doc.createElement("td");
      setCellLabel(idTd, "Case ID");
      if (href) {
        var idLink = doc.createElement("a");
        idLink.href = href;
        idLink.textContent = row.Case_ID;
        idTd.appendChild(idLink);
      } else {
        idTd.textContent = row.Case_ID || "—";
      }
      tr.appendChild(idTd);

      var srcTd = doc.createElement("td");
      setCellLabel(srcTd, "Sources");
      var sourceUrls = uniqueHttpUrls(
        row.Source_URLs && row.Source_URLs.length
          ? row.Source_URLs
          : row.Primary_Source_URL
            ? [row.Primary_Source_URL]
            : []
      );
      var seenHosts = {};
      srcTd.className = "lookup-source-cell";
      if (!sourceUrls.length) {
        srcTd.textContent = "—";
      } else {
        sourceUrls.forEach(function (url, i) {
          if (i) {
            srcTd.appendChild(doc.createTextNode(" · "));
          }
          var src = doc.createElement("a");
          src.href = url;
          src.target = "_blank";
          src.rel = "noopener";
          src.textContent = sourceLabel(url, seenHosts);
          srcTd.appendChild(src);
        });
      }
      tr.appendChild(srcTd);
      tbody.appendChild(tr);
    });
  }

  function initCancelLookup(doc, options) {
    doc = doc || document;
    options = options || {};
    var root = doc.querySelector("[data-cancel-lookup]");
    if (!root) {
      return null;
    }

    var search = root.querySelector("[data-cancel-search]");
    var stateSelect = root.querySelector("[data-cancel-state]");
    var actionSelect = root.querySelector("[data-cancel-action]");
    var reasonSelect = root.querySelector("[data-cancel-reason]");
    var kindSelect = root.querySelector("[data-cancel-kind]");
    var pageSizeSelect = root.querySelector("[data-cancel-page-size]");
    var status = root.querySelector("[data-cancel-status]");
    var tbody = root.querySelector("[data-cancel-body]");
    var prevBtn = root.querySelector("[data-cancel-prev]");
    var nextBtn = root.querySelector("[data-cancel-next]");
    var clearBtn = root.querySelector("[data-cancel-clear]");
    var chipsEl = root.querySelector("[data-cancel-states]");
    var jsonUrl = root.getAttribute("data-json-url") || DEFAULT_JSON_URL;
    var stateLock = lockedState(root);
    var anchors = caseAnchorsFromDoc(doc);
    hideLockedStateField(stateLock ? stateSelect : null);
    if (stateLock && chipsEl) {
      chipsEl.hidden = true;
      chipsEl.setAttribute("hidden", "");
    }

    var records = [];
    var page = 1;
    var debounce = null;

    function currentPageSize() {
      return Number((pageSizeSelect && pageSizeSelect.value) || 15);
    }

    function currentState() {
      return stateLock || (stateSelect ? stateSelect.value : "");
    }

    function setState(code) {
      if (stateLock || !stateSelect) {
        return;
      }
      if (stateSelect.value === code) {
        stateSelect.value = "";
      } else {
        stateSelect.value = code;
      }
    }

    function draw() {
      var filtered = sortRows(
        filterRows(
          records,
          search ? search.value : "",
          currentState(),
          actionSelect ? actionSelect.value : "",
          kindSelect ? kindSelect.value : "",
          reasonSelect ? reasonSelect.value : ""
        ),
        true
      );
      var sliced = pageRows(filtered, page, currentPageSize());
      page = sliced.page;
      if (tbody) {
        renderTable(
          doc,
          tbody,
          sliced.rows,
          anchors,
          stateLock
            ? null
            : function (state) {
                setState(state);
                page = 1;
                draw();
              }
        );
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
              (stateLock
                ? " " + (stateName(stateLock) || stateLock) + " records"
                : " records")
          : "No cities match those filters."
      );
      if (prevBtn) {
        prevBtn.disabled = sliced.page <= 1;
      }
      if (nextBtn) {
        nextBtn.disabled = sliced.page >= sliced.pageCount;
      }
      markStateActive(chipsEl, currentState());
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
    if (stateSelect) {
      stateSelect.addEventListener("change", onFilterChange);
    }
    if (actionSelect) {
      actionSelect.addEventListener("change", onFilterChange);
    }
    if (reasonSelect) {
      reasonSelect.addEventListener("change", onFilterChange);
    }
    if (kindSelect) {
      kindSelect.addEventListener("change", onFilterChange);
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
        if (stateSelect && !stateLock) {
          stateSelect.value = "";
        }
        if (actionSelect) {
          actionSelect.value = "";
        }
        if (reasonSelect) {
          reasonSelect.value = "";
        }
        if (kindSelect) {
          kindSelect.value = "";
        }
        page = 1;
        draw();
      });
    }

    function applyRecords(list) {
      records = mergeArticleSources(list || [], doc, anchors);
      if (stateLock) {
        records = applyStateLock(records, stateLock);
      }
      fillSelect(
        doc,
        stateSelect,
        statesForSelect(records),
        "All states",
        "state",
        function (item) {
          return item.state + " (" + formatCount(item.count) + ")";
        }
      );
      fillSelect(
        doc,
        actionSelect,
        actionCounts(records),
        "All actions",
        "action",
        function (item) {
          return item.action + " (" + formatCount(item.count) + ")";
        }
      );
      fillSelect(
        doc,
        reasonSelect,
        reasonCounts(records),
        "All reasons",
        "reason",
        function (item) {
          return item.label + " (" + formatCount(item.count) + ")";
        }
      );
      if (!stateLock) {
        renderStateChips(doc, chipsEl, stateCounts(records), function (state) {
          setState(state);
          page = 1;
          draw();
        });
      }
      draw();
      notifyLayout(doc);
    }

    setText(status, "Loading cancellations…");

    if (options.data) {
      applyRecords(recordsFromDossier(options.data));
      return { records: records, draw: draw };
    }

    var LOAD_ERROR =
      "Could not load this table. Try again on the live site.";

    var fetchFn = options.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fetchFn) {
      setText(status, LOAD_ERROR);
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
        applyRecords(recordsFromDossier(data));
      })
      .catch(function () {
        setText(status, LOAD_ERROR);
      });

    return { records: records, draw: draw };
  }

  return {
    DEFAULT_JSON_URL: DEFAULT_JSON_URL,
    CLEAR_EXIT_TYPES: CLEAR_EXIT_TYPES,
    recordsFromDossier: recordsFromDossier,
    collectSourceUrls: collectSourceUrls,
    stateName: stateName,
    isClearExit: isClearExit,
    parseActionDate: parseActionDate,
    formatActionDate: formatActionDate,
    filterRows: filterRows,
    sortRows: sortRows,
    pageRows: pageRows,
    stateCounts: stateCounts,
    statesForSelect: statesForSelect,
    actionCounts: actionCounts,
    reasonCounts: reasonCounts,
    splitReasons: splitReasons,
    reasonBucketsForRow: reasonBucketsForRow,
    setCellLabel: setCellLabel,
    renderTable: renderTable,
    caseAnchorsFromDoc: caseAnchorsFromDoc,
    cancellationsRoot: cancellationsRoot,
    lockedState: lockedState,
    applyStateLock: applyStateLock,
    initCancelLookup: initCancelLookup,
  };
});
