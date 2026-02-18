function checkShorts() {
  if (location.pathname.startsWith("/shorts")) {
    document.documentElement.innerHTML = "";
    window.location.href = "about:blank";
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