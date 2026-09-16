/**
 * Combined Tennessee lookup (tennessee.html).
 * Fetches docs/Tennessee_Flock_Index.json. Do not inline a second copy.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      typeof require === "function" ? require("./tennessee-index.js") : root.TennesseeIndex,
      typeof require === "function" ? require("./dossier-lookup.js") : root.DossierLookup
    );
  } else {
    root.TennesseeLookup = factory(root.TennesseeIndex, root.DossierLookup);
  }
})(typeof self !== "undefined" ? self : this, function (TennesseeIndex, DossierLookup) {
  "use strict";

  var JSON_URL = "docs/Tennessee_Flock_Index.json";
  var LOAD_ERROR = "Could not load this table. Try again on the live site.";
  var ID_RE = /(?:FLK|ALPR|CAN)-\d{4}-\d{3}|wrongful ID\s+(\d+)/gi;

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

  function anchorsFromDoc(doc) {
    var map = {};
    if (!doc || !doc.querySelectorAll) {
      return map;
    }
    var nodes = doc.querySelectorAll("article[id]");
    var i;
    var match;
    var re;
    var key;
    for (i = 0; i < nodes.length; i += 1) {
      re = new RegExp(ID_RE.source, "gi");
      match = re.exec(String(nodes[i].textContent || ""));
      while (match) {
        key = match[1] ? "ID " + match[1] : match[0];
        if (key && !map[key]) {
          map[key] = "#" + nodes[i].id;
        }
        match = re.exec(String(nodes[i].textContent || ""));
      }
    }
    return map;
  }

  function writeupHref(row, anchors) {
    if (row && row.Writeup) {
      return row.Writeup;
    }
    if (row && row.ID && anchors && anchors[row.ID]) {
      return anchors[row.ID];
    }
    return "";
  }

  function renderTable(doc, tbody, rows, anchors) {
    tbody.textContent = "";
    var helpers = DossierLookup || {};
    var setCellLabel = helpers.setCellLabel || function (td) { return td; };
    var addSourceCell = helpers.addSourceCell;
    if (!rows.length) {
      var empty = doc.createElement("tr");
      var cell = doc.createElement("td");
      cell.setAttribute("colspan", "6");
      cell.textContent = "No records match those filters.";
      empty.appendChild(cell);
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = doc.createElement("tr");
      var href = writeupHref(row, anchors);
      var place = doc.createElement("td");
      setCellLabel(place, "Place");
      if (href) {
        var a = doc.createElement("a");
        a.setAttribute("href", href);
        a.textContent = row.Place || row.ID || "—";
        place.appendChild(a);
      } else {
        place.textContent = row.Place || "—";
      }
      tr.appendChild(place);

      var kind = doc.createElement("td");
      setCellLabel(kind, "Type");
      kind.textContent = row.Kind_Label || row.Kind || "—";
      tr.appendChild(kind);

      var what = doc.createElement("td");
      setCellLabel(what, "What happened");
      what.textContent = row.What || "—";
      tr.appendChild(what);

      var date = doc.createElement("td");
      setCellLabel(date, "Date");
      date.textContent = row.Date_Label || "—";
      tr.appendChild(date);

      var idTd = doc.createElement("td");
      setCellLabel(idTd, "ID");
      if (href && row.ID && row.ID !== "—") {
        var idLink = doc.createElement("a");
        idLink.setAttribute("href", href);
        idLink.textContent = row.ID;
        idTd.appendChild(idLink);
      } else {
        idTd.textContent = row.ID || "—";
      }
      tr.appendChild(idTd);

      if (addSourceCell) {
        addSourceCell(doc, tr, row.Source_URLs || row.Source_URL);
      } else {
        var src = doc.createElement("td");
        setCellLabel(src, "Sources");
        src.textContent = row.Source_URL ? "Source" : "—";
        tr.appendChild(src);
      }
      tbody.appendChild(tr);
    });
  }

  function lockedKind(root) {
    return String((root && root.getAttribute && root.getAttribute("data-kind-lock")) || "").trim();
  }

  function initTennesseeLookup(doc, options) {
    doc = doc || document;
    options = options || {};
    var root = doc.querySelector("[data-tennessee-lookup]");
    if (!root) {
      return null;
    }
    var search = root.querySelector("[data-tn-search]");
    var kindSelect = root.querySelector("[data-tn-kind]");
    var pageSizeSelect = root.querySelector("[data-tn-page-size]");
    var status = root.querySelector("[data-tn-status]");
    var tbody = root.querySelector("[data-tn-body]");
    var prevBtn = root.querySelector("[data-tn-prev]");
    var nextBtn = root.querySelector("[data-tn-next]");
    var clearBtn = root.querySelector("[data-tn-clear]");
    var jsonUrl = root.getAttribute("data-json-url") || JSON_URL;
    var kindLock = lockedKind(root);
    var records = [];
    var anchors = anchorsFromDoc(doc);
    var page = 1;
    var debounce = null;
    if (kindLock && kindSelect) {
      kindSelect.value = kindLock;
      var kindField = kindSelect.parentNode;
      if (kindField && kindField.setAttribute) {
        kindField.setAttribute("hidden", "");
        kindField.hidden = true;
      }
    }

    function currentPageSize() {
      return Number((pageSizeSelect && pageSizeSelect.value) || 15);
    }

    function setText(el, text) {
      if (el) {
        el.textContent = text;
      }
    }

    function draw() {
      var filtered = TennesseeIndex.filterRows(
        records,
        search ? search.value : "",
        kindLock || (kindSelect ? kindSelect.value : "")
      );
      var sliced = pageRows(filtered, page, currentPageSize());
      page = sliced.page;
      if (tbody) {
        renderTable(doc, tbody, sliced.rows, anchors);
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
    if (kindSelect) kindSelect.addEventListener("change", onFilterChange);
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
        if (kindSelect && !kindLock) kindSelect.value = "";
        if (kindSelect && kindLock) kindSelect.value = kindLock;
        page = 1;
        draw();
      });
    }

    function apply(list) {
      records = list || [];
      if (kindLock) {
        records = TennesseeIndex.filterRows(records, "", kindLock);
      }
      draw();
    }

    if (options.data && options.data.records) {
      apply(options.data.records);
      return { records: records, draw: draw };
    }

    var fetchFn = Object.prototype.hasOwnProperty.call(options, "fetch")
      ? options.fetch
      : typeof fetch === "function"
        ? fetch
        : null;
    if (!fetchFn) {
      setText(status, LOAD_ERROR);
      return { records: records, draw: draw, error: LOAD_ERROR };
    }
    fetchFn(jsonUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        apply((data && data.records) || []);
      })
      .catch(function () {
        setText(status, LOAD_ERROR);
      });
    return { records: records, draw: draw };
  }

  return {
    JSON_URL: JSON_URL,
    pageRows: pageRows,
    anchorsFromDoc: anchorsFromDoc,
    writeupHref: writeupHref,
    renderTable: renderTable,
    lockedKind: lockedKind,
    initTennesseeLookup: initTennesseeLookup,
  };
});
