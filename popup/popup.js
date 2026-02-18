const sites = ["x", "reddit", "instagram", "shorts"];

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(sites);

  sites.forEach(site => {
    const checkbox = document.getElementById(site);

    checkbox.checked = stored[site] === true;

    checkbox.addEventListener("change", async () => {
      await chrome.runtime.sendMessage({
        type: "toggle",
        site,
        enabled: checkbox.checked
      });
    });
  });
});