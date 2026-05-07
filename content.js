const OVERLAY_ID = "bzg-overlay-root";
const DEFAULT_UNLOCK_MS = 300000;
const DAILY_STATS_DATE_KEY = "dailyStatsDate";
const DAILY_SENTENCES_TYPED_KEY = "dailySentencesTypedCount";
const DAILY_WASTED_TIME_MS_KEY = "dailyWastedTimeMs";
const TOTAL_WASTED_TIME_MS_KEY = "totalWastedTimeMs";
const LEGACY_SENTENCES_TYPED_COUNT_KEY = "sentencesTypedCount";
const TYPING_STATS_RESET_VERSION_KEY = "typingStatsResetVersion";
const TYPING_STATS_RESET_VERSION = 1;

const phrases = [
    " yes i want to waste my time ",
    " i choose distraction over progress ",
    " i am avoiding meaningful work ",
    " i accept that this does not help my goals ",
    " this is not aligned with my future self ",
    " i am trading discipline for a quick dopamine hit ",
    " i know this is easy now and expensive later ",
    " i am letting impulse decide my direction ",
    " i am choosing comfort instead of momentum ",
    " i am delaying the life i say i want "
];

let overlayRequired = false;
let currentPhrase = "";
let blockerObserver = null;
let pageFrozen = false;

const scrollLockState = {
    scrollY: 0,
    htmlOverflow: "",
    bodyOverflow: "",
    bodyPosition: "",
    bodyTop: "",
    bodyLeft: "",
    bodyRight: "",
    bodyWidth: ""
};

const scrollKeys = new Set([
    " ",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End"
]);

function isTextEntryTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;

    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA";
}

function preventWheelScroll(event) {
    if (!overlayRequired) return;
    event.preventDefault();
}

function preventTouchScroll(event) {
    if (!overlayRequired) return;
    event.preventDefault();
}

function preventKeyboardScroll(event) {
    if (!overlayRequired) return;
    if (isTextEntryTarget(event.target)) return;
    if (!scrollKeys.has(event.key)) return;

    event.preventDefault();
}

function addScrollLockListeners() {
    window.addEventListener("wheel", preventWheelScroll, { passive: false, capture: true });
    window.addEventListener("touchmove", preventTouchScroll, { passive: false, capture: true });
    window.addEventListener("keydown", preventKeyboardScroll, { passive: false, capture: true });
}

function removeScrollLockListeners() {
    window.removeEventListener("wheel", preventWheelScroll, true);
    window.removeEventListener("touchmove", preventTouchScroll, true);
    window.removeEventListener("keydown", preventKeyboardScroll, true);
}

