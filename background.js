'use strict';

// ============================================================
// SECTION 1: PRS CONFIG
// ============================================================
const CREATE_URL =
  'http://pmp.digitaldividedata.com:8111/prs/index.php?r=productivity/create';
const LIST_URL =
  'http://pmp.digitaldividedata.com:8111/prs/index.php?r=productivity';

const PROJECT_ID_KEY  = 'savedProjectId';
const TASK_ID_KEY     = 'savedTaskId';
const SUBTASK_ID_KEY  = 'savedSubtaskId';

const handledTabs = new Set();
const autoScrapeTabs = new Map();

// ============================================================
// SECTION 2: WAVE CONFIG
// ============================================================
const WAVE_URL = "http://56.228.51.27:8080/employee/fill-productivity";
const TIMER_WATCH_INTERVAL_MINUTES = 1;

const IDLE_CHECK_INTERVAL_MINUTES = 5;
const POST_SHIFT_CHECK_INTERVAL_MINUTES = 10;

const SCHEDULE_DEFAULTS = {
  shiftStart:       "20:00",
  shiftStop:        "05:00",
  firstBreakStart:  "23:30",
  firstBreakStop:   "00:00",
  secondBreakStart: "02:00",
  secondBreakStop:  "02:30"
};

const NOTIFICATION_PREFIXES = [
  "shift-start-",
  "shift-stop-",
  "break-start-",
  "break-end-",
  "stop-blocked-",
  "please-start-",
  "post-shift-"
];

// ============================================================
// SECTION 3: WAVE GLOBAL STATE
// ============================================================
let workingStatus = false;
let scheduleCheckInFlight = null;
let statusCheckInFlight = null;
let suppressStorageReaction = false;

function log(...args) {
  console.log("[BG]", new Date().toISOString(), ...args);
}

// ============================================================
// SECTION 4: PRS TABS / SCRAPING
// ============================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (!tab.url.startsWith(CREATE_URL)) return;
  if (handledTabs.has(tabId)) return;
  handledTabs.add(tabId);

  chrome.tabs.create({ url: LIST_URL, active: false }, (newTab) => {
    if (chrome.runtime.lastError || !newTab) return;
    autoScrapeTabs.set(newTab.id, { openerTabId: tabId });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handledTabs.delete(tabId);
  autoScrapeTabs.delete(tabId);
});

// ============================================================
// SECTION 5: ALARMS
// ============================================================
function ensureTimerWatchAlarm() {
  chrome.alarms.get("timerWatch", (a) => {
    if (!a) {
      chrome.alarms.create("timerWatch", {
        periodInMinutes: TIMER_WATCH_INTERVAL_MINUTES,
        delayInMinutes: TIMER_WATCH_INTERVAL_MINUTES
      });
      log("Created alarm: timerWatch");
    }
  });
}

async function ensureStatusCheckAlarm(periodInMinutes = IDLE_CHECK_INTERVAL_MINUTES) {
  const desired = periodInMinutes === POST_SHIFT_CHECK_INTERVAL_MINUTES
    ? POST_SHIFT_CHECK_INTERVAL_MINUTES
    : IDLE_CHECK_INTERVAL_MINUTES;

  const current = await chrome.alarms.get("statusCheck");
  if (current && current.periodInMinutes === desired) return;

  await chrome.alarms.clear("statusCheck");
  chrome.alarms.create("statusCheck", {
    periodInMinutes: desired,
    delayInMinutes: desired
  });
  log(`statusCheck alarm armed (${desired} min)`);
}

async function recreateAllAlarms() {
  await chrome.alarms.clear("timerWatch");
  await chrome.alarms.clear("statusCheck");

  chrome.alarms.create("timerWatch", {
    periodInMinutes: TIMER_WATCH_INTERVAL_MINUTES,
    delayInMinutes: TIMER_WATCH_INTERVAL_MINUTES
  });
  chrome.alarms.create("statusCheck", {
    periodInMinutes: IDLE_CHECK_INTERVAL_MINUTES,
    delayInMinutes: IDLE_CHECK_INTERVAL_MINUTES
  });

  log("All alarms recreated");
}

// ============================================================
// SECTION 6: NOTIFICATIONS
// ============================================================
function isExtensionNotificationId(id) {
  if (!id) return false;
  return NOTIFICATION_PREFIXES.some((p) => id.startsWith(p));
}

