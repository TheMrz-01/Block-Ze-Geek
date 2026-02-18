function redirectToFocus() {
  const focusUrl = chrome.runtime.getURL("focus/focus.html");
  window.location.replace(focusUrl);
}

function checkShorts() {
  if (location.pathname.startsWith("/shorts")) {
    redirectToFocus();
  }
}

checkShorts();

let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    checkShorts();
  }
}).observe(document, { subtree: true, childList: true });