function freezePage() {
    if (pageFrozen) return;

    const html = document.documentElement;
    const body = document.body;

    scrollLockState.scrollY = window.scrollY || 0;
    scrollLockState.htmlOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    if (body) {
        scrollLockState.bodyOverflow = body.style.overflow;
        scrollLockState.bodyPosition = body.style.position;
        scrollLockState.bodyTop = body.style.top;
        scrollLockState.bodyLeft = body.style.left;
        scrollLockState.bodyRight = body.style.right;
        scrollLockState.bodyWidth = body.style.width;

        body.style.overflow = "hidden";
        body.style.position = "fixed";
        body.style.top = `-${scrollLockState.scrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
    }

    addScrollLockListeners();
    pageFrozen = true;
}

function unfreezePage() {
    if (!pageFrozen) return;

    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = scrollLockState.htmlOverflow;

    if (body) {
        body.style.overflow = scrollLockState.bodyOverflow;
        body.style.position = scrollLockState.bodyPosition;
        body.style.top = scrollLockState.bodyTop;
        body.style.left = scrollLockState.bodyLeft;
        body.style.right = scrollLockState.bodyRight;
        body.style.width = scrollLockState.bodyWidth;
    }

    removeScrollLockListeners();
    window.scrollTo(0, scrollLockState.scrollY);
    pageFrozen = false;
}

function randomPhrase() {
    return phrases[Math.floor(Math.random() * phrases.length)];
}

function getRootNode() {
    return document.documentElement || document.body;
}

function removeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
        overlay.remove();
    }

    if (!overlayRequired) {
        unfreezePage();
    }
}

function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatWastedTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function normalizeTypingStats(data) {
    const todayKey = getTodayKey();
    const needsDailyReset = data[DAILY_STATS_DATE_KEY] !== todayKey;

    return {
        dailyStatsDate: todayKey,
        dailySentencesTyped: needsDailyReset ? 0 : Number(data[DAILY_SENTENCES_TYPED_KEY]) || 0,
        dailyWastedTimeMs: needsDailyReset ? 0 : Number(data[DAILY_WASTED_TIME_MS_KEY]) || 0,
        totalWastedTimeMs: Number(data[TOTAL_WASTED_TIME_MS_KEY]) || 0,
        needsDailyReset
    };
}

async function ensureTypingStatsReset() {
    const data = await chrome.storage.local.get([TYPING_STATS_RESET_VERSION_KEY]);
    if (data[TYPING_STATS_RESET_VERSION_KEY] === TYPING_STATS_RESET_VERSION) return;

    await chrome.storage.local.set({
        [DAILY_STATS_DATE_KEY]: getTodayKey(),
        [DAILY_SENTENCES_TYPED_KEY]: 0,
        [DAILY_WASTED_TIME_MS_KEY]: 0,
        [TOTAL_WASTED_TIME_MS_KEY]: 0,
        [LEGACY_SENTENCES_TYPED_COUNT_KEY]: 0,
        [TYPING_STATS_RESET_VERSION_KEY]: TYPING_STATS_RESET_VERSION
    });
}

async function getTypingStats() {
    await ensureTypingStatsReset();

    const data = await chrome.storage.local.get([
        DAILY_STATS_DATE_KEY,
        DAILY_SENTENCES_TYPED_KEY,
        DAILY_WASTED_TIME_MS_KEY,
        TOTAL_WASTED_TIME_MS_KEY
    ]);
    const stats = normalizeTypingStats(data);

    if (stats.needsDailyReset) {
        await chrome.storage.local.set({
            [DAILY_STATS_DATE_KEY]: stats.dailyStatsDate,
            [DAILY_SENTENCES_TYPED_KEY]: 0,
            [DAILY_WASTED_TIME_MS_KEY]: 0
        });
    }

    return stats;
}

async function incrementTypingStats(wastedTimeMs) {
    const stats = await getTypingStats();
    const nextStats = {
        dailyStatsDate: stats.dailyStatsDate,
        dailySentencesTyped: stats.dailySentencesTyped + 1,
        dailyWastedTimeMs: stats.dailyWastedTimeMs + wastedTimeMs,
        totalWastedTimeMs: stats.totalWastedTimeMs + wastedTimeMs
    };

    await chrome.storage.local.set({
        [DAILY_STATS_DATE_KEY]: nextStats.dailyStatsDate,
        [DAILY_SENTENCES_TYPED_KEY]: nextStats.dailySentencesTyped,
        [DAILY_WASTED_TIME_MS_KEY]: nextStats.dailyWastedTimeMs,
        [TOTAL_WASTED_TIME_MS_KEY]: nextStats.totalWastedTimeMs
    });

    return nextStats;
}

function renderTypingStats(totalLine, dailyLine, stats) {
    totalLine.textContent = `Total wasted time: ${formatWastedTime(stats.totalWastedTimeMs)}`;
    dailyLine.textContent = `Today: ${stats.dailySentencesTyped} typed | ${formatWastedTime(stats.dailyWastedTimeMs)} wasted`;
}

async function unlockAndClose(durationMs, unlockDurationEnabled) {
    if (unlockDurationEnabled) {
        await chrome.storage.local.set({ unlockUntil: Date.now() + durationMs });
    } else {
        await chrome.storage.local.set({ unlockUntil: 0 });
    }

    overlayRequired = false;
    removeOverlay();
}

function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("style", [
        "position: fixed",
        "inset: 0",
        "z-index: 2147483647",
        "display: flex",
        "align-items: center",
        "justify-content: center",
        "background: rgba(10, 10, 10, 0.88)",
        "padding: 16px",
        "box-sizing: border-box"
    ].join(";"));

    const card = document.createElement("div");
    card.setAttribute("style", [
        "max-width: 720px",
        "width: 100%",
        "padding: 28px",
        "border-radius: 12px",
        "background: #161616",
        "color: #f0f0f0",
        "box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35)",
        "font-family: Arial, sans-serif",
        "text-align: center"
    ].join(";"));

    const title = document.createElement("h2");
    title.textContent = "Pause. Think.";
    title.setAttribute("style", "margin: 0 0 10px; font-size: 28px;");

    const hint = document.createElement("p");
    hint.textContent = "Type the sentence exactly to continue.";
    hint.setAttribute("style", "margin: 0 0 16px; color: #c8c8c8; font-size: 14px;");

    const phraseBox = document.createElement("p");
    phraseBox.textContent = `\"${currentPhrase}\"`;
    phraseBox.setAttribute("style", [
        "margin: 0 0 16px",
        "padding: 10px",
        "border-radius: 8px",
        "background: #222",
        "font-size: 15px"
    ].join(";"));

    const statsBox = document.createElement("div");
    statsBox.setAttribute("style", [
        "margin: 0 0 16px",
        "color: #a8a8a8",
        "font-size: 13px",
        "line-height: 1.5"
    ].join(";"));

    const totalWastedTime = document.createElement("p");
    totalWastedTime.textContent = "Total wasted time: 0s";
    totalWastedTime.setAttribute("style", "margin: 0;");

    const dailyStats = document.createElement("p");
    dailyStats.textContent = "Today: 0 typed | 0s wasted";
    dailyStats.setAttribute("style", "margin: 0;");

    statsBox.appendChild(totalWastedTime);
    statsBox.appendChild(dailyStats);

    void getTypingStats().then((stats) => {
        if (!statsBox.isConnected) return;
        renderTypingStats(totalWastedTime, dailyStats, stats);
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type the sentence exactly";
    input.autocomplete = "off";
    input.setAttribute("style", [
        "width: 100%",
        "max-width: 540px",
        "padding: 10px 12px",
        "border-radius: 8px",
        "border: 1px solid #444",
        "background: #111",
        "color: #fff",
        "font-size: 14px",
        "box-sizing: border-box"
    ].join(";"));

    input.addEventListener("paste", (event) => event.preventDefault());
    input.addEventListener("contextmenu", (event) => event.preventDefault());
    input.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") return;

        if (input.value.trim() === currentPhrase.trim()) {
            const data = await chrome.storage.local.get([
                "unlockDurationMs",
                "unlockDurationEnabled"
            ]);
            const durationMs = data.unlockDurationMs ?? DEFAULT_UNLOCK_MS;
            const unlockDurationEnabled = data.unlockDurationEnabled ?? true;
            const stats = await incrementTypingStats(durationMs);

            renderTypingStats(totalWastedTime, dailyStats, stats);
            await unlockAndClose(durationMs, unlockDurationEnabled);
            return;
        }

        alert("Incorrect. Try again.");
    });

    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(phraseBox);
    card.appendChild(statsBox);
    card.appendChild(input);
    overlay.appendChild(card);

    return { overlay, input };
}

function mountOverlay() {
    removeOverlay();

    currentPhrase = randomPhrase();
    const rootNode = getRootNode();
    if (!rootNode) return false;

    const { overlay, input } = buildOverlay();
    rootNode.appendChild(overlay);
    freezePage();
    input.focus();

    return true;
}

function ensureObserver() {
    if (blockerObserver) return;

    const rootNode = getRootNode();
    if (!rootNode) return;

    blockerObserver = new MutationObserver(() => {
        if (!overlayRequired) return;

        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return;

        const mounted = mountOverlay();
        if (!mounted) return;

        chrome.runtime.sendMessage({ type: "BZG_OVERLAY_TAMPERED" }).catch(() => {});
    });

    blockerObserver.observe(rootNode, {
        childList: true,
        subtree: true
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === "BZG_SHOW_BLOCKER") {
        overlayRequired = true;
        ensureObserver();

        const mounted = mountOverlay();
        sendResponse({ ok: mounted, present: mounted });
        return;
    }

    if (message.type === "BZG_HIDE_BLOCKER") {
        overlayRequired = false;
        removeOverlay();
        sendResponse({ ok: true, present: false });
        return;
    }

    if (message.type === "BZG_VERIFY_BLOCKER") {
        sendResponse({
            ok: true,
            present: Boolean(document.getElementById(OVERLAY_ID))
        });
    }
});
