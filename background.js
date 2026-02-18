const BLOCKED_SITES = {
    youtube: ["youtube.com/shorts"],
    instagram: ["instagram.com"],
    x: ["x.com", "twitter.com"],
    reddit: ["reddit.com"]
};

async function handleNavigation(details) {
    if (details.frameId !== 0) return;

    const data = await chrome.storage.local.get(["blocked", "unlockUntil"]);
    const blocked = data.blocked || {};
    const unlockUntil = data.unlockUntil || 0;

    const now = Date.now();

    if (now < unlockUntil) {
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


async function checkExpiration() {
    const data = await chrome.storage.local.get(["unlockUntil", "blocked"]);
    const unlockUntil = data.unlockUntil || 0;
    const blocked = data.blocked || {};

    const now = Date.now();

    if (unlockUntil && now >= unlockUntil) {

        await chrome.storage.local.set({ unlockUntil: 0 });

        const tabs = await chrome.tabs.query({});

        for (const tab of tabs) {
            if (!tab.url) continue;

            for (const site in BLOCKED_SITES) {
                if (!blocked[site]) continue;

                const patterns = BLOCKED_SITES[site];

                for (const pattern of patterns) {
                    if (tab.url.includes(pattern)) {
                        chrome.tabs.reload(tab.id);
                    }
                }
            }
        }
    }
}

setInterval(checkExpiration, 1000);