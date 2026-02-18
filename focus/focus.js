const phrases = [
    "yes i want to waste my time",
    "i choose distraction over progress",
    "i am avoiding meaningful work",
    "i accept that this does not help my goals",
    "this is not aligned with my future self"
];

const params = new URLSearchParams(window.location.search);
const target = params.get("target");

const challengeElement = document.querySelector(".container #challenge");
const input = document.querySelector(".container #input");
const button = document.querySelector(".container #submit");

const phrase = phrases[Math.floor(Math.random() * phrases.length)];
challengeElement.textContent = `"${phrase}"`;

input.addEventListener('paste', e => e.preventDefault());

button.addEventListener("click", () => {
    if (input.value.trim() === phrase) {
        window.location.href = target;
    } else {
        alert("Incorrect. Try again.");
    }
});