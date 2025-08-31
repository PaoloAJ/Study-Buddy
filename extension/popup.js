// waits for the page to fully load before running any code
document.addEventListener("DOMContentLoaded", () => {
  try {
    // initialize all the different parts of the popup
    setupExtensionToggle();
    setupPomodoroTimer();
    setupSettingsModal();
    setupWebsiteManagement();
    console.log("all popup components initialized successfully");
  } catch (error) {
    console.error("error during popup initialization:", error);
  }
});

function setupExtensionToggle() {
  // get the toggle switch element
  const toggleSwitch = document.getElementById("toggleExtension");

  // load the current toggle state from storage
  chrome.storage.local.get("extensionEnabled", ({ extensionEnabled }) => {
    // if no setting exists, default to enabled (true)
    toggleSwitch.checked = extensionEnabled ?? true;
  });

  // listen for when the user toggles the switch
  toggleSwitch.addEventListener("change", () => {
    const isExtensionNowEnabled = toggleSwitch.checked;

    // save the new state to storage
    chrome.storage.local.set(
      { extensionEnabled: isExtensionNowEnabled },
      () => {
        // only reload the current tab if we're enabling the extension
        if (isExtensionNowEnabled) {
          checkAndReloadCurrentTab();
        } else {
          console.log("extension disabled");
        }
      }
    );
  });
}

// check if the current tab should be reloaded when enabling the extension
async function checkAndReloadCurrentTab() {
  try {
    // get the currently active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (!currentTab) {
      console.warn("no active tab found");
      return;
    }

    console.log("extension enabled - checking current tab:", currentTab.url);

    // check if the current tab is on a blocked website
    const shouldReloadTab = await checkIfCurrentTabIsBlocked(currentTab.url);

    if (shouldReloadTab) {
      console.log("reloading tab to activate extension on blocked website");
      chrome.tabs.reload(currentTab.id);
    } else {
      console.log(
        "not on a blocked website - extension will activate when you visit a blocked site"
      );
    }
  } catch (error) {
    console.error("error checking current tab:", error);
  }
}

// ============================================================================
// pomodoro timer functionality
// ============================================================================

// class to handle timer settings (work time, break time, etc.)
class TimerSettings {
  constructor() {
    // default timer settings
    this.defaultSettings = {
      workTime: 25, // minutes for work session
      shortBreak: 5, // minutes for short break
      longBreak: 15, // minutes for long break
      longBreakInterval: 4, // how many work sessions before a long break
    };
  }

  // get current settings from storage
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get("timerSettings", ({ timerSettings }) => {
        // combine default settings with any saved settings
        resolve({ ...this.defaultSettings, ...timerSettings });
      });
    });
  }

  // save new settings to storage
  async saveSettings(newSettings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ timerSettings: newSettings }, resolve);
    });
  }
}

// main pomodoro timer class
class StudyBuddyTimer {
  constructor() {
    // get all the timer-related elements from the popup
    this.timeDisplay = document.getElementById("timeDisplay");
    this.phaseDisplay = document.getElementById("phaseDisplay");
    this.progressFill = document.getElementById("progressFill");
    this.startButton = document.getElementById("startBtn");
    this.stopButton = document.getElementById("stopBtn");
    this.resetButton = document.getElementById("resetBtn");
    this.completedCount = document.getElementById("completedCount");
    this.statusText = document.getElementById("statusText");

    // timer state variables
    this.updateInterval = null;
    this.settings = new TimerSettings();
  }

