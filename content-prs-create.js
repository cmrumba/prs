(() => {
  'use strict';

  // ---------- Configuration ----------
  const CREATE_URL_PREFIX =
    'http://pmp.digitaldividedata.com:8111/prs/index.php?r=productivity/create';
  const LIST_URL_PREFIX =
    'http://pmp.digitaldividedata.com:8111/prs/index.php?r=productivity';

  const PANEL_ID = 'pmp-ext-panel';

  const DEBUG = false; // set true to log restore/read events

  const PROJECT_ID_KEY  = 'savedProjectId';
  const TASK_ID_KEY     = 'savedTaskId';
  const SUBTASK_ID_KEY  = 'savedSubtaskId';

  const PROJECT_SELECTOR =
    'select[name="Productivity[project_id]"]';

  const TASK_SELECTOR =
    'select[name="Productivity[task_id]"], select#Productivity_task_id';

  const SUBTASK_SELECTOR =
    'select[name="Productivity[subtask_id]"], select#Productivity_subtask_id';

  const AUTO_FILL = [
    { selector: 'input#start_time, input[name="startTime"]', value: '08:00' },
    { selector: 'input#end_time, input[name="endTime"]',     value: '17:00' },
    { selector: 'input#breaktime, input[name="breaktime"]',  value: '01:00' },
    {
      selector:
        'input#Productivity_units_completed, input[name="Productivity[units_completed]"]',
      value: '480'
    }
  ];

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const CALENDAR_STORAGE_KEY = 'prsCalendar';

  const PAYROLL_START_DAY = 25;
  const PAYROLL_END_DAY = 24;

  const BASE_PAY = 25000;

  const SATURDAY_MIN_HOURS = 2;

  const SUNDAY_ERROR = 'sunday is not a working day';

  const ELONGATED_BREAK_HOURS = 1;
  const ELONGATED_BREAK_WARNING = 'Elongated break';

  const EXCESS_HOURS_THRESHOLD = 11;
  const EXCESS_HOURS_WARNING = 'Excess hours';

  const PREV_MONTH_EDITABLE_UNTIL_DAY = 4;

  const MISSING_POLL_MS = 500;
  const MISSING_POLL_MAX_TRIES = 40; // ~20 s

  // ---------- Page mode ----------
  function detectPageMode() {
    const url = window.location.href.split('#')[0];
    if (url.startsWith(CREATE_URL_PREFIX)) return 'create';
    if (url.startsWith(LIST_URL_PREFIX))   return 'list';
    return null;
  }

  // ---------- State ----------
  const PAGE_MODE = detectPageMode();
  const IS_CREATE = PAGE_MODE === 'create';
  const IS_LIST   = PAGE_MODE === 'list';

  const autoFilled = new Set();

  let calendarContainer = null;
  let dayPopupEl = null;
  let calendarData = {};

  let calendarView = 'current';

  // Project select handling
  let projectSelect = null;
  let projectChangeHandler = null;
  let projectRestoreAttempted = false;
  let projectStorageLoaded = false;
  let savedProjectId = null;

  // Task select handling
  let taskSelect = null;
  let taskChangeHandler = null;
  let taskRestoreAttempted = false;
  let taskStorageLoaded = false;
  let savedTaskId = null;

  // Subtask select handling
  let subtaskSelect = null;
  let subtaskChangeHandler = null;
  let subtaskRestoreAttempted = false;
  let subtaskStorageLoaded = false;
  let savedSubtaskId = null;

  // ---------- Utilities ----------
  function log(...args) {
    if (DEBUG) console.log('[PMP]', ...args);
  }

  function isInPanel(el) {
    const panel = document.getElementById(PANEL_ID);
    return !!(panel && el && panel.contains(el));
  }

  function fireChange(el) {
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function daysInMonth(year, month1to12) {
    return new Date(year, month1to12, 0).getDate();
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function dateKey(year, month1to12, day) {
    return `${year}-${pad2(month1to12)}-${pad2(day)}`;
  }

  function isSaturday(dateObj) { return dateObj.getDay() === 6; }
  function isSunday(dateObj)   { return dateObj.getDay() === 0; }

  // ---------- Storage ----------
  function loadStoredValues() {
    return new Promise(resolve => {
      chrome.storage.local.get(
        [CALENDAR_STORAGE_KEY, PROJECT_ID_KEY, TASK_ID_KEY, SUBTASK_ID_KEY],
        (result) => {
          calendarData = result[CALENDAR_STORAGE_KEY] || {};
          savedProjectId = result[PROJECT_ID_KEY] ?? null;
          savedTaskId    = result[TASK_ID_KEY]    ?? null;
          savedSubtaskId = result[SUBTASK_ID_KEY] ?? null;
          projectStorageLoaded = true;
          taskStorageLoaded = true;
          subtaskStorageLoaded = true;
          log('storage loaded, projectId =', savedProjectId,
              'taskId =', savedTaskId,
              'subtaskId =', savedSubtaskId);
          resolve();
        }
      );
    });
  }

  function saveCalendarData() {
    chrome.storage.local.set({ [CALENDAR_STORAGE_KEY]: calendarData });
  }

  function saveProjectId(value) {
    const isClear = (value === '' || value == null);
    if (isClear) {
      if (savedProjectId == null) return;
      chrome.storage.local.remove(PROJECT_ID_KEY);
      savedProjectId = null;
      log('cleared projectId');
    } else {
      if (savedProjectId === value) return;
      chrome.storage.local.set({ [PROJECT_ID_KEY]: value });
      savedProjectId = value;
      log('saved projectId =', value);
    }
  }

  function saveTaskId(value) {
    const isClear = (value === '' || value == null);
    if (isClear) {
      if (savedTaskId == null) return;
      chrome.storage.local.remove(TASK_ID_KEY);
      savedTaskId = null;
      log('cleared taskId');
    } else {
      if (savedTaskId === value) return;
      chrome.storage.local.set({ [TASK_ID_KEY]: value });
      savedTaskId = value;
      log('saved taskId =', value);
    }
  }

  function saveSubtaskId(value) {
    const isClear = (value === '' || value == null);
    if (isClear) {
      if (savedSubtaskId == null) return;
      chrome.storage.local.remove(SUBTASK_ID_KEY);
      savedSubtaskId = null;
      log('cleared subtaskId');
    } else {
      if (savedSubtaskId === value) return;
      chrome.storage.local.set({ [SUBTASK_ID_KEY]: value });
      savedSubtaskId = value;
      log('saved subtaskId =', value);
    }
  }

  // ---------- Build panel ----------
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="pmp-ext-header">
        <span class="pmp-ext-title">Productivity</span>
        <button type="button" class="pmp-ext-close" title="Hide">✕</button>
      </div>
      <div class="pmp-ext-body">
        <div class="pmp-ext-calendar" id="pmpExtCalendar"></div>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('.pmp-ext-close').addEventListener('click', () => {
      panel.style.display = 'none';
      hideDayPopup();
    });

    makeDraggable(panel, panel.querySelector('.pmp-ext-header'));

    calendarContainer = panel.querySelector('#pmpExtCalendar');
    renderCalendar();
  }

  // ---------- Project select ----------
  function findProjectSelect() {
    if (!IS_CREATE) return false;
    if (projectSelect && document.contains(projectSelect)) return true;
    const el = document.querySelector(PROJECT_SELECTOR);
    if (el && !isInPanel(el)) {
      attachProjectSelect(el);
      return true;
    }
    return false;
  }

  function attachProjectSelect(select) {
    if (projectChangeHandler && projectSelect) {
      projectSelect.removeEventListener('change', projectChangeHandler);
      projectSelect.removeEventListener('input', projectChangeHandler);
    }

    projectSelect = select;

    projectChangeHandler = () => {
      const value = (select.value || '').trim();
      if (value) saveProjectId(value);
    };
    select.addEventListener('change', projectChangeHandler);
    select.addEventListener('input', projectChangeHandler);

    tryRestoreProject();
  }

  function tryRestoreProject() {
    if (!IS_CREATE) return;
    if (projectRestoreAttempted) return;
    if (!projectStorageLoaded) return;
    if (!projectSelect || !document.contains(projectSelect)) return;

    if (!projectSelect.options || projectSelect.options.length === 0) {
      log('project restore waiting (no options)');
      return;
    }

    projectRestoreAttempted = true;

    if (savedProjectId != null && savedProjectId !== '') {
      const wanted = String(savedProjectId);
      const byValue = Array.from(projectSelect.options)
        .find(o => (o.value || '').trim() === wanted);
      if (byValue) {
        projectSelect.value = byValue.value;
        fireChange(projectSelect);
        log('project restored by value:', wanted);
        return;
      }
      const byText = Array.from(projectSelect.options)
        .find(o => (o.textContent || '').trim() === wanted);
      if (byText) {
        projectSelect.value = byText.value;
        fireChange(projectSelect);
        log('project restored by text:', wanted);
        return;
      }
      log('project restore: saved value not found in options:', wanted);
    }

    // if (projectSelect.options.length >= 2) {
    //   projectSelect.selectedIndex = 1;
    //   fireChange(projectSelect);
    //   const chosen = (projectSelect.value || '').trim();
    //   if (chosen) saveProjectId(chosen);
    //   log('project: selected second option =', chosen);
    // }
  }

  // ---------- Task select ----------
  function findTaskSelect() {
    if (!IS_CREATE) return false;
    if (taskSelect && document.contains(taskSelect)) return true;
    const el = document.querySelector(TASK_SELECTOR);
    if (el && !isInPanel(el)) {
      attachTaskSelect(el);
      return true;
    }
    return false;
  }

  function attachTaskSelect(select) {
    if (taskChangeHandler && taskSelect) {
      taskSelect.removeEventListener('change', taskChangeHandler);
      taskSelect.removeEventListener('input', taskChangeHandler);
    }

    taskSelect = select;

    taskChangeHandler = () => {
      const value = (select.value || '').trim();
      if (value) saveTaskId(value);
    };
    select.addEventListener('change', taskChangeHandler);
    select.addEventListener('input', taskChangeHandler);

    tryRestoreTask();
  }

  function tryRestoreTask() {
    if (!IS_CREATE) return;
    if (taskRestoreAttempted) return;
    if (!taskStorageLoaded) return;
    if (!taskSelect || !document.contains(taskSelect)) return;

    if (!taskSelect.options || taskSelect.options.length === 0) {
      log('task restore waiting (no options)');
      return;
    }

    taskRestoreAttempted = true;

    if (savedTaskId == null || savedTaskId === '') {
      log('task restore: no saved value, leaving as-is');
      return;
    }

    const wanted = String(savedTaskId);
    const byValue = Array.from(taskSelect.options)
      .find(o => (o.value || '').trim() === wanted);
    if (byValue) {
      taskSelect.value = byValue.value;
      fireChange(taskSelect);
      log('task restored by value:', wanted);
      return;
    }
    const byText = Array.from(taskSelect.options)
      .find(o => (o.textContent || '').trim() === wanted);
    if (byText) {
      taskSelect.value = byText.value;
      fireChange(taskSelect);
      log('task restored by text:', wanted);
      return;
    }
    log('task restore: saved value not found in options:', wanted);
  }

  // ---------- Subtask select ----------
  function findSubtaskSelect() {
    if (!IS_CREATE) return false;
    if (subtaskSelect && document.contains(subtaskSelect)) return true;
    const el = document.querySelector(SUBTASK_SELECTOR);
    if (el && !isInPanel(el)) {
      attachSubtaskSelect(el);
      return true;
    }
    return false;
  }

  function attachSubtaskSelect(select) {
    if (subtaskChangeHandler && subtaskSelect) {
      subtaskSelect.removeEventListener('change', subtaskChangeHandler);
      subtaskSelect.removeEventListener('input', subtaskChangeHandler);
    }

    subtaskSelect = select;

    subtaskChangeHandler = () => {
      const value = (select.value || '').trim();
      if (value) saveSubtaskId(value);
    };
    select.addEventListener('change', subtaskChangeHandler);
    select.addEventListener('input', subtaskChangeHandler);

    tryRestoreSubtask();
  }

  function tryRestoreSubtask() {
    if (!IS_CREATE) return;
    if (subtaskRestoreAttempted) return;
    if (!subtaskStorageLoaded) return;
    if (!subtaskSelect || !document.contains(subtaskSelect)) return;

    if (!subtaskSelect.options || subtaskSelect.options.length === 0) {
      log('subtask restore waiting (no options)');
      return;
    }

    subtaskRestoreAttempted = true;

    if (savedSubtaskId == null || savedSubtaskId === '') {
      log('subtask restore: no saved value, leaving as-is');
      return;
    }

    const wanted = String(savedSubtaskId);
    const byValue = Array.from(subtaskSelect.options)
      .find(o => (o.value || '').trim() === wanted);
    if (byValue) {
      subtaskSelect.value = byValue.value;
      fireChange(subtaskSelect);
      log('subtask restored by value:', wanted);
      return;
    }
    const byText = Array.from(subtaskSelect.options)
      .find(o => (o.textContent || '').trim() === wanted);
    if (byText) {
      subtaskSelect.value = byText.value;
      fireChange(subtaskSelect);
      log('subtask restored by text:', wanted);
      return;
    }
    log('subtask restore: saved value not found in options:', wanted);
  }

  // ---------- Page-only auto-fill ----------
  function autoFillOne(cfg) {
    if (!IS_CREATE) return true;
    if (autoFilled.has(cfg.selector)) return true;

    const el = document.querySelector(cfg.selector);
    if (!el) return false;
    if (isInPanel(el)) { autoFilled.add(cfg.selector); return true; }

    if (!el.value) {
      el.value = cfg.value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur',   { bubbles: true }));
    }

    autoFilled.add(cfg.selector);
    return true;
  }

  function autoFillAll() {
    if (!IS_CREATE) return;
    AUTO_FILL.forEach(autoFillOne);
  }

  // ---------- Calendar / Payroll ----------
  function countWeekdays(start, end) {
    let count = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= stop) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function countDaysPresent(start, end) {
    let count = 0;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= stop) {
      const dow = cursor.getDay();

      if (dow === 0) {
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const key = dateKey(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        cursor.getDate()
      );
      const entry = ensureDayEntry(key);

      if (dow === 6) {
        if (typeof entry.prsHours === 'number' &&
            entry.prsHours > SATURDAY_MIN_HOURS) {
          count++;
        }
      } else {
        if (entry.prsFilled === 'yes') count++;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function formatCurrency(n) {
    const rounded = Math.round(n * 100) / 100;
    const [intPart, decPart = '00'] = rounded.toFixed(2).split('.');
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `KES ${withSep}.${decPart}`;
  }

  function ensureDayEntry(key) {
    if (!calendarData[key]) {
      calendarData[key] = {
        prsFilled: 'no',
        prsHours: 0,
        prsBreak: 0
      };
    } else {
      if (calendarData[key].prsFilled !== 'yes' && calendarData[key].prsFilled !== 'no') {
        calendarData[key].prsFilled = 'no';
      }
      if (typeof calendarData[key].prsHours !== 'number') {
        calendarData[key].prsHours = 0;
      }
      if (typeof calendarData[key].prsBreak !== 'number') {
        calendarData[key].prsBreak = 0;
      }
      if (calendarData[key].prsBreak < 0) calendarData[key].prsBreak = 0;
    }
    return calendarData[key];
  }

  function hasElongatedBreak(entry) {
    return typeof entry.prsBreak === 'number' &&
           entry.prsBreak > ELONGATED_BREAK_HOURS;
  }

  function hasExcessHours(entry) {
    return typeof entry.prsHours === 'number' &&
           entry.prsHours > EXCESS_HOURS_THRESHOLD;
  }

  function buildCalendarNavHtml() {
    const now = new Date();
    const thisMonthName = MONTHS[now.getMonth()];
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthName = MONTHS[prevMonthDate.getMonth()];

    const showing = calendarView === 'current' ? thisMonthName : prevMonthName;

    const buttons = [];

    if (calendarView === 'current') {
      buttons.push(`
        <button type="button" class="pmp-ext-cal-nav-btn"
                data-cal-nav="previous" title="Show previous month">
          <span class="pmp-ext-cal-nav-arrow">◀</span>
          <span class="pmp-ext-cal-nav-label">${prevMonthName}</span>
        </button>
      `);
    } else {
      buttons.push(`
        <button type="button" class="pmp-ext-cal-nav-btn"
                data-cal-nav="current" title="Show current month">
          <span class="pmp-ext-cal-nav-label">${thisMonthName}</span>
          <span class="pmp-ext-cal-nav-arrow">▶</span>
        </button>
      `);
    }

    return `
      <div class="pmp-ext-cal-nav">
        <div class="pmp-ext-cal-nav-month">${showing}</div>
        <div class="pmp-ext-cal-nav-buttons">${buttons.join('')}</div>
      </div>
    `;
  }

  function getMonthsToShow() {
    const now = new Date();
    const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

    if (calendarView === 'previous') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [{
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        editable: now.getDate() <= PREV_MONTH_EDITABLE_UNTIL_DAY
      }];
    }

    return [{ year: thisMonth.year, month: thisMonth.month, editable: true }];
  }

  function isQualifyingSaturday(entry) {
    return typeof entry.prsHours === 'number' && entry.prsHours > SATURDAY_MIN_HOURS;
  }

  // Determine the CSS class(es) for a day cell.
  // Warning states (yellow) take priority over red/green/older.
  function dayCellClass(entry, {
    isSat, isSun, weekend, isPreviousMonth, monthLocked
  }) {
    const classes = [];

    const elongatedBreak = hasElongatedBreak(entry);
    const excessHours = hasExcessHours(entry);

    // Warnings first — yellow wins.
    if (elongatedBreak) classes.push('pmp-ext-cal-elongated-break');
    if (excessHours) classes.push('pmp-ext-cal-excess-hours');

    if (classes.length === 0) {
      if (isSun && entry.prsFilled === 'yes') {
        classes.push('pmp-ext-cal-sunday-filled');
      } else if (isSat && isQualifyingSaturday(entry)) {
        classes.push('pmp-ext-cal-saturday-worked');
      } else if (entry.prsFilled === 'yes') {
        classes.push('pmp-ext-cal-green');
        if (weekend) classes.push('pmp-ext-cal-weekend');
      } else if (weekend) {
        classes.push('pmp-ext-cal-weekend');
      } else if (isPreviousMonth) {
        classes.push('pmp-ext-cal-older');
      } else {
        classes.push('pmp-ext-cal-red');
      }
    }

    if (monthLocked) classes.push('pmp-ext-cal-locked');

    return classes.join(' ');
  }

  function renderCalendar() {
    if (!calendarContainer) return;

    saveCalendarData();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthsToShow = getMonthsToShow();

    let html = buildCalendarNavHtml();
    html += '<div class="pmp-ext-cal-months">';

    monthsToShow.forEach(({ year, month, editable }) => {
      html += '<div class="pmp-ext-cal-month">';
      html += '<div class="pmp-ext-cal-grid">';
      DOW.forEach(d => { html += `<div class="pmp-ext-cal-dow">${d}</div>`; });

      const firstDow = new Date(year, month - 1, 1).getDay();
      const totalDays = daysInMonth(year, month);

      const isPreviousMonth =
        (year < now.getFullYear()) ||
        (year === now.getFullYear() && month < (now.getMonth() + 1));

      const monthLocked = isPreviousMonth && !editable;

      for (let i = 0; i < firstDow; i++) {
        html += '<div class="pmp-ext-cal-day pmp-ext-cal-empty"></div>';
      }

      for (let d = 1; d <= totalDays; d++) {
        const key = dateKey(year, month, d);
        const cellDate = new Date(year, month - 1, d);
        const isSat = isSaturday(cellDate);
        const isSun = isSunday(cellDate);
        const weekend = isSat || isSun;

        if (cellDate > today) {
          const cls = weekend
            ? 'pmp-ext-cal-weekend pmp-ext-cal-future'
            : 'pmp-ext-cal-disabled';
          html += `<div class="pmp-ext-cal-day ${cls}"
                        data-date="${key}">${d}</div>`;
          continue;
        }

        const entry = ensureDayEntry(key);

        const cls = dayCellClass(entry, {
          isSat, isSun, weekend, isPreviousMonth, monthLocked
        });

        html += `<div class="pmp-ext-cal-day ${cls}"
                      data-date="${key}">${d}</div>`;
      }

      html += '</div>';
      html += '</div>';
    });

    html += '</div>';

    // ---------- Payroll summary ----------
    const dNow = now.getDate();
    const inNextPayPeriod = dNow < PAYROLL_START_DAY; // days 1–24

    let nextStartYear, nextStartMonth;
    if (dNow >= PAYROLL_START_DAY) {
      nextStartYear = now.getFullYear();
      nextStartMonth = now.getMonth();
    } else {
      nextStartYear = (now.getMonth() === 0) ? now.getFullYear() - 1 : now.getFullYear();
      nextStartMonth = (now.getMonth() === 0) ? 11 : now.getMonth() - 1;
    }

    const nextStart = new Date(nextStartYear, nextStartMonth, PAYROLL_START_DAY);
    const nextEnd = new Date(
      nextStart.getFullYear(),
      nextStart.getMonth() + 1,
      PAYROLL_END_DAY
    );

    const prevStart = new Date(
      nextStart.getFullYear(),
      nextStart.getMonth() - 1,
      PAYROLL_START_DAY
    );
    const prevEnd = new Date(
      nextStart.getFullYear(),
      nextStart.getMonth(),
      PAYROLL_END_DAY
    );

    const nextWeekdays = countWeekdays(nextStart, nextEnd);
    const nextRate = nextWeekdays > 0 ? BASE_PAY / nextWeekdays : 0;
    const nextDaysPresent = countDaysPresent(nextStart, nextEnd);
    const nextPay = nextDaysPresent * nextRate;

    const nextLabel =
      `${MONTHS[nextStart.getMonth()]} ${nextStart.getDate()} – ` +
      `${MONTHS[nextEnd.getMonth()]} ${nextEnd.getDate()}`;

    // Previous pay period — only shown when NOT in the 1st–24th window.
    let prevHtml = '';
    if (!inNextPayPeriod) {
      const prevWeekdays = countWeekdays(prevStart, prevEnd);
      const prevRate = prevWeekdays > 0 ? BASE_PAY / prevWeekdays : 0;
      const prevDaysPresent = countDaysPresent(prevStart, prevEnd);
      const prevPay = prevDaysPresent * prevRate;

      const prevLabel =
        `${MONTHS[prevStart.getMonth()]} ${prevStart.getDate()} – ` +
        `${MONTHS[prevEnd.getMonth()]} ${prevEnd.getDate()}`;

      prevHtml = `
        <div class="pmp-ext-payroll-block">
          <div class="pmp-ext-payroll-title">Previous pay period</div>
          <div class="pmp-ext-payroll-period">${prevLabel}</div>
          <div class="pmp-ext-payroll-row">
            <span>Days present</span>
            <strong>${prevDaysPresent}</strong>
          </div>
          <div class="pmp-ext-payroll-row">
            <span>Payroll</span>
            <strong>${formatCurrency(prevPay)}</strong>
          </div>
          <div class="pmp-ext-payroll-note">
            Rate: ${formatCurrency(prevRate)}/day × ${prevWeekdays} weekdays
          </div>
        </div>

        <div class="pmp-ext-payroll-divider"></div>
      `;
    }

    const payrollHtml = `
      <div class="pmp-ext-cal-total">
        ${prevHtml}

        <div class="pmp-ext-payroll-block">
          <div class="pmp-ext-payroll-title">Next pay period</div>
          <div class="pmp-ext-payroll-period">${nextLabel}</div>
          <div class="pmp-ext-payroll-row">
            <span>Days present</span>
            <strong>${nextDaysPresent}</strong>
          </div>
          <div class="pmp-ext-payroll-row">
            <span>Estimated Payroll <small>(No incentives & deductions)</small></span>
            <strong>${formatCurrency(nextPay)}</strong>
          </div>
          <div class="pmp-ext-payroll-note">
            Rate: ${formatCurrency(nextRate)}/day × ${nextWeekdays} weekdays
          </div>
        </div>
      </div>
    `;

    html += payrollHtml;

    calendarContainer.innerHTML = html;

    calendarContainer.querySelectorAll('[data-cal-nav]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const target = btn.getAttribute('data-cal-nav');
        if (target === 'previous' || target === 'current') {
          calendarView = target;
          hideDayPopup();
          renderCalendar();
        }
      });
    });

    calendarContainer.querySelectorAll('.pmp-ext-cal-day').forEach(el => {
      if (el.classList.contains('pmp-ext-cal-empty')) return;
      if (el.classList.contains('pmp-ext-cal-disabled')) return;
      if (el.classList.contains('pmp-ext-cal-older')) return;
      if (el.classList.contains('pmp-ext-cal-locked')) return;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const dateStr = el.getAttribute('data-date');
        if (dateStr) onCalendarDayClicked(el, dateStr);
      });
    });
  }

  // ---------- Day click ----------
  function onCalendarDayClicked(anchorEl, dateKeyStr) {
    showDayPopup(anchorEl, dateKeyStr);
  }

  function hideDayPopup() {
    if (dayPopupEl && dayPopupEl.parentNode) {
      dayPopupEl.parentNode.removeChild(dayPopupEl);
    }
    dayPopupEl = null;
  }

  function showDayPopup(anchorEl, dateKeyStr) {
    hideDayPopup();

    const entry = ensureDayEntry(dateKeyStr);

    const [yy, mm, dd] = dateKeyStr.split('-').map(n => parseInt(n, 10));
    const cellDate = new Date(yy, mm - 1, dd);
    const isSun = isSunday(cellDate);
    const isSat = isSaturday(cellDate);

    const showSundayError = isSun && entry.prsFilled === 'yes';
    const showSaturdayWorked =
      isSat && typeof entry.prsHours === 'number' && entry.prsHours > SATURDAY_MIN_HOURS;

    const showElongatedBreak = hasElongatedBreak(entry);
    const showExcessHours = hasExcessHours(entry);

    const popup = document.createElement('div');
    popup.className = 'pmp-ext-day-popup';
    popup.innerHTML = `
      <div class="pmp-ext-popup-row">
        <span class="pmp-ext-popup-label">Date:</span>
        <span class="pmp-ext-popup-value">${dateKeyStr}</span>
      </div>
      <div class="pmp-ext-popup-row">
        <span class="pmp-ext-popup-label">PRS Filled:</span>
        <span class="pmp-ext-popup-value">${entry.prsFilled}</span>
      </div>
      <div class="pmp-ext-popup-row">
        <span class="pmp-ext-popup-label">Hours:</span>
        <span class="pmp-ext-popup-value">${entry.prsHours}</span>
      </div>
      <div class="pmp-ext-popup-row">
        <span class="pmp-ext-popup-label">Break:</span>
        <span class="pmp-ext-popup-value">${entry.prsBreak}</span>
      </div>
      ${showSaturdayWorked
        ? `<div class="pmp-ext-popup-info">Saturday worked (&gt; ${SATURDAY_MIN_HOURS}h) — counted as a paid day.</div>`
        : ''}
      ${showElongatedBreak
        ? `<div class="pmp-ext-popup-warning">${ELONGATED_BREAK_WARNING}</div>`
        : ''}
      ${showExcessHours
        ? `<div class="pmp-ext-popup-warning">${EXCESS_HOURS_WARNING}</div>`
        : ''}
      ${showSundayError
        ? `<div class="pmp-ext-popup-error">${SUNDAY_ERROR}</div>`
        : ''}
    `;

    const panel = document.getElementById(PANEL_ID);
    panel.appendChild(popup);

    const panelRect = panel.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();

    const popupRect = popup.getBoundingClientRect();

    let left = anchorRect.left - panelRect.left
      + (anchorRect.width / 2) - (popupRect.width / 2);
    let top = anchorRect.top - panelRect.top - popupRect.height - 6;

    if (left < 4) left = 4;
    if (left + popupRect.width > panelRect.width - 4) {
      left = panelRect.width - popupRect.width - 4;
    }
    if (top < 4) top = anchorRect.bottom - panelRect.top + 6;

    popup.style.left = left + 'px';
    popup.style.top  = top + 'px';

    dayPopupEl = popup;
  }

  document.addEventListener('click', (e) => {
    if (!dayPopupEl) return;
    if (dayPopupEl.contains(e.target)) return;
    if (e.target.classList && e.target.classList.contains('pmp-ext-cal-day')) {
      return;
    }
    if (e.target.closest && e.target.closest('.pmp-ext-cal-nav')) {
      return;
    }
    hideDayPopup();
  }, true);

  // ---------- Draggable ----------
  function makeDraggable(panel, handle) {
    let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('pmp-ext-close')) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = startLeft + (e.clientX - startX) + 'px';
      panel.style.top  = startTop  + (e.clientY - startY) + 'px';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ---------- Boot ----------
  function boot() {
    if (!PAGE_MODE) return;
    if (!document.body) return;

    buildPanel();

    if (IS_CREATE) {
      findProjectSelect();
      findTaskSelect();
      findSubtaskSelect();
      autoFillAll();

      let tries = 0;
      const pollTimer = setInterval(() => {
        tries++;

        findProjectSelect();
        tryRestoreProject();
        findTaskSelect();
        tryRestoreTask();
        findSubtaskSelect();
        tryRestoreSubtask();
        autoFillAll();

        const allFilled = AUTO_FILL.every(c => autoFilled.has(c.selector));
        const projectDone = projectRestoreAttempted;
        const taskDone = taskRestoreAttempted;
        const subtaskDone = subtaskRestoreAttempted;

        if ((allFilled && projectDone && taskDone && subtaskDone) ||
            tries >= MISSING_POLL_MAX_TRIES) {
          clearInterval(pollTimer);
        }
      }, MISSING_POLL_MS);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes[CALENDAR_STORAGE_KEY]) {
        calendarData = changes[CALENDAR_STORAGE_KEY].newValue || {};
        renderCalendar();
      }

      if (changes[PROJECT_ID_KEY]) {
        savedProjectId = changes[PROJECT_ID_KEY].newValue ?? null;
        log('projectId changed in storage:', savedProjectId);
      }

      if (changes[TASK_ID_KEY]) {
        savedTaskId = changes[TASK_ID_KEY].newValue ?? null;
        log('taskId changed in storage:', savedTaskId);
      }

      if (changes[SUBTASK_ID_KEY]) {
        savedSubtaskId = changes[SUBTASK_ID_KEY].newValue ?? null;
        log('subtaskId changed in storage:', savedSubtaskId);
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'PRS_CALENDAR_UPDATED') {
        chrome.storage.local.get([CALENDAR_STORAGE_KEY], (result) => {
          calendarData = result[CALENDAR_STORAGE_KEY] || {};
          renderCalendar();
        });
      }
    });
  }

  loadStoredValues().then(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  });
})();