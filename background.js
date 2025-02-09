// background.js
const storage = chrome.storage.local;
let lastTotal = 0;
let currentLivestreamId = null;
let checkInterval = null;
const UPDATE_INTERVAL = 10000; // 10 seconds

// Function to check for new sales
async function checkSales() {
  if (!currentLivestreamId) {
    console.log("⚠️ No livestream ID available");
    return;
  }

  console.log("🔄 Checking sales at:", new Date().toLocaleTimeString());

  try {
    const allSales = await fetchAllSales(currentLivestreamId);
    const total = calculateTotal(allSales);
    const totalAfterFees = calculateTotalAfterFees(allSales);
    const salesCount = allSales.length;

    console.log(`📊 Found ${salesCount} sales, total: $${total}`);

    if (total !== lastTotal) {
      console.log(`💵 Total sales updated from $${lastTotal} to $${total}`);
      lastTotal = total;

      const storageData = {
        totalSales: total.toFixed(0),
        estimatedTotalAfterFees: totalAfterFees.toFixed(2),
        lastUpdated: new Date().toISOString(),
        salesCount: salesCount,
      };

      await storage.set(storageData);

      // Notify popup
      try {
        chrome.runtime.sendMessage({
          type: "SALES_UPDATED",
          data: storageData,
        });
      } catch (e) {
        console.log("No popup active");
      }
    } else {
      console.log("💤 No change in total sales");
    }
  } catch (error) {
    console.error("❌ Error checking sales:", error);
  }
}

function startTracking() {
  console.log("🚀 Starting sales tracking...");

  // Clear any existing interval
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Perform initial check
  checkSales();

  // Set up interval for future checks
  checkInterval = setInterval(checkSales, UPDATE_INTERVAL);
  console.log("⏰ Set check interval to", UPDATE_INTERVAL / 1000, "seconds");
}

function stopTracking() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log("🛑 Stopped sales tracking");
  }
}

async function fetchAllSales(livestreamId) {
  let allEdges = [];
  let hasNextPage = true;
  let after = null;

  while (hasNextPage) {
    try {
      const response = await fetch(
        "https://www.whatnot.com/services/graphql/?operationName=LivestreamShop",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apollographql-client-name": "web",
          },
          credentials: "include",
          body: JSON.stringify({
            operationName: "LivestreamShop",
            variables: {
              livestreamId: livestreamId,
              tab: "SOLD",
              first: 50,
              after: after,
            },
            query: `
            query LivestreamShop($livestreamId: ID!, $tab: ShopTab, $first: Int, $after: String) {
              liveStream(id: $livestreamId) {
                id
                shop(tab: $tab, first: $first, after: $after) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  edges {
                    node {
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
      const pageInfo = data.data.liveStream.shop.pageInfo;
      const edges = data.data.liveStream.shop.edges;

      allEdges = [...allEdges, ...edges];
      hasNextPage = pageInfo.hasNextPage;
      after = pageInfo.endCursor;

      if (hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("❌ Error fetching page:", error);
      break;
    }
  }

  return allEdges;
}

function calculateTotal(edges) {
  return edges.reduce((sum, edge) => {
    return sum + edge.node.price.amount / 100;
  }, 0);
}

function calculateTotalAfterFees(edges) {
  return edges.reduce((sum, edge) => {
    const price = edge.node.price.amount / 100;
    const processingFee = price * 0.029 - 0.3;
    const whatnotFee = price * 0.08;
    return sum + price - processingFee - whatnotFee;
  }, 0);
}

// Listen for the initial request to get livestream ID
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (
      details.url.includes("graphql/?operationName=LivestreamShop") &&
      details.method === "POST"
    ) {
      try {
        const requestBody = JSON.parse(
          decodeURIComponent(
            String.fromCharCode.apply(
              null,
              new Uint8Array(details.requestBody.raw[0].bytes)
            )
          )
        );

        if (requestBody.variables?.tab === "SOLD") {
          const newLivestreamId = requestBody.variables.livestreamId;

          if (newLivestreamId !== currentLivestreamId) {
            console.log("🎯 New livestream detected:", newLivestreamId);
            currentLivestreamId = newLivestreamId;
            lastTotal = 0;
            startTracking();
          }
        }
      } catch (error) {
        console.error("❌ Error processing request:", error);
      }
    }
  },
  { urls: ["*://*.whatnot.com/*"] },
  ["requestBody"]
);

// Handle popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_TOTAL") {
    storage.get(
      ["totalSales", "estimatedTotalAfterFees", "lastUpdated", "salesCount"],
      (result) => {
        sendResponse(result);
      }
    );
    return true;
  }

  if (request.type === "FORCE_UPDATE") {
    checkSales();
    sendResponse({ status: "Updating..." });
    return true;
  }
});

// Clean up when extension is unloaded
chrome.runtime.onSuspend.addListener(() => {
  stopTracking();
});
