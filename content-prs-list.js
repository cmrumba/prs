(() => {
  'use strict';

  const CALENDAR_STORAGE_KEY = 'prsCalendar';
  const TABLE_SELECTOR = 'table.items';

  // Pagination link for the "next page" — as provided.
  const NEXT_PAGE_SELECTOR = '#\\33  > li:nth-child(4) > a';

  // How long to wait for the table to refresh after clicking next.
  const PAGE_REFRESH_TIMEOUT_MS = 8000;
  const PAGE_REFRESH_POLL_MS = 250;

  // Manual-mode change detection debounce.
  const MANUAL_DEBOUNCE_MS = 600;

  const BREAK_TASK_NAME = 'Break Time';

  // ---------- Date helpers ----------
  function parsePageDate(str) {
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    return {
      day: parseInt(dd, 10),
      month: parseInt(mm, 10),
      year: parseInt(yyyy, 10)
    };
  }

  function toStorageKey({ day, month, year }) {
    const p = n => String(n).padStart(2, '0');
    return `${year}-${p(month)}-${p(day)}`;
  }

  function durationToHours(str) {
    if (!str) return 0;
    const t = str.trim();
    if (!t) return 0;

    const hms = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (hms) {
      const h = parseInt(hms[1], 10);
      const m = parseInt(hms[2], 10);
      const s = hms[3] ? parseInt(hms[3], 10) : 0;
      return h + m / 60 + s / 3600;
    }

    const num = parseFloat(t);
    return Number.isFinite(num) ? num : 0;
  }

  function roundHours(n) {
    return Math.round(n * 100) / 100;
  }

  // ---------- Scrape the table (aggregated) ----------
  // Rows with the same (taskName, date) are summed together for
  // durationHours and unitsCompleted. Break Time rows are summed
  // per date and stored separately (uncapped).
  function scrapeTable() {
    const table = document.querySelector(TABLE_SELECTOR);
    if (!table) return [];

    const rows = table.querySelectorAll('tr');

    // Aggregation maps:
    //   taskKey = `${date}||${taskName}` -> { taskName, date, durationHours, unitsCompleted }
    //   breakKey = date                  -> total break hours
    const taskMap = new Map();
    const breakMap = new Map();

    rows.forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 3) return;

      const taskName = (tds[2].textContent || '').trim();

      const dateStr = (tds[tds.length - 1].textContent || '').trim();
      const parsedDate = parsePageDate(dateStr);
      if (!parsedDate) return;

      const dateKey = toStorageKey(parsedDate);

      const durationStr = (tds[tds.length - 2].textContent || '').trim();
      const durationHours = roundHours(durationToHours(durationStr));

      // Break Time: accumulate per date, do not include as a task entry.
      if (taskName === BREAK_TASK_NAME) {
        const prev = breakMap.get(dateKey) || 0;
        breakMap.set(dateKey, roundHours(prev + durationHours));
        return;
      }

      const unitsCompletedRaw = tds.length > 7
        ? (tds[7].textContent || '').trim()
        : '';
      const unitsCompleted = parseInt(unitsCompletedRaw, 10);
      const unitsCompletedValue = Number.isFinite(unitsCompleted)
        ? unitsCompleted
        : 0;

      const key = `${dateKey}||${taskName}`;
      const existing = taskMap.get(key);

      if (existing) {
        existing.durationHours = roundHours(
          existing.durationHours + durationHours
        );
        existing.unitsCompleted = existing.unitsCompleted + unitsCompletedValue;
      } else {
        taskMap.set(key, {
          taskName,
          date: dateKey,
          durationHours,
          unitsCompleted: unitsCompletedValue
        });
      }
    });

    // Attach the break total for each date to the aggregated task entries.
    const entries = [];
    taskMap.forEach((entry) => {
      entry.breakHours = breakMap.get(entry.date) || 0;
      entries.push(entry);
    });

    // If a date only had Break Time rows (no task rows), still emit a
    // placeholder entry so the break can be recorded for that date.
    breakMap.forEach((breakHours, dateKey) => {
      const hasTask = entries.some(e => e.date === dateKey);
      if (!hasTask) {
        entries.push({
          taskName: '',
          date: dateKey,
          durationHours: 0,
          unitsCompleted: 0,
          breakHours
        });
      }
    });

    return entries;
  }

  // ---------- Merge + reconcile ----------
  const RESTRICT_RESET_TO_PAYROLL = false;
  const PAYROLL_START_DAY = 25;
  const PAYROLL_END_DAY = 24;

  function getPayrollWindow(now = new Date()) {
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    let startYear, startMonth, endYear, endMonth;

    if (d >= PAYROLL_START_DAY) {
      startYear = y;
      startMonth = m;
      endYear = (m === 11) ? y + 1 : y;
      endMonth = (m === 11) ? 0 : m + 1;
    } else {
      startYear = (m === 0) ? y - 1 : y;
      startMonth = (m === 0) ? 11 : m - 1;
      endYear = y;
      endMonth = m;
    }

    const start = new Date(startYear, startMonth, PAYROLL_START_DAY);
    const end = new Date(endYear, endMonth, PAYROLL_END_DAY);
    return { start, end };
  }

  function isWithinPayrollWindow(key) {
    const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const [, y, mo, d] = m;
    const date = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
    const { start, end } = getPayrollWindow();
    return date >= start && date <= end;
  }

  function defaultEntry() {
    return {
      prsFilled: 'no',
      prsHours: 0,
      prsBreak: 0
    };
  }

  function mergeAddOnly(entries) {
    return new Promise((resolve) => {
      chrome.storage.local.get([CALENDAR_STORAGE_KEY], (result) => {
        const calendarData = result[CALENDAR_STORAGE_KEY] || {};

        entries.forEach((entry) => {
          const key = entry.date;

          if (!calendarData[key]) {
            calendarData[key] = defaultEntry();
          }

          const day = calendarData[key];

          if (day.prsFilled !== 'yes' && day.prsFilled !== 'no') {
            day.prsFilled = 'no';
          }
          if (typeof day.prsHours !== 'number') day.prsHours = 0;
          if (typeof day.prsBreak !== 'number') day.prsBreak = 0;

          // Break hours (summed per date) — stored uncapped so the
          // widget can flag days with break > 1 hour.
          if (typeof entry.breakHours === 'number') {
            day.prsBreak = entry.breakHours;
            if (day.prsBreak < 0) day.prsBreak = 0;
          }

          // Placeholder (break-only date): don't mark as filled.
          if (!entry.taskName) return;

          day.prsHours = entry.durationHours;
          day.prsFilled = 'yes';
          day.unitsCompleted = entry.unitsCompleted;
          day.taskName = entry.taskName;
        });

        chrome.storage.local.set(
          { [CALENDAR_STORAGE_KEY]: calendarData },
          () => resolve(calendarData)
        );
      });
    });
  }

  function reconcileAll(seenDates) {
    return new Promise((resolve) => {
      chrome.storage.local.get([CALENDAR_STORAGE_KEY], (result) => {
        const calendarData = result[CALENDAR_STORAGE_KEY] || {};
        const seen = seenDates instanceof Set ? seenDates : new Set(seenDates);

        Object.keys(calendarData).forEach((key) => {
          if (seen.has(key)) return;
          if (RESTRICT_RESET_TO_PAYROLL && !isWithinPayrollWindow(key)) return;

          const day = calendarData[key];
          const wasFilled = day.prsFilled === 'yes';
          const hadHours = typeof day.prsHours === 'number' && day.prsHours !== 0;
          const hadBreak = typeof day.prsBreak === 'number' && day.prsBreak !== 0;
          const hadExtra = 'unitsCompleted' in day || 'taskName' in day;

          if (wasFilled || hadHours || hadBreak || hadExtra) {
            calendarData[key] = defaultEntry();
          }
        });

        chrome.storage.local.set(
          { [CALENDAR_STORAGE_KEY]: calendarData },
          () => resolve(calendarData)
        );
      });
    });
  }

  // ---------- Pagination helpers ----------
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function tableSignature() {
    const table = document.querySelector(TABLE_SELECTOR);
    if (!table) return '';
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return '';
    let sig = '';
    const limit = Math.min(rows.length, 3);
    for (let i = 0; i < limit; i++) {
      sig += (rows[i].textContent || '').replace(/\s+/g, ' ').trim() + '|';
    }
    return sig;
  }

  async function goToNextPage() {
    const link = document.querySelector(NEXT_PAGE_SELECTOR);
    if (!link) return false;

    const before = tableSignature();
    link.click();

    const start = Date.now();
    while (Date.now() - start < PAGE_REFRESH_TIMEOUT_MS) {
      await wait(PAGE_REFRESH_POLL_MS);
      const after = tableSignature();
      if (after && after !== before) return true;
    }
    return false;
  }

  // ---------- Widget notification ----------
  function notifyWidget() {
    chrome.runtime.sendMessage(
      { type: 'PRS_CALENDAR_UPDATED' },
      () => { void chrome.runtime.lastError; }
    );
  }

  // ---------- Auto-mode: scrape every page ----------
  const MAX_PAGES = 20;

  async function collectAllPages() {
    const seenDates = new Set();
    let pagesVisited = 0;

    while (pagesVisited < MAX_PAGES) {
      if (!document.querySelector(TABLE_SELECTOR)) {
        let tries = 0;
        while (!document.querySelector(TABLE_SELECTOR) && tries < 40) {
          await wait(PAGE_REFRESH_POLL_MS);
          tries++;
        }
      }

      const entries = scrapeTable();
      entries.forEach(e => seenDates.add(e.date));

      await mergeAddOnly(entries);
      notifyWidget();

      pagesVisited++;

      const moved = await goToNextPage();
      if (!moved) break;
    }

    await reconcileAll(seenDates);
    notifyWidget();

    return { seenDates, pagesVisited };
  }

  // ---------- Manual-mode: watch for table changes ----------
  function startManualMonitor() {
    let debounceTimer = null;
    let lastSignature = '';

    const triggerRescrape = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        try {
          const sig = tableSignature();
          if (!sig || sig === lastSignature) return;
          lastSignature = sig;

          const entries = scrapeTable();
          if (entries.length === 0) return;
          await mergeAddOnly(entries);
          notifyWidget();
        } catch { /* ignore */ }
      }, MANUAL_DEBOUNCE_MS);
    };

    const attach = () => {
      const table = document.querySelector(TABLE_SELECTOR);
      if (!table) return null;

      lastSignature = tableSignature();

      const observer = new MutationObserver(triggerRescrape);
      observer.observe(table, {
        childList: true,
        subtree: true,
        characterData: true
      });

      const pager = document.querySelector('#\\33, .pagination, .pager');
      if (pager) {
        observer.observe(pager, { childList: true, subtree: true });
      }

      return observer;
    };

    let observer = attach();
    if (!observer) {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        observer = attach();
        if (observer || tries > 40) clearInterval(timer);
      }, PAGE_REFRESH_POLL_MS);
    }

    setTimeout(async () => {
      try {
        const entries = scrapeTable();
        if (entries.length > 0) {
          lastSignature = tableSignature();
          await mergeAddOnly(entries);
          notifyWidget();
        }
      } catch { /* ignore */ }
    }, 300);
  }

  // ---------- Run ----------
  function run(isAuto) {
    if (isAuto) {
      collectAllPages()
        .catch(() => { /* swallow */ })
        .finally(() => {
          chrome.runtime.sendMessage(
            { type: 'PRS_SCRAPE_DONE' },
            () => { void chrome.runtime.lastError; }
          );
        });
    } else {
      startManualMonitor();
    }
  }

  function boot() {
    chrome.runtime.sendMessage(
      { type: 'PRS_IS_AUTO_SCRAPE_TAB' },
      (response) => {
        const isAuto = !!(response && response.auto);
        run(isAuto);
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();