async function clearAllExtensionNotifications() {
  const all = await new Promise((resolve) => {
    chrome.notifications.getAll((list) => {
      if (chrome.runtime.lastError) return resolve({});
      resolve(list || {});
    });
  });

  const ids = Object.keys(all).filter(isExtensionNotificationId);
  await Promise.all(ids.map((id) => new Promise((resolve) => {
    chrome.notifications.clear(id, () => resolve());
  })));

  await chrome.storage.local.remove("currentNotificationId");
  return ids.length;
}

async function verifyIcon() {
  try {
    const url = chrome.runtime.getURL("images/logo64.png");
    const res = await fetch(url);
    if (!res.ok) throw new Error("Icon fetch failed: " + res.status);
    return true;
  } catch (err) {
    console.error("Icon not available:", err.message);
    return false;
  }
}

async function showNotification({ id, title, message, buttons }) {
  await clearAllExtensionNotifications();
  const iconOk = await verifyIcon();

  const options = {
    type: "basic",
    title,
    message,
    contextMessage: "Productivity Assistant",
    priority: 0,
    requireInteraction: true,
    silent: true,
    isClickable: true,
    buttons: buttons || []
  };

  options.iconUrl = iconOk
    ? "images/logo64.png"
    : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5GQmCC";

  return new Promise((resolve) => {
    chrome.notifications.create(id, options, (createdId) => {
      if (chrome.runtime.lastError) {
        console.error("Notification failed:", chrome.runtime.lastError.message);
        return resolve(null);
      }
      log(`Notification created: ${id} — "${title}"`);
      resolve(createdId);
    });
  });
}

