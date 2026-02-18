const sites = ["youtube", "instagram", "x", "reddit"];

document.addEventListener("DOMContentLoaded", async () => {

    let data = await chrome.storage.local.get([
        "blocked",
        "unlockDurationMs",
        "unlockUntil"
    ]);

    let blocked = data.blocked;
    let unlockDurationMs = data.unlockDurationMs ?? 300000; // default 5 min
    let unlockUntil = data.unlockUntil ?? 0;

    if (!blocked) {
        blocked = {
            youtube: false,
            instagram: false,
            x: false,
            reddit: false
        };
        await chrome.storage.local.set({ blocked });
    }

    sites.forEach(site => {
        const checkbox = document.getElementById(site);
        checkbox.checked = blocked[site];

        checkbox.addEventListener("change", async () => {
            blocked[site] = checkbox.checked;
            await chrome.storage.local.set({ blocked });
        });
    });

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0")
        );
    }

    function parseTimeToMs(text) {
        const parts = text.split(":");
        if (parts.length !== 2) return null;

        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);

        if (isNaN(minutes) || isNaN(seconds)) return null;
        if (seconds < 0 || seconds >= 60) return null;

        return (minutes * 60 + seconds) * 1000;
    }

    const slider = document.getElementById("timeSlider");
    const selectedTime = document.getElementById("selectedTime");
    const remainingTime = document.getElementById("remainingTime");
    const saveButton = document.getElementById("saveTime");

    slider.value = unlockDurationMs / 1000;
    selectedTime.textContent = formatTime(unlockDurationMs);

    slider.addEventListener("input", () => {
        const ms = slider.value * 1000;
        unlockDurationMs = ms;
        selectedTime.textContent = formatTime(ms);
    });

    selectedTime.addEventListener("click", () => {
        selectedTime.contentEditable = true;
        selectedTime.focus();
    });

    selectedTime.addEventListener("blur", async () => {
        selectedTime.contentEditable = false;

        const parsedMs = parseTimeToMs(selectedTime.textContent.trim());

        if (parsedMs !== null) {
            const minMs = slider.min * 1000;
            const maxMs = slider.max * 1000;

            const clamped = Math.min(Math.max(parsedMs, minMs), maxMs);

            unlockDurationMs = clamped;

            slider.value = clamped / 1000;

            selectedTime.textContent = formatTime(clamped);

            await chrome.storage.local.set({ unlockDurationMs });
        } else {
            selectedTime.textContent = formatTime(unlockDurationMs);
        }
    });

    selectedTime.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            selectedTime.blur();
        }
    });

    saveButton.addEventListener("click", async () => {
        unlockDurationMs = slider.value * 1000;
        await chrome.storage.local.set({ unlockDurationMs });
    });

    function updateRemaining() {
        const now = Date.now();

        if (unlockUntil > now) {
            const remainingMs = unlockUntil - now;
            remainingTime.textContent = formatTime(remainingMs);
        } else {
            remainingTime.textContent = "00:00";
        }
    }

    updateRemaining();
    setInterval(updateRemaining, 1000);
});