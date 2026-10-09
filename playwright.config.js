const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 8000 --bind 127.0.0.1 --directory flockville-draft-lottery",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
