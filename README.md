<div align="center">

# ⏰ WAVE Timer Reminder

**A self-healing Chrome extension that reminds you to start, pause, and stop your WAVE timer — based on your shift and break schedule.**

[![Manifest](https://img.shields.io/badge/Manifest-V3-blue?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/version-1.0-success?style=for-the-badge)]()
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)]()
[![License](https://img.shields.io/badge/license-Internal-lightgrey?style=for-the-badge)]()

</div>

---

## 📖 Overview

**WAVE Timer Reminder** is a Chrome extension that watches the WAVE productivity page and reminds the user to start, pause, and stop their timer based on a configurable shift and break schedule. It also auto-fills and remembers the project, task, and subtask dropdowns on that page.

The extension has three components:

| Component | File | Role |
|---|---|---|
| 🔧 **Service Worker** | `background.js` | Owns the schedule, the state, and all notifications |
| 🌐 **Content Script** | `content.js` | Injected into the WAVE page; observes buttons & dropdowns, mirrors state into storage |
| 🪟 **Popup** | `popup.html` / `popup.js` | Shows current status, current project/task/subtask, and shift/break editors |

---

## 🎯 The Single Source of Truth — `workingStatus`

Everything the extension does revolves around **one boolean** stored in `chrome.storage.local`:

| Value | Meaning |
|:---:|---|
| 🟢 `true` | The user is working (WAVE timer is running) |
| ⚪ `false` | The user is not working |

> Every change to `workingStatus` is logged to the service worker console with the **old value**, **new value**, **reason**, and **timestamp**.

The extension does **not** use `waveTrackingState` or `isTracking` — `workingStatus` is the only state variable.

---

## 🔄 How `workingStatus` Is Set

The content script runs on the WAVE page and observes two buttons:

- 🎬 `#trackBtn` — toggles between **"Start Tracking"** and **"Stop Tracking"**
- ☕ `#pauseBtn` — toggles between **"Pause (Break)"** and **"Resume Tracking"**

A `MutationObserver` watches for `class`, `disabled`, `style`, `childList`, and `characterData` changes. Whenever the DOM mutates, the content script evaluates the buttons and writes `workingStatus` if it changed:

| Button state | `workingStatus` |
|---|:---:|
| `pauseBtn` visible + `"Pause (Break)"` | 🟢 **`true`** |
| `pauseBtn` visible + `"Resume Tracking"` | ⚪ **`false`** |
| `trackBtn` visible + `"Start Tracking"` | ⚪ **`false`** |
| `trackBtn` visible + transition `"Stop Tracking"` → `"Start Tracking"` | ⚪ **`false`** |

> On page load, the content script evaluates both buttons **immediately** (synchronously), again at **+1 s**, and again at **+3 s** — so the state is captured even if the page re-renders after first paint.

The service worker's `chrome.storage.onChanged` listener picks up each write and re-evaluates the schedule immediately.

---

## 📅 The Schedule

Four time windows, stored in `chrome.storage.local`:

| Window | Default |
|---|---|
| 🕗 **Shift** | `20:00` → `05:00` |
| ☕ **First break** | `00:00` → `00:30` |
| ☕ **Second break** | `02:30` → `03:00` |

All comparisons use **minutes-since-midnight**. Overnight windows (`start > stop`) are supported.

The user edits these in the popup. Changes are saved to storage immediately (debounced).

---

## ⏱️ Alarms

Two `chrome.alarms` drive the extension:

| Alarm | Period | Purpose |
|---|:---:|---|
| 🔔 `timerWatch` | **1 min** | Fires schedule-event checks; ensures the `statusCheck` alarm exists; runs `checkStatus()` every minute |
| 🔔 `statusCheck` | **5 min** *(or 10 after shift end)* | Fires the periodic reminders |

Both alarms are created:

- ✅ At every service-worker boot (top-level IIFE)
- ✅ On browser start (`chrome.runtime.onStartup`)
- ✅ On install / update (`chrome.runtime.onInstalled`)
- ✅ On every `timerWatch` tick (self-heal)

> The alarms are **never** cleared by `checkStatus()`. They stay armed as long as the browser is running, so the reminder cadence is guaranteed.

---

## 🔔 Notifications

All notifications are **Windows-native Chrome notifications** with two buttons:

- ✔ **Dismiss** — closes the notification
- 🚀 **Open WAVE** — opens the WAVE page and clears the notification

Created with `silent: true` and `priority: 0` so Windows does **not** show them on the lock screen. They stay in the Action Center until dismissed (`requireInteraction: true`).

### Notification Types

| Notification | When it fires | Condition |
|---|---|---|
| 🌅 **Shift Started** | At `shiftStart` | `workingStatus === false` |
| ☕ **Break Time** | At `firstBreakStart` and `secondBreakStart` | *No condition — always fires* |
| ⏱️ **Break Ended** | At `firstBreakStop` and `secondBreakStop` | *No condition — always fires* |
| 🌇 **Shift Ended** | At `shiftStop` | `workingStatus === true` |
| ⏰ **Shift Is On** — *"Please start WAVE timer"* | Every 5 minutes | Inside shift + `workingStatus === false` + not during a break |
| 🌇 **Shift ended at {HH:MM}, kindly stop the timer** | Every 10 minutes after shift end | `workingStatus === true` |
| ⚠️ **Can't Stop Tracking Yet** | When the user clicks Stop Tracking inside a protected window | Message from content script |

### 🧹 How Notifications Are Created

Every call to `showNotification()` first **clears all existing extension notifications** (matched by ID prefix) and **then** creates the new one. This means:

- 🟢 There is **never more than one** extension notification visible at a time.
- 🟢 A new reminder **always replaces** the previous one, even if the previous one was minimized or hidden.

### 📌 Once-Per-Day Guard

Shift-start, all four break notifications, and shift-stop use a **day-keyed** `scheduleState` in storage, so each fires at most **once per day**.

The **⏰ Please start WAVE timer** and **🌇 Shift ended…** reminders are **not** once-per-day — they repeat on their 5- or 10-minute cadence as long as the condition holds.

---

## 🔍 The Two Periodic Checks

### 🕐 `checkScheduleEvents()` — every minute

Evaluates the current minute against `shiftStart`, `shiftStop`, and the four break times. Uses a **±1 minute tolerance**. Fires the shift-start, break, and shift-stop notifications.

### 🕔 `checkStatus()` — every 5 minutes *(or 10)*

Evaluates the broader conditions:

| Mode | Condition | Action |
|---|---|---|
| 🅰️ **Idle during shift** | Inside shift + `workingStatus === false` + not during break | **⏰ Please start WAVE timer** |
| 🅱️ **Post-shift working** | After shift end + `workingStatus === true` | **🌇 Shift ended at {HH:MM}…**, and switches cadence to 10 min |
| 🅲 **Outside shift, idle** | Outside shift + `workingStatus === false` + not during break | No notification (alarm stays armed at 5 min) |

> `checkStatus()` reads `workingStatus` **directly from storage** (pure read, no side effects) so it cannot re-enter or race with itself.

---

## 💤 Idle Detection

The extension uses `chrome.idle` to re-check when the screen unlocks:

```javascript
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === "active") {
    checkStatus();
    checkScheduleEvents();
  }
});
```

When the user **unlocks their screen**, both checks run immediately — so a reminder is displayed right away if one is due, without waiting for the next 5-minute tick.

---

## ✍️ Auto-Fill of the Productivity Page

On page load, the content script restores the user's last-selected project / task / subtask from storage:

1. ⏳ Waits up to **3–4 seconds** for each `<select>` to populate.
2. ↩️ Restores the saved value if it exists.
3. ➡️ Falls back to the **first available option** if the saved value no longer exists.

The script retries up to **three times**, **2 seconds apart**, if the dropdowns aren't ready.

Every change to any of the three dropdowns is written back to storage, along with the **display name** (so the popup can show it).

> While `workingStatus === true`, the current selections are refreshed **every 2 seconds**, so the popup always reflects what the user is working on.

---

## 🪟 The Popup

The popup shows:

- 🟢 **Status chip** (*Working* / *Not working*) driven by `workingStatus`
- 📋 Current **project / task / subtask** names
- ⏰ Editable **shift and break times** (with a *"✅ Saved"* indicator)
- 🚀 **Launch** button that opens WAVE and closes the popup

> Any click anywhere in the popup **clears all extension notifications**, so the user doesn't see stale reminders after interacting with the extension.

---

## 🗄️ Storage Keys

| Key | Type | Written by |
|---|---|---|
| `workingStatus` | `boolean` | content + background |
| `shiftStart`, `shiftStop` | `"HH:MM"` | popup |
| `firstBreakStart`, `firstBreakStop` | `"HH:MM"` | popup |
| `secondBreakStart`, `secondBreakStop` | `"HH:MM"` | popup |
| `assignedProject`, `assignedTask`, `assignedSubtask` | `string` | content |
| `assignedProjectName`, `assignedTaskName`, `assignedSubtaskName` | `string` | content |
| `scheduleState` | `object (day-keyed)` | background |
| `currentNotificationId` | `string` | background |
| `lastPleaseStartAlert` | `number (timestamp)` | background |
| `lastPostShiftAlert` | `number (timestamp)` | background |

---

## 🛡️ Reliability Mechanisms

The extension is designed to survive the constraints of a **Manifest V3 service worker**:

1. 🔁 **Top-level boot IIFE** — runs on every service-worker boot (install, update, reload, browser start, first wake-up). Seeds defaults, ensures alarms, loads status, runs the initial checks.
2. ⏱️ **`timerWatch` every minute** — re-arms `statusCheck` and runs both checks. **The reliable heartbeat.**
3. 📥 **Storage change listener** — re-evaluates the schedule immediately whenever `workingStatus` changes.
4. 💤 **`chrome.idle`** — re-evaluates on screen unlock.
5. 🩹 **Self-healing alarms** — `ensureTimerWatchAlarm()` and `ensureStatusCheckAlarm()` are called on every alarm tick, so dropped alarms are recreated automatically.
6. 🔒 **Pure reads in `checkStatus`** — no side-effect writes, so no re-entrancy or storage races.
7. 🧹 **Prefix-scoped notification clearing** — only the extension's own notifications are cleared; nothing else in the OS is touched.

---

## 🎬 End-to-End Example

> Shift `20:00 → 05:00` · First break `00:00 → 00:30` · Second break `02:30 → 03:00`

| Time | Event | `workingStatus` | Notification |
|:---:|---|:---:|---|
| `19:55` | — | ⚪ `false` | — |
| `20:00` | Shift starts | ⚪ `false` | 🌅 Shift Started |
| `20:05` | 5-min tick | ⚪ `false` | ⏰ Please start WAVE timer |
| `20:10` | 5-min tick | ⚪ `false` | ⏰ Please start WAVE timer |
| `20:15` | User clicks **Start Tracking** | ⚪ `false` | — |
| `20:30` | User clicks **Pause (Break)** | 🟢 `true` | — |
| `00:00` | First break starts | 🟢 `true` | ☕ Break Time |
| `00:15` | User clicks **Resume Tracking** | ⚪ `false` | — |
| `00:30` | First break ends | ⚪ `false` | ⏱️ Break Ended |
| `02:30` | Second break starts | 🟢 `true` | ☕ Break Time |
| `03:00` | Second break ends | ⚪ `false` | ⏱️ Break Ended |
| `03:05` | 5-min tick | ⚪ `false` | ⏰ Please start WAVE timer |
| `05:00` | Shift ends | ⚪ `false` | — *(shift-stop only fires when working)* |
| `05:05` | Outside shift | ⚪ `false` | — *(alarm stays armed)* |
| **Alt scenario** | | | |
| `05:00` | Shift ends | 🟢 `true` | 🌇 Shift Ended |
| `05:10` | Still working | 🟢 `true` | 🌇 Shift ended at 05:00… *(10-min cadence)* |
| `05:20` | Still working | 🟢 `true` | 🌇 Shift ended at 05:00… |
| `05:30` | User clicks **Resume Tracking** | ⚪ `false` | — |

---

## ✨ Summary

**WAVE Timer Reminder** is a **self-healing MV3 extension** that:

- 🎯 Tracks a single boolean (`workingStatus`) derived from the WAVE page's buttons.
- ⏱️ Uses two alarms *(1-minute heartbeat, 5/10-minute reminder)* plus `chrome.storage.onChanged` and `chrome.idle` to **guarantee** the reminders fire.
- 🧹 **Always clears existing extension notifications** before creating a new one — the user never misses a reminder because an old notification was hidden.
- 🔔 Provides Windows-native notifications with **Dismiss** and **Open WAVE** actions, suppressed from the lock screen.
- ✍️ Auto-fills the productivity dropdowns and mirrors the current selection into the popup.
- 🪟 Lets the user configure the shift and break windows from the popup.
- 📝 Logs **every state change, alarm fire, and notification** with timestamps for easy debugging.

<div align="center">


</div>

**Storage keys used:**

| Key | Site | Purpose |
|---|---|---|
| `savedProjectId` / `savedTaskId` / `savedSubtaskId` | PRS | Persisted dropdown selections |
| `prsCalendar` | PRS | Scraped calendar data |
| `workingStatus` | WAVE | Single source of truth for timer state |
| `assignedProject*` / `assignedTask*` / `assignedSubtask*` | WAVE | Live WAVE form selections |
| `shiftStart`, `shiftStop`, `firstBreak*`, `secondBreak*` | WAVE | Schedule config |
| `scheduleState` | WAVE | Once-per-day notification fired flags |

---

## 🚀 Roadmap

The extension is functional today, but there's plenty of room to grow. Below are planned enhancements.

### 📊 Supervisor & Team Lead Dashboard

> **Goal:** Give team leads a bird's-eye view of team attendance and tool usage.

<div align="center">

| Feature | Description |
|---|---|
| 🧑‍💼 **Supervisor Portal** | A web dashboard (or extension page) where supervisors log in with their team code to view real-time status of every employee. |
| 🟢 **Live Attendance** | See who is currently **Working**, on **Break**, or **Offline** — updated every 30 seconds. |
| ⚠️ **Idle Alerts** | Highlight employees who are inside their shift window but have **not started the WAVE timer** for more than 15 minutes. |
| 📉 **Compliance Report** | Daily summary: % of shift time tracked, number of missed days, average break duration. |
| 🔔 **One-Click Nudge** | Supervisors can push a notification directly to a specific employee's browser: *"Please start your timer."* |
| 📤 **CSV Export** | Export attendance and productivity data per team, per week, per month. |
| 🎯 **Team Heatmap** | A calendar-style heatmap showing team-wide productivity per day. |
| 📈 **Leaderboards** | Optional gamified view ranking team members by hours logged and units completed. |

</div>

### 🛠 Other Improvements

- [ ] **Dark mode** for the popup and the productivity panel
- [ ] **Localisation** — support for additional languages
- [ ] **Voice reminders** — optional TTS announcements for shift start/stop
- [ ] **Slack / Teams integration** — push reminders to team channels

---

## 🤝 Contributing

Contributions are welcome! If you have an idea for a feature or spot a bug:

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

### ⚡ Developer. 
This tool was developed by **Collins Mrumba**

**[⬆ Back to Top](#-productivity-assistant)**

<sub>Made with ❤️ for teams that value their time.</sub>

</div>
