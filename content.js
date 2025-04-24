console.log("🔌 Whatnot Sales Tracker content script loaded");

function createSalesDisplay() {
    if (document.getElementById("whatnot-sales-tracker")) {
        return;
    }

    const displayElement = document.createElement("div");
    displayElement.id = "whatnot-sales-tracker";
    displayElement.innerHTML = `
    <div class="sales-tracker-container">
      <div class="sales-label">Total Sales</div>
      <div class="sales-total">$<span id="injected-total-sales">0</span></div>
      <div class="sales-label">After Fees</div>
      <div class="sales-total">$<span id="injected-total-sales-after-fees">0</span></div>
      <div class="sales-label">Sales Count</div>
      <div class="sales-count"><span id="injected-sales-count">0</span> items</div>
    </div>
  `;

    const styles = document.createElement("style");
    styles.textContent = `
    #whatnot-sales-tracker {
      position: fixed;
      top: 70px;
      right: 20px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    .sales-tracker-container {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sales-total {
      font-size: 20px;
      font-weight: bold;
    }
    .sales-count {
      font-size: 14px;
      opacity: 0.9;
    }
  `;

    document.head.appendChild(styles);
    document.body.appendChild(displayElement);
}

function updateSalesDisplay(data) {
    if (!document.getElementById("whatnot-sales-tracker")) {
        createSalesDisplay();
    }

    const totalElement = document.getElementById("injected-total-sales");
    const totalAfterFeesElement = document.getElementById("injected-total-sales-after-fees");
    const countElement = document.getElementById("injected-sales-count");

    if (totalElement && data.totalSales) {
        const formattedTotal = parseFloat(data.totalSales).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
        totalElement.textContent = formattedTotal;
    }

    if (countElement && data.salesCount) {
        countElement.textContent = data.salesCount;
    }

    if (totalAfterFeesElement && data.estimatedTotalAfterFees) {
        const formattedTotalAfterFees = parseFloat(data.estimatedTotalAfterFees).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
        totalAfterFeesElement.textContent = formattedTotalAfterFees;
    }
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SALES_UPDATED") {
        updateSalesDisplay(message.data);
    }
});

chrome.runtime.sendMessage({ type: "GET_TOTAL" }, (response) => {
    if (response) {
        updateSalesDisplay(response);
    }
});

createSalesDisplay();

function requestLatestData() {
    chrome.runtime.sendMessage({ type: "GET_TOTAL" }, (response) => {
        if (response) {
            console.log("📊 Received updated sales data:", response);
            updateSalesDisplay(response);
        }
    });
}

setInterval(requestLatestData, 10000);

let port = chrome.runtime.connect({ name: "whatnot-sales-tracker" });
port.onDisconnect.addListener(() => {
    console.log("🔄 Reconnecting to background script...");
    port = chrome.runtime.connect({ name: "whatnot-sales-tracker" });
});
