document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = new URL(tab?.url || "");
    const isRunning =
      url.hostname.endsWith("whatnot.com") && url.pathname.includes("/live/");

    const title = document.getElementById("title");
    const desc = document.getElementById("desc");
    const dot = document.getElementById("dot");

    if (isRunning) {
      title.textContent = "Whatnot Sales Tracker is currently running";
      desc.textContent =
        "This stream is being tracked and totals are shown on-page.";
      dot.classList.remove("off");
      dot.classList.add("on");
    } else {
      title.textContent = "Whatnot Sales Tracker is not currently running";
      desc.textContent =
        "Open a Whatnot livestream page to start tracking automatically.";
      dot.classList.remove("on");
      dot.classList.add("off");
    }
  } catch (e) {
    const title = document.getElementById("title");
    const desc = document.getElementById("desc");
    if (title) title.textContent = "Unable to read current tab";
    if (desc)
      desc.textContent =
        "Please make sure the popup has access to the active tab.";
  }
});
