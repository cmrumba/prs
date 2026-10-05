// ============================================================
// URLs
// ============================================================
const WAVE_URL = "http://56.228.51.27:8080/employee/fill-productivity";
const PRS_LOGIN_URL =
  'http://pmp.digitaldividedata.com:8111/prs/index.php?r=user/login';

// ============================================================
// Shift / break defaults
// ============================================================
const DEFAULTS = {
  shiftStart:       "20:00",
  shiftStop:        "05:00",
  firstBreakStart:  "00:00",
  firstBreakStop:   "00:30",
  secondBreakStart: "02:30",
  secondBreakStop:  "03:00"
};

const timeFields = {
  shiftStart:       document.getElementById('shiftStart'),
  shiftStop:        document.getElementById('shiftStop'),
  firstBreakStart:  document.getElementById('firstBreakStart'),
  firstBreakStop:   document.getElementById('firstBreakStop'),
  secondBreakStart: document.getElementById('secondBreakStart'),
  secondBreakStop:  document.getElementById('secondBreakStop')
};

const displayEls = {
  project: document.getElementById('projectNameValue'),
  task:    document.getElementById('taskNameValue'),
  subtask: document.getElementById('subtaskNameValue')
};

const saveIndicator = document.getElementById('saveIndicator');

// ============================================================
// Notification cleanup
// ============================================================
function clearAllExtensionNotifications() {
  try {
    chrome.runtime.sendMessage({ action: "clearAllNotifications" }, () => {
      void chrome.runtime.lastError;
    });
  } catch (e) { /* ignore */ }
}

// ============================================================
// Time fields: load / save
// ============================================================
async function loadSavedTimeFields() {
  const keys = Object.keys(timeFields);
  const data = await chrome.storage.local.get(keys);

  const seed = {};
  Object.keys(DEFAULTS).forEach((k) => {
    if (data[k] == null) seed[k] = DEFAULTS[k];
  });
  if (Object.keys(seed).length > 0) {
    await chrome.storage.local.set(seed);
    Object.assign(data, seed);
  }

  keys.forEach((k) => {
    if (data[k] != null) timeFields[k].value = data[k];
  });
}

async function persistTimeFields() {
  const payload = {};
  Object.keys(timeFields).forEach((k) => {
    payload[k] = timeFields[k].value.trim();
  });
  await chrome.storage.local.set(payload);

  saveIndicator.classList.add('show');
  clearTimeout(persistTimeFields._t);
  persistTimeFields._t = setTimeout(() => {
    saveIndicator.classList.remove('show');
  }, 1000);
}

let saveDebounce = null;
function scheduleSave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(persistTimeFields, 400);
}

Object.values(timeFields).forEach((input) => {
  input.addEventListener('input', scheduleSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(saveDebounce);
      persistTimeFields();
    }
  });
  input.addEventListener('blur', () => {
    clearTimeout(saveDebounce);
    persistTimeFields();
  });
});

// ============================================================
// Selection display
// ============================================================
function setDisplay(el, text) {
  if (!el) return;
  const t = (text || '').trim();
  if (t) {
    el.textContent = t;
    el.classList.remove('empty');
  } else {
    el.textContent = '—';
    el.classList.add('empty');
  }
}

async function updateSelectionsFromStorage() {
  const data = await chrome.storage.local.get([
    'assignedProject', 'assignedTask', 'assignedSubtask',
    'assignedProjectName', 'assignedTaskName', 'assignedSubtaskName'
  ]);

  setDisplay(displayEls.project, data.assignedProjectName || data.assignedProject);
  setDisplay(displayEls.task,    data.assignedTaskName    || data.assignedTask);
  setDisplay(displayEls.subtask, data.assignedSubtaskName || data.assignedSubtask);
}

async function requestFreshSelectionsFromWaveTab() {
  try {
    const tabs = await chrome.tabs.query({ url: WAVE_URL + "*" });
    if (tabs.length === 0) return;
    await chrome.tabs.sendMessage(tabs[0].id, { action: "fetchCurrentSelections" });
  } catch (err) {
    // Content script may not be loaded yet on that tab — fine
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const keys = ['assignedProject', 'assignedTask', 'assignedSubtask',
                'assignedProjectName', 'assignedTaskName', 'assignedSubtaskName'];
  if (keys.some((k) => changes[k])) {
    updateSelectionsFromStorage();
  }
  if (changes.workingStatus) {
    renderWorkingStatus(changes.workingStatus.newValue);
  }
});

// ============================================================
// Action buttons
// ============================================================
document.getElementById('launchWave').addEventListener('click', () => {
  clearAllExtensionNotifications();
  chrome.runtime.sendMessage({ action: "launchWave" });
  window.close();
});

document.getElementById('openPrsBtn').addEventListener('click', () => {
  clearAllExtensionNotifications();
  chrome.tabs.create(
    { url: PRS_LOGIN_URL, active: true },
    () => window.close()
  );
});

// ============================================================
// Any click in popup clears notifications
// ============================================================
document.addEventListener('click', () => {
  clearAllExtensionNotifications();
}, true);

clearAllExtensionNotifications();

// ============================================================
// Working-status chip
// ============================================================
function renderWorkingStatus(workingStatus) {
  const el = document.getElementById('trackingState');
  if (!el) return;

  if (workingStatus === undefined || workingStatus === null) {
    el.textContent = '⏳ Checking working status…';
    el.className = 'state-unknown';
    return;
  }

  if (workingStatus === true) {
    el.textContent = '🟢 Working';
    el.className = 'state-tracking';
  } else {
    el.textContent = '⚪ Not working';
    el.className = 'state-idle';
  }
}

async function updateWorkingStatus() {
  const data = await chrome.storage.local.get(['workingStatus']);
  renderWorkingStatus(data.workingStatus);
}

// ============================================================
// Initialize
// ============================================================
loadSavedTimeFields();
updateWorkingStatus();
updateSelectionsFromStorage();
requestFreshSelectionsFromWaveTab();