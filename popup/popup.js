const sites = ["youtube", "instagram", "x", "reddit"];

document.addEventListener("DOMContentLoaded", async () => {

    let data = await chrome.storage.local.get("blocked");
    let blocked = data.blocked;

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
});