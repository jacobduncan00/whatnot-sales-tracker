const storage = chrome.storage.local;

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Popup opened");
  setupDisplay();
  loadData();
});

function setupDisplay() {
  const container = document.createElement("div");
  container.className = "stats-container";

  container.innerHTML = `
    <div class="label">Total Sales</div>
    <div class="total">$<span id="totalSales">0.00</span></div>
    <div class="total-after-fees-label">Estimated Total After Fees</div>
    <div class="total-after-fees">$<span id="estimatedTotalAfterFees">0.00</span></div>
    <div class="sales-count">Items Sold: <span id="salesCount">0</span></div>
    <div id="lastUpdated" class="timestamp">Not yet updated</div>
  `;

  document.body.appendChild(container);

  const refreshButton = document.createElement("button");
  refreshButton.textContent = "Refresh";
  refreshButton.className = "refresh-button";
  refreshButton.onclick = forceRefresh;
  document.body.appendChild(refreshButton);
}

function forceRefresh() {
  const button = document.querySelector(".refresh-button");
  button.disabled = true;
  button.textContent = "Updating...";

  chrome.runtime.sendMessage({ type: "FORCE_UPDATE" }, () => {
    setTimeout(() => {
      loadData();
      button.disabled = false;
      button.textContent = "Refresh";
    }, 2000);
  });
}

function loadData() {
  chrome.runtime.sendMessage({ type: "GET_TOTAL" }, (response) => {
    if (response) {
      updateDisplay(response);
    }
  });
}

function updateDisplay(data) {
  if (!data) return;

  const totalElement = document.getElementById("totalSales");
  const estimatedTotalAfterFeesElement = document.getElementById(
    "estimatedTotalAfterFees"
  );
  const lastUpdatedElement = document.getElementById("lastUpdated");
  const salesCountElement = document.getElementById("salesCount");

  if (data.totalSales) {
    const formattedTotal = parseFloat(data.totalSales).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    totalElement.textContent = formattedTotal;
  }

  if (data.estimatedTotalAfterFees) {
    const formattedTotal = parseFloat(
      data.estimatedTotalAfterFees
    ).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    estimatedTotalAfterFeesElement.textContent = formattedTotal;
  }

  if (data.salesCount) {
    salesCountElement.textContent = data.salesCount;
  }

  if (data.lastUpdated) {
    const date = new Date(data.lastUpdated);
    lastUpdatedElement.textContent = `Last updated: ${date.toLocaleTimeString()}`;
  }
}

// Listen for live updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SALES_UPDATED") {
    updateDisplay(message.data);
  }
});
