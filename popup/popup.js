const sites = ["youtube", "instagram", "x", "reddit"];

document.addEventListener("DOMContentLoaded", async () => {

    let data = await chrome.storage.local.get([
        "blocked",
        "unlockDurationMs",
        "unlockUntil"
    ]);

    let blocked = data.blocked;
    let unlockDurationMs = data.unlockDurationMs ?? 300000; // 5 min default
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

    // --------------------------
    // Slider logic
    // --------------------------
    const slider = document.getElementById("timeSlider");
    const selectedTime = document.getElementById("selectedTime");
    const remainingTime = document.getElementById("remainingTime");
    const saveButton = document.getElementById("saveTime");

    slider.value = unlockDurationMs / 1000;
    selectedTime.textContent = formatTime(unlockDurationMs);

    slider.addEventListener("input", () => {
        const ms = slider.value * 1000;
        selectedTime.textContent = formatTime(ms);
    });

    saveButton.addEventListener("click", async () => {
        const ms = slider.value * 1000;
        await chrome.storage.local.set({
            unlockDurationMs: ms
        });
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