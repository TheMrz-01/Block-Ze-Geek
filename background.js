const BLOCKED_SITES = {
    youtube: [{ domain: "youtube.com", pathPrefix: "/shorts" }],
    instagram: [{ domain: "instagram.com" }],
    x: [{ domain: "x.com" }, { domain: "twitter.com" }],
    reddit: [{ domain: "reddit.com" }]
};

function parseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

function hostMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

function matchesSite(urlObject, site) {
    const rules = BLOCKED_SITES[site] || [];
    const hostname = urlObject.hostname.toLowerCase();
    const pathname = urlObject.pathname.toLowerCase();

    for (const rule of rules) {
        if (!hostMatches(hostname, rule.domain)) {
            continue;
        }

        if (rule.pathPrefix && !pathname.startsWith(rule.pathPrefix)) {
            continue;
        }

        return true;
    }

    return false;
}

function shouldBlockUrl(url, blocked) {
    const parsedUrl = parseUrl(url);
    if (!parsedUrl) return false;

    for (const site in BLOCKED_SITES) {
        if (!blocked[site]) continue;
        if (matchesSite(parsedUrl, site)) return true;
    }

    return false;
}

async function handleNavigation(details) {
    if (details.frameId !== 0) return;

    const data = await chrome.storage.local.get(["blocked", "unlockUntil"]);
    const blocked = data.blocked || {};
    const unlockUntil = data.unlockUntil || 0;

    const now = Date.now();

    if (now < unlockUntil) {
        return;
    }

    if (shouldBlockUrl(details.url, blocked)) {
        const redirectUrl = chrome.runtime.getURL(
            `focus/focus.html?target=${encodeURIComponent(details.url)}`
        );

        chrome.tabs.update(details.tabId, { url: redirectUrl });
        return;
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

            if (shouldBlockUrl(tab.url, blocked)) {
                chrome.tabs.reload(tab.id);
            }
        }
    }
}

setInterval(checkExpiration, 1000);
