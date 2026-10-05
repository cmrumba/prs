<div align="center">

<img src="images/logo128.png" alt="Productivity Assistant logo" width="120" height="120" />

# 🧩 Productivity Assistant

**Productivity-boosting Chrome extension for PRS and WAVE.**

Remembers your form selections · auto-fills your daily productivity entries · paints a live payroll calendar · reminds you to start, pause, and stop your WAVE timer· reminds you to Fill your PRS entries.

<br />

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
[![Chrome](https://img.shields.io/badge/Chrome-Compatible-34A853?style=for-the-badge&logo=googlechrome&logoColor=white)](#)
[![Edge](https://img.shields.io/badge/Edge-Compatible-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)](#)
[![Version](https://img.shields.io/badge/version-1.0-2b5d94?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-f4d03f?style=for-the-badge)](#-license)

<br />

[**Features**](#-features) · [**Installation**](#-installation) · [**How It Works**](#-how-it-works) · [**Architecture**](#-architecture) · [**Roadmap**](#-roadmap) · [**Contributing**](#-contributing) · [**License**](#-license)

</div>

---

## 📖 Overview

**Productivity Assistant** is a single Chrome extension that bundles **two independent functionalities** for the PRS and WAVE web apps:

<table>
  <tr>
    <th width="50%">🧠 PRS Auto-fills</th>
    <th width="50%">⏰ WAVE Timer Reminder</th>
  </tr>
  <tr valign="top">
    <td>

Automates the PRS productivity flow:

- Remembers **Project / Task / Subtask** picks
- Auto-fills common fields on load
- Paints a **live payroll calendar**
- Syncs data from a hidden background tab

    </td>
    <td>

Watches the WAVE fill-productivity page and reminds you to start / pause / stop your timer:

- Tracks one boolean: **`workingStatus`**
- Fires notifications based on your **shift & break schedule**
- Auto-fills the WAVE dropdowns

    </td>
  </tr>
</table>

Both functionalities share the same storage, popup, and service worker. You can use either one, or both together.

---

## 🚀 Installation

<table>
  <tr>
    <th width="50%">Method 1 — `.crx` Drag & Drop <em>(quickest)</em></th>
  </tr>
  <tr>
    <td>

1. Download the `.crx` file from the [**Releases**](../../) page.
2. Open `chrome://extensions` (or Click Settings -> then click Extensions).
3. Enable **Developer mode** (top-right toggle).
4. **Drag** the `.crx` file onto the page.
5. Confirm the prompt.
6. The extension icon appears in the toolbar.
   
>⚠️ Chrome may block `.crx` files for non-Web-Store extensions. If that happens, use **Method 2**.

    </td>
  </tr>
</table>



<table>
  <tr>
    <th width="50%">Method 2 — `.zip` + Developer Mode <em>(recommended)</em></th>
  </tr>
  <tr valign="top">
    <td>
1. Download the `.zip` from the [**Releases**](../../) page.
2. Extract it to a permanent folder.
3. Open `chrome://extensions` (or Click Settings -> then click Extensions).
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked**.
6. Select the extracted folder.
7. The extension icon appears in the toolbar.
 >✅ Works on all platforms, easier to update manually, and won't be blocked by Chrome.
    </td>
  </tr>
</table>
### 📋 Before You Begin

| Requirement | Details |
|---|---|
| **Browser** | Google Chrome |
| **OS** | Windows |
| **Access** | The official GitHub repository for Productivity Assistant |
| **Network** | Ability to reach `pmp.digitaldividedata.com` and `56.228.51.27:8080` |

### ✅ Verify the Installation

- The extension icon appears in the toolbar.
- Click it → the popup opens with the **Current Selections**, **Shift**, and **Breaks** panels.
- Open PRS / WAVE → the content scripts run and the auto-fill kicks in.

### 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| Extension doesn't appear | Make sure **Developer mode** is on and you loaded the right folder |
| `.crx` blocked by Chrome | Use **Method 2 (.zip + Load unpacked)** instead |
| Popup blank | Reload the extension, then reopen the popup |
| No notifications | Check Windows → Settings → System → Notifications → Google Chrome is allowed and Do Not Disturb is off |
| WAVE auto-fill not working | Reload the WAVE page once after install |

### 🔄 Updating the Extension

- **Method 1** — download the new `.crx` and drag it onto `chrome://extensions` again
- **Method 2** — replace the contents of the loaded folder, then click the **Reload** icon on the extension card

### 🗑️ Uninstalling

1. Open `chrome://extensions`
2. Find **Productivity Assistant**
3. Click **Remove**

---
## ✨ Features

### 🧠 PRS Auto-fills

<table>
  <tr>
    <td width="50%" valign="top">

#### Smart Field Memory

Your **Project**, **Task**, and **Subtask** selections are saved automatically and restored the next time you open a create page. Never re-pick the same options again.

- **Project** — restored from storage, or defaults to the first real project
- **Task** — restored only if you've saved one
- **Subtask** — restored only if you've saved one

    </td>
    <td width="50%" valign="top">

#### Auto-fill on Load

Four common fields are filled the instant the page loads — but only if they're empty, so your own edits are never overwritten.

| Field | Value |
|---|---|
| `startTime` | `08:00` |
| `endTime` | `17:00` |
| `breaktime` | `01:00` |
| `units_completed` | `480` |

    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">

#### 📅 Live Productivity Calendar

A floating, draggable widget paints a color-coded calendar so you can see your month at a glance.

| Color | Meaning |
|---|---|
| 🔴 Red | Weekday, no PRS entry |
| 🟢 Green | PRS filled |
| 🔵 Blue | Saturday worked (> 2h) |
| 🟡 Yellow | Warning state |
| ⚪ Gray | Weekend / older / upcoming |

    </td>
    <td width="50%" valign="top">

#### ⚠️ Warning States

Two conditions trigger a **yellow** day cell and a popup warning:

- **Elongated break** — break exceeds **1 hour**
- **Excess hours** — daily hours exceed **11 hours**

Sundays with entries are flagged as errors too.

    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">

#### 💰 Payroll Summary

Automatic **25th → 24th** pay-period math:

- **Days present** — weekdays filled + qualifying Saturdays
- **Daily rate** — `KES 25,000 ÷ weekdays in period`
- **Payroll** — `daysPresent × dailyRate`

Previous pay period hides during the 1st–24th window.

    </td>
    <td width="50%" valign="top">

#### 🔄 Background Sync

The extension silently opens a hidden list-page tab, scrapes **every page** of your productivity table, aggregates rows by `(task, date)`, and syncs the calendar — no manual action required.

    </td>
  </tr>
</table>

---

### ⏰ WAVE Timer Reminder

A **self-healing Chrome extension** that reminds you to start, pause, and stop your WAVE timer — based on your shift and break schedule.

> Everything the WAVE functionality does revolves around **one boolean** stored in `chrome.storage.local`: **`workingStatus`**.

| Value | Meaning |
|:---:|---|
| 🟢 `true` | The user is working (WAVE timer is running) |
| ⚪ `false` | The user is not working |

> Every change to `workingStatus` is logged to the service worker console with the **old value**, **new value**, **reason**, and **timestamp**.

#### 🔄 How `workingStatus` Is Set

The content script observes two buttons on the WAVE page:

- 🎬 `#trackBtn` — toggles between **"Start Tracking"** and **"Stop Tracking"**
- ☕ `#pauseBtn` — toggles between **"Pause (Break)"** and **"Resume Tracking"**

| Button state | `workingStatus` |
|---|:---:|
| `pauseBtn` visible + `"Pause (Break)"` | 🟢 **`true`** |
| `pauseBtn` visible + `"Resume Tracking"` | ⚪ **`false`** |
| `trackBtn` visible + `"Start Tracking"` | ⚪ **`false`** |
| `trackBtn` visible + transition `"Stop Tracking"` → `"Start Tracking"` | ⚪ **`false`** |

> On page load, both buttons are evaluated **immediately**, again at **+1 s**, and again at **+3 s** — so the state is captured even if the page re-renders after first paint.

#### 📅 The Schedule

| Window | Default |
|---|---|
| 🕗 **Shift** | `20:00` → `05:00` |
| ☕ **First break** | `00:00` → `00:30` |
| ☕ **Second break** | `02:30` → `03:00` |

All comparisons use **minutes-since-midnight**. Overnight windows are supported. Editable in the popup.

#### ⏱️ Alarms

| Alarm | Period | Purpose |
|---|:---:|---|
| 🔔 `timerWatch` | **1 min** | Fires schedule-event checks; ensures `statusCheck` exists; runs `checkStatus()` |
| 🔔 `statusCheck` | **5 min** *(or 10 after shift end)* | Fires the periodic reminders |

Both alarms are created at every service-worker boot, on browser start, on install/update, and on every `timerWatch` tick (self-heal).

#### 🔔 Notifications

All notifications are **Windows-native Chrome notifications** with two buttons: **✔ Dismiss** and **🚀 Open WAVE**. They are `silent: true` and `priority: 0`, so they don't show on the lock screen.

| Notification | When it fires | Condition |
|---|---|---|
| 🌅 **Shift Started** | At `shiftStart` | `workingStatus === false` |
| ☕ **Break Time** | At `firstBreakStart` and `secondBreakStart` | *Always fires* |
| ⏱️ **Break Ended** | At `firstBreakStop` and `secondBreakStop` | *Always fires* |
| 🌇 **Shift Ended** | At `shiftStop` | `workingStatus === true` |
| ⏰ **Shift Is On** — *"Please start WAVE timer"* | Every 5 minutes | Inside shift + `workingStatus === false` + not during a break |
| 🌇 **Shift ended at {HH:MM}, kindly stop the timer** | Every 10 minutes after shift end | `workingStatus === true` |
| ⚠️ **Can't Stop Tracking Yet** | Stop Tracking clicked inside a protected window | Message from content script |

> 🧹 **Every new notification clears all existing extension notifications first.** There is never more than one extension notification visible at a time.

> 📌 **Once-per-day guard** — shift-start, all four break notifications, and shift-stop fire at most once per day, keyed by `scheduleState`. The **⏰ Please start WAVE timer** and **🌇 Shift ended…** reminders repeat on their cadence.

#### 🔍 The Two Periodic Checks

**🕐 `checkScheduleEvents()` — every minute:** evaluates the current minute against `shiftStart`, `shiftStop`, and the four break times (±1 min tolerance).

**🕔 `checkStatus()` — every 5 minutes *(or 10)*:**

| Mode | Condition | Action |
|---|---|---|
| 🅰️ **Idle during shift** | Inside shift + `workingStatus === false` + not during break | **⏰ Please start WAVE timer** |
| 🅱️ **Post-shift working** | After shift end + `workingStatus === true` | **🌇 Shift ended at {HH:MM}…** (10-min cadence) |
| 🅲 **Outside shift, idle** | Outside shift + `workingStatus === false` + not during break | No notification (alarm stays armed) |

#### 💤 Idle Detection

```javascript
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === "active") {
    checkStatus();
    checkScheduleEvents();
  }
});
```

When the user **unlocks their screen**, both checks run immediately.

#### ✍️ WAVE Auto-Fill

On page load, the content script restores the user's last-selected **project / task / subtask** from storage:

1. ⏳ Waits up to **3–4 seconds** for each `<select>` to populate
2. ↩️ Restores the saved value if it exists
3. ➡️ Falls back to the **first available option** otherwise

Retries up to **3 times**, **2 s apart**. Every change is written back to storage with its display name. While `workingStatus === true`, selections refresh **every 2 seconds**.

---

## 🪟 The Popup

The popup is **shared by both functionalities** and shows:

- 🟢 **Status chip** (*Working* / *Not working*) driven by `workingStatus`
- 📋 Current **project / task / subtask** names
- ⏰ Editable **shift and break times** (with a *"✅ Saved"* indicator)
- 🚀 **Launch** button that opens WAVE and closes the popup

> Any click anywhere in the popup **clears all extension notifications**.

---

## 🏗️ Architecture

<table>
  <tr>
    <th>Component</th>
    <th>File</th>
    <th>Role</th>
  </tr>
  <tr>
    <td>🔧 **Service Worker**</td>
    <td>`background.js`</td>
    <td>Owns the schedule, the state, and all notifications</td>
  </tr>
  <tr>
    <td>🌐 **Content Scripts**</td>
    <td>`prs-content.js` · `wave-content.js`</td>
    <td>Injected into the PRS / WAVE pages; observe DOM, mirror state into storage</td>
  </tr>
  <tr>
    <td>🪟 **Popup**</td>
    <td>`popup.html` / `popup.js`</td>
    <td>Shows current status, current selections, and shift/break editors</td>
  </tr>
  <tr>
    <td>🎨 **Styles**</td>
    <td>`styles.css`</td>
    <td>Glossy popup theme and in-page widget styling</td>
  </tr>
</table>

---

## 🗄️ Storage Keys

| Key | Site | Purpose |
|---|---|---|
| `savedProjectId` / `savedTaskId` / `savedSubtaskId` | PRS | Persisted dropdown selections |
| `prsCalendar` | PRS | Scraped calendar data |
| `workingStatus` | WAVE | Single source of truth for timer state |
| `assignedProject*` / `assignedTask*` / `assignedSubtask*` | WAVE | Live WAVE form selections |
| `shiftStart`, `shiftStop`, `firstBreak*`, `secondBreak*` | WAVE | Schedule config |
| `scheduleState` | WAVE | Once-per-day notification fired flags |
| `currentNotificationId` | WAVE | Currently displayed notification ID |
| `lastPleaseStartAlert` / `lastPostShiftAlert` | WAVE | Reminder cooldown timestamps |

---

## 🛡️ Reliability Mechanisms (WAVE)

1. 🔁 **Top-level boot IIFE** — runs on every service-worker boot (install, update, reload, browser start, first wake-up)
2. ⏱️ **`timerWatch` every minute** — the reliable heartbeat
3. 📥 **Storage change listener** — re-evaluates on every `workingStatus` change
4. 💤 **`chrome.idle`** — re-evaluates on screen unlock
5. 🩹 **Self-healing alarms** — recreated on every tick
6. 🔒 **Pure reads in `checkStatus`** — no side effects, no races
7. 🧹 **Prefix-scoped notification clearing** — only the extension's own notifications are cleared

---


## 🎬 End-to-End Example (WAVE)

> Shift `20:00 → 05:00` · First break `00:00 → 00:30` · Second break `02:30 → 03:00`

| Time | Event | `workingStatus` | Notification |
|:---:|---|:---:|---|
| `19:55` | — | ⚪ `false` | — |
| `20:00` | Shift starts | ⚪ `false` | 🌅 Shift Started |
| `20:05` | 5-min tick | ⚪ `false` | ⏰ Please start WAVE timer |
| `20:15` | User clicks **Start Tracking** | ⚪ `false` | — |
| `20:30` | User clicks **Pause (Break)** | 🟢 `true` | — |
| `00:00` | First break starts | 🟢 `true` | ☕ Break Time |
| `00:15` | User clicks **Resume Tracking** | ⚪ `false` | — |
| `00:30` | First break ends | ⚪ `false` | ⏱️ Break Ended |
| `02:30` | Second break starts | 🟢 `true` | ☕ Break Time |
| `03:00` | Second break ends | ⚪ `false` | ⏱️ Break Ended |
| `03:05` | 5-min tick | ⚪ `false` | ⏰ Please start WAVE timer |
| `05:00` | Shift ends | ⚪ `false` | — |
| **Alt scenario** | | | |
| `05:00` | Shift ends | 🟢 `true` | 🌇 Shift Ended |
| `05:10` | Still working | 🟢 `true` | 🌇 Shift ended at 05:00… |
| `05:30` | User clicks **Resume Tracking** | ⚪ `false` | — |

---

## 🚀 Roadmap

### 📊 Supervisor & Team Lead Dashboard

<div align="center">

| Feature | Description |
|---|---|
| 🧑‍💼 **Supervisor Portal** | Web dashboard where supervisors log in with their team code to view real-time status of every employee. |
| 🟢 **Live Attendance** | See who is **Working**, on **Break**, or **Offline** — updated every 30 seconds. |
| ⚠️ **Idle Alerts** | Highlight employees inside their shift window who haven't started the WAVE timer for > 15 min. |
| 📉 **Compliance Report** | Daily summary: % shift time tracked, missed days, average break duration. |
| 🔔 **One-Click Nudge** | Push a notification to a specific employee's browser: *"Please start your timer."* |
| 📤 **CSV Export** | Export attendance and productivity per team / week / month. |
| 🎯 **Team Heatmap** | Calendar-style heatmap of team-wide productivity. |
| 📈 **Leaderboards** | Optional gamified rankings by hours logged and units completed. |

</div>

### 🛠 Other Improvements

- [ ] **Dark mode** for the popup and in-page widgets
- [ ] **Localisation** — additional languages
- [ ] **Voice reminders** — optional TTS for shift start/stop
- [ ] **Slack / Teams integration** — push reminders to team channels

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">

### ⚡ Developer

This tool was developed by **Collins Mrumba**

**[⬆ Back to Top](#-productivity-assistant)**

<sub>Made with ❤️ for teams that value their time.</sub>

</div>