  // initialize the timer and set up event listeners
  init() {
    // add click handlers for timer buttons
    this.startButton.addEventListener("click", () => this.startTimer());
    this.stopButton.addEventListener("click", () => this.stopTimer());
    this.resetButton.addEventListener("click", () => this.resetTimer());

    // listen for timer completion messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "timerCompleted") {
        this.showCompletionNotification(message.data);
      }
    });

    // update the display immediately and a few more times to handle timing issues
    this.updateDisplay();
    setTimeout(() => this.updateDisplay(), 100);
    setTimeout(() => this.updateDisplay(), 300);

    // start the regular display updates
    this.startRegularUpdates();
  }

  // start the timer
  async startTimer() {
    try {
      await this.sendMessageToBackground({ action: "start" });
      this.updateDisplay();
    } catch (error) {
      console.error("error starting timer:", error);
    }
  }

  // stop the timer
  async stopTimer() {
    try {
      await this.sendMessageToBackground({ action: "stop" });
      this.updateDisplay();
    } catch (error) {
      console.error("error stopping timer:", error);
    }
  }

  // reset the timer
  async resetTimer() {
    try {
      await this.sendMessageToBackground({ action: "reset" });
      // add a small delay to ensure settings are loaded
      setTimeout(() => {
        this.updateDisplay();
      }, 100);
    } catch (error) {
      console.error("error resetting timer:", error);
    }
  }

  // send a message to the background script
  async sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      console.log("sending message to background:", message);
      chrome.runtime.sendMessage(message, (response) => {
        console.log("received response from background:", response);
        if (chrome.runtime.lastError) {
          console.error("runtime error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // get the current timer state from background script
  async getCurrentTimerState() {
    try {
      return await this.sendMessageToBackground({ action: "getState" });
    } catch (error) {
      console.error("error getting timer state:", error);
      return null;
    }
  }

  // update the timer display with current state
  async updateDisplay() {
    const timerState = await this.getCurrentTimerState();
    if (!timerState) {
      // show loading state if there's an error
      this.timeDisplay.textContent = "--:--";
      this.phaseDisplay.textContent = "loading...";
      return;
    }

    // get time information from the state
    const timeRemainingInMilliseconds = timerState.timeRemaining;
    const totalTimeInMilliseconds = timerState.totalTime;

    // display the time in mm:ss format
    this.timeDisplay.textContent = this.formatTimeAsMinutesSeconds(
      timeRemainingInMilliseconds
    );

    // display the current phase (work, break, or long break)
    const phaseNames = {
      work: "work time",
      break: "short break",
      longBreak: "long break",
    };

    this.phaseDisplay.textContent =
      phaseNames[timerState.currentPhase] || "work time";
    this.phaseDisplay.className = `phase ${timerState.currentPhase}`;

    // update the progress bar
    const progressPercentage =
      ((totalTimeInMilliseconds - timeRemainingInMilliseconds) /
        totalTimeInMilliseconds) *
      100;
    this.progressFill.style.width = `${Math.max(
      0,
      Math.min(100, progressPercentage)
    )}%`;

    // update the statistics
    this.completedCount.textContent = timerState.completedPomodoros;
    this.statusText.textContent = timerState.isRunning ? "running" : "ready";

    // update button states based on whether timer is running
    this.updateButtonStates(timerState.isRunning);
  }

  // update the start/stop button states
  updateButtonStates(isTimerRunning) {
    this.startButton.disabled = isTimerRunning;
    this.stopButton.disabled = !isTimerRunning;

    if (isTimerRunning) {
      this.startButton.textContent = "running";
      this.startButton.classList.add("disabled");
    } else {
      this.startButton.textContent = "start";
      this.startButton.classList.remove("disabled");
    }
  }

  // convert milliseconds to mm:ss format
  formatTimeAsMinutesSeconds(milliseconds) {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  // start updating the display every second
  startRegularUpdates() {
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000);
  }

  // stop the regular display updates
  stopRegularUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // show a notification when a timer phase completes
  showCompletionNotification(timerData) {
    const phaseNames = {
      work: "work session",
      break: "short break",
      longBreak: "long break",
    };

    const nextPhaseNames = {
      work: "short break",
      break: "work session",
      longBreak: "work session",
    };

    // handle the special case of long break
    if (timerData.nextPhase === "longBreak") {
      nextPhaseNames.work = "long break";
    }

    const completedPhaseName =
      phaseNames[timerData.completedPhase] || "session";
    const nextPhaseName = nextPhaseNames[timerData.completedPhase] || "session";

    const notificationMessage = `🎉 ${completedPhaseName} complete!\n\nTime to start your ${nextPhaseName}.\n\nPomodoros completed: ${timerData.completedPomodoros}`;

    console.log("timer completed");
    alert(notificationMessage);
  }
}

// ============================================================================
// settings modal functionality
// ============================================================================

function setupSettingsModal() {
  // get all the settings modal elements
  const settingsButton = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeButton = document.getElementById("closeSettings");
  const saveButton = document.getElementById("saveSettings");
  const resetSettingsButton = document.getElementById("resetSettings");

  // get all the input fields
  const workTimeInput = document.getElementById("workTime");
  const shortBreakInput = document.getElementById("shortBreak");
  const longBreakInput = document.getElementById("longBreak");
  const longBreakIntervalInput = document.getElementById("longBreakInterval");

  // check if all required elements exist
  if (
    !settingsButton ||
    !settingsModal ||
    !closeButton ||
    !saveButton ||
    !workTimeInput ||
    !shortBreakInput ||
    !longBreakInput ||
    !longBreakIntervalInput
  ) {
    console.error("some settings elements not found");
    return;
  }

  const settings = new TimerSettings();

  // load current settings into the form
  async function loadCurrentSettings() {
    const currentSettings = await settings.getSettings();
    workTimeInput.value = currentSettings.workTime;
    shortBreakInput.value = currentSettings.shortBreak;
    longBreakInput.value = currentSettings.longBreak;
    longBreakIntervalInput.value = currentSettings.longBreakInterval;
  }

  // show the settings modal
  settingsButton.addEventListener("click", () => {
    loadCurrentSettings();
    settingsModal.style.display = "block";
  });

  // hide the settings modal
  closeButton.addEventListener("click", () => {
    settingsModal.style.display = "none";
  });

  // close modal when clicking outside of it
  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
      settingsModal.style.display = "none";
    }
  });

  // reset settings to defaults
  resetSettingsButton.addEventListener("click", async () => {
    const defaultSettings = {
      workTime: 25,
      shortBreak: 5,
      longBreak: 15,
      longBreakInterval: 4,
    };

    workTimeInput.value = defaultSettings.workTime;
    shortBreakInput.value = defaultSettings.shortBreak;
    longBreakInput.value = defaultSettings.longBreak;
    longBreakIntervalInput.value = defaultSettings.longBreakInterval;
  });

  // save the new settings
  saveButton.addEventListener("click", async () => {
    // get the values from the form
    const workTime = parseInt(workTimeInput.value);
    const shortBreak = parseInt(shortBreakInput.value);
    const longBreak = parseInt(longBreakInput.value);
    const longBreakInterval = parseInt(longBreakIntervalInput.value);

    // validate the input values
    if (
      workTime < 1 ||
      workTime > 60 ||
      shortBreak < 1 ||
      shortBreak > 30 ||
      longBreak < 1 ||
      longBreak > 60 ||
      longBreakInterval < 2 ||
      longBreakInterval > 10
    ) {
      alert(
        "please enter valid values:\n- work time: 1-60 minutes\n- short break: 1-30 minutes\n- long break: 1-60 minutes\n- long break interval: 2-10 pomodoros"
      );
      return;
    }

    const newSettings = {
      workTime,
      shortBreak,
      longBreak,
      longBreakInterval,
    };

    try {
      // save the settings
      await settings.saveSettings(newSettings);

      // notify the background script about the settings change
      await sendMessageToBackground({
        action: "updateSettings",
        settings: newSettings,
      });

      // hide the modal
      settingsModal.style.display = "none";

      // update the timer display if needed
      if (window.studyBuddyTimer) {
        window.studyBuddyTimer.updateDisplay();
      }
    } catch (error) {
      console.error("error saving settings:", error);
      alert("error saving settings. please try again.");
    }
  });

  // load settings when the popup opens
  loadCurrentSettings();
}

