document.querySelectorAll(".brand-mark").forEach((brand) => {
  const image = brand.querySelector("img");
  const toggle = brand.querySelector(".logo-motion-toggle");
  toggle.addEventListener("click", () => {
    const paused = toggle.getAttribute("aria-pressed") !== "true";
    image.src = `assets/flockville-energy-logo.${paused ? "png" : "gif"}`;
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.textContent = paused ? "Play logo animation" : "Pause logo animation";
  });
});
