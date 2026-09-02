/**
 * Officials stance lookup (officials.html#officials-lookup).
 * Fetches docs/Politician_Stances.json. Do not inline a second copy.
 * Works in the browser and under Node (CommonJS) for unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PoliticianLookup = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_JSON_URL = "docs/Politician_Stances.json";
  var LOAD_ERROR = "Could not load this table. Try again on the live site.";
  var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var MONTH_RE = /^(\d{4})-(\d{2})$/;
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
  var STANCE_LABELS = {
    ban: "Ban / cut funding",
    restrict: "Restrict / new rules",
    pulled: "Pulled cameras",
    hedge: "Hedge / keep with rules",
  };
  var LEVEL_LABELS = {
    federal: "Congress",
    statewide: "Statewide",
    local: "Local",
  };
  var PARTY_LABELS = {
    R: "R",
    D: "D",
    I: "I",
    N: "Other",
  };
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

  function trim(value) {
    return String(value == null ? "" : value).trim();
  }

  function stanceLabel(stance) {
    var key = trim(stance);
    return STANCE_LABELS[key] || key || "—";
  }

  function levelLabel(level) {
    var key = trim(level);
    return LEVEL_LABELS[key] || key || "—";
  }

  function partyLabel(party) {
    var key = trim(party).toUpperCase();
    if (!key) {
      return "Other";
    }
    return PARTY_LABELS[key] || key;
  }

  function stateName(code) {
    var st = trim(code).toUpperCase();
    return STATE_NAMES[st] || st;
  }

  function parseActionDate(value) {
    var raw = trim(value);
    var day = DAY_RE.exec(raw);
    var month;
    if (day) {
      return Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    }
    month = MONTH_RE.exec(raw);
    if (month) {
      return Date.UTC(Number(month[1]), Number(month[2]) - 1, 1);
    }
    return 0;
  }

  function formatActionDate(value) {
    var raw = trim(value);
    var day = DAY_RE.exec(raw);
    var month;
    var monthName;
    if (day) {
      monthName = MONTHS[Number(day[2]) - 1];
      return monthName + " " + Number(day[3]) + ", " + day[1];
    }
    month = MONTH_RE.exec(raw);
    if (month) {
      monthName = MONTHS[Number(month[2]) - 1];
      return monthName + " " + month[1];
    }
    return raw || "—";
  }

  function recordsFromIndex(data) {
    var list = data && Array.isArray(data.records) ? data.records : [];
    return list.map(function (row) {
      return {
        Slug: trim(row.Slug),
        Name: trim(row.Name),
        Office: trim(row.Office),
        State: trim(row.State).toUpperCase(),
        Party: trim(row.Party).toUpperCase() || "N",
        Level: trim(row.Level),
        Stance: trim(row.Stance),
        Stance_Label: stanceLabel(row.Stance),
        Date: trim(row.Date),
        Date_Label: formatActionDate(row.Date),
        What: trim(row.What),
        Writeup: trim(row.Writeup),
        Source_URL: trim(row.Source_URL),
      };
    });
  }

  function haystack(row) {
    return [
      row.Name,
      row.Office,
      row.State,
      stateName(row.State),
      row.Party,
      partyLabel(row.Party),
      row.Level,
      levelLabel(row.Level),
      row.Stance,
      row.Stance_Label,
      row.What,
      row.Slug,
      row.Writeup,
      row.Source_URL,
    ]
      .join(" ")
      .toLowerCase();
  }

  function filterRows(records, query, state, stance, level, party) {
    var q = trim(query).toLowerCase();
    var st = trim(state).toUpperCase();
    var stanceKey = trim(stance);
    var levelKey = trim(level);
    var partyKey = trim(party).toUpperCase();
    return (records || []).filter(function (row) {
      if (st && row.State !== st) {
        return false;
      }
      if (stanceKey && row.Stance !== stanceKey) {
        return false;
      }
      if (levelKey && row.Level !== levelKey) {
        return false;
      }
      if (partyKey === "N") {
        if (row.Party === "R" || row.Party === "D" || row.Party === "I") {
          return false;
        }
      } else if (partyKey && row.Party !== partyKey) {
        return false;
      }
      if (!q) {
        return true;
      }
      if (q.length === 2 && /^[a-z]{2}$/.test(q)) {
        return row.State.toLowerCase() === q;
      }
      return haystack(row).indexOf(q) !== -1;
    });
  }

  function sortRows(records, newestFirst) {
    var copy = (records || []).slice();
    copy.sort(function (a, b) {
      var diff = parseActionDate(a.Date) - parseActionDate(b.Date);
      if (diff === 0) {
        return a.Name.localeCompare(b.Name);
      }
      return newestFirst === false ? diff : -diff;
    });
    return copy;
  }

  function pageRows(rows, page, size) {
    var total = (rows || []).length;
    var pageCount = Math.max(1, Math.ceil(total / size) || 1);
    var p = Math.min(Math.max(1, page), pageCount);
    var start = (p - 1) * size;
    return {
      page: p,
      pageCount: pageCount,
      total: total,
      start: total ? start + 1 : 0,
      end: Math.min(start + size, total),
      rows: (rows || []).slice(start, start + size),
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
    var out = Object.keys(map).map(function (code) {
      return { state: code, name: stateName(code), count: map[code] };
    });
    out.sort(function (a, b) {
      return a.state.localeCompare(b.state);
    });
    return out;
  }

  function fillSelect(select, items, valueKey, labelFn, allLabel) {
    if (!select) {
      return;
    }
    var current = select.value;
    select.textContent = "";
    var all = select.ownerDocument.createElement("option");
    all.value = "";
    all.textContent = allLabel;
    select.appendChild(all);
    items.forEach(function (item) {
      var opt = select.ownerDocument.createElement("option");
      opt.value = item[valueKey];
      opt.textContent = labelFn(item);
      select.appendChild(opt);
    });
    if (current) {
      select.value = current;
    }
  }

  function sourceHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (err) {
      return "source";
    }
  }

  function renderTable(doc, tbody, rows) {
    tbody.textContent = "";
    if (!rows.length) {
      var empty = doc.createElement("tr");
      var cell = doc.createElement("td");
      cell.setAttribute("colspan", "6");
      cell.textContent = "No officials match those filters.";
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      var nameTd = doc.createElement("td");
      if (row.Writeup) {
        var link = doc.createElement("a");
        link.href = row.Writeup;
        link.textContent = row.Name;
        nameTd.appendChild(link);
      } else {
        nameTd.textContent = row.Name;
      }
      tr.appendChild(nameTd);

      var officeTd = doc.createElement("td");
      officeTd.textContent = row.Office || "—";
      tr.appendChild(officeTd);

      var stateTd = doc.createElement("td");
      stateTd.textContent = row.State || "—";
      tr.appendChild(stateTd);

      var stanceTd = doc.createElement("td");
      stanceTd.textContent = row.Stance_Label || "—";
      tr.appendChild(stanceTd);

      var dateTd = doc.createElement("td");
      dateTd.textContent = row.Date_Label || "—";
      tr.appendChild(dateTd);

      var srcTd = doc.createElement("td");
      if (row.Source_URL) {
        var src = doc.createElement("a");
        src.href = row.Source_URL;
        src.target = "_blank";
        src.rel = "noopener";
        src.textContent = sourceHost(row.Source_URL);
        srcTd.appendChild(src);
      } else {
        srcTd.textContent = "—";
      }
      tr.appendChild(srcTd);
      tbody.appendChild(tr);
    });
  }

  function setText(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  function initPoliticianLookup(doc, options) {
    doc = doc || document;
    options = options || {};
    var root = doc.querySelector("[data-politician-lookup]");
    if (!root) {
      return null;
    }

    var search = root.querySelector("[data-official-search]");
    var stateSelect = root.querySelector("[data-official-state]");
    var stanceSelect = root.querySelector("[data-official-stance]");
    var levelSelect = root.querySelector("[data-official-level]");
    var partySelect = root.querySelector("[data-official-party]");
    var pageSizeSelect = root.querySelector("[data-official-page-size]");
    var status = root.querySelector("[data-official-status]");
    var tbody = root.querySelector("[data-official-body]");
    var prevBtn = root.querySelector("[data-official-prev]");
    var nextBtn = root.querySelector("[data-official-next]");
    var clearBtn = root.querySelector("[data-official-clear]");
    var countEl = options.countEl || doc.querySelector("[data-official-count]");
    var asOfEl = options.asOfEl || doc.querySelector("[data-official-as-of]");
    var jsonUrl = root.getAttribute("data-json-url") || DEFAULT_JSON_URL;

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
          stateSelect ? stateSelect.value : "",
          stanceSelect ? stanceSelect.value : "",
          levelSelect ? levelSelect.value : "",
          partySelect ? partySelect.value : ""
        ),
        true
      );
      var sliced = pageRows(filtered, page, currentPageSize());
      page = sliced.page;
      if (tbody) {
        renderTable(doc, tbody, sliced.rows);
      }
      if (prevBtn) {
        prevBtn.disabled = page <= 1;
      }
      if (nextBtn) {
        nextBtn.disabled = page >= sliced.pageCount;
      }
      setText(
        status,
        sliced.total
          ? "Showing " + sliced.start + "–" + sliced.end + " of " + sliced.total + "."
          : "No officials match those filters."
      );
    }

    function scheduleDraw() {
      page = 1;
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(draw, 40);
    }

    function applyRecords(rows, meta) {
      records = rows || [];
      fillSelect(
        stateSelect,
        stateCounts(records),
        "state",
        function (item) {
          return item.state + " · " + item.name + " (" + item.count + ")";
        },
        "All states"
      );
      if (countEl) {
        countEl.textContent = String((meta && meta.record_count) || records.length);
      }
      if (asOfEl && meta && meta.as_of_long) {
        asOfEl.textContent = meta.as_of_long;
      }
      draw();
    }

    if (search) {
      search.addEventListener("input", scheduleDraw);
    }
    [stateSelect, stanceSelect, levelSelect, partySelect, pageSizeSelect].forEach(
      function (el) {
        if (el) {
          el.addEventListener("change", scheduleDraw);
          el.addEventListener("input", scheduleDraw);
        }
      }
    );
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
        if (stateSelect) {
          stateSelect.value = "";
        }
        if (stanceSelect) {
          stanceSelect.value = "";
        }
        if (levelSelect) {
          levelSelect.value = "";
        }
        if (partySelect) {
          partySelect.value = "";
        }
        page = 1;
        draw();
      });
    }

    if (options.records) {
      applyRecords(options.records, options.meta || {});
      return { records: records, draw: draw };
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
    STANCE_LABELS: STANCE_LABELS,
    LEVEL_LABELS: LEVEL_LABELS,
    recordsFromIndex: recordsFromIndex,
    stanceLabel: stanceLabel,
    levelLabel: levelLabel,
    partyLabel: partyLabel,
    parseActionDate: parseActionDate,
    formatActionDate: formatActionDate,
    filterRows: filterRows,
    sortRows: sortRows,
    pageRows: pageRows,
    stateCounts: stateCounts,
    renderTable: renderTable,
    initPoliticianLookup: initPoliticianLookup,
  };
});
