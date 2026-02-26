const BLOCKED_SITES = {
    youtube: [{ domain: "youtube.com", pathPrefix: "/shorts" }],
    instagram: [{ domain: "instagram.com" }],
    x: [{ domain: "x.com" }, { domain: "twitter.com" }],
    reddit: [{ domain: "reddit.com" }]
};

const DEFAULT_SLEEP_START_SECONDS = 23 * 3600;
const DEFAULT_SLEEP_END_SECONDS = 7 * 3600;

let wasSleepWindowActive = null;

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

function secondsSinceMidnight(now = new Date()) {
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function isInSleepWindow(nowMs, sleepStartSeconds, sleepEndSeconds) {
    if (sleepStartSeconds === sleepEndSeconds) {
        return false;
    }

    const nowSeconds = secondsSinceMidnight(new Date(nowMs));

    if (sleepStartSeconds < sleepEndSeconds) {
        return nowSeconds >= sleepStartSeconds && nowSeconds < sleepEndSeconds;
    }

    return nowSeconds >= sleepStartSeconds || nowSeconds < sleepEndSeconds;
}

function getSleepSettings(data) {
    const rawStart = Number(data.sleepStartSeconds);
    const rawEnd = Number(data.sleepEndSeconds);

    const sleepStartSeconds = Number.isFinite(rawStart)
        ? rawStart
        : DEFAULT_SLEEP_START_SECONDS;

    const sleepEndSeconds = Number.isFinite(rawEnd)
        ? rawEnd
        : DEFAULT_SLEEP_END_SECONDS;

    return { sleepStartSeconds, sleepEndSeconds };
}

function getFeatureFlags(data) {
    const unlockDurationEnabled = data.unlockDurationEnabled ?? true;
    const eepyTimeEnabled = data.eepyTimeEnabled ?? true;

    return { unlockDurationEnabled, eepyTimeEnabled };
}

async function releaseGuardPageTabs(pagePath) {
    const tabs = await chrome.tabs.query({});
    const pageUrl = chrome.runtime.getURL(pagePath);

    for (const tab of tabs) {
        if (!tab.url || tab.id === undefined) continue;
        if (!tab.url.startsWith(pageUrl)) continue;

        const parsedUrl = parseUrl(tab.url);
        const target = parsedUrl?.searchParams.get("target");
        if (!target) continue;

        chrome.tabs.update(tab.id, { url: target });
    }
}

async function handleNavigation(details) {
    if (details.frameId !== 0) return;

    const data = await chrome.storage.local.get([
        "blocked",
        "unlockUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeEnabled"
    ]);

    const blocked = data.blocked || {};
    const unlockUntil = data.unlockUntil || 0;
    const { sleepStartSeconds, sleepEndSeconds } = getSleepSettings(data);
    const { unlockDurationEnabled, eepyTimeEnabled } = getFeatureFlags(data);

    const now = Date.now();

    if (!shouldBlockUrl(details.url, blocked)) {
        return;
    }

    if (eepyTimeEnabled && isInSleepWindow(now, sleepStartSeconds, sleepEndSeconds)) {
        const sleepBlockUrl = chrome.runtime.getURL(
            `sleep/sleep.html?target=${encodeURIComponent(details.url)}`
        );

        chrome.tabs.update(details.tabId, { url: sleepBlockUrl });
        return;
    }

    if (!unlockDurationEnabled) {
        return;
    }

    if (now < unlockUntil) {
        return;
    }

    const redirectUrl = chrome.runtime.getURL(
        `focus/focus.html?target=${encodeURIComponent(details.url)}`
    );

    chrome.tabs.update(details.tabId, { url: redirectUrl });
    return;
}

chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);


async function checkExpiration() {
    const data = await chrome.storage.local.get([
        "unlockUntil",
        "blocked",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeEnabled"
    ]);

    const unlockUntil = data.unlockUntil || 0;
    const blocked = data.blocked || {};
    const { sleepStartSeconds, sleepEndSeconds } = getSleepSettings(data);
    const { unlockDurationEnabled, eepyTimeEnabled } = getFeatureFlags(data);

    const now = Date.now();
    const previousSleepWindowActive = wasSleepWindowActive;
    const sleepWindowActive = eepyTimeEnabled && isInSleepWindow(now, sleepStartSeconds, sleepEndSeconds);
    const sleepWindowJustStarted = previousSleepWindowActive === false && sleepWindowActive;
    const firstRunInSleepWindow = previousSleepWindowActive === null && sleepWindowActive;
    const sleepWindowEnded = previousSleepWindowActive === true && !sleepWindowActive;
    wasSleepWindowActive = sleepWindowActive;

    const unlockExpired = unlockDurationEnabled && unlockUntil && now >= unlockUntil;

    if (!unlockExpired && !sleepWindowJustStarted && !firstRunInSleepWindow && !sleepWindowEnded) {
        if (!unlockDurationEnabled && unlockUntil) {
            await chrome.storage.local.set({ unlockUntil: 0 });
        }
        return;
    }

    if (unlockExpired) {
        await chrome.storage.local.set({ unlockUntil: 0 });
    }

    const tabs = await chrome.tabs.query({});
    const sleepPageUrl = chrome.runtime.getURL("sleep/sleep.html");

    for (const tab of tabs) {
        if (!tab.url || tab.id === undefined) continue;

        const redirectUrl = chrome.runtime.getURL(
            `sleep/sleep.html?target=${encodeURIComponent(tab.url)}`
        );

        if (sleepWindowActive && shouldBlockUrl(tab.url, blocked)) {
            chrome.tabs.update(tab.id, { url: redirectUrl });
            continue;
        }

        if (sleepWindowEnded && tab.url.startsWith(sleepPageUrl)) {
            const parsedSleepTabUrl = parseUrl(tab.url);
            const target = parsedSleepTabUrl?.searchParams.get("target");

            if (target) {
                chrome.tabs.update(tab.id, { url: target });
                continue;
            }
        }

        if (unlockExpired && shouldBlockUrl(tab.url, blocked)) {
            chrome.tabs.reload(tab.id);
        }
    }
}

setInterval(checkExpiration, 1000);

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.eepyTimeEnabled && changes.eepyTimeEnabled.newValue === false) {
        void releaseGuardPageTabs("sleep/sleep.html");
    }

    if (changes.unlockDurationEnabled && changes.unlockDurationEnabled.newValue === false) {
        void releaseGuardPageTabs("focus/focus.html");
    }
});
