// Whatnot Sales Tracker – Popup Script
// Reads data stored by the content script

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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateDisplay({
  gross,
  net,
  count,
  topSpenders,
  updatedAt,
  isLoading,
  error,
}) {
  const title = document.getElementById("title");
  const desc = document.getElementById("desc");
  const dot = document.getElementById("dot");
  const grossEl = document.getElementById("gross");
  const netEl = document.getElementById("net");
  const countEl = document.getElementById("count");
  const updatedEl = document.getElementById("updated");
  const errorEl = document.getElementById("error");
  const spendersSection = document.getElementById("spenders-section");
  const spendersList = document.getElementById("spenders-list");

  if (error) {
    title.textContent = "Error";
    desc.textContent = error;
    dot.classList.remove("on");
    dot.classList.add("off");
    if (grossEl) grossEl.textContent = "$0.00";
    if (netEl) netEl.textContent = "$0.00";
    if (countEl) countEl.textContent = "0";
    if (updatedEl) updatedEl.textContent = "—";
    if (spendersSection) spendersSection.style.display = "none";
    if (errorEl) {
      errorEl.textContent = error;
      errorEl.style.display = "block";
    }
    return;
  }

  if (errorEl) errorEl.style.display = "none";

  if (isLoading) {
    title.textContent = "Loading sales data";
    desc.textContent = "Fetching from Whatnot";
    dot.classList.remove("on");
    dot.classList.add("off");
    if (grossEl) grossEl.textContent = "—";
    if (netEl) netEl.textContent = "—";
    if (countEl) countEl.textContent = "—";
    if (updatedEl) updatedEl.textContent = "—";
    if (spendersSection) spendersSection.style.display = "none";
    return;
  }

  title.textContent = "Sales Tracker";
  desc.textContent = "Whatnot livestream sales";
  dot.classList.remove("off");
  dot.classList.add("on");

  if (grossEl) grossEl.textContent = formatCurrency(gross);
  if (netEl) netEl.textContent = formatCurrency(net);
  if (countEl) countEl.textContent = String(count);
  if (updatedEl) {
    updatedEl.textContent = updatedAt
      ? `Updated: ${new Date(updatedAt).toLocaleTimeString()}`
      : "—";
  }

  // Update top spenders
  if (spendersSection && spendersList && topSpenders) {
    if (topSpenders.length === 0) {
      spendersSection.style.display = "none";
    } else {
      spendersSection.style.display = "block";
      spendersList.innerHTML = "";

      topSpenders.forEach((spender, index) => {
        const li = document.createElement("li");
        li.className = "spender-item";

        const rankClass =
          index === 0
            ? "gold"
            : index === 1
            ? "silver"
            : index === 2
            ? "bronze"
            : "";
        const itemLabel = spender.count === 1 ? "item" : "items";

        li.innerHTML = `
          <span class="rank ${rankClass}">${index + 1}</span>
          <span class="username">@${escapeHtml(spender.username)}</span>
          <span class="item-count">${spender.count} ${itemLabel}</span>
          <span class="amount">${formatCurrency(spender.total)}</span>
        `;

        spendersList.appendChild(li);
      });
    }
  }
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

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.url) {
      updateDisplay({
        error: "Unable to read current tab URL",
      });
      return;
    }

    const livestreamId = getLivestreamIdFromUrl(tab.url);

    if (!livestreamId) {
      updateDisplay({
        error:
          "Not on a Whatnot livestream page. Open a livestream to track sales.",
      });
      return;
    }

    // Show loading state
    updateDisplay({ isLoading: true });

    // Get data from storage (set by content script)
    try {
      const stored = await chrome.storage.local.get([
        "topSpenders",
        "livestreamId",
        "lastUpdated",
        "salesStats",
      ]);

      console.log("[Whatnot Sales Tracker] Stored data:", stored);

      if (stored.livestreamId !== livestreamId) {
        updateDisplay({
          gross: 0,
          net: 0,
          count: 0,
          topSpenders: [],
          updatedAt: null,
          isLoading: false,
          error: "Click the 'Sold' tab on Whatnot to load sales data. The extension intercepts Whatnot's own API calls.",
        });
        return;
      }

      const topSpenders = stored.topSpenders || [];
      const lastUpdated = stored.lastUpdated;
      const salesStats = stored.salesStats || { gross: 0, net: 0, count: 0 };

      if (salesStats.count === 0 && !lastUpdated) {
        updateDisplay({
          gross: 0,
          net: 0,
          count: 0,
          topSpenders: [],
          updatedAt: null,
          isLoading: false,
          error: "No sales data yet. Click the 'Sold' tab on Whatnot to load data.",
        });
        return;
      }

      updateDisplay({
        gross: salesStats.gross,
        net: salesStats.net,
        count: salesStats.count,
        topSpenders,
        updatedAt: lastUpdated,
        isLoading: false,
      });
    } catch (err) {
      console.error("[Whatnot Sales Tracker] Error reading stored data", err);
      updateDisplay({
        error: "Failed to read sales data from storage.",
        isLoading: false,
      });
    }
  } catch (e) {
    console.error("[Whatnot Sales Tracker] Error in popup", e);
    updateDisplay({
      error:
        "Unable to read current tab. Please make sure the popup has access to the active tab.",
    });
  }
});
