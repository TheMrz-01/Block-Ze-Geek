const BLOCKED_SITES = {
  youtube: ["youtube.com/shorts"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  reddit: ["reddit.com"]
};

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const { blocked, allowedUrl } = await chrome.storage.local.get(["blocked", "allowedUrl"]);
  if (!blocked) return;

  const url = details.url;

  if (allowedUrl && url.includes(allowedUrl)) {
      await chrome.storage.local.remove("allowedUrl");
      return;
  }

  for (const site in BLOCKED_SITES) {
      if (!blocked[site]) continue;

      const patterns = BLOCKED_SITES[site];

      for (const pattern of patterns) {
          if (url.includes(pattern)) {

              if (url.includes("focus.html")) return;

              const redirectUrl = chrome.runtime.getURL(
                  `focus/focus.html?target=${encodeURIComponent(url)}`
              );

              chrome.tabs.update(details.tabId, { url: redirectUrl });
              return;
          }
      }
  }
});