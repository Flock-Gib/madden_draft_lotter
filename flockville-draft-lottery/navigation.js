(() => {
  const pages = new Set(["ability", "lottery", "results", "history", "help"]);
  const anchorPages = {
    "ability-guide": "ability", setup: "lottery", odds: "lottery", draw: "lottery",
    results: "results", history: "history", "how-it-works": "help",
  };

  function showPage(scroll = false) {
    const url = new URL(location.href);
    const anchor = url.hash.slice(1);
    const authCallback = new URLSearchParams(anchor).has("access_token") ||
      new URLSearchParams(anchor).has("error");
    const page = authCallback ? "history" : pages.has(url.searchParams.get("page"))
      ? url.searchParams.get("page") : anchorPages[anchor] || "lottery";
    document.body.dataset.page = page;
    document.querySelectorAll(".site-nav a").forEach((link) => {
      if (new URL(link.href).searchParams.get("page") === page) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (scroll) {
      const target = anchorPages[anchor] === page && document.getElementById(anchor);
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    }
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute("download")) return;
    const target = new URL(link.href, location.href);
    if (target.origin !== location.origin || target.pathname !== location.pathname) return;
    const anchor = target.hash.slice(1);
    const page = anchorPages[anchor] || target.searchParams.get("page");
    if (!pages.has(page)) return;
    event.preventDefault();
    target.searchParams.set("page", page);
    history.pushState({}, "", target);
    showPage(true);
  });
  window.addEventListener("popstate", () => showPage(true));
  showPage(Boolean(anchorPages[location.hash.slice(1)]));
})();
