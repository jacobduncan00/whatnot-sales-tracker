// Whatnot Sales Tracker – Content Script
// Intercepts Whatnot's own GraphQL responses to track sales

(function () {
  const WIDGET_ID = "wn-sales-tracker-widget";
  const STORAGE_KEY = "wn-sales-tracker-data";

  let currentLivestreamId = null;
  let currentUrl = location.href;
  let salesData = { edges: [], totalCount: 0 };

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

  function calculateTotal(edges) {
    return edges.reduce((sum, edge) => {
      const price = edge?.node?.price?.amount;
      return sum + (typeof price === "number" ? price / 100 : 0);
    }, 0);
  }

  function calculateTotalAfterFees(edges) {
    return edges.reduce((sum, edge) => {
      const price = edge?.node?.price?.amount;
      if (typeof price !== "number") return sum;
      const priceInDollars = price / 100;
      const processingFee = priceInDollars * 0.029 + 0.3;
      const whatnotFee = priceInDollars * 0.08;
      return sum + priceInDollars - processingFee - whatnotFee;
    }, 0);
  }

  function calculateTopSpenders(edges) {
    const spenderMap = new Map();

    for (const edge of edges) {
      const username = edge?.node?.buyer?.username;
      if (!username) continue;

      const amount = edge?.node?.price?.amount;
      if (typeof amount !== "number") continue;

      const amountInDollars = amount / 100;
      const current = spenderMap.get(username) || { total: 0, count: 0 };
      spenderMap.set(username, {
        total: current.total + amountInDollars,
        count: current.count + 1,
      });
    }

    const sorted = Array.from(spenderMap.entries())
      .map(([username, data]) => ({
        username,
        total: data.total,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total);

    return sorted.slice(0, 5);
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
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      border: 1px solid rgba(197,199,214,0.3);
      border-radius: 8px;
      background: #1a1a1a;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      font-family: Inter, system-ui, sans-serif;
      min-width: 200px;
    `;

    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-family:Poppins, Inter, system-ui, -apple-system, Segoe UI, Roboto; font-weight:700; font-size:14px; letter-spacing:-0.2px;">Sales Tracker</span>
        <span id="${WIDGET_ID}-status" style="font-family:Inter; font-size:11px; color:#999;">Listening...</span>
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
      <div id="${WIDGET_ID}-loading" style="margin-top:6px; font-size:11px; color:#888;">Loading sales data...</div>
    `;

    return container;
  }

  function ensureWidgetMounted() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing) {
      return existing;
    }

    log("Mounting floating widget");
    const widget = createWidgetElement();
    document.body.appendChild(widget);
    return widget;
  }

  function updateWidget({ gross, net, count, updatedAt }) {
    const widget = ensureWidgetMounted();
    if (!widget) {
      log("Widget not mounted, cannot update");
      return;
    }
    log("Updating widget with", count, "items");
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
        : "Listening...";
  }

  function processNewSalesData(edges) {
    // Merge new edges with existing ones, avoiding duplicates by id
    const existingIds = new Set(salesData.edges.map((e) => e?.node?.id));
    const newEdges = edges.filter((e) => e?.node?.id && !existingIds.has(e.node.id));

    if (newEdges.length > 0) {
      salesData.edges = [...salesData.edges, ...newEdges];
      log(`Added ${newEdges.length} new sales. Total: ${salesData.edges.length}`);
    }
  }

  function handleGraphQLResponse(data) {
    try {
      // Check if this is a full load (replaces all data)
      const isFullLoad = data?._isFullLoad;

      // Handle LiveShopSold response
      const soldItems = data?.data?.liveShop?.soldItems;
      if (soldItems?.edges && Array.isArray(soldItems.edges)) {
        log("Received", soldItems.edges.length, "items", isFullLoad ? "(full load)" : "(incremental)");

        if (isFullLoad) {
          // Replace all data
          salesData.edges = soldItems.edges;
          log("Full load complete:", salesData.edges.length, "total items");
        } else if (soldItems.edges.length > 0) {
          // Incremental update - add new items
          processNewSalesData(soldItems.edges);
        }

        // Update display
        const gross = calculateTotal(salesData.edges);
        const net = calculateTotalAfterFees(salesData.edges);
        const count = salesData.edges.length;
        const topSpenders = calculateTopSpenders(salesData.edges);

        updateWidget({ gross, net, count, updatedAt: Date.now() });

        // Store data
        chrome.storage.local.set({
          topSpenders,
          livestreamId: currentLivestreamId,
          lastUpdated: Date.now(),
          salesStats: { gross, net, count },
        }).catch(e => log("Failed to store data", e));

        // Update loading status
        const loadingEl = document.querySelector(`#${CSS.escape(WIDGET_ID)}-loading`);
        if (loadingEl) {
          loadingEl.textContent = `Live • Polling every 15s`;
          loadingEl.style.color = "#4ade80";
        }
      }
    } catch (e) {
      log("Error processing GraphQL response:", e);
    }
  }

  // Inject script into page to intercept fetch/XHR
  function injectInterceptor() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("injector.js");
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function observeDomForSidebar() {
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
    setInterval(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        const newId = getLivestreamIdFromUrl(currentUrl);
        if (newId !== currentLivestreamId) {
          currentLivestreamId = newId;
          salesData = { edges: [], totalCount: 0 }; // Reset data for new stream
          const existing = document.getElementById(WIDGET_ID);
          if (existing) existing.remove();
          ensureWidgetMounted();
        }
      }
    }, 1000);
  }

  function init() {
    log("Content script initialized");
    log("Current URL:", location.href);
    currentLivestreamId = getLivestreamIdFromUrl(location.href);
    log("Detected livestreamId:", currentLivestreamId);

    if (!currentLivestreamId) {
      log("Not on a livestream page, exiting");
      return;
    }

    // Listen for intercepted data from page script
    window.addEventListener("whatnot-sales-tracker-data", (event) => {
      try {
        const data = JSON.parse(event.detail);
        handleGraphQLResponse(data);
      } catch (e) {
        log("Error parsing intercepted data:", e);
      }
    });

    // Listen for button reset (when load fails due to no headers)
    window.addEventListener("whatnot-sales-tracker-reset-button", () => {
      const loadAllBtn = document.querySelector(`#${CSS.escape(WIDGET_ID)}-load-all`);
      if (loadAllBtn) {
        loadAllBtn.textContent = "Load All Sales";
        loadAllBtn.disabled = false;
        loadAllBtn.style.background = "#5c5cff";
      }
    });

    // Inject the network interceptor into the page
    injectInterceptor();

    ensureWidgetMounted();
    observeDomForSidebar();
    observeUrlChanges();

    log("Sales tracker ready - will auto-load once headers are captured");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
