class PomodoroTimer {
  constructor() {
    // timer state variables
    this.isTimerRunning = false;
    this.currentPhase = "work";
    this.timeRemainingInMilliseconds = 0;
    this.completedPomodoros = 0;
    this.timerStartTime = null;

    // default timer settings
    this.settings = {
      workTime: 25, // minutes for work session
      shortBreak: 5, // minutes for short break
      longBreak: 15, // minutes for long break
      longBreakInterval: 4, // how many work sessions before a long break
    };

    // load saved settings and state
    this.loadSettings();
    this.loadTimerState();
    this.initializeTimer();
  }

  // load saved timer state from storage
  async loadTimerState() {
    try {
      const result = await chrome.storage.local.get([
        "timerState",
        "isRunning",
        "currentPhase",
        "completedPomodoros",
        "startTime",
      ]);

      if (result.timerState) {
        // restore timer state from storage
        this.isTimerRunning = result.timerState.isRunning || false;
        this.currentPhase = result.timerState.currentPhase || "work";
        this.completedPomodoros = result.timerState.completedPomodoros || 0;
        this.timerStartTime = result.timerState.startTime || null;

        // restore remaining time if available (when timer was stopped)
        if (typeof result.timerState.timeRemaining === "number") {
          this.timeRemainingInMilliseconds = result.timerState.timeRemaining;
        }

        // ensure timeRemaining has a sensible value when not running
        if (
          !this.isTimerRunning &&
          (this.timeRemainingInMilliseconds === 0 ||
            this.timeRemainingInMilliseconds == null)
        ) {
          this.timeRemainingInMilliseconds = this.getPhaseTimeInMilliseconds(
            this.currentPhase
          );
        }
      }
    } catch (error) {
      console.error("error loading timer state:", error);
    }
  }

  // save current timer state to storage
  async saveTimerState() {
    try {
      const timerState = {
        isRunning: this.isTimerRunning,
        currentPhase: this.currentPhase,
        completedPomodoros: this.completedPomodoros,
        startTime: this.timerStartTime,
        // save the base remaining time; when running we calculate dynamic remaining from this base
        timeRemaining: this.timeRemainingInMilliseconds,
      };
      await chrome.storage.local.set({ timerState });
    } catch (error) {
      console.error("error saving timer state:", error);
    }
  }

