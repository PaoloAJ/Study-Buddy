document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggleExtension");

  // Load the current state
  chrome.storage.local.get("extensionEnabled", ({ extensionEnabled }) => {
    toggle.checked = extensionEnabled ?? true; // default ON
  });

  // Save the state when toggled
  toggle.addEventListener("change", () => {
    chrome.storage.local.set({ extensionEnabled: toggle.checked }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (!currentTab) {
          console.warn("No active tab found.");
          return;
        }

        console.log("Tab object:", currentTab); // ✅ debug output

        if (
          currentTab.url &&
          currentTab.url.startsWith("https://www.instagram.com/")
        ) {
          chrome.tabs.reload(currentTab.id);
        } else {
          console.warn("URL is not accessible or not Instagram.");
        }
      });
    });
  });
});
