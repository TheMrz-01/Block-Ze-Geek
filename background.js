const BLOCKED_SITES = {
    youtube: [{ domain: "youtube.com", pathPrefix: "/shorts" }],
    instagram: [{ domain: "instagram.com" }],
    x: [{ domain: "x.com" }, { domain: "twitter.com" }],
    reddit: [{ domain: "reddit.com" }]
};

const DEFAULT_SLEEP_START_SECONDS = 23 * 3600;
const DEFAULT_SLEEP_END_SECONDS = 7 * 3600;
const OVERLAY_VERIFY_INTERVAL_MS = 3000;

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

function buildFocusUrl(targetUrl) {
    return chrome.runtime.getURL(
        `focus/focus.html?target=${encodeURIComponent(targetUrl)}`
    );
}

function buildSleepUrl(targetUrl) {
    return chrome.runtime.getURL(
        `sleep/sleep.html?target=${encodeURIComponent(targetUrl)}`
    );
}

async function sendMessageToTab(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch {
        return null;
    }
}

async function showInjectedBlocker(tabId, targetUrl) {
    const response = await sendMessageToTab(tabId, {
        type: "BZG_SHOW_BLOCKER",
        targetUrl
    });

    return response?.ok === true;
}

async function hideInjectedBlocker(tabId) {
    await sendMessageToTab(tabId, { type: "BZG_HIDE_BLOCKER" });
}

async function hardRedirectToFocus(tabId, targetUrl) {
    await chrome.tabs.update(tabId, { url: buildFocusUrl(targetUrl) });
}

async function hardRedirectToSleep(tabId, targetUrl) {
    await chrome.tabs.update(tabId, { url: buildSleepUrl(targetUrl) });
}

async function enforceFocusBlock(tabId, targetUrl) {
    const shown = await showInjectedBlocker(tabId, targetUrl);
    if (shown) return;

    await hardRedirectToFocus(tabId, targetUrl);
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

async function hideInjectedBlockersOnAllTabs() {
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
        if (tab.id === undefined) continue;
        await hideInjectedBlocker(tab.id);
    }
}

async function handleNavigation(details, options = { allowOverlay: false }) {
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

    const tabId = details.tabId;
    if (tabId === undefined || tabId < 0) return;

    const isBlockedTarget = shouldBlockUrl(details.url, blocked);
    if (!isBlockedTarget) {
        if (options.allowOverlay) {
            await hideInjectedBlocker(tabId);
        }
        return;
    }

    const now = Date.now();
    const sleepWindowActive = eepyTimeEnabled && isInSleepWindow(now, sleepStartSeconds, sleepEndSeconds);

    if (sleepWindowActive) {
        await hardRedirectToSleep(tabId, details.url);
        return;
    }

    if (!unlockDurationEnabled) {
        await hideInjectedBlocker(tabId);
        return;
    }

    if (now < unlockUntil) {
        await hideInjectedBlocker(tabId);
        return;
    }

    if (!options.allowOverlay) {
        return;
    }

    await enforceFocusBlock(tabId, details.url);
}

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

    if (!unlockDurationEnabled && unlockUntil) {
        await chrome.storage.local.set({ unlockUntil: 0 });
    }

    if (!unlockExpired && !sleepWindowJustStarted && !firstRunInSleepWindow && !sleepWindowEnded) {
        return;
    }

    if (unlockExpired) {
        await chrome.storage.local.set({ unlockUntil: 0 });
    }

    const tabs = await chrome.tabs.query({});
    const sleepPageUrl = chrome.runtime.getURL("sleep/sleep.html");

    for (const tab of tabs) {
        if (!tab.url || tab.id === undefined) continue;

        if (sleepWindowActive && shouldBlockUrl(tab.url, blocked)) {
            await hardRedirectToSleep(tab.id, tab.url);
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
            await enforceFocusBlock(tab.id, tab.url);
        }
    }
}

async function verifyInjectedBlockers() {
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

    if (!unlockDurationEnabled) {
        return;
    }

    const now = Date.now();
    const sleepWindowActive = eepyTimeEnabled && isInSleepWindow(now, sleepStartSeconds, sleepEndSeconds);
    if (sleepWindowActive) {
        return;
    }

    if (now < unlockUntil) {
        return;
    }

    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
        if (!tab.url || tab.id === undefined) continue;
        if (!shouldBlockUrl(tab.url, blocked)) continue;

        const response = await sendMessageToTab(tab.id, { type: "BZG_VERIFY_BLOCKER" });
        if (response?.present) continue;

        await enforceFocusBlock(tab.id, tab.url);
    }
}

async function handleOverlayTampered(tabId) {
    if (tabId === undefined || tabId < 0) return;

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.url) return;

    const data = await chrome.storage.local.get([
        "blocked",
        "unlockUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeEnabled"
    ]);

    const blocked = data.blocked || {};
    if (!shouldBlockUrl(tab.url, blocked)) return;

    const { sleepStartSeconds, sleepEndSeconds } = getSleepSettings(data);
    const { unlockDurationEnabled, eepyTimeEnabled } = getFeatureFlags(data);
    const unlockUntil = data.unlockUntil || 0;

    const now = Date.now();

    if (eepyTimeEnabled && isInSleepWindow(now, sleepStartSeconds, sleepEndSeconds)) {
        await hardRedirectToSleep(tabId, tab.url);
        return;
    }

    if (!unlockDurationEnabled) {
        return;
    }

    if (now < unlockUntil) {
        return;
    }

    await hardRedirectToFocus(tabId, tab.url);
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    void handleNavigation(details, { allowOverlay: false });
});

chrome.webNavigation.onCompleted.addListener((details) => {
    void handleNavigation(details, { allowOverlay: true });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    void handleNavigation(details, { allowOverlay: true });
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message || !message.type) return;

    if (message.type === "BZG_OVERLAY_TAMPERED") {
        void handleOverlayTampered(sender.tab?.id);
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes.eepyTimeEnabled && changes.eepyTimeEnabled.newValue === false) {
        void releaseGuardPageTabs("sleep/sleep.html");
    }

    if (changes.eepyTimeEnabled && changes.eepyTimeEnabled.newValue === true) {
        void checkExpiration();
    }

    if (changes.unlockDurationEnabled && changes.unlockDurationEnabled.newValue === false) {
        void chrome.storage.local.set({ unlockUntil: 0 });
        void releaseGuardPageTabs("focus/focus.html");
        void hideInjectedBlockersOnAllTabs();
    }

    if (changes.unlockDurationEnabled && changes.unlockDurationEnabled.newValue === true) {
        void verifyInjectedBlockers();
    }
});

setInterval(() => {
    void checkExpiration();
}, 1000);

setInterval(() => {
    void verifyInjectedBlockers();
}, OVERLAY_VERIFY_INTERVAL_MS);