  // load timer settings from storage
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get("timerSettings");
      if (result.timerSettings) {
        this.settings = { ...this.settings, ...result.timerSettings };
      }
    } catch (error) {
      console.error("error loading settings:", error);
    }
  }

  // update timer settings
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.local.set({ timerSettings: this.settings });

    // update remaining time if timer is not running
    if (!this.isTimerRunning) {
      this.timeRemainingInMilliseconds = this.getPhaseTimeInMilliseconds(
        this.currentPhase
      );
    }
  }

  // get the time duration for a specific phase in milliseconds
  getPhaseTimeInMilliseconds(phase) {
    switch (phase) {
      case "work":
        return this.settings.workTime * 60 * 1000;
      case "break":
        return this.settings.shortBreak * 60 * 1000;
      case "longBreak":
        return this.settings.longBreak * 60 * 1000;
      default:
        return this.settings.workTime * 60 * 1000;
    }
  }

  // initialize the timer with default values
  initializeTimer() {
    if (this.timeRemainingInMilliseconds === 0) {
      this.timeRemainingInMilliseconds = this.getPhaseTimeInMilliseconds(
        this.currentPhase
      );
    }
  }

  // start the timer
  async start() {
    if (this.isTimerRunning) return;

    this.isTimerRunning = true;
    this.timerStartTime = Date.now();
    await this.saveTimerState();

    // create a chrome alarm to check timer status periodically
    const alarmName = "pomodoroTimer";

    // clear any existing alarm
    await chrome.alarms.clear(alarmName);

    // create a recurring alarm that fires every minute to check timer status
    // this handles timers longer than chrome's alarm delay limit (~24 minutes)
    await chrome.alarms.create(alarmName, {
      periodInMinutes: 1,
    });

    console.log("timer started - recurring alarm set to check every minute");
  }

  // stop the timer
  async stop() {
    if (!this.isTimerRunning) return;

    // calculate remaining time
    const elapsedTime = Date.now() - this.timerStartTime;
    this.timeRemainingInMilliseconds = Math.max(
      0,
      this.timeRemainingInMilliseconds - elapsedTime
    );

    this.isTimerRunning = false;
    this.timerStartTime = null;
    await this.saveTimerState();

    // clear the alarm
    await chrome.alarms.clear("pomodoroTimer");

    console.log(
      "timer stopped, remaining time:",
      this.timeRemainingInMilliseconds
    );
  }

  // reset the timer to initial state
  async reset() {
    await this.stop();
    this.currentPhase = "work";
    this.timeRemainingInMilliseconds = this.getPhaseTimeInMilliseconds(
      this.currentPhase
    );
    this.completedPomodoros = 0;
    await this.saveTimerState();

    console.log("timer reset");
  }

  // complete the current phase and move to the next phase
  async complete() {
    await this.stop();
    this.showCompletionNotification();

    const completedPhase = this.currentPhase;

    // handle phase transitions
    if (this.currentPhase === "work") {
      this.completedPomodoros++;

      // check if it's time for a long break
      if (this.completedPomodoros % this.settings.longBreakInterval === 0) {
        this.currentPhase = "longBreak";
      } else {
        this.currentPhase = "break";
      }
    } else {
      this.currentPhase = "work";
    }

    this.timeRemainingInMilliseconds = this.getPhaseTimeInMilliseconds(
      this.currentPhase
    );
    await this.saveTimerState();

    // send completion message to popup if it exists
    try {
      chrome.runtime
        .sendMessage({
          action: "timerCompleted",
          data: {
            completedPhase: completedPhase,
            nextPhase: this.currentPhase,
            completedPomodoros: this.completedPomodoros,
          },
        })
        .catch(() => {
          // nothing happens if popup is not open
        });
    } catch (error) {
      // ignore errors
    }

    console.log(`phase completed. new phase: ${this.currentPhase}`);
  }

  // show notification when timer phase completes
  showCompletionNotification() {
    const phaseNames = {
      work: "work session",
      break: "short break",
      longBreak: "long break",
    };

    // get the phase that just completed (before the transition)
    const completedPhaseName = phaseNames[this.currentPhase];

    // determine what the next phase will be
    let nextPhaseName;
    if (this.currentPhase === "work") {
      // completedPomodoros will be incremented in complete() after this method
      const upcomingCompletedCount = this.completedPomodoros + 1;
      if (upcomingCompletedCount % this.settings.longBreakInterval === 0) {
        nextPhaseName = "long break";
      } else {
        nextPhaseName = "short break";
      }
    } else {
      nextPhaseName = "work session";
    }

    const notificationTitle = `${completedPhaseName} complete!`;
    const notificationMessage = `time for your ${nextPhaseName}`;

    // create browser notification
    chrome.notifications.create({
      type: "basic",
      iconUrl: "popup_icon.png",
      title: notificationTitle,
      message: notificationMessage,
      priority: 2,
    });

    // speak the notification using text-to-speech
    try {
      chrome.tts.speak(`${notificationTitle} ${notificationMessage}`, {
        rate: 1.0,
        volume: 0.8,
      });
    } catch (error) {
      console.log("text-to-speech not available:", error);
    }
  }

  // get the current timer state
  getState() {
    // calculate current remaining time if running
    let currentTimeRemaining = this.timeRemainingInMilliseconds;
    if (this.isTimerRunning && this.timerStartTime) {
      const elapsedTime = Date.now() - this.timerStartTime;
      // when running, remaining time is base remaining minus elapsed
      currentTimeRemaining = Math.max(
        0,
        this.timeRemainingInMilliseconds - elapsedTime
      );
    }

    return {
      isRunning: this.isTimerRunning,
      currentPhase: this.currentPhase,
      timeRemaining: currentTimeRemaining, // this is the actual current time
      totalTime: this.getPhaseTimeInMilliseconds(this.currentPhase),
      completedPomodoros: this.completedPomodoros,
      startTime: this.timerStartTime,
      settings: this.settings,
    };
  }
}

// blocking website functionality

// create the main timer instance
const pomodoroTimer = new PomodoroTimer();

// list of distracting websites to redirect (will be loaded from storage)
let blockedWebsites = [
  "instagram.com",
  "youtube.com",
  "facebook.com",
  "twitter.com",
  "tiktok.com",
  "reddit.com",
  "netflix.com",
  "hulu.com",
  "disneyplus.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "pinterest.com",
  "snapchat.com",
  "twitch.tv",
];

