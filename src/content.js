const HIDDEN_STORAGE_KEY = "hiddenMobileDeListingIds";
const SEEN_STORAGE_KEY = "seenMobileDeListingIds";
const LAST_VIEWED_STORAGE_KEY = "lastViewedMobileDeListingById";

const PROCESSED_ATTRIBUTE = "data-mobile-de-filter-processed";
const COLLAPSED_ATTRIBUTE = "data-mobile-de-filter-collapsed";

const SCAN_DELAY_MS = 600;

function isSearchResultsPage() {
  return (
    window.location.hostname === "suchen.mobile.de" &&
    window.location.pathname.includes("/fahrzeuge/search.html")
  );
}

function isDetailPage() {
  return (
    window.location.hostname === "suchen.mobile.de" &&
    window.location.pathname.includes("/fahrzeuge/details.html")
  );
}

function getListingIdFromUrl() {
  try {
    const url = new URL(window.location.href);

    return url.searchParams.get("id");
  } catch {
    return null;
  }
}

function formatDateTime(value) {
  if (!value) {
    return "Never viewed";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Never viewed";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function getHiddenListingIds() {
  const result = await chrome.storage.local.get(HIDDEN_STORAGE_KEY);

  return new Set(result[HIDDEN_STORAGE_KEY] || []);
}

async function saveHiddenListingIds(hiddenListingIds) {
  await chrome.storage.local.set({
    [HIDDEN_STORAGE_KEY]: Array.from(hiddenListingIds),
  });
}

async function getSeenListingIds() {
  const result = await chrome.storage.local.get(SEEN_STORAGE_KEY);

  return new Set(result[SEEN_STORAGE_KEY] || []);
}

async function saveSeenListingIds(seenListingIds) {
  await chrome.storage.local.set({
    [SEEN_STORAGE_KEY]: Array.from(seenListingIds),
  });
}

async function getLastViewedListingMap() {
  const result = await chrome.storage.local.get(LAST_VIEWED_STORAGE_KEY);

  return result[LAST_VIEWED_STORAGE_KEY] || {};
}

async function saveLastViewedListingMap(lastViewedListingMap) {
  await chrome.storage.local.set({
    [LAST_VIEWED_STORAGE_KEY]: lastViewedListingMap,
  });
}

function getListingIdFromLink(link) {
  try {
    const url = new URL(link.href);

    return url.searchParams.get("id");
  } catch {
    return null;
  }
}

function getListingSummary(card) {
  const title =
    card.querySelector("h2")?.innerText?.replace(/\s+/g, " ").trim() ||
    "Hidden listing";

  const price =
    card.querySelector('[data-testid="price-label"]')?.innerText?.trim() ||
    "";

  const details =
    card.querySelector('[data-testid="listing-details"]')?.innerText
      ?.replace(/\s+/g, " ")
      .trim() || "";

  return [title, price, details].filter(Boolean).join(" — ");
}

function findListings() {
  const links = Array.from(
    document.querySelectorAll(
      'a[data-testid^="result-listing-"][href*="/fahrzeuge/details.html?id="]'
    )
  );

  const listings = [];

  for (const link of links) {
    const listingId = getListingIdFromLink(link);

    if (!listingId) {
      continue;
    }

    const card = link.closest("article");

    if (!card) {
      continue;
    }

    listings.push({
      card,
      listingId,
      link,
    });
  }

  return listings;
}

function expandCard(card) {
  const collapsedBar = card.querySelector(
    ":scope > .mobile-de-filter-collapsed-bar"
  );

  if (collapsedBar) {
    collapsedBar.remove();
  }

  for (const child of Array.from(card.children)) {
    child.style.display = "";
  }

  card.removeAttribute(COLLAPSED_ATTRIBUTE);
}

function collapseCard(card, listingId, hiddenListingIds) {
  if (card.hasAttribute(COLLAPSED_ATTRIBUTE)) {
    return;
  }

  card.setAttribute(COLLAPSED_ATTRIBUTE, "true");

  const summary = getListingSummary(card);

  for (const child of Array.from(card.children)) {
    child.style.display = "none";
  }

  const bar = document.createElement("div");
  bar.className = "mobile-de-filter-collapsed-bar";

  const text = document.createElement("span");
  text.className = "mobile-de-filter-collapsed-text";
  text.textContent = summary;

  const unhideButton = document.createElement("button");
  unhideButton.className = "mobile-de-filter-unhide-button";
  unhideButton.textContent = "Unhide";
  unhideButton.type = "button";

  unhideButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    hiddenListingIds.delete(listingId);

    await saveHiddenListingIds(hiddenListingIds);

    expandCard(card);
  });

  bar.appendChild(text);
  bar.appendChild(unhideButton);

  card.appendChild(bar);
}

