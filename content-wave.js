// Content script - waits for messages to show/hide the popup
// AND auto-selects cascading dropdowns on the WAVE fill-productivity page.
//
// Single source of truth: `workingStatus` in chrome.storage.local.
//   pauseBtn visible + "Pause (Break)"                         → workingStatus = true
//   pauseBtn visible + "Resume Tracking"                       → workingStatus = false
//   trackBtn visible + "Start Tracking"                        → workingStatus = false
//   trackBtn visible + "Stop Tracking" → "Start Tracking"      → workingStatus = false
//
// On page load, pauseBtn is evaluated immediately (in addition to the
// MutationObserver kickoff) so workingStatus is set without waiting for
// the first mutation.
(function () {
  if (window.__timerReminderInjected) return;
  window.__timerReminderInjected = true;

  // ================================================================
  // POPUP (in-page banner)
  // ================================================================
  function createPopup() {
    if (document.getElementById('timer-reminder-popup')) return;

    const popup = document.createElement('div');
    popup.id = 'timer-reminder-popup';
    popup.className = 'timer-reminder-popup';
    popup.innerHTML = `
      <div class="timer-reminder-header">
        <span class="timer-reminder-icon">⏰</span>
        <span class="timer-reminder-title">Timer Reminder</span>
        <button class="timer-reminder-close" id="timer-reminder-close">✕</button>
      </div>
      <div class="timer-reminder-body">
        Please start your timer if you are working.
      </div>
      <div class="timer-reminder-footer">
        <button class="timer-reminder-btn" id="timer-reminder-dismiss">Dismiss</button>
      </div>
    `;
    document.body.appendChild(popup);

    requestAnimationFrame(() => popup.classList.add('timer-reminder-show'));

    const close = () => {
      popup.classList.remove('timer-reminder-show');
      popup.classList.add('timer-reminder-hide');
      setTimeout(() => popup.remove(), 300);
    };

    popup.querySelector('#timer-reminder-close').addEventListener('click', close);
    popup.querySelector('#timer-reminder-dismiss').addEventListener('click', close);

    makeDraggable(popup);
  }

  function removePopup() {
    const popup = document.getElementById('timer-reminder-popup');
    if (popup) {
      popup.classList.remove('timer-reminder-show');
      popup.classList.add('timer-reminder-hide');
      setTimeout(() => popup.remove(), 300);
    }
  }

  function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = element.querySelector('.timer-reminder-header');
    if (!header) return;
    header.style.cursor = 'move';
    header.onmousedown = (e) => {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = () => {
        document.onmouseup = null;
        document.onmousemove = null;
      };
      document.onmousemove = (ev) => {
        ev.preventDefault();
        pos1 = pos3 - ev.clientX;
        pos2 = pos4 - ev.clientY;
        pos3 = ev.clientX;
        pos4 = ev.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.right = "auto";
        element.style.bottom = "auto";
      };
    };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showNotification") {
      createPopup();
      sendResponse({ status: "shown" });
    } else if (request.action === "hideNotification") {
      removePopup();
      sendResponse({ status: "hidden" });
    } else if (request.action === "getTrackingState") {
      sendResponse({ isTracking: !!lastWorkingStatusWritten });
    } else if (request.action === "fetchCurrentSelections") {
      pushCurrentSelectionsToStorage()
        .then(() => sendResponse({ status: "ok" }))
        .catch((err) => sendResponse({ status: "error", message: String(err) }));
      return true;
    }
    return true;
  });

  // ================================================================
  // CONSTANTS
  // ================================================================
  const WAVE_PATH = '/employee/fill-productivity';
  const RETRY_DELAY_MS = 2000;
  const MAX_ATTEMPTS = 3;
  const LOG = (...args) => console.log('[WAVE Autofill]', ...args);

  const STORAGE_KEYS = {
    project: 'assignedProject',
    task:    'assignedTask',
    subtask: 'assignedSubtask',
    projectName: 'assignedProjectName',
    taskName:    'assignedTaskName',
    subtaskName: 'assignedSubtaskName'
  };

  let autofillAttempts = 0;
  let autofillSucceeded = false;
  let changeListenersAttached = false;
  let buttonWatcherAttached = false;
  let lastTrackBtnLabel = null;
  let lastWorkingStatusWritten = null;

  // ================================================================
  // Helpers
  // ================================================================
  function getSelectableOptions(select) {
    if (!select || !select.options) return [];
    return Array.from(select.options).filter(
      (o) => !o.disabled && o.value !== ''
    );
  }

  function dumpOptions(select) {
    if (!select) return '(missing)';
    return Array.from(select.options).map(o => ({
      value: o.value,
      text: o.textContent.trim(),
      disabled: o.disabled,
      selected: o.selected
    }));
  }

  function selectOption(select, option) {
    if (!select || !option) return false;

    const targetValue = String(option.value);

    if (select.value === targetValue) {
      LOG(`#${select.id} already set to "${targetValue}" — skipping`);
      return true;
    }

    select.value = targetValue;

    if (select.value !== targetValue) {
      const idx = Array.from(select.options).findIndex(o => o.value === targetValue);
      if (idx >= 0) select.selectedIndex = idx;
    }

    option.selected = true;

    if (select.value !== targetValue) {
      LOG(`❌ Could not set #${select.id} to "${targetValue}"`);
      return false;
    }

    select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    select.dispatchEvent(new Event('input',  { bubbles: true }));

    LOG(`Selected "${option.textContent.trim()}" (value="${targetValue}") on #${select.id}`);
    return true;
  }

  function waitForAtLeastOneOption(select, timeoutMs = 3000) {
    return new Promise((resolve) => {
      if (!select) return resolve(0);
      if (getSelectableOptions(select).length >= 1) {
        return resolve(getSelectableOptions(select).length);
      }

      const start = Date.now();
      const check = () => {
        const n = getSelectableOptions(select).length;
        if (n >= 1) return resolve(n);
        if (Date.now() - start > timeoutMs) return resolve(n);
        setTimeout(check, 100);
      };
      check();
    });
  }

  function findOptionByValue(select, value) {
    if (!select || value == null || value === '') return null;
    const target = String(value);
    return Array.from(select.options).find(o => o.value === target) || null;
  }

  // ================================================================
  // Read current selections from the page
  // ================================================================
  function getSelectedValue(select) {
    if (!select) return '';
    return select.value || '';
  }

  function getSelectedText(select) {
    if (!select) return '';
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent.trim() : '';
  }

  async function pushCurrentSelectionsToStorage() {
    const projectSelect = document.getElementById('assignedProject');
    const taskSelect    = document.getElementById('assignedTask');
    const subtaskSelect = document.getElementById('assignedSubtask');

    const payload = {
      [STORAGE_KEYS.project]: getSelectedValue(projectSelect),
      [STORAGE_KEYS.task]:    getSelectedValue(taskSelect),
      [STORAGE_KEYS.subtask]: getSelectedValue(subtaskSelect),

      [STORAGE_KEYS.projectName]: getSelectedText(projectSelect),
      [STORAGE_KEYS.taskName]:    getSelectedText(taskSelect),
      [STORAGE_KEYS.subtaskName]: getSelectedText(subtaskSelect)
    };

    await chrome.storage.local.set(payload);
    LOG('💾 Pushed current selections:', {
      project: payload[STORAGE_KEYS.projectName],
      task:    payload[STORAGE_KEYS.taskName],
      subtask: payload[STORAGE_KEYS.subtaskName]
    });
    return payload;
  }

  const persistCurrentSelections = pushCurrentSelectionsToStorage;

  function attachChangeListeners() {
    if (changeListenersAttached) return;

    const projectSelect = document.getElementById('assignedProject');
    const taskSelect    = document.getElementById('assignedTask');
    const subtaskSelect = document.getElementById('assignedSubtask');

    if (!projectSelect && !taskSelect && !subtaskSelect) return;

    [projectSelect, taskSelect, subtaskSelect].forEach((sel) => {
      if (!sel) return;
      sel.addEventListener('change', () => {
        LOG(`change event on #${sel.id} → new value "${sel.value}"`);
        setTimeout(pushCurrentSelectionsToStorage, 150);
      });
    });

    changeListenersAttached = true;
    LOG('Attached change listeners to project/task/subtask dropdowns.');
  }

  // ================================================================
  // BUTTON WATCHERS
  // ================================================================
  function getBtnLabel(btn) {
    if (!btn) return '';
    return (btn.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isBtnVisible(btn) {
    if (!btn) return false;
    return !btn.classList.contains('d-none') && btn.offsetParent !== null;
  }

  async function writeWorkingStatus(value, reason) {
    if (value === lastWorkingStatusWritten) return;

    lastWorkingStatusWritten = value;
    LOG(`💼 workingStatus → ${value} (${reason}) at ${new Date().toISOString()}`);
    try {
      await chrome.storage.local.set({ workingStatus: value });
    } catch (err) {
      console.error('[WAVE Autofill] Failed to persist workingStatus:', err);
    }
  }

  // ---- trackBtn watcher ----
  async function processTrackBtn() {
    const trackBtn = document.getElementById('trackBtn');
    if (!trackBtn) return;

    if (!isBtnVisible(trackBtn)) {
      lastTrackBtnLabel = getBtnLabel(trackBtn) || lastTrackBtnLabel;
      return;
    }

    const label = getBtnLabel(trackBtn);
    const previousLabel = lastTrackBtnLabel;

    if (label === 'Start Tracking') {
      await writeWorkingStatus(false, 'trackBtn visible + "Start Tracking"');
    }

    if (label === 'Start Tracking' && previousLabel === 'Stop Tracking') {
      LOG('🔁 trackBtn transition: "Stop Tracking" → "Start Tracking"');
      await writeWorkingStatus(false, 'trackBtn transition Stop→Start');
    }

    lastTrackBtnLabel = label;
  }

  // ---- pauseBtn watcher ----
  async function processPauseBtn() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (!pauseBtn) return;

    if (!isBtnVisible(pauseBtn)) return;

    const label = getBtnLabel(pauseBtn);

    if (label === 'Pause (Break)') {
      await writeWorkingStatus(true, 'pauseBtn visible + "Pause (Break)"');
    } else if (label === 'Resume Tracking') {
      await writeWorkingStatus(false, 'pauseBtn visible + "Resume Tracking"');
    }
  }

  function attachButtonWatchers() {
    if (buttonWatcherAttached) return;

    const observer = new MutationObserver(() => {
      processTrackBtn();
      processPauseBtn();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'style']
    });

    setTimeout(() => {
      processTrackBtn();
      processPauseBtn();
    }, 3000);

    buttonWatcherAttached = true;
    LOG('Attached button watchers (trackBtn + pauseBtn).');
  }

  // ================================================================
  // Selection refresh (while working)
  // ================================================================
  let selectionRefreshInterval = null;

  function startSelectionRefresh() {
    if (selectionRefreshInterval) return;
    selectionRefreshInterval = setInterval(() => {
      if (lastWorkingStatusWritten === true) {
        pushCurrentSelectionsToStorage().catch(() => {});
      }
    }, 2000);
    LOG('Started 2s selection refresh (active while working).');
  }

  // ================================================================
  // AUTOFILL
  // ================================================================
  async function applySelection(select, savedValue, label, waitMs = 3000) {
    const count = await waitForAtLeastOneOption(select, waitMs);
    if (count === 0) {
      LOG(`⏳ #${select.id} has 0 selectable options — will retry.`);
      return false;
    }

    const opts = getSelectableOptions(select);

    if (savedValue) {
      const savedOpt = findOptionByValue(select, savedValue);
      if (savedOpt) {
        LOG(`↩️ Restoring saved ${label} = "${savedValue}" on #${select.id}`);
        return selectOption(select, savedOpt);
      }
      LOG(`⚠️ Saved ${label} "${savedValue}" not found in #${select.id} — falling back to first option.`);
    }

    const firstOpt = opts[0];
    if (!firstOpt) {
      LOG(`⚠️ #${select.id}: no selectable option to choose.`);
      return false;
    }
    LOG(`➡️ No saved ${label} — selecting first option on #${select.id}`);
    return selectOption(select, firstOpt);
  }

  async function attemptAutofill() {
    const projectSelect = document.getElementById('assignedProject');
    const taskSelect    = document.getElementById('assignedTask');
    const subtaskSelect = document.getElementById('assignedSubtask');

    if (!projectSelect) {
      LOG('⚠️ #assignedProject not in DOM yet.');
      return false;
    }

    attachChangeListeners();

    const data = await chrome.storage.local.get([
      STORAGE_KEYS.project,
      STORAGE_KEYS.task,
      STORAGE_KEYS.subtask
    ]);
    const saved = {
      project: data[STORAGE_KEYS.project] || '',
      task:    data[STORAGE_KEYS.task]    || '',
      subtask: data[STORAGE_KEYS.subtask] || ''
    };
    LOG('Saved selections from storage:', saved);

    const projOk = await applySelection(projectSelect, saved.project, 'project', 3000);
    if (!projOk) return false;

    if (!taskSelect) {
      LOG('⚠️ #assignedTask not in DOM.');
      return false;
    }
    const taskOk = await applySelection(taskSelect, saved.task, 'task', 4000);
    if (!taskOk) return false;

    if (!subtaskSelect) {
      LOG('⚠️ #assignedSubtask not in DOM.');
      return false;
    }
    const subtaskOk = await applySelection(subtaskSelect, saved.subtask, 'subtask', 4000);
    if (!subtaskOk) return false;

    return true;
  }

  function scheduleAutofill() {
    if (autofillSucceeded) return;

    if (autofillAttempts >= MAX_ATTEMPTS) {
      LOG(`❌ Gave up after ${MAX_ATTEMPTS} attempts.`);
      LOG('Project options:',  dumpOptions(document.getElementById('assignedProject')));
      LOG('Task options:',     dumpOptions(document.getElementById('assignedTask')));
      LOG('Subtask options:',  dumpOptions(document.getElementById('assignedSubtask')));
      attachChangeListeners();
      return;
    }

    autofillAttempts++;
    LOG(`=== Attempt ${autofillAttempts}/${MAX_ATTEMPTS} ===`);

    attemptAutofill()
      .then((ok) => {
        if (ok) {
          autofillSucceeded = true;
          LOG('✅ Cascading autofill complete.');
          setTimeout(pushCurrentSelectionsToStorage, 200);
          return;
        }
        setTimeout(scheduleAutofill, RETRY_DELAY_MS);
      })
      .catch((err) => {
        console.error('[WAVE Autofill] Unexpected error:', err);
        setTimeout(scheduleAutofill, RETRY_DELAY_MS);
      });
  }

  // ================================================================
  // BOOTSTRAP
  // ================================================================
  if (location.pathname.startsWith(WAVE_PATH)) {
    const start = () => {
      LOG(`Starting autofill scheduler (every ${RETRY_DELAY_MS} ms, max ${MAX_ATTEMPTS} attempts)…`);

      const attachWhenReady = () => {
        const hasAll = document.getElementById('assignedProject') &&
                       document.getElementById('assignedTask') &&
                       document.getElementById('assignedSubtask');
        if (hasAll) attachChangeListeners();
        else setTimeout(attachWhenReady, 200);
      };
      attachWhenReady();

      chrome.storage.local.get("workingStatus").then(({ workingStatus }) => {
        lastWorkingStatusWritten = !!workingStatus;
      });

      attachButtonWatchers();
      startSelectionRefresh();

      // -----------------------------------------------------------------
      // IMMEDIATE evaluation on page load:
      // If pauseBtn is present + visible + its label is "Pause (Break)",
      // force workingStatus = true right away (don't wait for the first
      // DOM mutation or the 3 s fallback timer). The storage write wakes
      // the service worker, which re-evaluates the schedule and fires any
      // applicable notification immediately.
      // -----------------------------------------------------------------
      processPauseBtn();
      processTrackBtn();

      // A short follow-up in case the page re-renders pauseBtn after the
      // first paint (e.g. server round-trip replaces the button node).
      setTimeout(() => {
        processPauseBtn();
        processTrackBtn();
      }, 1000);

      setTimeout(() => {
        if (lastWorkingStatusWritten === true) {
          LOG('🟢 Page loaded while working — pushing current selections.');
          pushCurrentSelectionsToStorage();
        }
      }, 2500);

      setTimeout(scheduleAutofill, RETRY_DELAY_MS);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }
})();