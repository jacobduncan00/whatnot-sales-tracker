const storage = chrome.storage.local;
let lastTotal = 0;
let currentLivestreamId = null;

async function getCurrentLivestreamId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.hostname === 'www.whatnot.com' && url.pathname.includes('/live/')) {
      const livestreamId = url.pathname.split('/').pop();
      console.log("📺 Found livestream ID:", livestreamId);
      return livestreamId;
    }
    return null;
  } catch (error) {
    console.error("❌ Error getting livestream ID:", error);
    return null;
  }
}

async function checkSales() {
  currentLivestreamId = await getCurrentLivestreamId();

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

    const storageData = {
      totalSales: total.toFixed(0),
      estimatedTotalAfterFees: totalAfterFees.toFixed(2),
      lastUpdated: new Date().toISOString(),
      salesCount: salesCount,
    };

    await storage.set(storageData);

    try {
      chrome.runtime.sendMessage({
        type: "SALES_UPDATED",
        data: storageData,
      });

    } catch (e) {
      console.log("No popup active");
    }
  } catch (error) {
    console.error("❌ Error checking sales:", error);
  }

}

function startTracking() {
  console.log("🚀 Starting sales tracking...");
  checkSales();
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
                      title
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
        await new Promise((resolve) => setTimeout(resolve, 200));
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("📨 Received message:", request.type, "from:", sender?.tab?.id || "popup");

  if (request.type === "GET_TOTAL") {
    storage.get(
      ["totalSales", "estimatedTotalAfterFees", "lastUpdated", "salesCount"],
      (result) => {
        console.log("📤 Sending current data:", result);
        sendResponse(result);
      }
    );

    checkSales();
    return true;
  }

  if (request.type === "FORCE_UPDATE") {
    checkSales().then(() => {
      sendResponse({ status: "Updating..." });
    });
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  console.log("🔌 Content script connected:", port.name);

  port.onDisconnect.addListener(() => {
    console.log("🔌 Content script disconnected:", port.name);
  });
});