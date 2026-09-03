/**
 * CrossvillePrivacy.org Site Search
 * Unified search across all JSON catalogs and page content.
 * Opens in a modal with page/site-wide filter.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SiteSearch = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var INDEX_SOURCES = {
    misuse: {
      url: "docs/Flock_Safety_ALPR_Misuse_Master_Database.json",
      label: "Officer Misuse",
      icon: "⚠️",
      extract: function (data) {
        return (data.verified_incidents || []).map(function (row) {
          return {
            type: "misuse",
            id: row.Case_ID,
            title: row.Agency_Jurisdiction + " — " + (row.Misuse_Abuse_Category || "Misuse"),
            subtitle: row.State + " · " + row.Year + " · " + row.Case_ID,
            body: [
              row.Subject_Officer_Involved,
              row.Outcome_Bucket,
              row.Documented_Search_Count_Frequency,
              row.Year_Note
            ].filter(Boolean).join(" — "),
            url: "national.html#nationwide-misuse",
            source: row.Source_URL
          };
        });
      }
    },
    cancellations: {
      url: "docs/Flock_Municipal_Cancellations_Database.json",
      label: "Cancellations",
      icon: "🚫",
      extract: function (data) {
        return (data.records || []).map(function (row) {
          return {
            type: "cancellation",
            id: row.Case_ID,
            title: row.Jurisdiction + ", " + row.State + " — " + row.Action_Type,
            subtitle: row.Action_Date + " · " + row.Case_ID,
            body: [row.Primary_Reasons, row.Summary].filter(Boolean).join(" — "),
            url: "national.html#cancellations",
            source: row.Primary_Source_URL
          };
        });
      }
    },
    wrongful: {
      url: "docs/AI_Wrongful_Enforcement_Database.json",
      label: "Wrongful Stops",
      icon: "🛑",
      extract: function (data) {
        return (Array.isArray(data) ? data : []).map(function (row) {
          return {
            type: "wrongful",
            id: "ID " + row.ID,
            title: row.City + ", " + row.State + " — " + (row.Technology_Category || row.Technology || "ALPR"),
            subtitle: row.Incident_Year + " · ID " + row.ID,
            body: [row.Summary, row.Lawsuit_Filed, row.Settlement_Amount ? "$" + row.Settlement_Amount.toLocaleString() : null].filter(Boolean).join(" — "),
            url: "national.html#nationwide-misuse",
            source: row.Primary_Source_URL
          };
        });
      }
    },
    tnExtras: {
      url: "docs/Tennessee_Flock_Extras.json",
      label: "Tennessee Watch",
      icon: "🏛️",
      extract: function (data) {
        return (data.items || []).map(function (row) {
          return {
            type: "tn-watch",
            id: row.Slug || row.City,
            title: row.City + " — " + (row.Status || "Watch"),
            subtitle: row.County + " County · " + (row.Camera_Count ? row.Camera_Count + " cameras" : ""),
            body: row.Notes || "",
            url: "tennessee.html#tn-watch-lookup",
            source: row.Source_URL
          };
        });
      }
    },
    politicians: {
      url: "docs/Politician_Stances.json",
      label: "Officials",
      icon: "👔",
      extract: function (data) {
        return (data.officials || []).map(function (row) {
          return {
            type: "official",
            id: row.Name,
            title: row.Name + " — " + row.Office,
            subtitle: row.Jurisdiction + " · " + row.Stance,
            body: row.Notes || "",
            url: "officials.html",
            source: row.Source_URL
          };
        });
      }
    },
    speeches: {
      url: "docs/Council_Speeches_3min.json",
      label: "Council Speeches",
      icon: "🎤",
      extract: function (data) {
        return (data.speeches || []).map(function (row) {
          return {
            type: "speech",
            id: row.id,
            title: row.title,
            subtitle: row.duration + " · " + row.audience,
            body: row.outline || "",
            url: "council.html#speech-picker",
            source: null
          };
        });
      }
    }
  };

  var PAGE_CONTENT = [
    { url: "index.html", label: "Crossville Home" },
    { url: "cumberland.html", label: "Cumberland County" },
    { url: "tennessee.html", label: "Tennessee Statewide" },
    { url: "national.html", label: "National Overview" },
    { url: "why.html", label: "Why It Matters" },
    { url: "officials.html", label: "Officials" },
    { url: "records.html", label: "Records & TPRA" },
    { url: "council.html", label: "City Council" },
    { url: "election.html", label: "Election 2026" },
    { url: "flock.html", label: "Flock Dossier" },
    { url: "printables.html", label: "Printables" },
    { url: "sources.html", label: "Sources" }
  ];

  var index = [];
  var pageIndex = [];
  var loaded = false;
  var loading = false;
  var modal = null;
  var searchInput = null;
  var resultsContainer = null;
  var statusEl = null;
  var debounceTimer = null;

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function haystack(item) {
    // Include ID with hyphens converted to spaces for better matching
    var idVariants = (item.id || "").replace(/-/g, " ");
    return normalize([
      item.id,
      idVariants,
      item.title,
      item.subtitle,
      item.body,
      item.type
    ].join(" "));
  }

  function scoreMatch(item, tokens, query) {
    // Higher score = better match
    var score = 0;
    var id = normalize(item.id || "");
    var title = normalize(item.title || "");
    var q = normalize(query);
    
    // Exact ID match (e.g., searching "fine-print" or "fine print" matches #fine-print)
    if (id === q || id === q.replace(/\s+/g, "-")) score += 100;
    // ID contains query
    else if (id.indexOf(q.replace(/\s+/g, "-")) !== -1) score += 50;
    
    // Title starts with query
    if (title.indexOf(q) === 0) score += 80;
    // Title contains query as whole phrase
    else if (title.indexOf(q) !== -1) score += 40;
    
    // All tokens in title
    var allInTitle = tokens.every(function (t) { return title.indexOf(t) !== -1; });
    if (allInTitle) score += 30;
    
    // All tokens in ID
    var allInId = tokens.every(function (t) { return id.indexOf(t) !== -1; });
    if (allInId) score += 25;
    
    // Prefer sections/articles over full pages
    if (item.type === "section" || item.type === "article" || item.type === "panel") score += 10;
    
    return score;
  }

  function searchIndex(query, scope) {
    var q = normalize(query);
    if (!q) return [];
    var tokens = q.split(/\s+/).filter(Boolean);
    var pool = scope === "page" ? pageIndex : index.concat(pageIndex);
    var matches = pool.filter(function (item) {
      var h = item._haystack || (item._haystack = haystack(item));
      return tokens.every(function (t) { return h.indexOf(t) !== -1; });
    });
    // Sort by relevance score
    matches.sort(function (a, b) {
      return scoreMatch(b, tokens, q) - scoreMatch(a, tokens, q);
    });
    return matches.slice(0, 50);
  }

  function loadJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function extractPageContent(html, pageUrl, label) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");
    var items = [];
    // Index articles
    var articles = doc.querySelectorAll("article[id]");
    articles.forEach(function (article) {
      var id = article.id;
      var h = article.querySelector("h2, h3, h4, .article-title");
      var title = h ? h.textContent.trim() : id;
      var body = article.textContent.replace(/\s+/g, " ").trim().slice(0, 500);
      items.push({
        type: "page",
        id: id,
        title: title,
        subtitle: label,
        body: body,
        url: pageUrl + "#" + id,
        pageUrl: pageUrl,
        source: null
      });
    });
    // Index sections
    var sections = doc.querySelectorAll("section[id]");
    sections.forEach(function (section) {
      var id = section.id;
      if (items.some(function (i) { return i.id === id; })) return;
      var h = section.querySelector("h2, h3");
      var title = h ? h.textContent.trim() : id;
      var body = section.textContent.replace(/\s+/g, " ").trim().slice(0, 500);
      items.push({
        type: "section",
        id: id,
        title: title,
        subtitle: label,
        body: body,
        url: pageUrl + "#" + id,
        pageUrl: pageUrl,
        source: null
      });
    });
    // Index panels and other divs with IDs that have headings
    var panels = doc.querySelectorAll("div.panel[id], div.case[id], div[id]:has(h2, h3, h4)");
    panels.forEach(function (panel) {
      var id = panel.id;
      if (!id || items.some(function (i) { return i.id === id; })) return;
      var h = panel.querySelector("h2, h3, h4");
      var title = h ? h.textContent.trim() : id;
      var body = panel.textContent.replace(/\s+/g, " ").trim().slice(0, 500);
      items.push({
        type: "panel",
        id: id,
        title: title,
        subtitle: label,
        body: body,
        url: pageUrl + "#" + id,
        pageUrl: pageUrl,
        source: null
      });
    });
    // Index the whole page as fallback
    var mainTitle = doc.querySelector("title");
    items.push({
      type: "page",
      id: pageUrl,
      title: mainTitle ? mainTitle.textContent.trim() : label,
      subtitle: "Full page",
      body: doc.body ? doc.body.textContent.replace(/\s+/g, " ").trim().slice(0, 1000) : "",
      url: pageUrl,
      pageUrl: pageUrl,
      source: null
    });
    return items;
  }

  function loadAllIndexes() {
    if (loaded || loading) return Promise.resolve();
    loading = true;
    var jsonPromises = Object.keys(INDEX_SOURCES).map(function (key) {
      var src = INDEX_SOURCES[key];
      return loadJSON(src.url).then(function (data) {
        var items = src.extract(data);
        items.forEach(function (item) {
          item.typeLabel = src.label;
          item.typeIcon = src.icon;
        });
        return items;
      }).catch(function () { return []; });
    });
    var pagePromises = PAGE_CONTENT.map(function (page) {
      return fetch(page.url).then(function (r) {
        if (!r.ok) return [];
        return r.text().then(function (html) {
          return extractPageContent(html, page.url, page.label);
        });
      }).catch(function () { return []; });
    });
    return Promise.all(jsonPromises.concat(pagePromises)).then(function (results) {
      var jsonCount = Object.keys(INDEX_SOURCES).length;
      for (var i = 0; i < jsonCount; i++) {
        index = index.concat(results[i]);
      }
      for (var j = jsonCount; j < results.length; j++) {
        pageIndex = pageIndex.concat(results[j]);
      }
      loaded = true;
      loading = false;
    });
  }

  function renderResults(results, query) {
    if (!resultsContainer) return;
    resultsContainer.innerHTML = "";
    if (!query) {
      resultsContainer.innerHTML = '<p class="search-hint">Type to search cases, cities, officials, keywords…</p>';
      return;
    }
    if (!results.length) {
      resultsContainer.innerHTML = '<p class="search-no-results">No results for "<strong>' + escapeHtml(query) + '</strong>"</p>';
      return;
    }
    var ul = document.createElement("ul");
    ul.className = "search-results-list";
    results.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "search-result-item search-result-" + item.type;
      var a = document.createElement("a");
      a.href = item.url;
      a.className = "search-result-link";
      a.addEventListener("click", function () { closeModal(); });
      var icon = document.createElement("span");
      icon.className = "search-result-icon";
      icon.textContent = item.typeIcon || "📄";
      icon.setAttribute("aria-hidden", "true");
      a.appendChild(icon);
      var content = document.createElement("div");
      content.className = "search-result-content";
      var title = document.createElement("div");
      title.className = "search-result-title";
      title.textContent = item.title;
      content.appendChild(title);
      var meta = document.createElement("div");
      meta.className = "search-result-meta";
      meta.textContent = (item.typeLabel || item.type) + " · " + item.subtitle;
      content.appendChild(meta);
      if (item.body) {
        var snippet = document.createElement("div");
        snippet.className = "search-result-snippet";
        snippet.textContent = item.body.slice(0, 150) + (item.body.length > 150 ? "…" : "");
        content.appendChild(snippet);
      }
      a.appendChild(content);
      li.appendChild(a);
      ul.appendChild(li);
    });
    resultsContainer.appendChild(ul);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function doSearch() {
    var query = searchInput ? searchInput.value.trim() : "";
    renderResults(searchIndex(query, "site"), query);
    if (statusEl) {
      var count = resultsContainer.querySelectorAll(".search-result-item").length;
      statusEl.textContent = query ? count + " result" + (count === 1 ? "" : "s") : "";
    }
  }

  function createModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "site-search-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Site search");
    modal.innerHTML = [
      '<div class="site-search-backdrop" data-search-close></div>',
      '<div class="site-search-panel">',
      '  <div class="site-search-header">',
      '    <div class="site-search-input-row">',
      '      <label class="sr-only" for="site-search-input">Search</label>',
      '      <input type="search" id="site-search-input" class="site-search-input" placeholder="Search cases, cities, officials, keywords…" autocomplete="off" />',
      '      <button type="button" class="site-search-close" data-search-close aria-label="Close search">&times;</button>',
      '    </div>',
      '    <span class="site-search-status" data-search-status></span>',
      '  </div>',
      '  <div class="site-search-results" data-search-results></div>',
      '</div>'
    ].join("\n");
    document.body.appendChild(modal);
    searchInput = modal.querySelector("#site-search-input");
    resultsContainer = modal.querySelector("[data-search-results]");
    statusEl = modal.querySelector("[data-search-status]");
    // Events
    searchInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(doSearch, 120);
    });
    modal.querySelectorAll("[data-search-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    modal.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
    return modal;
  }

  function openModal() {
    createModal();
    modal.classList.add("is-open");
    document.body.classList.add("search-open");
    loadAllIndexes().then(function () {
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      doSearch();
    });
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove("is-open");
      document.body.classList.remove("search-open");
    }
  }

  function addSearchButton(container) {
    if (!container) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-search-btn";
    btn.setAttribute("aria-label", "Search site");
    btn.innerHTML = '<svg class="site-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
    btn.addEventListener("click", openModal);
    container.insertBefore(btn, container.firstChild);
    // Keyboard shortcut: Ctrl+K or Cmd+K
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        openModal();
      }
    });
  }

  function init() {
    var headerTools = document.querySelector(".header-tools");
    addSearchButton(headerTools);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    open: openModal,
    close: closeModal,
    search: searchIndex,
    loadIndex: loadAllIndexes
  };
});
