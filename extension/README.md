# Study Buddy Extension

A Chrome extension that helps you stay focused by blocking distracting websites and providing a Pomodoro timer.

## Features

### 🍅 Pomodoro Timer

- Customizable work sessions, short breaks, and long breaks
- Visual progress bar and phase indicators
- Session completion notifications with text-to-speech
- Persistent timer state across browser sessions

### 🚫 Website Blocking

- **Dynamic Website Management**: Add and remove websites from your blocked list
- **Current Site Detection**: One-click button to add the website you're currently on
- **Manual Input**: Paste any website URL to add it to your blocked list
- **Smart Validation**: Automatically normalizes URLs (removes protocols, www, etc.)
- **Real-time Updates**: Changes take effect immediately

### 🎛️ Extension Controls

- Toggle the extension on/off with a simple switch
- Settings modal for customizing timer durations
- Clear all blocked websites option

## How to Use

### Adding Websites to Block

1. **Add Current Site**: Click the "Add Current Site" button while on any webpage
2. **Manual Input**: Type a website URL (e.g., "facebook.com") and click "Add"
3. **Enter Key**: Press Enter after typing a website to add it quickly

### Managing Blocked Websites

- View all blocked websites in the list below the input
- Click "Remove" next to any website to unblock it
- Click "Clear All" to remove all blocked websites at once

### Timer Settings

- Click the settings icon (⚙️) next to "Pomodoro Timer"
- Adjust work time, short break, long break, and long break interval
- Settings are automatically saved and applied

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your toolbar

## Technical Details

- **Manifest Version**: 3
- **Storage**: Uses Chrome's local storage for settings and blocked websites
- **Permissions**: Requires tabs, storage, notifications, and scripting permissions
- **Background Script**: Handles timer logic and website blocking
- **Popup Interface**: Provides user interface for all features

## Default Blocked Websites

The extension comes with Instagram and YouTube pre-blocked by default for new installations. You can customize this list by adding or removing websites as needed.

**Default blocked websites:**

- Instagram (instagram.com)
- YouTube (youtube.com)

## Browser Compatibility

- Chrome 88+ (Manifest V3)
- Other Chromium-based browsers (Edge, Brave, etc.)
