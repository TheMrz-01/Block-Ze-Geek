const sites = ["youtube", "instagram", "x", "reddit"];

const DEFAULT_UNLOCK_MS = 300000;
const DEFAULT_SLEEP_START_SECONDS = 23 * 3600;
const DEFAULT_SLEEP_END_SECONDS = 7 * 3600;

document.addEventListener("DOMContentLoaded", async () => {
    const data = await chrome.storage.local.get([
        "blocked",
        "unlockDurationMs",
        "unlockUntil",
        "sleepStartSeconds",
        "sleepEndSeconds",
        "unlockDurationEnabled",
        "eepyTimeEnabled"
    ]);

    let blocked = data.blocked;
    let unlockDurationMs = data.unlockDurationMs ?? DEFAULT_UNLOCK_MS;
    let unlockUntil = data.unlockUntil ?? 0;
    let sleepStartSeconds = data.sleepStartSeconds ?? DEFAULT_SLEEP_START_SECONDS;
    let sleepEndSeconds = data.sleepEndSeconds ?? DEFAULT_SLEEP_END_SECONDS;
    let unlockDurationEnabled = data.unlockDurationEnabled ?? true;
    let eepyTimeEnabled = data.eepyTimeEnabled ?? true;

    if (!blocked) {
        blocked = {
            youtube: false,
            instagram: false,
            x: false,
            reddit: false
        };
        await chrome.storage.local.set({ blocked });
    }

    sites.forEach((site) => {
        const checkbox = document.getElementById(site);
        checkbox.checked = blocked[site];

        checkbox.addEventListener("change", async () => {
            blocked[site] = checkbox.checked;
            await chrome.storage.local.set({ blocked });
        });
    });

    function formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function parseDurationToMs(text) {
        const parts = text.split(":");
        if (parts.length !== 2) return null;

        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);

        if (isNaN(minutes) || isNaN(seconds)) return null;
        if (seconds < 0 || seconds >= 60) return null;

        return (minutes * 60 + seconds) * 1000;
    }

    function formatClockTime(totalSeconds) {
        const normalized = ((totalSeconds % 86400) + 86400) % 86400;
        const hours = Math.floor(normalized / 3600);
        const minutes = Math.floor((normalized % 3600) / 60);

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    function parseClockTimeToSeconds(text) {
        const parts = text.split(":");
        if (parts.length !== 2) return null;

        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);

        if (isNaN(hours) || isNaN(minutes)) return null;
        if (hours < 0 || hours > 23) return null;
        if (minutes < 0 || minutes > 59) return null;

        return hours * 3600 + minutes * 60;
    }

    function setupClockControl(config) {
        const {
            slider,
            timeText,
            button,
            storageKey,
            getValue,
            setValue,
            isEnabled
        } = config;

        slider.value = String(getValue());
        timeText.textContent = formatClockTime(getValue());

        slider.addEventListener("input", () => {
            if (!isEnabled()) return;

            const seconds = Number(slider.value);
            setValue(seconds);
            timeText.textContent = formatClockTime(seconds);
        });

        timeText.addEventListener("click", () => {
            if (!isEnabled()) return;

            timeText.contentEditable = true;
            timeText.focus();
        });

        timeText.addEventListener("blur", async () => {
            timeText.contentEditable = false;

            if (!isEnabled()) {
                timeText.textContent = formatClockTime(getValue());
                return;
            }

            const parsedSeconds = parseClockTimeToSeconds(timeText.textContent.trim());

            if (parsedSeconds !== null) {
                const minSeconds = Number(slider.min);
                const maxSeconds = Number(slider.max);
                const clamped = Math.min(Math.max(parsedSeconds, minSeconds), maxSeconds);

                setValue(clamped);
                slider.value = String(clamped);
                timeText.textContent = formatClockTime(clamped);

                await chrome.storage.local.set({ [storageKey]: clamped });
            } else {
                timeText.textContent = formatClockTime(getValue());
            }
        });

        timeText.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                timeText.blur();
            }
        });

        button.addEventListener("click", async () => {
            if (!isEnabled()) return;

            const seconds = Number(slider.value);
            setValue(seconds);
            timeText.textContent = formatClockTime(seconds);
            await chrome.storage.local.set({ [storageKey]: seconds });
        });
    }

    const unlockControls = document.getElementById("unlockControls");
    const slider = document.getElementById("timeSlider");
    const selectedTime = document.getElementById("selectedTime");
    const remainingTime = document.getElementById("remainingTime");
    const saveButton = document.getElementById("saveTime");
    const unlockDurationStatus = document.getElementById("unlockDurationStatus");
    const toggleUnlockDuration = document.getElementById("toggleUnlockDuration");

    const eepyControls = document.getElementById("eepyControls");
    const sleepStartSlider = document.getElementById("sleepStartSlider");
    const sleepStartTime = document.getElementById("sleepStartTime");
    const saveSleepStart = document.getElementById("saveSleepStart");
    const sleepEndSlider = document.getElementById("sleepEndSlider");
    const sleepEndTime = document.getElementById("sleepEndTime");
    const saveSleepEnd = document.getElementById("saveSleepEnd");
    const eepyTimeStatus = document.getElementById("eepyTimeStatus");
    const toggleEepyTime = document.getElementById("toggleEepyTime");

    function applyUnlockDurationState() {
        unlockDurationStatus.textContent = unlockDurationEnabled ? "Enabled" : "Disabled";
        toggleUnlockDuration.textContent = unlockDurationEnabled ? "Disable" : "Enable";

        unlockControls.classList.toggle("section-disabled", !unlockDurationEnabled);
        selectedTime.classList.toggle("is-disabled", !unlockDurationEnabled);
        slider.disabled = !unlockDurationEnabled;
        saveButton.disabled = !unlockDurationEnabled;

        if (!unlockDurationEnabled) {
            selectedTime.contentEditable = false;
        }
    }

    function applyEepyTimeState() {
        eepyTimeStatus.textContent = eepyTimeEnabled ? "Enabled" : "Disabled";
        toggleEepyTime.textContent = eepyTimeEnabled ? "Disable" : "Enable";

        eepyControls.classList.toggle("section-disabled", !eepyTimeEnabled);
        sleepStartTime.classList.toggle("is-disabled", !eepyTimeEnabled);
        sleepEndTime.classList.toggle("is-disabled", !eepyTimeEnabled);

        sleepStartSlider.disabled = !eepyTimeEnabled;
        saveSleepStart.disabled = !eepyTimeEnabled;
        sleepEndSlider.disabled = !eepyTimeEnabled;
        saveSleepEnd.disabled = !eepyTimeEnabled;

        if (!eepyTimeEnabled) {
            sleepStartTime.contentEditable = false;
            sleepEndTime.contentEditable = false;
        }
    }

    slider.value = String(unlockDurationMs / 1000);
    selectedTime.textContent = formatDuration(unlockDurationMs);

    slider.addEventListener("input", () => {
        if (!unlockDurationEnabled) return;

        const ms = Number(slider.value) * 1000;
        unlockDurationMs = ms;
        selectedTime.textContent = formatDuration(ms);
    });

    selectedTime.addEventListener("click", () => {
        if (!unlockDurationEnabled) return;

        selectedTime.contentEditable = true;
        selectedTime.focus();
    });

    selectedTime.addEventListener("blur", async () => {
        selectedTime.contentEditable = false;

        if (!unlockDurationEnabled) {
            selectedTime.textContent = formatDuration(unlockDurationMs);
            return;
        }

        const parsedMs = parseDurationToMs(selectedTime.textContent.trim());

        if (parsedMs !== null) {
            const minMs = Number(slider.min) * 1000;
            const maxMs = Number(slider.max) * 1000;
            const clamped = Math.min(Math.max(parsedMs, minMs), maxMs);

            unlockDurationMs = clamped;
            slider.value = String(clamped / 1000);
            selectedTime.textContent = formatDuration(clamped);

            await chrome.storage.local.set({ unlockDurationMs });
        } else {
            selectedTime.textContent = formatDuration(unlockDurationMs);
        }
    });

    selectedTime.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            selectedTime.blur();
        }
    });

    saveButton.addEventListener("click", async () => {
        if (!unlockDurationEnabled) return;

        unlockDurationMs = Number(slider.value) * 1000;
        await chrome.storage.local.set({ unlockDurationMs });
    });

    toggleUnlockDuration.addEventListener("click", async () => {
        unlockDurationEnabled = !unlockDurationEnabled;

        if (!unlockDurationEnabled) {
            unlockUntil = 0;
            await chrome.storage.local.set({ unlockDurationEnabled, unlockUntil: 0 });
        } else {
            await chrome.storage.local.set({ unlockDurationEnabled });
        }

        applyUnlockDurationState();
        updateRemaining();
    });

    toggleEepyTime.addEventListener("click", async () => {
        eepyTimeEnabled = !eepyTimeEnabled;
        await chrome.storage.local.set({ eepyTimeEnabled });
        applyEepyTimeState();
    });

    setupClockControl({
        slider: sleepStartSlider,
        timeText: sleepStartTime,
        button: saveSleepStart,
        storageKey: "sleepStartSeconds",
        getValue: () => sleepStartSeconds,
        setValue: (seconds) => {
            sleepStartSeconds = seconds;
        },
        isEnabled: () => eepyTimeEnabled
    });

    setupClockControl({
        slider: sleepEndSlider,
        timeText: sleepEndTime,
        button: saveSleepEnd,
        storageKey: "sleepEndSeconds",
        getValue: () => sleepEndSeconds,
        setValue: (seconds) => {
            sleepEndSeconds = seconds;
        },
        isEnabled: () => eepyTimeEnabled
    });

    function updateRemaining() {
        if (!unlockDurationEnabled) {
            remainingTime.textContent = "00:00";
            return;
        }

        const now = Date.now();

        if (unlockUntil > now) {
            const remainingMs = unlockUntil - now;
            remainingTime.textContent = formatDuration(remainingMs);
        } else {
            remainingTime.textContent = "00:00";
        }
    }

    applyUnlockDurationState();
    applyEepyTimeState();
    updateRemaining();
    setInterval(updateRemaining, 1000);
});
