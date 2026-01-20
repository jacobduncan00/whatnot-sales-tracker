// Network interceptor - injected into page context
(function() {
  const TRACKER_EVENT = "whatnot-sales-tracker-data";
  const POLL_INTERVAL = 15000; // Poll every 15 seconds for new sales

  let capturedHeaders = null;
  let capturedLiveId = null;
  let isLoadingAll = false;
  let hasLoadedInitial = false;
  let pollTimer = null;

  // Extract liveId from URL
  function getLiveIdFromUrl() {
    const match = window.location.pathname.match(/\/live\/([^\/]+)/);
    return match ? match[1] : null;
  }

  capturedLiveId = getLiveIdFromUrl();
  console.log('[Whatnot Sales Tracker] Live ID from URL:', capturedLiveId);

  // Intercept fetch to capture headers and responses
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url;

    // Capture headers from ANY GraphQL request (they all have Kasada headers)
    if (url && url.includes('graphql') && !capturedHeaders) {
      try {
        if (init?.headers) {
          capturedHeaders = {};
          if (init.headers instanceof Headers) {
            init.headers.forEach((value, key) => {
              capturedHeaders[key] = value;
            });
          } else if (typeof init.headers === 'object') {
            capturedHeaders = { ...init.headers };
          }
          console.log('[Whatnot Sales Tracker] Captured headers from GraphQL request');

          // Auto-start loading once we have headers
          if (!hasLoadedInitial && capturedLiveId) {
            setTimeout(() => {
              if (!hasLoadedInitial) {
                console.log('[Whatnot Sales Tracker] Auto-starting initial load');
                loadAllSales();
              }
            }, 1000);
          }
        }
      } catch (e) {
        console.log('[Whatnot Sales Tracker] Error capturing headers:', e);
      }
    }

    const response = await originalFetch.apply(this, args);

    // Intercept LiveShopSold responses (from Whatnot's own calls)
    if (url && url.includes('graphql') && url.includes('LiveShopSold')) {
      try {
        const clone = response.clone();
        clone.json().then(data => {
          window.dispatchEvent(new CustomEvent(TRACKER_EVENT, { detail: JSON.stringify(data) }));
        }).catch(() => {});
      } catch (e) {}
    }

    return response;
  };

  // Function to fetch all sales
  async function loadAllSales() {
    if (!capturedHeaders || !capturedLiveId) {
      console.log('[Whatnot Sales Tracker] Cannot load - no headers or liveId');
      return;
    }

    if (isLoadingAll) {
      console.log('[Whatnot Sales Tracker] Already loading');
      return;
    }

    isLoadingAll = true;
    console.log('[Whatnot Sales Tracker] Loading all sales...');

    let allEdges = [];
    let hasNextPage = true;
    let after = null;
    let pageCount = 0;

    const query = `query LiveShopSold($liveId:ID!$filters:[FilterInput]$sort:ShopSortInput$query:String$first:Int$after:String){liveShop(liveId:$liveId){soldItems(query:$query filters:$filters sort:$sort first:$first after:$after){totalCount pageInfo{hasNextPage endCursor __typename}edges{node{id listing{id title __typename}buyer{id username __typename}price{amount currency __typename}__typename}__typename}__typename}__typename}}`;

    while (hasNextPage) {
      try {
        pageCount++;

        const response = await originalFetch(
          "https://www.whatnot.com/services/graphql/?operationName=LiveShopSold&ssr=0",
          {
            method: "POST",
            headers: capturedHeaders,
            credentials: "include",
            body: JSON.stringify({
              operationName: "LiveShopSold",
              variables: {
                liveId: capturedLiveId,
                first: 50,
                after: after,
                filters: null,
                sort: null,
                query: "",
              },
              query: query,
            }),
          }
        );

        const data = await response.json();
        const soldItems = data?.data?.liveShop?.soldItems;
        const edges = soldItems?.edges || [];
        const pageInfo = soldItems?.pageInfo;

        console.log(`[Whatnot Sales Tracker] Page ${pageCount}: ${edges.length} items`);

        if (edges.length > 0) {
          allEdges = allEdges.concat(edges);
        }

        hasNextPage = pageInfo?.hasNextPage || false;
        after = pageInfo?.endCursor || null;

        // Small delay between requests to avoid rate limiting
        if (hasNextPage) {
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (error) {
        console.error('[Whatnot Sales Tracker] Error fetching page:', error);
        break;
      }
    }

    console.log(`[Whatnot Sales Tracker] Loaded ${allEdges.length} total items`);

    // Send all data to content script
    window.dispatchEvent(new CustomEvent(TRACKER_EVENT, {
      detail: JSON.stringify({
        data: {
          liveShop: {
            soldItems: {
              edges: allEdges,
              pageInfo: { hasNextPage: false },
              totalCount: allEdges.length
            }
          }
        },
        _isFullLoad: true
      })
    }));

    isLoadingAll = false;
    hasLoadedInitial = true;

    // Start polling for updates
    startPolling();
  }

  // Poll for new sales
  async function pollForUpdates() {
    if (!capturedHeaders || !capturedLiveId || isLoadingAll) return;

    try {
      const query = `query LiveShopSold($liveId:ID!$filters:[FilterInput]$sort:ShopSortInput$query:String$first:Int$after:String){liveShop(liveId:$liveId){soldItems(query:$query filters:$filters sort:$sort first:$first after:$after){totalCount pageInfo{hasNextPage endCursor __typename}edges{node{id listing{id title __typename}buyer{id username __typename}price{amount currency __typename}__typename}__typename}__typename}__typename}}`;

      const response = await originalFetch(
        "https://www.whatnot.com/services/graphql/?operationName=LiveShopSold&ssr=0",
        {
          method: "POST",
          headers: capturedHeaders,
          credentials: "include",
          body: JSON.stringify({
            operationName: "LiveShopSold",
            variables: {
              liveId: capturedLiveId,
              first: 50,
              after: null,
              filters: null,
              sort: null,
              query: "",
            },
            query: query,
          }),
        }
      );

      const data = await response.json();
      const edges = data?.data?.liveShop?.soldItems?.edges || [];

      if (edges.length > 0) {
        // Send to content script - it will handle deduplication
        window.dispatchEvent(new CustomEvent(TRACKER_EVENT, {
          detail: JSON.stringify(data)
        }));
      }
    } catch (error) {
      console.error('[Whatnot Sales Tracker] Poll error:', error);
    }
  }

  function startPolling() {
    if (pollTimer) return;
    console.log('[Whatnot Sales Tracker] Starting polling for new sales');
    pollTimer = setInterval(pollForUpdates, POLL_INTERVAL);
  }

  // Listen for manual load request
  window.addEventListener("whatnot-sales-tracker-load-all", function() {
    loadAllSales();
  });

  console.log('[Whatnot Sales Tracker] Network interceptor installed - waiting for headers...');
})();