function createHideButton(card, listingId, hiddenListingIds) {
  if (card.hasAttribute(PROCESSED_ATTRIBUTE)) {
    return;
  }

  card.setAttribute(PROCESSED_ATTRIBUTE, "true");

  const button = document.createElement("button");

  button.className = "mobile-de-filter-hide-button";
  button.textContent = "Hide";
  button.type = "button";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    hiddenListingIds.add(listingId);

    await saveHiddenListingIds(hiddenListingIds);

    collapseCard(card, listingId, hiddenListingIds);
  });

  card.style.position = "relative";
  card.appendChild(button);
}

function createDetailHideButton(container, card, listingId, hiddenListingIds) {
  if (card.hasAttribute(PROCESSED_ATTRIBUTE)) {
    return;
  }

  card.setAttribute(PROCESSED_ATTRIBUTE, "true");

  const button = document.createElement("button");

  button.className = "mobile-de-filter-hide-button mobile-de-filter-hide-button-inline";
  button.textContent = "Hide";
  button.type = "button";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    hiddenListingIds.add(listingId);

    await saveHiddenListingIds(hiddenListingIds);

    collapseCard(card, listingId, hiddenListingIds);
  });

  // Ensure the container is positioned so absolute placement works
  try {
    const style = window.getComputedStyle(container);

    if (!style || style.position === "static" || !style.position) {
      container.style.position = "relative";
    }
  } catch (e) {
    container.style.position = "relative";
  }

  container.appendChild(button);
}

function createNewBadge(card) {
  if (card.querySelector(":scope > .mobile-de-filter-new-badge")) {
    return;
  }

  const badge = document.createElement("div");
  badge.className = "mobile-de-filter-new-badge";
  badge.textContent = "NEW";

  card.style.position = "relative";
  card.appendChild(badge);
}

function removeNewBadge(card) {
  const badge = card.querySelector(":scope > .mobile-de-filter-new-badge");

  if (badge) {
    badge.remove();
  }
}

function detectPageParamName(doc = document) {
  const anchors = Array.from(
    doc.querySelectorAll('a[href*="fahrzeuge/search.html"], a[href*="search.html"]')
  );

  const counts = {};

  for (const a of anchors) {
    try {
      const url = new URL(a.href, window.location.origin);

      for (const [k, v] of url.searchParams) {
        if (/^\d+$/.test(v)) {
          counts[k] = (counts[k] || 0) + 1;
        }
      }
    } catch {}

    const dataPage = a.getAttribute("data-page");

    if (/^\d+$/.test(dataPage)) {
      counts["data-page"] = (counts["data-page"] || 0) + 1;
    }

    const txt = a.textContent?.trim();

    if (/^\d+$/.test(txt)) {
      counts["link-text"] = (counts["link-text"] || 0) + 1;
    }
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return "pageNumber";
  }

  const top = entries[0][0];

  if (top === "link-text" || top === "data-page") {
    return "pageNumber";
  }

  return top;
}

