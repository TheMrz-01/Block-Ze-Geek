const sites = ["youtube", "instagram", "x", "reddit"];

document.addEventListener("DOMContentLoaded", async () => {

    let data = await chrome.storage.local.get(["blocked", "unlockDuration", "unlockUntil"]);

    let blocked = data.blocked;
    let unlockDuration = data.unlockDuration ?? 5;
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

    const slider = document.getElementById("timeSlider");
    const timeValue = document.getElementById("timeValue");
    const remainingTime = document.getElementById("remainingTime");

    slider.value = unlockDuration;
    timeValue.textContent = unlockDuration;

    slider.addEventListener("input", async () => {
        timeValue.textContent = slider.value;
        await chrome.storage.local.set({
            unlockDuration: Number(slider.value)
        });
    });

    // --- Remaining time display ---
    function updateRemaining() {
        const now = Date.now();
        if (unlockUntil > now) {
            const minutesLeft = Math.ceil((unlockUntil - now) / 60000);
            remainingTime.textContent = minutesLeft;
        } else {
            remainingTime.textContent = 0;
        }
    }

    updateRemaining();
    setInterval(updateRemaining, 1000);
});