// website management functionality

function setupWebsiteManagement() {
  // get all the website management elements
  const websiteInput = document.getElementById("websiteInput");
  const addWebsiteButton = document.getElementById("addWebsiteBtn");
  const addCurrentSiteButton = document.getElementById("addCurrentSiteBtn");
  const websiteList = document.getElementById("websiteList");

  // load existing blocked websites
  loadBlockedWebsites();

  // listen for changes to the blocked websites list
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.blockedWebsites) {
      displayWebsites(changes.blockedWebsites.newValue || []);
    }
  });

  // add event delegation for remove buttons
  websiteList.addEventListener("click", (event) => {
    if (event.target.classList.contains("remove-btn")) {
      const websiteItem = event.target.closest(".website-item");
      const website = websiteItem.getAttribute("data-website");
      if (website) {
        removeWebsite(website);
      }
    }
  });

  // add website from input field
  addWebsiteButton.addEventListener("click", () => {
    const website = websiteInput.value.trim();
    if (website) {
      addWebsite(website);
      websiteInput.value = "";
    }
  });

  // add website when user presses enter
  websiteInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      const website = websiteInput.value.trim();
      if (website) {
        addWebsite(website);
        websiteInput.value = "";
      }
    }
  });

  // add the current website the user is on
  addCurrentSiteButton.addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const currentTab = tabs[0];

      if (currentTab && currentTab.url) {
        const url = new URL(currentTab.url);
        const hostname = url.hostname.replace("www.", "");
        addWebsite(hostname);
      } else {
        alert(
          "unable to get current site. please make sure you're on a valid webpage."
        );
      }
    } catch (error) {
      console.error("error getting current site:", error);
      alert("error getting current site. please try again.");
    }
  });

  // clear all blocked websites
  const clearAllButton = document.getElementById("clearAllBtn");
  clearAllButton.addEventListener("click", async () => {
    if (confirm("are you sure you want to clear all blocked websites?")) {
      await clearAllWebsites();
    }
  });
}

// load blocked websites from storage and display them
async function loadBlockedWebsites() {
  try {
    const result = await chrome.storage.local.get("blockedWebsites");
    const blockedWebsites = result.blockedWebsites || [];
    displayWebsites(blockedWebsites);
  } catch (error) {
    console.error("error loading blocked websites:", error);
  }
}