function getLastPageNumberFromDocument(doc = document, pageParamName = "pageNumber") {
  // 1) Try the compact paginator summary like "1/7"
  const paginator = doc.querySelector('[data-testid="srp-pagination"]');

  if (paginator) {
    const summary = paginator.querySelector('.XUy1p')?.textContent?.trim();

    if (summary && /\d+\s*\/\s*\d+/.test(summary)) {
      const parts = summary.split('/').map((s) => s.replace(/[^0-9]/g, '').trim());
      const total = Number(parts[1] || parts[0]);

      if (Number.isInteger(total) && total > 0) {
        return total;
      }
    }

    // 2) Look for page buttons inside paginator (aria-label="Page N" or button text)
    const buttons = Array.from(
      paginator.querySelectorAll('button[aria-label], button')
    );

    const nums = [];

    for (const b of buttons) {
      const aria = b.getAttribute('aria-label') || '';
      const txt = b.textContent?.trim() || '';

      const mAria = aria.match(/Page\s*(\d+)/i);
      if (mAria) nums.push(Number(mAria[1]));

      const mTxt = txt.match(/^(\d+)$/);
      if (mTxt) nums.push(Number(mTxt[1]));
    }

    if (nums.length > 0) {
      return Math.max(...nums.filter((n) => Number.isInteger(n) && n > 0));
    }
  }

  // Fallback: inspect anchors for numeric query params or numeric link text
  const anchors = Array.from(
    doc.querySelectorAll('a[href*="fahrzeuge/search.html"], a[href*="search.html"]')
  );

  const pageNumbers = [];

  for (const a of anchors) {
    try {
      const url = new URL(a.href, window.location.origin);

      if (url.searchParams.has(pageParamName)) {
        const v = Number(url.searchParams.get(pageParamName));

        if (Number.isInteger(v) && v > 0) {
          pageNumbers.push(v);
        }
      }

      for (const [, v] of url.searchParams) {
        if (/^\d+$/.test(v)) {
          pageNumbers.push(Number(v));
        }
      }
    } catch {}

    const txt = a.textContent?.trim();

    if (/^\d+$/.test(txt)) {
      pageNumbers.push(Number(txt));
    }

    const dataPage = a.getAttribute("data-page");

    if (/^\d+$/.test(dataPage)) {
      pageNumbers.push(Number(dataPage));
    }
  }

  if (pageNumbers.length === 0) {
    return 1;
  }

  return Math.max(...pageNumbers);
}

function getImageFromCard(card) {
  const image = card.querySelector("img");

  if (!image) {
    return "";
  }

  return (
    image.currentSrc ||
    image.src ||
    image.getAttribute("src") ||
    image.getAttribute("data-src") ||
    ""
  );
}

function parseListingsFromDocument(doc) {
  const links = Array.from(
    doc.querySelectorAll(
      'a[data-testid^="result-listing-"][href*="/fahrzeuge/details.html?id="]'
    )
  );

  const listings = [];

  for (const link of links) {
    const listingId = getListingIdFromLink(link);

    if (!listingId) {
      continue;
    }

    const card = link.closest("article");

    if (!card) {
      continue;
    }

    const title =
      card.querySelector("h2")?.innerText?.replace(/\s+/g, " ").trim() ||
      "Unknown listing";

    const price =
      card.querySelector('[data-testid="price-label"]')?.innerText?.trim() ||
      "";

    const details =
      card.querySelector('[data-testid="listing-details"]')?.innerText
        ?.replace(/\s+/g, " ")
        .trim() || "";

    const seller =
      card.querySelector('[data-testid="seller-info"]')?.innerText
        ?.replace(/\s+/g, " ")
        .trim() || "";

    const image = getImageFromCard(card);

    listings.push({
      id: listingId,
      title,
      price,
      details,
      seller,
      image,
      href: new URL(link.getAttribute("href"), window.location.origin).href,
    });
  }

  return listings;
}

function createSearchPageUrl(pageNumber, pageParamName = "pageNumber") {
  const url = new URL(window.location.href);

  url.searchParams.set(pageParamName, String(pageNumber));

  return url.href;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, options = {}, retries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, options);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      return resp;
    } catch (err) {
      lastError = err;

      if (attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt);
        console.warn(`Fetch failed for ${url}, retrying in ${backoff}ms...`, err);
        await sleep(backoff);
      }
    }
  }

  throw lastError;
}

// Dev helper: fetch first `pages` pages and log per-page listing counts
async function runScanDryRun(pages = 3) {
  const pageParamName = detectPageParamName();

  for (let i = 1; i <= pages; i++) {
    const pageUrl = createSearchPageUrl(i, pageParamName);

    try {
      const resp = await fetchWithRetries(pageUrl, { credentials: "include" }, 1);
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const listings = parseListingsFromDocument(doc);

      console.info(`Dry-run page ${i}: ${listings.length} listings - ${pageUrl}`);
    } catch (err) {
      console.error(`Dry-run failed for page ${i}: ${pageUrl}`, err);
      break;
    }

    await sleep(SCAN_DELAY_MS);
  }
}