async function showShiftStartReminder() {
  const id = "shift-start-" + Date.now();
  await showNotification({
    id,
    title: "🌅 Shift Started",
    message: "Shift has started, please start the timer.",
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({ currentNotificationId: id });
  return id;
}

async function showBreakStartReminder() {
  const id = "break-start-" + Date.now();
  await showNotification({
    id,
    title: "☕ Break Time",
    message: "Break time, stop the timer before leaving your workstation.",
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({ currentNotificationId: id });
  return id;
}

async function showBreakEndReminder() {
  const id = "break-end-" + Date.now();
  await showNotification({
    id,
    title: "⏱️ Break Ended",
    message: "The Break has ended, kindly start the timer.",
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({ currentNotificationId: id });
  return id;
}

async function showShiftStopReminder() {
  const id = "shift-stop-" + Date.now();
  await showNotification({
    id,
    title: "🌇 Shift Ended",
    message: "Your Shift has ended, stop the timer before logging out.",
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({ currentNotificationId: id });
  return id;
}

async function showStopBlockedReminder() {
  const id = "stop-blocked-" + Date.now();
  await showNotification({
    id,
    title: "⚠️ Can't Stop Tracking Yet",
    message: "You can't stop your shift before time, unless permitted by your supervisor.",
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({ currentNotificationId: id });
  return id;
}

async function showPleaseStartWaveTimerReminder() {
  const id = "please-start-" + Date.now();
  await showNotification({
    id,
    title: "⏰ Shift Is On",
    message: "Please start WAVE timer",
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({
    currentNotificationId: id,
    lastPleaseStartAlert: Date.now()
  });
  return id;
}

async function showPostShiftStillWorkingReminder(shiftStopHM) {
  const id = "post-shift-" + Date.now();
  await showNotification({
    id,
    title: "🌇 Shift Ended",
    message: `Shift ended at ${shiftStopHM}, kindly stop the timer if not working`,
    buttons: [{ title: "✔ Dismiss" }, { title: "🚀 Open WAVE" }]
  });
  await chrome.storage.local.set({
    currentNotificationId: id,
    lastPostShiftAlert: Date.now()
  });
  return id;
}

function clearNativeNotification(id) {
  chrome.storage.local.get(["currentNotificationId"], (result) => {
    const target = id || result.currentNotificationId;
    if (target) {
      chrome.notifications.clear(target);
      if (result.currentNotificationId === target) {
        chrome.storage.local.remove("currentNotificationId");
      }
    }
  });
}

// ============================================================
// SECTION 7: TIME HELPERS
// ============================================================
function parseHMToMinutes(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function isWithinWindow(nowMin, startMin, stopMin) {
  if (startMin == null || stopMin == null) return false;
  if (startMin <= stopMin) return nowMin >= startMin && nowMin <= stopMin;
  return nowMin >= startMin || nowMin <= stopMin;
}

function isAtTime(nowMin, targetMin, toleranceMin = 1) {
  if (targetMin == null) return false;
  let diff = nowMin - targetMin;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return Math.abs(diff) <= toleranceMin;
}

function isAfterShiftEnd(nowMin, startMin, stopMin) {
  if (startMin == null || stopMin == null) return false;
  return nowMin > stopMin && nowMin < startMin;
}

async function readScheduleState() {
  const { scheduleState } = await chrome.storage.local.get("scheduleState");
  return scheduleState || {};
}

async function markFired(key) {
  const state = await readScheduleState();
  const day = todayKey();
  state[day] = state[day] || {};
  state[day][key] = true;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  Object.keys(state).forEach((k) => {
    if (k < cutoffKey) delete state[k];
  });

  await chrome.storage.local.set({ scheduleState: state });
}

async function hasFired(key) {
  const state = await readScheduleState();
  const day = todayKey();
  return !!(state[day] && state[day][key]);
}

async function readScheduleConfig() {
  const data = await chrome.storage.local.get(Object.keys(SCHEDULE_DEFAULTS));
  const cfg = { ...SCHEDULE_DEFAULTS };
  Object.keys(SCHEDULE_DEFAULTS).forEach((k) => {
    if (data[k]) cfg[k] = data[k];
  });
  return cfg;
}

// ============================================================
// SECTION 8: WORKING STATUS
// ============================================================
async function readWorkingStatusFromStorage() {
  const { workingStatus: stored } = await chrome.storage.local.get("workingStatus");
  return stored === undefined || stored === null ? false : !!stored;
}

async function normalizeWorkingStatusOnce() {
  const { workingStatus: stored } = await chrome.storage.local.get("workingStatus");
  if (stored === undefined || stored === null) {
    suppressStorageReaction = true;
    try {
      await chrome.storage.local.set({ workingStatus: false });
      workingStatus = false;
      log("Normalized workingStatus → false (was undefined)");
    } finally {
      suppressStorageReaction = false;
    }
  } else {
    workingStatus = !!stored;
  }
  return workingStatus;
}

async function setWorkingStatus(value, reason = "unspecified") {
  const next = !!value;

  if (next === workingStatus) {
    const { workingStatus: stored } = await chrome.storage.local.get("workingStatus");
    if (stored !== next) {
      await chrome.storage.local.set({ workingStatus: next });
      log(`workingStatus STORAGE-SYNC → ${next} (reason: ${reason})`);
    }
    return workingStatus;
  }

  log(`workingStatus CHANGED → ${next} (was ${workingStatus}, reason: ${reason})`);
  workingStatus = next;
  await chrome.storage.local.set({ workingStatus: next });
  return workingStatus;
}

// ============================================================
// SECTION 9: STATUS CHECK
// ============================================================
async function checkStatus() {
  if (statusCheckInFlight) {
    log("checkStatus — already in flight");
    return statusCheckInFlight;
  }

  statusCheckInFlight = (async () => {
    try {
      log("checkStatus START");

      const ws = await readWorkingStatusFromStorage();
      workingStatus = ws;

      const cfg = await readScheduleConfig();
      const nowMin = currentMinutes();

      const shiftStart       = parseHMToMinutes(cfg.shiftStart);
      const shiftStop        = parseHMToMinutes(cfg.shiftStop);
      const firstBreakStart  = parseHMToMinutes(cfg.firstBreakStart);
      const firstBreakStop   = parseHMToMinutes(cfg.firstBreakStop);
      const secondBreakStart = parseHMToMinutes(cfg.secondBreakStart);
      const secondBreakStop  = parseHMToMinutes(cfg.secondBreakStop);

      const inShift = isWithinWindow(nowMin, shiftStart, shiftStop);
      const inFirstBreak  = isWithinWindow(nowMin, firstBreakStart, firstBreakStop);
      const inSecondBreak = isWithinWindow(nowMin, secondBreakStart, secondBreakStop);
      const inAnyBreak = inFirstBreak || inSecondBreak;

      log(
        "checkStatus:",
        "inShift =", inShift,
        "| inAnyBreak =", inAnyBreak,
        "| workingStatus =", workingStatus
      );

      if (!inShift && workingStatus === true && isAfterShiftEnd(nowMin, shiftStart, shiftStop)) {
        await ensureStatusCheckAlarm(POST_SHIFT_CHECK_INTERVAL_MINUTES);
        log("Post-shift + still working → showing reminder");
        await showPostShiftStillWorkingReminder(cfg.shiftStop);
        return true;
      }

      if (inShift && !inAnyBreak && workingStatus === false) {
        await ensureStatusCheckAlarm(IDLE_CHECK_INTERVAL_MINUTES);
        log("Inside shift + idle + not in break → showing 'Please start WAVE timer'");
        await showPleaseStartWaveTimerReminder();
        return true;
      }

      if (!inShift && !inAnyBreak && workingStatus === false) {
        await ensureStatusCheckAlarm(IDLE_CHECK_INTERVAL_MINUTES);
        log("Outside shift + idle → no notification (alarm stays armed)");
        return false;
      }

      if (inShift) {
        await ensureStatusCheckAlarm(IDLE_CHECK_INTERVAL_MINUTES);
      }

      log("checkStatus — no notification fired");
      return false;
    } catch (err) {
      console.error("checkStatus failed:", err);
      return false;
    } finally {
      log("checkStatus END");
    }
  })();

  try {
    return await statusCheckInFlight;
  } finally {
    statusCheckInFlight = null;
  }
}

// ============================================================
// SECTION 10: SCHEDULE EVENTS
// ============================================================
async function checkScheduleEvents() {
  if (scheduleCheckInFlight) {
    log("checkScheduleEvents — already in flight");
    return scheduleCheckInFlight;
  }

  scheduleCheckInFlight = (async () => {
    try {
      const data = await chrome.storage.local.get([
        "workingStatus",
        "shiftStart", "shiftStop",
        "firstBreakStart", "firstBreakStop",
        "secondBreakStart", "secondBreakStop"
      ]);

      const cfg = { ...SCHEDULE_DEFAULTS };
      Object.keys(SCHEDULE_DEFAULTS).forEach((k) => {
        if (data[k]) cfg[k] = data[k];
      });

      const isTracking = !!data.workingStatus;
      workingStatus = isTracking;

      const nowMin = currentMinutes();

      const shiftStart       = parseHMToMinutes(cfg.shiftStart);
      const shiftStop        = parseHMToMinutes(cfg.shiftStop);
      const firstBreakStart  = parseHMToMinutes(cfg.firstBreakStart);
      const firstBreakStop   = parseHMToMinutes(cfg.firstBreakStop);
      const secondBreakStart = parseHMToMinutes(cfg.secondBreakStart);
      const secondBreakStop  = parseHMToMinutes(cfg.secondBreakStop);

      if (shiftStart != null && isAtTime(nowMin, shiftStart) && !isTracking && workingStatus !== true) {
        if (!(await hasFired("shiftStart"))) {
          await markFired("shiftStart");
          await showShiftStartReminder();
          return true;
        }
      }

      if (firstBreakStart != null && isAtTime(nowMin, firstBreakStart)) {
        if (!(await hasFired("firstBreakStart"))) {
          await markFired("firstBreakStart");
          await showBreakStartReminder();
          return true;
        }
      }

      if (firstBreakStop != null && isAtTime(nowMin, firstBreakStop)) {
        if (!(await hasFired("firstBreakStop"))) {
          await markFired("firstBreakStop");
          await showBreakEndReminder();
          return true;
        }
      }

      if (secondBreakStart != null && isAtTime(nowMin, secondBreakStart)) {
        if (!(await hasFired("secondBreakStart"))) {
          await markFired("secondBreakStart");
          await showBreakStartReminder();
          return true;
        }
      }

      if (secondBreakStop != null && isAtTime(nowMin, secondBreakStop)) {
        if (!(await hasFired("secondBreakStop"))) {
          await markFired("secondBreakStop");
          await showBreakEndReminder();
          return true;
        }
      }

      if (shiftStop != null && isAtTime(nowMin, shiftStop) && isTracking) {
        if (!(await hasFired("shiftStop"))) {
          await markFired("shiftStop");
          await showShiftStopReminder();
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error("checkScheduleEvents failed:", err);
      return false;
    }
  })();

  try {
    return await scheduleCheckInFlight;
  } finally {
    scheduleCheckInFlight = null;
  }
}

// ============================================================
// SECTION 11: OPEN WAVE
// ============================================================
function openWaveTab() {
  chrome.tabs.create({ url: WAVE_URL, active: true });
}

// ============================================================
// SECTION 12: NOTIFICATION EVENTS
// ============================================================
chrome.notifications.onButtonClicked.addListener((id, idx) => {
  if (idx === 0) {
    chrome.notifications.clear(id);
    chrome.storage.local.get(["currentNotificationId"], (result) => {
      if (result.currentNotificationId === id) {
        chrome.storage.local.remove("currentNotificationId");
      }
    });
    return;
  }
  if (idx === 1) {
    openWaveTab();
    chrome.notifications.clear(id);
    chrome.storage.local.remove("currentNotificationId");
  }
});

chrome.notifications.onClicked.addListener((id) => {
  openWaveTab();
  chrome.notifications.clear(id);
  chrome.storage.local.remove("currentNotificationId");
});

chrome.notifications.onClosed.addListener((id) => {
  chrome.storage.local.get(["currentNotificationId"], (result) => {
    if (result.currentNotificationId === id) {
      chrome.storage.local.remove("currentNotificationId");
    }
  });
});

// ============================================================
// SECTION 13: MESSAGE HANDLER (merged)
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  // ----- PRS messages -----
  if (message.type === 'PRS_SCRAPE_DONE') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId != null && autoScrapeTabs.has(tabId)) {
      autoScrapeTabs.delete(tabId);
      setTimeout(() => {
        chrome.tabs.remove(tabId, () => {
          void chrome.runtime.lastError;
        });
      }, 800);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PRS_IS_AUTO_SCRAPE_TAB') {
    const tabId = sender.tab && sender.tab.id;
    sendResponse({ auto: tabId != null && autoScrapeTabs.has(tabId) });
    return true;
  }

  if (message.type === 'PRS_GET_PROJECT_ID') {
    chrome.storage.local.get([PROJECT_ID_KEY], (result) => {
      sendResponse({ projectId: result[PROJECT_ID_KEY] ?? null });
    });
    return true;
  }

  if (message.type === 'PRS_SET_PROJECT_ID') {
    const value = message.projectId;
    if (value == null) {
      chrome.storage.local.remove(PROJECT_ID_KEY);
    } else {
      chrome.storage.local.set({ [PROJECT_ID_KEY]: value });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PRS_GET_TASK_ID') {
    chrome.storage.local.get([TASK_ID_KEY], (result) => {
      sendResponse({ taskId: result[TASK_ID_KEY] ?? null });
    });
    return true;
  }

  if (message.type === 'PRS_SET_TASK_ID') {
    const value = message.taskId;
    if (value == null) {
      chrome.storage.local.remove(TASK_ID_KEY);
    } else {
      chrome.storage.local.set({ [TASK_ID_KEY]: value });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PRS_GET_SUBTASK_ID') {
    chrome.storage.local.get([SUBTASK_ID_KEY], (result) => {
      sendResponse({ subtaskId: result[SUBTASK_ID_KEY] ?? null });
    });
    return true;
  }

  if (message.type === 'PRS_SET_SUBTASK_ID') {
    const value = message.subtaskId;
    if (value == null) {
      chrome.storage.local.remove(SUBTASK_ID_KEY);
    } else {
      chrome.storage.local.set({ [SUBTASK_ID_KEY]: value });
    }
    sendResponse({ ok: true });
    return true;
  }

  // ----- WAVE messages (action-based) -----
  if (message.action === "hideNotification") {
    clearNativeNotification();
  } else if (message.action === "launchWave") {
    openWaveTab();
  } else if (message.action === "checkScheduleEvents") {
    checkScheduleEvents().then((fired) => sendResponse({ fired }));
    return true;
  } else if (message.action === "stopBlocked") {
    showStopBlockedReminder();
  } else if (message.action === "setWorkingStatus") {
    setWorkingStatus(message.value, message.reason || "message:setWorkingStatus")
      .then((v) => sendResponse({ workingStatus: v }));
    return true;
  } else if (message.action === "getWorkingStatus") {
    readWorkingStatusFromStorage().then((v) => sendResponse({ workingStatus: v }));
    return true;
  } else if (message.action === "checkStatus") {
    checkStatus().then((fired) => sendResponse({ fired }));
    return true;
  } else if (message.action === "clearAllNotifications") {
    clearAllExtensionNotifications().then((count) => sendResponse({ cleared: count }));
    return true;
  }

  sendResponse({ status: "ok" });
  return true;
});

// ============================================================
// SECTION 14: ALARMS LISTENER
// ============================================================
ensureTimerWatchAlarm();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  log("Alarm fired:", alarm.name);
  ensureTimerWatchAlarm();

  if (alarm.name === "timerWatch") {
    await ensureStatusCheckAlarm(IDLE_CHECK_INTERVAL_MINUTES);
    checkStatus();
    checkScheduleEvents();
  } else if (alarm.name === "statusCheck") {
    checkStatus();
  }
});

// ============================================================
// SECTION 15: IDLE LISTENER
// ============================================================
try {
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((newState) => {
    log("idle state changed:", newState);
    if (newState === "active") {
      checkStatus();
      checkScheduleEvents();
    }
  });
  log("chrome.idle listener attached");
} catch (err) {
  console.error("[BG] Failed to attach chrome.idle listener:", err);
}

// ============================================================
// SECTION 16: STORAGE CHANGE
// ============================================================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.workingStatus) {
    const next = !!changes.workingStatus.newValue;

    if (suppressStorageReaction) {
      log("workingStatus STORAGE-CHANGED ignored (suppressed) →", next);
      workingStatus = next;
      return;
    }

    if (next !== workingStatus) {
      log(`workingStatus STORAGE-CHANGED → ${next} (was ${workingStatus})`);
    }
    workingStatus = next;

    checkScheduleEvents();
    checkStatus();

    if (next === true) {
      ensureStatusCheckAlarm(IDLE_CHECK_INTERVAL_MINUTES);
    }
  }
});

// ============================================================
// SECTION 17: STARTUP / INSTALL
// ============================================================
chrome.runtime.onInstalled.addListener(async (details) => {
  log("onInstalled:", details.reason);

  if (details.reason === "install" || details.reason === "update") {
    verifyIcon();

    const data = await chrome.storage.local.get(Object.keys(SCHEDULE_DEFAULTS));
    const seed = {};
    Object.keys(SCHEDULE_DEFAULTS).forEach((k) => {
      if (data[k] == null) seed[k] = SCHEDULE_DEFAULTS[k];
    });
    if (Object.keys(seed).length > 0) {
      await chrome.storage.local.set(seed);
      log("Seeded schedule defaults");
    }

    await normalizeWorkingStatusOnce();
    await recreateAllAlarms();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  log("onStartup — reloading state and re-arming alarms");

  const data = await chrome.storage.local.get(Object.keys(SCHEDULE_DEFAULTS));
  const seed = {};
  Object.keys(SCHEDULE_DEFAULTS).forEach((k) => {
    if (data[k] == null) seed[k] = SCHEDULE_DEFAULTS[k];
  });
  if (Object.keys(seed).length > 0) {
    await chrome.storage.local.set(seed);
  }

  await normalizeWorkingStatusOnce();
  await recreateAllAlarms();
});

// ============================================================
// SECTION 18: TOP-LEVEL BOOT
// ============================================================
(async () => {
  log("=== Service worker booted ===");

  const data = await chrome.storage.local.get(Object.keys(SCHEDULE_DEFAULTS));
  const seed = {};
  Object.keys(SCHEDULE_DEFAULTS).forEach((k) => {
    if (data[k] == null) seed[k] = SCHEDULE_DEFAULTS[k];
  });
  if (Object.keys(seed).length > 0) {
    await chrome.storage.local.set(seed);
    log("Top-level: seeded schedule defaults");
  }

  ensureTimerWatchAlarm();
  await ensureStatusCheckAlarm(IDLE_CHECK_INTERVAL_MINUTES);
  await normalizeWorkingStatusOnce();

  await checkStatus();
  await checkScheduleEvents();

  log("=== Service worker boot checks complete ===");
})();