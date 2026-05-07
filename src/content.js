const STORAGE_KEY = "hiddenMobileDeListingIds";
const PROCESSED_ATTRIBUTE = "data-mobile-de-filter-processed";
const COLLAPSED_ATTRIBUTE = "data-mobile-de-filter-collapsed";

function isSearchResultsPage() {
  return (
    window.location.hostname === "suchen.mobile.de" &&
    window.location.pathname.includes("/fahrzeuge/search.html")
  );
}

async function getHiddenListingIds() {
  const result = await chrome.storage.local.get(STORAGE_KEY);

  return new Set(result[STORAGE_KEY] || []);
}

async function saveHiddenListingIds(hiddenListingIds) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: Array.from(hiddenListingIds),
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
      .trim() ||
    "";

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
    });
  }

  return listings;
}

function expandCard(card) {
  const collapsedBar = card.querySelector(":scope > .mobile-de-filter-collapsed-bar");

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
    const listings = findListings();

    for (const { card, listingId } of listings) {
      if (hiddenListingIds.has(listingId)) {
        collapseCard(card, listingId, hiddenListingIds);
        continue;
      }

      createHideButton(card, listingId, hiddenListingIds);
    }
  } finally {
    isProcessing = false;
  }
}

processListings();

const observer = new MutationObserver(() => {
  processListings();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});