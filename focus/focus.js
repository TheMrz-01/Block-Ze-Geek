const phrases = [
    " yes i want to waste my time ",
    " i choose distraction over progress ",
    " i am avoiding meaningful work ",
    " i accept that this does not help my goals ",
    " this is not aligned with my future self "
];

const params = new URLSearchParams(window.location.search);
const target = params.get("target");

const challengeElement = document.querySelector(".container #challenge");
const input = document.querySelector(".container #input");

const phrase = phrases[Math.floor(Math.random() * phrases.length)];
challengeElement.textContent = `"${phrase}"`;

input.addEventListener("paste", e => e.preventDefault());
input.addEventListener("contextmenu", e => e.preventDefault());

input.addEventListener("keydown", async (event) => {
    if (input.value.trim() === phrase && event.key === "Enter") {

        const data = await chrome.storage.local.get("unlockDurationMs");
        const durationMs = data.unlockDurationMs ?? 300000;

        const unlockUntil = Date.now() + durationMs;

        await chrome.storage.local.set({ unlockUntil });

        // Redirect immediately
        window.location.href = target;

    } else if(input.values.trim() !== phrase){
        alert("Incorrect. Try again.");
    }
});