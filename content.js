// Whatnot Sales Tracker – Content Script
// Injects live sales totals into the Whatnot livestream page without needing to open the extension popup

(function () {
  const POLL_INTERVAL_MS = 10000; // refresh cadence (10s)
  const FETCH_PAGE_DELAY_MS = 200; // between GraphQL pages
  const WIDGET_ID = "wn-sales-tracker-widget";

  let currentLivestreamId = null;
  let currentUrl = location.href;
  let pollingTimer = null;
  let updating = false;

  function log(...args) {
    console.log("[Whatnot Sales Tracker]", ...args);
  }

  function getLivestreamIdFromUrl(urlString) {
    try {
      const url = new URL(urlString);
      if (
        url.hostname.endsWith("whatnot.com") &&
        url.pathname.includes("/live/")
      ) {
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[parts.length - 1] || null;
      }
    } catch (_) {
      // ignore
    }
    return null;
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchAllSales(livestreamId) {
    let allEdges = [];
    let hasNextPage = true;
    let after = null;

    while (hasNextPage) {
      try {
        const response = await fetch(
          "https://www.whatnot.com/services/graphql/?operationName=LiveShopSoldItems",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apollographql-client-name": "web",
            },
            credentials: "include",
            body: JSON.stringify({
              operationName: "LiveShopSoldItems",
              variables: {
                liveId: livestreamId,
                first: 50,
                after: after,
              },
              query: `
                query LiveShopSoldItems($liveId: ID!, $first: Int, $after: String) {
                  liveShop(liveId: $liveId) {
                    soldItems(first: $first, after: $after) {
                      totalCount
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      edges {
                        node {
                          id
                          listing {
                            title
                          }
                          buyer {
                            username
                          }
                          price {
                            amount
                            currency
                          }
                        }
                      }
                    }
                  }
                }
              `,
            }),
          }
        );

        const data = await response.json();
        const liveShop = data?.data?.liveShop;
        const soldItems = liveShop?.soldItems;
        const pageInfo = soldItems?.pageInfo;
        const edges = soldItems?.edges || [];

        if (!pageInfo) {
          log("Unexpected GraphQL response", data);
          break;
        }

        allEdges = allEdges.concat(edges);
        hasNextPage = Boolean(pageInfo.hasNextPage);
        after = pageInfo.endCursor || null;

        if (hasNextPage) {
          await sleep(FETCH_PAGE_DELAY_MS);
        }
      } catch (error) {
        console.error(
          "[Whatnot Sales Tracker] Error fetching sales page",
          error
        );
        break;
      }
    }

    return allEdges;
  }

  function calculateTotal(edges) {
    return edges.reduce((sum, edge) => sum + edge.node.price.amount / 100, 0);
  }

  function calculateTotalAfterFees(edges) {
    return edges.reduce((sum, edge) => {
      const price = edge.node.price.amount / 100;
      // Assume no taxes or shipping
      // Fees: 8% commission + (2.9% + $0.30) payment processing
      const processingFee = price * 0.029 + 0.3;
      const whatnotFee = price * 0.08;
      return sum + price - processingFee - whatnotFee;
    }, 0);
  }

  function calculateTopSpenders(edges) {
    const spenderMap = new Map();

    for (const edge of edges) {
      const username = edge.node.buyer?.username;
      if (!username) continue;

      const amount = edge.node.price.amount / 100;
      const current = spenderMap.get(username) || { total: 0, count: 0 };
      spenderMap.set(username, {
        total: current.total + amount,
        count: current.count + 1,
      });
    }

    // Convert to array and sort by total descending
    const sorted = Array.from(spenderMap.entries())
      .map(([username, data]) => ({
        username,
        total: data.total,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total);

    return sorted.slice(0, 5); // Top 5 spenders
  }

  async function storeTopSpenders(topSpenders, livestreamId) {
    try {
      await chrome.storage.local.set({
        topSpenders,
        livestreamId,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      log("Failed to store top spenders", e);
    }
  }

  function formatCurrency(amount) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (_) {
      return `$${amount.toFixed(2)}`;
    }
  }

  function createWidgetElement() {
    const container = document.createElement("div");
    container.id = WIDGET_ID;
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";
    container.style.padding = "12px";
    container.style.margin = "8px 0";
    container.style.border = "1px solid rgba(197,199,214,0.2)";
    container.style.borderRadius = "8px";
    container.style.background = "#0d0d0d";
    container.style.color = "#fff";

    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-family:Poppins, Inter, system-ui, -apple-system, Segoe UI, Roboto; font-weight:700; font-size:14px; letter-spacing:-0.2px;">Sales Tracker</span>
        <span id="${WIDGET_ID}-status" style="font-family:Inter; font-size:11px; color:#999;">—</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#aaa; font-family:Inter; font-size:12px;">Total Sales</span>
          <strong id="${WIDGET_ID}-gross" style="font-family:Poppins; font-size:13px;">$0</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#aaa; font-family:Inter; font-size:12px;">Est. After Fees</span>
          <strong id="${WIDGET_ID}-net" style="font-family:Poppins; font-size:13px;">$0</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#aaa; font-family:Inter; font-size:12px;">Items Sold</span>
          <strong id="${WIDGET_ID}-count" style="font-family:Poppins; font-size:13px;">0</strong>
        </div>
      </div>
    `;

    return container;
  }

  function findTitleElement() {
    // Prefer an h3 inside the same container that has the Breaks/Auction tabs
    const candidates = document.querySelectorAll(
      'h3.MuiTypography-h3, h3[class*="MuiTypography-h3"]'
    );
    for (const h3 of candidates) {
      const container = h3.parentElement;
      if (!container) continue;
      const hasTabs = container.querySelector(
        'h5[data-cy="Breaks"], h5[data-cy="Auction"], h5[data-cy="Sold"]'
      );
      if (hasTabs) return h3;
    }

    // Fallback: ascend from any tab to find a nearby h3
    const tabEl = document.querySelector(
      'h5[data-cy="Breaks"], h5[data-cy="Auction"], h5[data-cy="Sold"]'
    );
    if (tabEl) {
      let el = tabEl.parentElement;
      while (el && el !== document.body) {
        const h3 = el.querySelector(
          'h3.MuiTypography-h3, h3[class*="MuiTypography-h3"]'
        );
        if (h3) return h3;
        el = el.parentElement;
      }
    }
    return null;
  }

  function ensureWidgetMounted() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing) return existing;

    const titleEl = findTitleElement();
    if (!titleEl) return null; // Do not inject anywhere else; wait until title exists

    const widget = createWidgetElement();
    titleEl.insertAdjacentElement("afterend", widget);
    return widget;
  }

  function updateWidget({ gross, net, count, updatedAt }) {
    const widget = ensureWidgetMounted();
    if (!widget) return; // not yet ready to mount
    const grossEl = widget.querySelector(`#${CSS.escape(WIDGET_ID)}-gross`);
    const netEl = widget.querySelector(`#${CSS.escape(WIDGET_ID)}-net`);
    const countEl = widget.querySelector(`#${CSS.escape(WIDGET_ID)}-count`);
    const statusEl = widget.querySelector(`#${CSS.escape(WIDGET_ID)}-status`);

    if (grossEl) grossEl.textContent = formatCurrency(gross);
    if (netEl) netEl.textContent = formatCurrency(net);
    if (countEl) countEl.textContent = String(count);
    if (statusEl)
      statusEl.textContent = updatedAt
        ? new Date(updatedAt).toLocaleTimeString()
        : "—";
  }

  async function refreshOnce() {
    const livestreamId = getLivestreamIdFromUrl(location.href);
    if (!livestreamId) {
      log("Not on a Whatnot livestream page; skipping.");
      return;
    }

    if (updating) {
      return; // avoid overlapping fetches
    }
    updating = true;

    try {
      const edges = await fetchAllSales(livestreamId);
      const gross = calculateTotal(edges);
      const net = calculateTotalAfterFees(edges);
      const count = edges.length;
      const topSpenders = calculateTopSpenders(edges);

      updateWidget({ gross, net, count, updatedAt: Date.now() });
      await storeTopSpenders(topSpenders, livestreamId);
    } catch (err) {
      console.error("[Whatnot Sales Tracker] Error updating totals", err);
    } finally {
      updating = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollingTimer = setInterval(refreshOnce, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function observeDomForSidebar() {
    // Re-ensure the widget is attached if the sidebar re-renders (SPA behavior)
    const observer = new MutationObserver(() => {
      if (!document.getElementById(WIDGET_ID)) {
        ensureWidgetMounted();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function observeUrlChanges() {
    // Handle SPA navigations where location.href changes without reload
    setInterval(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        const newId = getLivestreamIdFromUrl(currentUrl);
        if (newId !== currentLivestreamId) {
          currentLivestreamId = newId;
          // Clear and re-mount widget on stream change
          const existing = document.getElementById(WIDGET_ID);
          if (existing) existing.remove();
          ensureWidgetMounted();
          refreshOnce();
        }
      }
    }, 1000);
  }

  async function init() {
    currentLivestreamId = getLivestreamIdFromUrl(location.href);
    ensureWidgetMounted();
    observeDomForSidebar();
    observeUrlChanges();
    await refreshOnce();
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