async function scanAllPages() {
  const panel = getOrCreateScanPanel();

  panel.innerHTML = `
    <div class="mobile-de-filter-panel-title">Scanning mobile.de results...</div>
    <div class="mobile-de-filter-panel-body">Starting scan...</div>
  `;

  const hiddenListingIds = await getHiddenListingIds();
  const seenListingIds = await getSeenListingIds();
  const lastViewedListingMap = await getLastViewedListingMap();

  const pageParamName = detectPageParamName();
  const lastPageNumber = getLastPageNumberFromDocument(document, pageParamName);

  const allListings = [];
  const uniqueListingIds = new Set();

  for (let pageNumber = 1; pageNumber <= lastPageNumber; pageNumber++) {
    panel.querySelector(".mobile-de-filter-panel-body").textContent =
      `Scanning page ${pageNumber} of ${lastPageNumber}...`;

    const pageUrl = createSearchPageUrl(pageNumber, pageParamName);

    try {
      const response = await fetchWithRetries(
        pageUrl,
        { credentials: "include" },
        1
      );

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const listings = parseListingsFromDocument(doc);

      // If no listings are found on a subsequent page, stop scanning early
      if (pageNumber > 1 && listings.length === 0) {
        console.warn(`Stopping scan early: no listings on page ${pageNumber}`);
        break;
      }

      for (const listing of listings) {
        if (uniqueListingIds.has(listing.id)) {
          continue;
        }

        uniqueListingIds.add(listing.id);

        allListings.push({
          ...listing,
          pageNumber,
          isHidden: hiddenListingIds.has(listing.id),
          isSeen: seenListingIds.has(listing.id),
          lastViewedAt: lastViewedListingMap[listing.id] || null,
        });
      }
    } catch (error) {
      console.error(`Failed to scan page ${pageNumber}`, error);
    }

    await sleep(SCAN_DELAY_MS);
  }

  const newListings = allListings.filter(
    (listing) => !listing.isHidden && !listing.isSeen
  );

  const hiddenListings = allListings.filter((listing) => listing.isHidden);

  const seenListings = allListings.filter(
    (listing) => !listing.isHidden && listing.isSeen
  );

  renderScanResults(panel, {
    allListings,
    newListings,
    seenListings,
    hiddenListings,
  });
}

