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

const DEFAULT_UNLOCK_MS = 300000;
const DAILY_STATS_DATE_KEY = "dailyStatsDate";
const DAILY_SENTENCES_TYPED_KEY = "dailySentencesTypedCount";
const DAILY_WASTED_TIME_MS_KEY = "dailyWastedTimeMs";
const TOTAL_WASTED_TIME_MS_KEY = "totalWastedTimeMs";
const LEGACY_SENTENCES_TYPED_COUNT_KEY = "sentencesTypedCount";
const TYPING_STATS_RESET_VERSION_KEY = "typingStatsResetVersion";
const TYPING_STATS_RESET_VERSION = 1;

const params = new URLSearchParams(window.location.search);
const target = params.get("target");

const challengeElement = document.querySelector(".container #challenge");
const totalWastedTimeElement = document.querySelector(".container #totalWastedTime");
const dailyStatsElement = document.querySelector(".container #dailyStats");
const input = document.querySelector(".container #input");

const phrase = phrases[Math.floor(Math.random() * phrases.length)];
challengeElement.textContent = `"${phrase}"`;

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

function renderTypingStats(stats) {
    totalWastedTimeElement.textContent = `Total wasted time: ${formatWastedTime(stats.totalWastedTimeMs)}`;
    dailyStatsElement.textContent = `Today: ${stats.dailySentencesTyped} typed | ${formatWastedTime(stats.dailyWastedTimeMs)} wasted`;
}

void getTypingStats().then(renderTypingStats);

input.addEventListener("paste", e => e.preventDefault());
input.addEventListener("contextmenu", e => e.preventDefault());

input.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
        if (input.value.trim() === phrase.trim()) {
            const data = await chrome.storage.local.get([
                "unlockDurationMs",
                "unlockDurationEnabled"
            ]);
            const durationMs = data.unlockDurationMs ?? DEFAULT_UNLOCK_MS;
            const unlockDurationEnabled = data.unlockDurationEnabled ?? true;
            const stats = await incrementTypingStats(durationMs);

            renderTypingStats(stats);

            if (unlockDurationEnabled) {
                const unlockUntil = Date.now() + durationMs;
                await chrome.storage.local.set({ unlockUntil });
            } else {
                await chrome.storage.local.set({ unlockUntil: 0 });
            }

            window.location.href = target;

        } else {
            alert("Incorrect. Try again.");
        }
    }
});
