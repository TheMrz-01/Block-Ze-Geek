const BLOCKED_SITES = {
    youtube: ["youtube.com/shorts"],
    instagram: ["instagram.com"],
    x: ["x.com", "twitter.com"],
    reddit: ["reddit.com"]
};

async function handleNavigation(details) {
    if (details.frameId !== 0) return;

    const data = await chrome.storage.local.get(["blocked", "allowedHost"]);
    const blocked = data.blocked || {};
    const allowedHost = data.allowedHost;

    const urlObj = new URL(details.url);
    const hostname = urlObj.hostname;

    if (allowedHost && hostname.includes(allowedHost)) {
        await chrome.storage.local.remove("allowedHost");
        return;
    }

    for (const site in BLOCKED_SITES) {
        if (!blocked[site]) continue;

        const patterns = BLOCKED_SITES[site];

        for (const pattern of patterns) {
            if (details.url.includes(pattern)) {

                if (details.url.includes("focus.html")) return;

                const redirectUrl = chrome.runtime.getURL(
                    `focus/focus.html?target=${encodeURIComponent(details.url)}`
                );

                chrome.tabs.update(details.tabId, { url: redirectUrl });
                return;
            }
        }
    }
}

chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation);

chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);