// add a new website to the blocked list
async function addWebsite(website) {
  try {
    // clean and validate the website input
    const cleanedWebsite = cleanWebsiteInput(website);

    if (!cleanedWebsite) {
      alert("please enter a valid website (e.g., facebook.com)");
      return;
    }

    // get current blocked websites
    const result = await chrome.storage.local.get("blockedWebsites");
    const blockedWebsites = result.blockedWebsites || [];

    // check if website is already in the list
    if (blockedWebsites.includes(cleanedWebsite)) {
      alert("this website is already in your blocked list!");
      return;
    }

    // add the website to the list
    blockedWebsites.push(cleanedWebsite);
    await chrome.storage.local.set({ blockedWebsites });

    // update the display
    displayWebsites(blockedWebsites);

    // notify the background script
    chrome.runtime.sendMessage({
      action: "updateBlockedWebsites",
      websites: blockedWebsites,
    });

    // show success message
    showSuccessMessage(`${cleanedWebsite} added to blocked list!`);
  } catch (error) {
    console.error("error adding website:", error);
    alert("error adding website. please try again.");
  }
}

// remove a website from the blocked list
async function removeWebsite(website) {
  try {
    const result = await chrome.storage.local.get("blockedWebsites");
    const blockedWebsites = result.blockedWebsites || [];

    // remove the website from the list
    const updatedWebsites = blockedWebsites.filter((site) => site !== website);
    await chrome.storage.local.set({ blockedWebsites: updatedWebsites });

    // update the display
    displayWebsites(updatedWebsites);

    // notify the background script
    chrome.runtime.sendMessage({
      action: "updateBlockedWebsites",
      websites: updatedWebsites,
    });
  } catch (error) {
    console.error("error removing website:", error);
    alert("error removing website. please try again.");
  }
}

// display the list of blocked websites
function displayWebsites(websites) {
  const websiteList = document.getElementById("websiteList");

  if (websites.length === 0) {
    websiteList.innerHTML =
      '<div class="empty-list">no websites blocked yet. add some to get started!</div>';
    return;
  }

  // create html for each website in the list
  websiteList.innerHTML = websites
    .map(
      (website) => `
    <div class="website-item" data-website="${website}">
      <span class="website-name">${website}</span>
      <button class="remove-btn">remove</button>
    </div>
  `
    )
    .join("");
}

// clean and validate website input
function cleanWebsiteInput(website) {
  try {
    // remove http:// or https:// if present
    let cleaned = website.replace(/^https?:\/\//, "");

    // remove www. if present
    cleaned = cleaned.replace(/^www\./, "");

    // remove trailing slash
    cleaned = cleaned.replace(/\/$/, "");

    // remove path and query parameters
    cleaned = cleaned.split("/")[0];
    cleaned = cleaned.split("?")[0];

    // basic validation
    if (cleaned.length === 0 || cleaned.includes(" ")) {
      return null;
    }

    // validate domain format
    const domainPattern =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainPattern.test(cleaned)) {
      return null;
    }

    // return lowercase version
    return cleaned.toLowerCase();
  } catch (error) {
    return null;
  }
}

// clear all blocked websites
async function clearAllWebsites() {
  try {
    await chrome.storage.local.set({ blockedWebsites: [] });
    displayWebsites([]);

    // notify the background script
    chrome.runtime.sendMessage({
      action: "updateBlockedWebsites",
      websites: [],
    });
  } catch (error) {
    console.error("error clearing websites:", error);
    alert("error clearing websites. please try again.");
  }
}

// show a temporary success message
function showSuccessMessage(message) {
  // create a temporary success message element
  const successMessage = document.createElement("div");
  successMessage.textContent = message;
  successMessage.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 0.9em;
    font-weight: 500;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;

  // add the message to the page
  document.body.appendChild(successMessage);

  // remove the message after 3 seconds
  setTimeout(() => {
    if (successMessage.parentNode) {
      successMessage.parentNode.removeChild(successMessage);
    }
  }, 3000);
}

// check if the current tab is on a blocked website
async function checkIfCurrentTabIsBlocked(url) {
  try {
    if (!url) return false;

    const result = await chrome.storage.local.get("blockedWebsites");
    const blockedWebsites = result.blockedWebsites || [];

    if (blockedWebsites.length === 0) return false;

    const hostname = new URL(url).hostname.toLowerCase();
    return blockedWebsites.some((site) => hostname.includes(site));
  } catch (error) {
    console.error("error checking if website is blocked:", error);
    return false;
  }
}

// first time initialization and cleanup

// initialize the pomodoro timer
function setupPomodoroTimer() {
  const timer = new StudyBuddyTimer();
  timer.init();

  // store reference for cleanup
  window.studyBuddyTimer = timer;
}

// helper function for sending messages to background script
async function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// clean up when popup closes
window.addEventListener("beforeunload", () => {
  if (window.studyBuddyTimer) {
    window.studyBuddyTimer.stopRegularUpdates();
  }
});