// load blocked websites from storage
async function loadBlockedWebsites() {
  try {
    const result = await chrome.storage.local.get("blockedWebsites");
    if (result.blockedWebsites && result.blockedWebsites.length > 0) {
      blockedWebsites = result.blockedWebsites;
    } else {
      // if no blocked websites are set, use the default list
      const defaultBlockedWebsites = ["instagram.com", "youtube.com"];
      blockedWebsites = defaultBlockedWebsites;
      // save the default websites to storage
      await chrome.storage.local.set({
        blockedWebsites: defaultBlockedWebsites,
      });
      console.log("default blocked websites loaded:", defaultBlockedWebsites);
    }
  } catch (error) {
    console.error("error loading blocked websites:", error);
  }
}

// check if a url should be redirected
function shouldRedirectUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blockedWebsites.some((site) => hostname.includes(site));
  } catch (error) {
    return false;
  }
}

// handle tab updates and redirect if needed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    // check if extension is enabled
    const result = await chrome.storage.local.get("extensionEnabled");
    const extensionEnabled = result.extensionEnabled !== false;

    if (extensionEnabled && shouldRedirectUrl(tab.url)) {
      // redirect to the motivation page
      // todo: replace with your actual vercel url once deployed
      const motivationUrl = "https://www.youtube.com";

      try {
        await chrome.tabs.update(tabId, { url: motivationUrl });
        console.log(`redirected from ${tab.url} to motivation page`);
      } catch (error) {
        console.error("error redirecting tab:", error);
      }
    }
  }
});

// handle chrome alarms (this persists across service worker restarts)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pomodoroTimer") {
    console.log("pomodoro alarm triggered!");

    // check to see if timer should legitimately complete
    const timerState = pomodoroTimer.getState();
    if (timerState.isRunning && timerState.timeRemaining <= 0) {
      console.log("timer completed - calling complete()");
      await pomodoroTimer.complete();
    } else if (timerState.isRunning) {
      console.log(
        `timer still running - ${Math.ceil(
          timerState.timeRemaining / 1000 / 60
        )} minutes remaining`
      );
    } else {
      console.log("timer not running - clearing alarm");
      await chrome.alarms.clear("pomodoroTimer");
    }
  }
});

// handle messages from popup (sender parameter is temporary)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case "start":
        pomodoroTimer.start().then(() => {
          sendResponse({ success: true, state: pomodoroTimer.getState() });
        });
        break;

      case "stop":
        pomodoroTimer.stop().then(() => {
          sendResponse({ success: true, state: pomodoroTimer.getState() });
        });
        break;

      case "reset":
        pomodoroTimer.reset().then(() => {
          sendResponse({ success: true, state: pomodoroTimer.getState() });
        });
        break;

      case "getState":
        sendResponse(pomodoroTimer.getState());
        break;

      case "updateSettings":
        pomodoroTimer.updateSettings(request.settings).then(() => {
          sendResponse({ success: true, settings: pomodoroTimer.settings });
        });
        break;

      case "updateBlockedWebsites":
        blockedWebsites = request.websites;
        sendResponse({ success: true });
        break;

      default:
        console.warn("unknown action:", request.action);
        sendResponse({ success: false, error: "unknown action" });
    }
  } catch (error) {
    console.error("error handling message:", error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // keeps message channel open for async response
});

// handle extension startup (restore timer state)
chrome.runtime.onStartup.addListener(async () => {
  console.log("extension started - checking for running timer");
  await pomodoroTimer.loadTimerState();
  await loadBlockedWebsites();
});

// handle extension installation (set up defaults)
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    console.log("extension installed");

    // set default blocked websites for new installations
    const defaultBlockedWebsites = ["instagram.com", "youtube.com"];

    await chrome.storage.local.set({
      extensionEnabled: true,
      timerSettings: pomodoroTimer.settings,
      blockedWebsites: defaultBlockedWebsites,
    });

    // update the blockedWebsites array to include the default websites
    blockedWebsites = defaultBlockedWebsites;

    console.log("default blocked websites set:", defaultBlockedWebsites);
  }
});

// load blocked websites on startup
loadBlockedWebsites();