function renderScanResults(panel, results) {
  const { allListings, newListings, seenListings, hiddenListings } = results;

  panel.innerHTML = "";

  const title = document.createElement("div");
  title.className = "mobile-de-filter-panel-title";
  title.textContent = "mobile.de Filter scan results";

  const summary = document.createElement("div");
  summary.className = "mobile-de-filter-panel-summary";
  summary.textContent =
    `${newListings.length} new / ` +
    `${seenListings.length} seen / ` +
    `${hiddenListings.length} hidden / ` +
    `${allListings.length} total`;

  const actions = document.createElement("div");
  actions.className = "mobile-de-filter-panel-actions";

  const markNewSeenButton = document.createElement("button");
  markNewSeenButton.textContent = "Mark new as seen";
  markNewSeenButton.type = "button";

  markNewSeenButton.addEventListener("click", async () => {
    const seenListingIds = await getSeenListingIds();

    for (const listing of newListings) {
      seenListingIds.add(listing.id);
    }

    await saveSeenListingIds(seenListingIds);

    markNewSeenButton.textContent = "Marked as seen";
    markNewSeenButton.disabled = true;

    processListings();
  });

  const closeButton = document.createElement("button");
  closeButton.textContent = "Close";
  closeButton.type = "button";

  closeButton.addEventListener("click", () => {
    panel.remove();
  });

  actions.appendChild(markNewSeenButton);
  actions.appendChild(closeButton);

  const list = document.createElement("div");
  list.className = "mobile-de-filter-scan-list";

  const listingsToShow = newListings.length > 0 ? newListings : allListings;

  for (const listing of listingsToShow) {
    const item = document.createElement("a");
    item.className = "mobile-de-filter-scan-item";
    item.href = listing.href;
    item.target = "_blank";
    item.rel = "noopener noreferrer";

    item.innerHTML = `
      ${
        listing.image
          ? `<img class="mobile-de-filter-scan-image" src="${escapeHtml(
              listing.image
            )}" alt="">`
          : `<div class="mobile-de-filter-scan-image mobile-de-filter-scan-image-placeholder"></div>`
      }
      <div class="mobile-de-filter-scan-content">
        <strong>${escapeHtml(listing.title)}</strong>
        <span>${escapeHtml(listing.price)}</span>
        <small>Page ${listing.pageNumber} — ${escapeHtml(listing.details)}</small>
        <small>Last viewed: ${escapeHtml(formatDateTime(listing.lastViewedAt))}</small>
      </div>
    `;

    list.appendChild(item);
  }

  if (listingsToShow.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mobile-de-filter-empty";
    empty.textContent = "No listings found.";

    list.appendChild(empty);
  }

  panel.appendChild(title);
  panel.appendChild(summary);
  panel.appendChild(actions);
  panel.appendChild(list);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getOrCreateScanPanel() {
  let panel = document.querySelector(".mobile-de-filter-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "mobile-de-filter-panel";
    document.body.appendChild(panel);
  }

  return panel;
}

function createToolbar() {
  if (!isSearchResultsPage()) {
    return;
  }

  if (document.querySelector(".mobile-de-filter-toolbar")) {
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "mobile-de-filter-toolbar";

  const scanButton = document.createElement("button");
  scanButton.textContent = "Scan all pages";
  scanButton.type = "button";

  scanButton.addEventListener("click", async () => {
    scanButton.disabled = true;
    scanButton.textContent = "Scanning...";

    try {
      await scanAllPages();
    } finally {
      scanButton.disabled = false;
      scanButton.textContent = "Scan all pages";
    }
  });

  const markVisibleSeenButton = document.createElement("button");
  markVisibleSeenButton.textContent = "Mark visible as seen";
  markVisibleSeenButton.type = "button";

  markVisibleSeenButton.addEventListener("click", async () => {
    const seenListingIds = await getSeenListingIds();
    const hiddenListingIds = await getHiddenListingIds();
    const listings = findListings();

    for (const { card, listingId } of listings) {
      if (hiddenListingIds.has(listingId)) {
        continue;
      }

      seenListingIds.add(listingId);
      removeNewBadge(card);
    }

    await saveSeenListingIds(seenListingIds);

    markVisibleSeenButton.textContent = "Marked";

    setTimeout(() => {
      markVisibleSeenButton.textContent = "Mark visible as seen";
    }, 1200);
  });

  toolbar.appendChild(scanButton);
  toolbar.appendChild(markVisibleSeenButton);

  document.body.appendChild(toolbar);
}

let isProcessing = false;

async function processListings() {
  if (!isSearchResultsPage()) {
    return;
  }

  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const hiddenListingIds = await getHiddenListingIds();
    const seenListingIds = await getSeenListingIds();
    const listings = findListings();

    for (const { card, listingId } of listings) {
      if (hiddenListingIds.has(listingId)) {
        removeNewBadge(card);
        collapseCard(card, listingId, hiddenListingIds);
        continue;
      }

      createHideButton(card, listingId, hiddenListingIds);

      if (!seenListingIds.has(listingId)) {
        createNewBadge(card);
      } else {
        removeNewBadge(card);
      }
    }
  } finally {
    isProcessing = false;
  }
}

createToolbar();
processListings();

async function processDetailView() {
  if (!isDetailPage()) return;

  // Prefer the article inside the aside (detail summary box), fallback to any article
  const card = document.querySelector("aside article") || document.querySelector("article");

  if (!card) return;

  const listingId = getListingIdFromUrl();

  if (!listingId) return;

  const lastViewedListingMap = await getLastViewedListingMap();
  lastViewedListingMap[listingId] = new Date().toISOString();
  await saveLastViewedListingMap(lastViewedListingMap);

  const hiddenListingIds = await getHiddenListingIds();

  if (hiddenListingIds.has(listingId)) {
    collapseCard(card, listingId, hiddenListingIds);
    return;
  }
  // Place hide button inside the top info box: the first div within the section
  const topInfoBox = card.querySelector('section > div');

  if (topInfoBox) {
    createDetailHideButton(topInfoBox, card, listingId, hiddenListingIds);
  } else {
    // fallback to action area or corner
    const actionArea = card.querySelector('.Va7Gr') || card.querySelector('.uUt6d') || card.querySelector('section');

    if (actionArea) {
      createDetailHideButton(actionArea, card, listingId, hiddenListingIds);
    } else {
      createHideButton(card, listingId, hiddenListingIds);
    }
  }
}

processDetailView();

const observer = new MutationObserver(() => {
  processListings();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});