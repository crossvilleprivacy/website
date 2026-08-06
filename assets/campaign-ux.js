/**
 * CrossvillePrivacy.org, campaign UX helpers (mailto, copy, mobile nav, share).
 * Works in the browser and under Node (CommonJS) for unit tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CrossvilleCampaign = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OFFICIALS_TO =
    "info@crossvilletn.gov,valerie.hale@crossvilletn.gov,jessie.brooks@crossvilletn.gov";

  /* Broader To: line for the August agenda letter (Fox has no published city email). */
  var AGENDA_LETTER_TO =
    "info@crossvilletn.gov,rj.crawford@crossvilletn.gov,art.gernt@crossvilletn.gov," +
    "mike.turner@crossvilletn.gov,valerie.hale@crossvilletn.gov,jessie.brooks@crossvilletn.gov";

  var SHORT_SUBJECT = "Cancel Crossville Flock cameras";

  var AGENDA_SUBJECT =
    "August agenda: recorded vote on canceling Crossville Flock cameras";

  var SHORT_BODY =
    "I support public safety and privacy.\n\n" +
    "Please cancel Crossville's Flock contract and remove the cameras.\n\n" +
    "If council will not cancel yet: hold a yearly public yes-or-no vote before any renewal " +
    "(no automatic renewal that skips a public vote), and publish monthly use reports " +
    "(who searched, what, why, hits, sharing), a written search policy, and a public camera map.";

  var FULL_LETTER =
    "Mayor Crawford, Mayor Pro-tem Gernt, Councilmembers Turner and Fox, " +
    "City Manager Hale, and Chief Brooks:\n\n" +
    "I am a Crossville resident writing about the City's Flock Safety cameras.\n\n" +
    "I am writing to request that the following item be placed on the August work-session " +
    "agenda for discussion and the August regular City Council agenda for a recorded " +
    "yes-or-no vote:\n\n" +
    "Motion: Direct the City Manager and Police Department to give timely written notice of " +
    "non-renewal, cancel Crossville's Flock Safety contract at the earliest lawful date, " +
    "and remove all Flock cameras from City property.\n\n" +
    "The contract renewal window is at the end of August. Residents deserve a public, " +
    "on-the-record decision before any renewal, not an automatic renewal that skips a " +
    "public vote.\n\n" +
    "If Council will not cancel, I ask that you still take a recorded vote on whether to " +
    "renew, with no automatic renewal that skips a public vote.\n\n" +
    "Please confirm in writing:\n" +
    "1. Whether this will be placed on the August agendas; and\n" +
    "2. The last date by which the City must give notice to prevent automatic renewal.\n\n" +
    "I will attend the August meetings and ask for this vote during public comment.\n\n" +
    "Thank you for your time and for a clear written response.";

  var SPOKEN_LINE =
    "I support public safety and privacy. Please cancel Crossville's Flock contract and remove the cameras. " +
    "If you will not cancel yet, please announce a public hearing ahead of time and take a recorded City Council " +
    "vote each year before any renewal, with no automatic renewal that skips a public vote. Publish monthly " +
    "public reports: who searched, what plate, why, what matched, and who data was shared with. Also publish " +
    "the search policy, supervisor-approval rules, and a public camera map. " +
    "I will be at the next council meeting.";

  function buildMailto(to, subject, body) {
    return (
      "mailto:" +
      to +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body)
    );
  }

  function shortOfficialsMailto() {
    return buildMailto(OFFICIALS_TO, SHORT_SUBJECT, SHORT_BODY);
  }

  function agendaLetterMailto() {
    return buildMailto(AGENDA_LETTER_TO, AGENDA_SUBJECT, FULL_LETTER);
  }

  function fullLetterText() {
    return FULL_LETTER;
  }

  function spokenLineText() {
    return SPOKEN_LINE;
  }

  function shortBodyText() {
    return SHORT_BODY;
  }

  function officialsTo() {
    return OFFICIALS_TO;
  }

  function agendaLetterTo() {
    return AGENDA_LETTER_TO;
  }

  function copyText(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      });
    }
    return new Promise(function (resolve, reject) {
      try {
        if (typeof document === "undefined") {
          reject(new Error("No clipboard"));
          return;
        }
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(true);
        else reject(new Error("Copy failed"));
      } catch (err) {
        reject(err);
      }
    });
  }

  function initMobileNav(doc) {
    doc = doc || document;
    var toggle = doc.querySelector("[data-nav-toggle]");
    var nav = doc.querySelector("[data-site-nav]");
    if (!toggle || !nav) return null;

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      doc.body.classList.toggle("nav-is-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setOpen(false);
      });
    });

    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });

    setOpen(false);
    return { setOpen: setOpen, toggle: toggle, nav: nav };
  }

  function initCopyButtons(doc) {
    doc = doc || document;
    var buttons = doc.querySelectorAll("[data-copy-letter]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var which = btn.getAttribute("data-copy-letter") || "full";
        var text = SHORT_BODY;
        if (which === "full") text = FULL_LETTER;
        else if (which === "spoken") text = SPOKEN_LINE;
        else if (which === "short") text = SHORT_BODY;
        var label = btn.getAttribute("data-label") || btn.textContent;
        copyText(text)
          .then(function () {
            btn.textContent = "Copied";
            window.setTimeout(function () {
              btn.textContent = label;
            }, 1800);
          })
          .catch(function () {
            btn.textContent = "Copy failed, select text below";
          });
      });
    });
  }

  function initShareButtons(doc) {
    doc = doc || document;
    var pageUrl = "https://crossvilleprivacy.org/";
    var shareText =
      "Crossville Flock cameras scan ordinary drivers. Here's the local research: " + pageUrl;

    var nativeBtn = doc.querySelector("[data-share='native']");
    if (nativeBtn && typeof navigator !== "undefined" && typeof navigator.share === "function") {
      nativeBtn.hidden = false;
    }

    doc.querySelectorAll("[data-share]").forEach(function (btn) {
      var kind = btn.getAttribute("data-share");
      btn.addEventListener("click", function (event) {
        if (kind === "native" && typeof navigator !== "undefined" && navigator.share) {
          event.preventDefault();
          navigator.share({ title: "CrossvillePrivacy.org", text: shareText, url: pageUrl }).catch(function () {});
          return;
        }
        if (kind === "copy-link") {
          event.preventDefault();
          var label = btn.textContent;
          copyText(pageUrl).then(function () {
            btn.textContent = "Link copied";
            window.setTimeout(function () {
              btn.textContent = label;
            }, 1800);
          });
          return;
        }
        if (kind === "sms") {
          btn.setAttribute("href", "sms:?&body=" + encodeURIComponent(shareText));
        }
        if (kind === "facebook") {
          btn.setAttribute(
            "href",
            "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(pageUrl)
          );
        }
        if (kind === "email") {
          btn.setAttribute(
            "href",
            "mailto:?subject=" +
              encodeURIComponent("CrossvillePrivacy.org: Flock cameras in Crossville") +
              "&body=" +
              encodeURIComponent(shareText)
          );
        }
      });
    });
  }

  function applyShortMailtos(doc) {
    doc = doc || document;
    var href = shortOfficialsMailto();
    doc.querySelectorAll("[data-short-mailto]").forEach(function (el) {
      el.setAttribute("href", href);
    });
    var agendaHref = agendaLetterMailto();
    doc.querySelectorAll("[data-agenda-mailto]").forEach(function (el) {
      el.setAttribute("href", agendaHref);
    });
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[''`]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 80) || "section";
  }

  function collectExistingIds(doc) {
    var used = Object.create(null);
    var nodes = doc.querySelectorAll("[id]");
    for (var i = 0; i < nodes.length; i++) {
      used[nodes[i].id] = true;
    }
    return used;
  }

  function uniqueSlug(base, used) {
    var slug = base || "section";
    if (!used[slug]) {
      used[slug] = true;
      return slug;
    }
    var n = 2;
    while (used[slug + "-" + n]) n += 1;
    slug = slug + "-" + n;
    used[slug] = true;
    return slug;
  }

  function isSkipDeepLinkZone(el) {
    return !!(el.closest && el.closest("nav, .toc, #toc, #toc-full, footer, .site-header, .renewal-banner"));
  }

  function primaryTitleOf(container, heading) {
    if (!container || !container.querySelector) return false;
    var first = container.querySelector("h2, h3, h4");
    return first === heading;
  }

  function resolveDeepLinkId(heading, used) {
    if (heading.id) {
      used[heading.id] = true;
      return heading.id;
    }

    var container = heading.closest(
      "article[id], .panel[id], .case[id], .reality[id], .pull-card[id], aside[id], section[id], details[id], .official[id]"
    );
    if (container && container.id && primaryTitleOf(container, heading)) {
      used[container.id] = true;
      return container.id;
    }

    var slug = uniqueSlug(slugify(heading.textContent), used);
    heading.id = slug;
    return slug;
  }

  function headingHasExternalLink(heading) {
    var links = heading.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (href.indexOf("http") === 0 || href.indexOf("mailto:") === 0) return true;
      if (href.charAt(0) === "#" && links[i].classList.contains("deep-link")) continue;
      if (href.charAt(0) === "#" && !links[i].classList.contains("deep-link")) {
        /* in-page link already present */
        return true;
      }
    }
    return false;
  }

  function decorateHeadingDeepLink(heading, id) {
    if (!id) return;
    if (heading.querySelector("a.deep-link")) return;

    // Keep stable heading/section ids for TOC and shared links, but do not
    // inject a visible "#" marker. Headings that already contain a real link
    // (e.g. an external URL title) stay unchanged so we do not wrap them.
    if (headingHasExternalLink(heading)) {
      return;
    }

    var link = heading.ownerDocument.createElement("a");
    link.className = "deep-link";
    link.setAttribute("href", "#" + id);
    link.title = "Link to this section";
    while (heading.firstChild) {
      link.appendChild(heading.firstChild);
    }
    heading.appendChild(link);
  }

  function ensureCardIds(doc, used) {
    var cards = doc.querySelectorAll(
      "main .panel:not([id]), main .case:not([id]), main .official:not([id]), main .reality:not([id]), main .pull-card:not([id])"
    );
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (isSkipDeepLinkZone(card)) continue;
      var title = card.querySelector("h2, h3, h4, strong");
      var base = title ? slugify(title.textContent) : "card";
      card.id = uniqueSlug(base, used);
    }
  }

  function initDeepLinks(doc) {
    doc = doc || document;
    var root = doc.querySelector("main") || doc.body;
    if (!root) return { count: 0 };

    var used = collectExistingIds(doc);
    ensureCardIds(doc, used);

    var headings = root.querySelectorAll("h2, h3, h4");
    var count = 0;
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      if (isSkipDeepLinkZone(heading)) continue;
      var id = resolveDeepLinkId(heading, used);
      decorateHeadingDeepLink(heading, id);
      count += 1;
    }

    // Section labels ("Section 3") jump to their parent section
    var labels = root.querySelectorAll(".section-label");
    for (var j = 0; j < labels.length; j++) {
      var label = labels[j];
      if (label.querySelector("a.deep-link")) continue;
      var section = label.closest("section[id], aside[id]");
      if (!section || !section.id) continue;
      var labelLink = doc.createElement("a");
      labelLink.className = "deep-link";
      labelLink.href = "#" + section.id;
      labelLink.title = "Link to this section";
      while (label.firstChild) {
        labelLink.appendChild(label.firstChild);
      }
      label.appendChild(labelLink);
      count += 1;
    }

    return { count: count };
  }

  function prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function syncHeroCredit(panel, slide) {
    if (!panel || !slide) return;
    var credit = slide.getAttribute("data-hero-credit") || "";
    var href = slide.getAttribute("data-hero-credit-href") || "";
    var link = panel.querySelector("[data-hero-credit-link]");
    if (link) {
      if (credit) link.textContent = credit;
      if (href) link.setAttribute("href", href);
    }
    var alt = slide.getAttribute("data-hero-alt") || "";
    if (alt) {
      panel.setAttribute("aria-label", alt);
    }
  }

  function showHeroSlide(panel, slides, index) {
    if (!slides || !slides.length) return 0;
    var next = ((index % slides.length) + slides.length) % slides.length;
    for (var i = 0; i < slides.length; i++) {
      if (i === next) slides[i].classList.add("is-active");
      else slides[i].classList.remove("is-active");
    }
    syncHeroCredit(panel, slides[next]);
    return next;
  }

  function initHeroRotate(doc, options) {
    doc = doc || document;
    options = options || {};
    var panel = doc.querySelector("[data-hero-rotate]");
    if (!panel) return null;

    var slides = panel.querySelectorAll(".hero-slides .hero-media");
    if (!slides.length) return null;

    var index = 0;
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].classList.contains("is-active")) {
        index = i;
        break;
      }
    }
    showHeroSlide(panel, slides, index);

    var intervalMs = parseInt(panel.getAttribute("data-hero-interval") || "9000", 10);
    if (!isFinite(intervalMs) || intervalMs < 2000) intervalMs = 9000;
    if (typeof options.intervalMs === "number" && options.intervalMs >= 2000) {
      intervalMs = options.intervalMs;
    }

    var timer = null;
    function clearTimer() {
      if (timer && typeof options.clearIntervalFn === "function") {
        options.clearIntervalFn(timer);
      } else if (timer && typeof clearInterval === "function") {
        clearInterval(timer);
      }
      timer = null;
    }

    function tick() {
      index = showHeroSlide(panel, slides, index + 1);
    }

    function start() {
      clearTimer();
      if (prefersReducedMotion() && !options.forceAnimate) return;
      if (slides.length < 2) return;
      var setInt = options.setIntervalFn || (typeof setInterval === "function" ? setInterval : null);
      if (!setInt) return;
      timer = setInt(tick, intervalMs);
    }

    start();

    return {
      panel: panel,
      slides: slides,
      getIndex: function () {
        return index;
      },
      next: tick,
      show: function (i) {
        index = showHeroSlide(panel, slides, i);
        return index;
      },
      stop: clearTimer,
      start: start,
    };
  }

  function initNewsGeoFilters(doc) {
    doc = doc || document;
    var group = doc.querySelector(".news-geo-filters");
    var list = doc.querySelector(".recent-news-list");
    if (!group || !list) return null;

    var buttons = group.querySelectorAll("[data-news-geo]");
    var items = list.querySelectorAll("li[data-geo]");
    var empty = doc.querySelector("[data-news-geo-empty]");

    function apply(geo) {
      var visible = 0;
      buttons.forEach(function (btn) {
        var active = btn.getAttribute("data-news-geo") === geo;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      items.forEach(function (item) {
        var itemGeo = item.getAttribute("data-geo");
        var show = geo === "all" || itemGeo === geo;
        item.hidden = !show;
        if (show) visible += 1;
      });
      if (empty) empty.hidden = visible > 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-news-geo") || "all");
      });
    });

    apply("all");
    return { apply: apply };
  }

  function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
    var d = new Date(year, monthIndex, 1);
    var first = d.getDay();
    var day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
    return new Date(year, monthIndex, day);
  }

  function atLocalTime(date, hours, minutes) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hours,
      minutes,
      0,
      0
    );
  }

  function nextNthWeekdayMeeting(now, weekday, nth, hours, minutes) {
    var y = now.getFullYear();
    var m = now.getMonth();
    for (var i = 0; i < 14; i++) {
      var month = m + i;
      var year = y + Math.floor(month / 12);
      var mi = ((month % 12) + 12) % 12;
      var day = nthWeekdayOfMonth(year, mi, weekday, nth);
      if (day.getMonth() !== mi) continue;
      var when = atLocalTime(day, hours, minutes);
      if (when.getTime() >= now.getTime() - 60 * 60 * 1000) {
        return when;
      }
    }
    return null;
  }

  function dayOrdinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + "th";
    switch (n % 10) {
      case 1:
        return n + "st";
      case 2:
        return n + "nd";
      case 3:
        return n + "rd";
      default:
        return n + "th";
    }
  }

  function formatMeetingNextLabel(when, timeLabel, suffix) {
    try {
      var month = when.toLocaleDateString("en-US", { month: "long" });
      var label =
        "Next: " + month + " " + dayOrdinal(when.getDate()) + " @ " + timeLabel;
      return suffix ? label + " · " + suffix : label;
    } catch (err) {
      return "Next: " + dayOrdinal(when.getDate()) + " @ " + timeLabel;
    }
  }

  /** Fill #inpage-work-next / #inpage-council-next with the next scheduled dates. */
  function fillCouncilMeetingNext(doc, now) {
    doc = doc || document;
    var workEl = doc.getElementById("inpage-work-next");
    var councilEl = doc.getElementById("inpage-council-next");
    if (!workEl && !councilEl) return null;

    now = now || new Date();
    var nextWork = nextNthWeekdayMeeting(now, 2, 1, 17, 0);
    var nextCouncil = nextNthWeekdayMeeting(now, 2, 2, 18, 0);
    if (workEl && nextWork) {
      workEl.textContent = formatMeetingNextLabel(nextWork, "5 PM");
    }
    if (councilEl && nextCouncil) {
      councilEl.textContent = formatMeetingNextLabel(
        nextCouncil,
        "6 PM",
        "chambers"
      );
    }
    return { nextWork: nextWork, nextCouncil: nextCouncil };
  }

  function loadYouTubeFacade(btn) {
    var id = btn.getAttribute("data-youtube-id");
    if (!id) return;
    var title = btn.getAttribute("data-youtube-title") || "YouTube video";
    var watch = "https://www.youtube.com/watch?v=" + id;
    // Local file previews cannot send an HTTP Referer: YouTube returns Error 153.
    if (typeof location !== "undefined" && location.protocol === "file:") {
      window.open(watch, "_blank", "noopener");
      return;
    }
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube.com/embed/" + id + "?autoplay=1&rel=0";
    iframe.title = title;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "eager");
    btn.replaceWith(iframe);
  }

  function loadRumbleFacade(btn) {
    var id = btn.getAttribute("data-rumble-id");
    if (!id) return;
    var title = btn.getAttribute("data-rumble-title") || "Rumble video";
    var figure = btn.closest ? btn.closest("figure") : null;
    var captionLink = figure ? figure.querySelector("figcaption a") : null;
    var watch = (captionLink && captionLink.href) || "https://rumble.com/embed/" + id + "/";
    if (typeof location !== "undefined" && location.protocol === "file:") {
      window.open(watch, "_blank", "noopener");
      return;
    }
    var iframe = document.createElement("iframe");
    iframe.src = "https://rumble.com/embed/" + id + "/";
    iframe.title = title;
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "eager");
    btn.replaceWith(iframe);
  }

  /**
   * Click-to-load YouTube / Rumble facades. Facebook reel cards use plain links
   * (no third-party contact until the visitor leaves for Facebook).
   */
  function initVideoFacades(doc) {
    doc = doc || document;
    var buttons = doc.querySelectorAll("button.video-facade");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        if (btn.getAttribute("data-video-bound") === "1") return;
        btn.setAttribute("data-video-bound", "1");
        btn.addEventListener("click", function () {
          if (btn.getAttribute("data-rumble-id")) {
            loadRumbleFacade(btn);
          } else if (btn.getAttribute("data-youtube-id")) {
            loadYouTubeFacade(btn);
          }
        });
      })(buttons[i]);
    }
    return { count: buttons.length };
  }

  function init(doc) {
    doc = doc || document;
    applyShortMailtos(doc);
    initMobileNav(doc);
    initCopyButtons(doc);
    initShareButtons(doc);
    initDeepLinks(doc);
    initHeroRotate(doc);
    initNewsGeoFilters(doc);
    initSpeechPicker(doc);
    fillCouncilMeetingNext(doc);
    initVideoFacades(doc);
  }

  function initSpeechPicker(doc) {
    doc = doc || document;
    var root = doc.querySelector("#speech-picker");
    if (!root) return null;

    var focusSelect = root.querySelector("[data-speech-focus]");
    var variantSelect = root.querySelector("[data-speech-variant]");
    var preview = root.querySelector("[data-speech-preview]");
    var titleEl = root.querySelector("[data-speech-title]");
    var statsEl = root.querySelector("[data-speech-stats]");
    var metaEl = root.querySelector("[data-speech-meta]");
    var visualsEl = root.querySelector("[data-speech-visuals]");
    var visualsList = root.querySelector("[data-speech-visuals-list]");
    var copyBtn = root.querySelector("[data-speech-copy]");
    var downloadLink = root.querySelector("[data-speech-download]");
    if (!focusSelect || !variantSelect || !preview || !copyBtn || !downloadLink) return null;

    var catalog =
      typeof window !== "undefined" && window.COUNCIL_SPEECHES ? window.COUNCIL_SPEECHES : null;
    var currentText = "";

    function speechesForFocus(focusId) {
      return (catalog.speeches || []).filter(function (s) {
        return s.perspective === focusId;
      });
    }

    function currentSpeech() {
      if (!catalog) return null;
      var focusId = focusSelect.value;
      var variant = variantSelect.value || "A";
      var list = speechesForFocus(focusId);
      for (var i = 0; i < list.length; i++) {
        if (list[i].variant === variant) return list[i];
      }
      return list[0] || null;
    }

    function renderVisuals(speech) {
      if (!visualsEl || !visualsList) return;
      var items = (speech && speech.visuals) || [];
      visualsList.innerHTML = "";
      if (!items.length) {
        visualsEl.hidden = true;
        return;
      }
      items.forEach(function (item) {
        var li = doc.createElement("li");
        var a = doc.createElement("a");
        a.href = item.href;
        a.textContent = item.label || item.href;
        if (/^https?:\/\//i.test(item.href)) {
          a.target = "_blank";
          a.rel = "noopener";
        }
        li.appendChild(a);
        visualsList.appendChild(li);
      });
      visualsEl.hidden = false;
    }

    function render() {
      var speech = currentSpeech();
      if (!speech) {
        preview.textContent = "No speech found for that selection.";
        currentText = "";
        renderVisuals(null);
        return;
      }
      currentText = speech.full_text || "";
      preview.textContent = currentText;
      if (titleEl) titleEl.textContent = speech.title;
      if (statsEl) {
        statsEl.textContent =
          "Script " +
          speech.variant +
          " · about " +
          speech.approx_minutes +
          " min · " +
          speech.word_count +
          " words · " +
          (speech.focus_note || "");
      }
      if (metaEl) metaEl.hidden = false;
      renderVisuals(speech);
      downloadLink.href = speech.pdf;
      downloadLink.setAttribute("download", speech.pdf.split("/").pop());
    }

    function fillFocusOptions(perspectives) {
      var previous = focusSelect.value;
      focusSelect.innerHTML = "";
      perspectives.forEach(function (p, idx) {
        var opt = doc.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        focusSelect.appendChild(opt);
        if ((!previous && idx === 0) || previous === p.id) opt.selected = true;
      });
    }

    focusSelect.addEventListener("change", render);
    variantSelect.addEventListener("change", render);

    copyBtn.addEventListener("click", function () {
      var label = copyBtn.getAttribute("data-label") || "Copy speech text";
      if (!currentText) {
        copyBtn.textContent = "Nothing to copy";
        window.setTimeout(function () {
          copyBtn.textContent = label;
        }, 1600);
        return;
      }
      copyText(currentText)
        .then(function () {
          copyBtn.textContent = "Copied";
          window.setTimeout(function () {
            copyBtn.textContent = label;
          }, 1800);
        })
        .catch(function () {
          copyBtn.textContent = "Copy failed, select the text";
        });
    });

    if (!catalog || !catalog.speeches || !catalog.speeches.length) {
      preview.textContent =
        "Speech catalog missing. Make sure assets/council-speeches-data.js is loaded before campaign-ux.js.";
      return { render: render };
    }

    fillFocusOptions((catalog.meta && catalog.meta.perspectives) || []);
    render();
    return { render: render };
  }

  return {
    OFFICIALS_TO: OFFICIALS_TO,
    AGENDA_LETTER_TO: AGENDA_LETTER_TO,
    SHORT_SUBJECT: SHORT_SUBJECT,
    AGENDA_SUBJECT: AGENDA_SUBJECT,
    SHORT_BODY: SHORT_BODY,
    FULL_LETTER: FULL_LETTER,
    SPOKEN_LINE: SPOKEN_LINE,
    buildMailto: buildMailto,
    shortOfficialsMailto: shortOfficialsMailto,
    agendaLetterMailto: agendaLetterMailto,
    fullLetterText: fullLetterText,
    spokenLineText: spokenLineText,
    shortBodyText: shortBodyText,
    officialsTo: officialsTo,
    agendaLetterTo: agendaLetterTo,
    copyText: copyText,
    initMobileNav: initMobileNav,
    initCopyButtons: initCopyButtons,
    initShareButtons: initShareButtons,
    applyShortMailtos: applyShortMailtos,
    slugify: slugify,
    initDeepLinks: initDeepLinks,
    initHeroRotate: initHeroRotate,
    showHeroSlide: showHeroSlide,
    syncHeroCredit: syncHeroCredit,
    initNewsGeoFilters: initNewsGeoFilters,
    initSpeechPicker: initSpeechPicker,
    fillCouncilMeetingNext: fillCouncilMeetingNext,
    nextNthWeekdayMeeting: nextNthWeekdayMeeting,
    initVideoFacades: initVideoFacades,
    init: init,
  };
});
