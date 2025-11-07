const FETCH_PAGE_DELAY_MS = 200; // between GraphQL pages

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
      const liveStream = data?.data?.liveStream;
      const pageInfo = liveStream?.shop?.pageInfo;
      const edges = liveStream?.shop?.edges || [];

      if (!pageInfo) {
        console.error("Unexpected GraphQL response", data);
        break;
      }

      allEdges = allEdges.concat(edges);
      hasNextPage = Boolean(pageInfo.hasNextPage);
      after = pageInfo.endCursor || null;

      if (hasNextPage) {
        await sleep(FETCH_PAGE_DELAY_MS);
      }
    } catch (error) {
      console.error("Error fetching sales page", error);
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

function updateDisplay({ gross, net, count, updatedAt, isLoading, error }) {
  const title = document.getElementById("title");
  const desc = document.getElementById("desc");
  const dot = document.getElementById("dot");
  const grossEl = document.getElementById("gross");
  const netEl = document.getElementById("net");
  const countEl = document.getElementById("count");
  const updatedEl = document.getElementById("updated");
  const errorEl = document.getElementById("error");

  if (error) {
    title.textContent = "Error";
    desc.textContent = error;
    dot.classList.remove("on");
    dot.classList.add("off");
    if (grossEl) grossEl.textContent = "$0.00";
    if (netEl) netEl.textContent = "$0.00";
    if (countEl) countEl.textContent = "0";
    if (updatedEl) updatedEl.textContent = "—";
    if (errorEl) {
      errorEl.textContent = error;
      errorEl.style.display = "block";
    }
    return;
  }

  if (errorEl) errorEl.style.display = "none";

  if (isLoading) {
    title.textContent = "Loading sales data…";
    desc.textContent = "Fetching from Whatnot…";
    dot.classList.remove("on");
    dot.classList.add("off");
    if (grossEl) grossEl.textContent = "—";
    if (netEl) netEl.textContent = "—";
    if (countEl) countEl.textContent = "—";
    if (updatedEl) updatedEl.textContent = "—";
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
      ? new Date(updatedAt).toLocaleTimeString()
      : "—";
  }
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

    const url = new URL(tab.url);
    const livestreamId = getLivestreamIdFromUrl(tab.url);

    if (!livestreamId) {
      updateDisplay({
        error: "Not on a Whatnot livestream page. Open a livestream to track sales.",
      });
      return;
    }

    // Show loading state
    updateDisplay({ isLoading: true });

    // Fetch sales data
    try {
      const edges = await fetchAllSales(livestreamId);
      const gross = calculateTotal(edges);
      const net = calculateTotalAfterFees(edges);
      const count = edges.length;

      updateDisplay({
        gross,
        net,
        count,
        updatedAt: Date.now(),
        isLoading: false,
      });
    } catch (err) {
      console.error("Error fetching sales data", err);
      updateDisplay({
        error: "Failed to fetch sales data. Make sure you're logged in to Whatnot.",
        isLoading: false,
      });
    }
  } catch (e) {
    console.error("Error in popup", e);
    updateDisplay({
      error: "Unable to read current tab. Please make sure the popup has access to the active tab.",
    });
  }
});
