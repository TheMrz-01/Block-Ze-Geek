const BLOCKED_SITES = {
    youtube: [{ domain: "youtube.com", pathPrefix: "/shorts" }],
    instagram: [{ domain: "instagram.com" }],
    x: [{ domain: "x.com" }, { domain: "twitter.com" }],
    reddit: [{ domain: "reddit.com" }]
};

const DEFAULT_SLEEP_START_SECONDS = 23 * 3600;
const DEFAULT_SLEEP_END_SECONDS = 7 * 3600;
const OVERLAY_VERIFY_INTERVAL_MS = 3000;
const AUTO_REENABLE_MS = 60 * 60 * 1000;
const TEMPORARY_DISABLE_WATCHDOG_ALARM = "bzg-temporary-disable-watchdog";
const AUTO_REENABLE_ALARMS = {
    unlockDurationEnabled: "bzg-reenable-unlock-duration",
    eepyTimeEnabled: "bzg-reenable-eepy-time"
};

let wasSleepWindowActive = null;

function getTemporaryDisableConfig(featureKey) {
    if (featureKey === "unlockDurationEnabled") {
        return {
            enabledKey: "unlockDurationEnabled",
            disabledUntilKey: "unlockDurationDisabledUntil",
            alarmName: AUTO_REENABLE_ALARMS.unlockDurationEnabled
        };
    }

    if (featureKey === "eepyTimeEnabled") {
        return {
            enabledKey: "eepyTimeEnabled",
            disabledUntilKey: "eepyTimeDisabledUntil",
            alarmName: AUTO_REENABLE_ALARMS.eepyTimeEnabled
        };
    }

    return null;
}

async function syncTemporaryDisableAlarm(featureKey, data) {
    const config = getTemporaryDisableConfig(featureKey);
    if (!config) return;

    const isEnabled = data[config.enabledKey] ?? true;
    const disabledUntil = Number(data[config.disabledUntilKey]) || 0;

    if (!isEnabled && disabledUntil > Date.now()) {
        await chrome.alarms.create(config.alarmName, { when: disabledUntil });
        return;
    }

    await chrome.alarms.clear(config.alarmName);
}

async function syncAllTemporaryDisableAlarms(data) {
    await syncTemporaryDisableAlarm("unlockDurationEnabled", data);
    await syncTemporaryDisableAlarm("eepyTimeEnabled", data);
}

async function normalizeTemporaryDisableStates(data) {
    const normalized = { ...data };
    const updates = {};
    const now = Date.now();

    if (!(normalized.unlockDurationEnabled ?? true)) {
        const unlockDurationDisabledUntil = Number(normalized.unlockDurationDisabledUntil) || 0;

        if (!unlockDurationDisabledUntil) {
            normalized.unlockDurationDisabledUntil = now + AUTO_REENABLE_MS;
            updates.unlockDurationDisabledUntil = normalized.unlockDurationDisabledUntil;
        }

        if (unlockDurationDisabledUntil && now >= unlockDurationDisabledUntil) {
            normalized.unlockDurationEnabled = true;
            normalized.unlockDurationDisabledUntil = 0;
            normalized.unlockUntil = 0;
            updates.unlockDurationEnabled = true;
            updates.unlockDurationDisabledUntil = 0;
            updates.unlockUntil = 0;
        }
    }

    if (!(normalized.eepyTimeEnabled ?? true)) {
        const eepyTimeDisabledUntil = Number(normalized.eepyTimeDisabledUntil) || 0;

        if (!eepyTimeDisabledUntil) {
            normalized.eepyTimeDisabledUntil = now + AUTO_REENABLE_MS;
            updates.eepyTimeDisabledUntil = normalized.eepyTimeDisabledUntil;
        }

        if (eepyTimeDisabledUntil && now >= eepyTimeDisabledUntil) {
            normalized.eepyTimeEnabled = true;
            normalized.eepyTimeDisabledUntil = 0;
            updates.eepyTimeEnabled = true;
            updates.eepyTimeDisabledUntil = 0;
        }
    }

    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }

    await syncAllTemporaryDisableAlarms(normalized);
    return normalized;
}

async function initializeTemporaryDisableState() {
    const data = await chrome.storage.local.get([
        "unlockDurationEnabled",
        "unlockDurationDisabledUntil",
        "unlockUntil",
        "eepyTimeEnabled",
        "eepyTimeDisabledUntil"
    ]);

    await chrome.alarms.create(TEMPORARY_DISABLE_WATCHDOG_ALARM, { periodInMinutes: 1 });
    await normalizeTemporaryDisableStates(data);
}

async function reconcileTemporaryDisableState() {
    const data = await chrome.storage.local.get([
        "unlockDurationEnabled",
        "unlockDurationDisabledUntil",
        "unlockUntil",
        "eepyTimeEnabled",
        "eepyTimeDisabledUntil"
    ]);

    return normalizeTemporaryDisableStates(data);
}

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

    const storedData = await chrome.storage.local.get([
        "blocked",
        "unlockUntil",
        "unlockDurationDisabledUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeDisabledUntil",
        "eepyTimeEnabled"
    ]);
    const data = await normalizeTemporaryDisableStates(storedData);

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
    const storedData = await chrome.storage.local.get([
        "unlockUntil",
        "blocked",
        "unlockDurationDisabledUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeDisabledUntil",
        "eepyTimeEnabled"
    ]);
    const data = await normalizeTemporaryDisableStates(storedData);

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
    const storedData = await chrome.storage.local.get([
        "unlockUntil",
        "blocked",
        "unlockDurationDisabledUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeDisabledUntil",
        "eepyTimeEnabled"
    ]);
    const data = await normalizeTemporaryDisableStates(storedData);

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

    const storedData = await chrome.storage.local.get([
        "blocked",
        "unlockUntil",
        "unlockDurationDisabledUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeDisabledUntil",
        "eepyTimeEnabled"
    ]);
    const data = await normalizeTemporaryDisableStates(storedData);

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

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TEMPORARY_DISABLE_WATCHDOG_ALARM) {
        void reconcileTemporaryDisableState();
        return;
    }

    if (alarm.name === AUTO_REENABLE_ALARMS.unlockDurationEnabled) {
        void chrome.storage.local.set({
            unlockDurationEnabled: true,
            unlockDurationDisabledUntil: 0,
            unlockUntil: 0
        });
        return;
    }

    if (alarm.name === AUTO_REENABLE_ALARMS.eepyTimeEnabled) {
        void chrome.storage.local.set({
            eepyTimeEnabled: true,
            eepyTimeDisabledUntil: 0
        });
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (
        changes.unlockDurationEnabled ||
        changes.unlockDurationDisabledUntil ||
        changes.eepyTimeEnabled ||
        changes.eepyTimeDisabledUntil
    ) {
        void (async () => {
            const data = await chrome.storage.local.get([
                "unlockDurationEnabled",
                "unlockDurationDisabledUntil",
                "eepyTimeEnabled",
                "eepyTimeDisabledUntil"
            ]);
            await syncAllTemporaryDisableAlarms(data);
        })();
    }

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

chrome.runtime.onStartup.addListener(() => {
    void initializeTemporaryDisableState();
});

chrome.runtime.onInstalled.addListener(() => {
    void initializeTemporaryDisableState();
});

void initializeTemporaryDisableState();

setInterval(() => {
    void checkExpiration();
}, 1000);

setInterval(() => {
    void verifyInjectedBlockers();
}, OVERLAY_VERIFY_INTERVAL_MS);
