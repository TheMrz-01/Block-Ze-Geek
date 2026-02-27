const OVERLAY_ID = "bzg-overlay-root";

const phrases = [
    " yes i want to waste my time ",
    " i choose distraction over progress ",
    " i am avoiding meaningful work ",
    " i accept that this does not help my goals ",
    " this is not aligned with my future self "
];

let overlayRequired = false;
let currentPhrase = "";
let blockerObserver = null;

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
}

async function unlockAndClose() {
    const data = await chrome.storage.local.get([
        "unlockDurationMs",
        "unlockDurationEnabled"
    ]);

    const durationMs = data.unlockDurationMs ?? 300000;
    const unlockDurationEnabled = data.unlockDurationEnabled ?? true;

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
            await unlockAndClose();
            return;
        }

        alert("Incorrect. Try again.");
    });

    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(phraseBox);
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
