// Replace the whole body content
chrome.storage.local.get("extensionEnabled", ({ extensionEnabled }) => {
  if (extensionEnabled) {
    document.body.innerHTML =
      "<h1>Hello! This page has been modified by my extension!</h1>";
  } else {
    // 🚫 skip or disable behavior
  }
});

// Or modify specific elements
// Example: Replace all paragraphs
// const paragraphs = document.querySelectorAll("p");
// paragraphs.forEach(p => p.textContent = "Changed by Chrome Extension");
