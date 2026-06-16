const defaults = {
  loanAmount: 12000000,
  tenor: 12,
  annualRate: 12,
  loanDate: "2025-12-15",
  cutoffDay: 15,
  daysPerYear: 365,
  extras: [],
};

const fields = {
  loanAmount: document.querySelector("#loanAmount"),
  tenor: document.querySelector("#tenor"),
  annualRate: document.querySelector("#annualRate"),
  loanDate: document.querySelector("#loanDate"),
  cutoffDay: document.querySelector("#cutoffDay"),
  daysPerYear: document.querySelector("#daysPerYear"),
};

const elements = {
  tableWrap: document.querySelector(".table-wrap"),
  toastContainer: document.querySelector("#toastContainer"),
  scheduleBody: document.querySelector("#scheduleBody"),
  heroTotalPayment: document.querySelector("#heroTotalPayment"),
  heroEndingBalance: document.querySelector("#heroEndingBalance"),
  totalInterest: document.querySelector("#totalInterest"),
  totalPrincipal: document.querySelector("#totalPrincipal"),
  totalExtra: document.querySelector("#totalExtra"),
  avgPayment: document.querySelector("#avgPayment"),
  extraDate: document.querySelector("#extraDate"),
  extraAmount: document.querySelector("#extraAmount"),
  applyExtraButton: document.querySelector("#applyExtraButton"),
  saveLoanButton: document.querySelector("#saveLoanButton"),
  saveCalculationButton: document.querySelector("#saveCalculationButton"),
  clearExtrasButton: document.querySelector("#clearExtrasButton"),
  exportButton: document.querySelector("#exportButton"),
  resetButton: document.querySelector("#resetButton"),
};

let extras = [...defaults.extras];
let currentRows = [];
let pendingFocusMonth = null;
let pendingFocusDate = null;
let activeConfig = null;

function readNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function readFormattedNumber(input, fallback = 0) {
  const normalized = String(input.value || "").replace(/[^\d]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : fallback;
}

function formatPlainNumber(value) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value || 0)));
}

function normalizeMoneyInput(input) {
  const value = readFormattedNumber(input, 0);
  input.value = value > 0 ? formatPlainNumber(value) : "";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  elements.toastContainer.append(toast);
  playNotificationSound();

  window.setTimeout(() => {
    toast.classList.add("is-hiding");
  }, 5000);

  window.setTimeout(() => {
    toast.remove();
  }, 5250);
}

function playNotificationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const audioContext = new AudioContext();
  const gain = audioContext.createGain();
  gain.connect(audioContext.destination);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);

  [660, 880].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + (index * 0.08));
    oscillator.connect(gain);
    oscillator.start(audioContext.currentTime + (index * 0.08));
    oscillator.stop(audioContext.currentTime + 0.24 + (index * 0.08));
  });

  window.setTimeout(() => audioContext.close(), 420);
}

function parseDateInput(value, fallback) {
  const [year, month, day] = String(value || fallback).split("-").map(Number);
  if (!year || !month || !day) {
    return parseDateInput(fallback, "2026-01-10");
  }

  return new Date(year, month - 1, day);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function cutoffDateFor(year, monthIndex, cutoffDay) {
  const day = Math.min(cutoffDay, daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, day);
}

function nextCutoffAfter(date, cutoffDay) {
  const currentMonthCutoff = cutoffDateFor(date.getFullYear(), date.getMonth(), cutoffDay);

  if (currentMonthCutoff > date) {
    return currentMonthCutoff;
  }

  return cutoffDateFor(date.getFullYear(), date.getMonth() + 1, cutoffDay);
}

function differenceInDays(startDate, endDate) {
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.max(0, Math.round((end - start) / 86400000));
}

function compareDates(leftDate, rightDate) {
  const left = Date.UTC(leftDate.getFullYear(), leftDate.getMonth(), leftDate.getDate());
  const right = Date.UTC(rightDate.getFullYear(), rightDate.getMonth(), rightDate.getDate());
  return left - right;
}

function getExtrasForPeriod(periodStart, periodEnd) {
  return extras
    .map((extra) => ({
      ...extra,
      dateObject: parseDateInput(extra.date, defaults.loanDate),
    }))
    .filter((extra) => compareDates(extra.dateObject, periodStart) >= 0 && compareDates(extra.dateObject, periodEnd) < 0)
    .map((extra) => ({
      ...extra,
      daysToCutoff: differenceInDays(extra.dateObject, periodEnd),
    }));
}

function renderExtraRows(row) {
  return row.periodExtras.map((extra) => {
    const config = activeConfig || readConfigFromFields();
    const extraInterest = extra.amount * config.annualRate * (extra.daysToCutoff / config.daysPerYear);

    return `
      <tr class="extra-transaction-row" data-row-month="${row.month}">
        <td><span class="type-badge type-extra">Tambah Pinjaman</span></td>
        <td>${row.month}</td>
        <td>${formatCurrency(extra.amount)}</td>
        <td>${formatDate(extra.dateObject)}</td>
        <td>${formatDate(row.periodEnd)}</td>
        <td>${extra.daysToCutoff}</td>
        <td>${row.resetMonth}</td>
        <td>${row.remainingTenor}</td>
        <td>${formatCurrency(extraInterest)}</td>
        <td>-</td>
        <td>${formatCurrency(extraInterest)}</td>
        <td>-</td>
        <td>-</td>
      </tr>
    `;
  }).join("");
}

function setDefaults() {
  fields.loanAmount.value = formatPlainNumber(defaults.loanAmount);
  fields.tenor.value = defaults.tenor;
  fields.annualRate.value = defaults.annualRate;
  fields.loanDate.value = defaults.loanDate;
  fields.cutoffDay.value = defaults.cutoffDay;
  fields.daysPerYear.value = defaults.daysPerYear;
  elements.extraAmount.value = "";
  elements.extraDate.value = "";
  extras = [...defaults.extras];
  activeConfig = readConfigFromFields();
  render();
}

function readConfigFromFields() {
  const tenor = Math.max(1, Math.round(readNumber(fields.tenor, defaults.tenor)));
  const cutoffDay = Math.min(31, Math.max(1, Math.round(readNumber(fields.cutoffDay, defaults.cutoffDay))));
  const loanDate = parseDateInput(fields.loanDate.value, defaults.loanDate);

  return {
    loanAmount: Math.max(0, readFormattedNumber(fields.loanAmount, defaults.loanAmount)),
    tenor,
    annualRate: Math.max(0, readNumber(fields.annualRate, defaults.annualRate)) / 100,
    loanDate,
    cutoffDay,
    daysPerYear: Math.max(1, readNumber(fields.daysPerYear, defaults.daysPerYear)),
  };
}

function readLoanFields() {
  return {
    loanAmount: Math.max(0, readFormattedNumber(fields.loanAmount, defaults.loanAmount)),
    tenor: Math.max(1, Math.round(readNumber(fields.tenor, defaults.tenor))),
    loanDate: parseDateInput(fields.loanDate.value, defaults.loanDate),
  };
}

function readCalculationFields() {
  return {
    annualRate: Math.max(0, readNumber(fields.annualRate, defaults.annualRate)) / 100,
    cutoffDay: Math.min(31, Math.max(1, Math.round(readNumber(fields.cutoffDay, defaults.cutoffDay)))),
    daysPerYear: Math.max(1, readNumber(fields.daysPerYear, defaults.daysPerYear)),
  };
}

function syncLoanFields(config) {
  fields.loanAmount.value = formatPlainNumber(config.loanAmount);
  fields.tenor.value = config.tenor;
  fields.loanDate.value = toDateInputValue(config.loanDate);
}

function syncCalculationFields(config) {
  fields.annualRate.value = Math.round(config.annualRate * 10000) / 100;
  fields.cutoffDay.value = config.cutoffDay;
  fields.daysPerYear.value = config.daysPerYear;
}

function runLoadingButton(button, loadingText, doneText, callback) {
  if (button.disabled) return;

  button.disabled = true;
  button.classList.add("is-loading");
  button.textContent = loadingText;

  window.setTimeout(() => {
    callback();
    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = doneText;
  }, 2000);
}

function simulate(config) {
  const rows = [];
  let endingAfterExtra = config.loanAmount;
  let resetMonth = 1;
  let previousExtra = 0;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalPayment = 0;
  let totalExtra = 0;
  let periodStart = config.loanDate;
  let scheduleEndMonth = config.tenor;
  const maxScheduleRows = Math.max(config.tenor, 1) * 20;

  for (let month = 1; month <= scheduleEndMonth && month <= maxScheduleRows; month += 1) {
    const baseBeginningBalance = month === 1 ? config.loanAmount : endingAfterExtra;
    const periodEnd = nextCutoffAfter(periodStart, config.cutoffDay);
    const periodDays = differenceInDays(periodStart, periodEnd);
    const periodExtras = getExtrasForPeriod(periodStart, periodEnd);
    const startingExtras = periodExtras.filter((item) => compareDates(item.dateObject, periodStart) === 0);
    const midPeriodExtras = periodExtras.filter((item) => compareDates(item.dateObject, periodStart) > 0);
    const startingExtra = startingExtras.reduce((sum, item) => sum + item.amount, 0);
    const midPeriodExtra = midPeriodExtras.reduce((sum, item) => sum + item.amount, 0);
    const extra = startingExtra + midPeriodExtra;
    const extraInterest = midPeriodExtras.reduce((sum, item) => {
      return sum + (item.amount * config.annualRate * (item.daysToCutoff / config.daysPerYear));
    }, 0);
    const beginningBalance = baseBeginningBalance + startingExtra;

    if (month > 1 && (previousExtra > 0 || startingExtra > 0)) {
      resetMonth = month;
      scheduleEndMonth = month + config.tenor - 1;
    }

    const remainingTenor = Math.max(1, config.tenor - (month - resetMonth));
    const baseInterest = beginningBalance * config.annualRate * (periodDays / config.daysPerYear);
    const interest = baseInterest + extraInterest;
    const principal = Math.max(0, Math.min(beginningBalance / remainingTenor, beginningBalance));
    const payment = interest + principal;
    const endingBeforeExtra = beginningBalance - principal;

    endingAfterExtra = Math.max(0, endingBeforeExtra + midPeriodExtra);
    previousExtra = midPeriodExtra;
    if (midPeriodExtra > 0) {
      scheduleEndMonth = Math.max(scheduleEndMonth, month + config.tenor);
    }
    totalInterest += interest;
    totalPrincipal += principal;
    totalPayment += payment;
    totalExtra += extra;

    rows.push({
      month,
      beginningBalance,
      periodStart,
      periodEnd,
      periodDays,
      periodExtras,
      extraInterest,
      resetMonth,
      remainingTenor,
      interest,
      principal,
      payment,
      endingBeforeExtra,
      extra,
      endingAfterExtra,
    });

    periodStart = periodEnd;
  }

  return {
    rows,
    summary: {
      totalInterest,
      totalPrincipal,
      totalPayment,
      totalExtra,
      endingBalance: rows.at(-1)?.endingAfterExtra || 0,
      averagePayment: rows.length ? totalPayment / rows.length : 0,
    },
  };
}

function render() {
  const config = activeConfig || readConfigFromFields();

  const result = simulate(config);
  currentRows = result.rows;

  elements.scheduleBody.innerHTML = result.rows.map((row) => {
    const extraClass = row.extra > 0 ? "is-extra" : "";
    const rowClass = row.extra > 0 ? "extra-row" : "";
    return `
      <tr class="${rowClass}" data-row-month="${row.month}">
        <td><span class="type-badge type-payment">Cicilan</span></td>
        <td>${row.month}</td>
        <td>${formatCurrency(row.beginningBalance)}</td>
        <td>${formatDate(row.periodStart)}</td>
        <td>${formatDate(row.periodEnd)}</td>
        <td>${row.periodDays}</td>
        <td>${row.resetMonth}</td>
        <td>${row.remainingTenor}</td>
        <td>${formatCurrency(row.interest)}</td>
        <td>${formatCurrency(row.principal)}</td>
        <td>${formatCurrency(row.payment)}</td>
        <td>${formatCurrency(row.endingBeforeExtra)}</td>
        <td>${formatCurrency(row.endingAfterExtra)}</td>
      </tr>
      ${renderExtraRows(row)}
    `;
  }).join("");

  elements.heroTotalPayment.textContent = formatCurrency(result.summary.totalPayment);
  elements.heroEndingBalance.textContent = formatCurrency(result.summary.endingBalance);
  elements.totalInterest.textContent = formatCurrency(result.summary.totalInterest);
  elements.totalPrincipal.textContent = formatCurrency(result.summary.totalPrincipal);
  elements.totalExtra.textContent = formatCurrency(result.summary.totalExtra);
  elements.avgPayment.textContent = formatCurrency(result.summary.averagePayment);

  if (pendingFocusDate !== null) {
    const focusedRow = result.rows.find((row) => {
      return row.periodExtras.some((extra) => extra.date === pendingFocusDate);
    });

    if (focusedRow) {
      focusTableRow(focusedRow.month);
    }
    pendingFocusDate = null;
  }

  if (pendingFocusMonth !== null) {
    focusTableRow(pendingFocusMonth);
    pendingFocusMonth = null;
  }
}

function focusTableRow(month) {
  requestAnimationFrame(() => {
    const row = elements.scheduleBody.querySelector(`[data-row-month="${month}"]`);
    if (!row) return;

    const rowLeft = row.offsetLeft;
    const rowTop = row.offsetTop;
    const targetLeft = Math.max(0, rowLeft - 24);
    const targetTop = Math.max(0, rowTop - (elements.tableWrap.clientHeight / 2) + (row.offsetHeight / 2));

    elements.tableWrap.scrollTo({
      left: targetLeft,
      top: targetTop,
      behavior: "smooth",
    });

    row.classList.remove("focus-row");
    requestAnimationFrame(() => row.classList.add("focus-row"));
  });
}

function setExtraLoan(date, amount, shouldFocus = amount > 0) {
  if (!date) return;

  if (amount > 0) {
    extras.push({
      id: `${date}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date,
      amount,
    });
    extras.sort((left, right) => compareDates(parseDateInput(left.date, defaults.loanDate), parseDateInput(right.date, defaults.loanDate)));

    if (shouldFocus) {
      pendingFocusDate = date;
    }
  }

  render();
}

function exportCsv() {
  const headers = [
    "Tipe",
    "Bulan",
    "Saldo Awal",
    "Tanggal Awal",
    "Cut Off",
    "Hari",
    "Bulan Reset",
    "Tenor Sisa",
    "Bunga",
    "Pokok",
    "Cicilan",
    "Saldo Akhir Sebelum Tambahan",
    "Saldo Akhir Setelah Tambahan",
  ];

  const lines = currentRows.flatMap((row) => {
    const paymentLine = [
      "Cicilan",
      row.month,
      row.beginningBalance,
      toDateInputValue(row.periodStart),
      toDateInputValue(row.periodEnd),
      row.periodDays,
      row.resetMonth,
      row.remainingTenor,
      row.interest,
      row.principal,
      row.payment,
      row.endingBeforeExtra,
      row.endingAfterExtra,
    ];

    const extraLines = row.periodExtras.map((extra) => {
      const config = activeConfig || readConfigFromFields();
      const extraInterest = extra.amount * config.annualRate * (extra.daysToCutoff / config.daysPerYear);

      return [
        "Tambah Pinjaman",
        row.month,
        extra.amount,
        extra.date,
        toDateInputValue(row.periodEnd),
        extra.daysToCutoff,
        row.resetMonth,
        row.remainingTenor,
        extraInterest,
        "",
        extraInterest,
        "",
        "",
      ];
    });

    return [paymentLine, ...extraLines];
  }).map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "simulasi-pinjaman.csv";
  link.click();
  URL.revokeObjectURL(url);
}

elements.applyExtraButton.addEventListener("click", () => {
  const date = elements.extraDate.value;
  const amount = readFormattedNumber(elements.extraAmount, 0);
  normalizeMoneyInput(elements.extraAmount);
  if (!date || amount <= 0) {
    showToast("Isi tanggal pinjaman dan nominal terlebih dahulu.");
    return;
  }

  runLoadingButton(elements.applyExtraButton, "Memproses", "Terapkan", () => {
    setExtraLoan(date, amount);
    elements.extraDate.value = "";
    elements.extraAmount.value = "";
    showToast("Tambah pinjaman berhasil disimpan.");
  });
});

elements.saveLoanButton.addEventListener("click", () => {
  runLoadingButton(elements.saveLoanButton, "Menyimpan", "Save Input Pinjaman", () => {
    activeConfig = {
      ...(activeConfig || readConfigFromFields()),
      ...readLoanFields(),
    };
    syncLoanFields(activeConfig);
    render();
    showToast("Input pinjaman berhasil disimpan.");
  });
});

elements.saveCalculationButton.addEventListener("click", () => {
  runLoadingButton(elements.saveCalculationButton, "Menyimpan", "Save Konfigurasi", () => {
    activeConfig = {
      ...(activeConfig || readConfigFromFields()),
      ...readCalculationFields(),
    };
    syncCalculationFields(activeConfig);
    render();
    showToast("Konfigurasi perhitungan berhasil disimpan.");
  });
});

elements.clearExtrasButton.addEventListener("click", () => {
  extras = [];
  render();
});

elements.exportButton.addEventListener("click", exportCsv);
elements.resetButton.addEventListener("click", setDefaults);

let isTableDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragScrollLeft = 0;
let dragScrollTop = 0;

elements.tableWrap.addEventListener("pointerdown", (event) => {
  if (event.target.closest("input, button, a")) return;

  isTableDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragScrollLeft = elements.tableWrap.scrollLeft;
  dragScrollTop = elements.tableWrap.scrollTop;
  elements.tableWrap.classList.add("is-dragging");
  elements.tableWrap.setPointerCapture(event.pointerId);
});

elements.tableWrap.addEventListener("pointermove", (event) => {
  if (!isTableDragging) return;

  elements.tableWrap.scrollLeft = dragScrollLeft - (event.clientX - dragStartX);
  elements.tableWrap.scrollTop = dragScrollTop - (event.clientY - dragStartY);
});

function stopTableDrag(event) {
  if (!isTableDragging) return;

  isTableDragging = false;
  elements.tableWrap.classList.remove("is-dragging");

  if (elements.tableWrap.hasPointerCapture(event.pointerId)) {
    elements.tableWrap.releasePointerCapture(event.pointerId);
  }
}

elements.tableWrap.addEventListener("pointerup", stopTableDrag);
elements.tableWrap.addEventListener("pointercancel", stopTableDrag);
elements.tableWrap.addEventListener("pointerleave", stopTableDrag);

const collapsibleSections = document.querySelectorAll("details.input-group");

function getSectionContent(section) {
  return section.querySelector(".input-group-content");
}

function openSection(section) {
  const content = getSectionContent(section);
  if (!content || section.dataset.animating === "open") return;

  section.dataset.animating = "open";
  section.open = true;
  content.style.height = "0px";
  content.style.opacity = "0";

  requestAnimationFrame(() => {
    content.style.height = `${content.scrollHeight}px`;
    content.style.opacity = "1";
  });

  window.setTimeout(() => {
    content.style.height = "auto";
    delete section.dataset.animating;
  }, 240);
}

function closeSection(section) {
  const content = getSectionContent(section);
  if (!content || !section.open || section.dataset.animating === "close") return;

  section.dataset.animating = "close";
  content.style.height = `${content.scrollHeight}px`;
  content.style.opacity = "1";

  requestAnimationFrame(() => {
    content.style.height = "0px";
    content.style.opacity = "0";
  });

  window.setTimeout(() => {
    section.open = false;
    delete section.dataset.animating;
  }, 240);
}

collapsibleSections.forEach((section) => {
  const summary = section.querySelector("summary");
  const content = getSectionContent(section);

  if (content) {
    content.style.height = section.open ? "auto" : "0px";
    content.style.opacity = section.open ? "1" : "0";
  }

  summary.addEventListener("click", (event) => {
    event.preventDefault();

    if (section.open && section.dataset.animating !== "close") {
      closeSection(section);
      return;
    }

    collapsibleSections.forEach((otherSection) => {
      if (otherSection !== section) {
        closeSection(otherSection);
      }
    });
    openSection(section);
  });
});

[fields.loanAmount, elements.extraAmount].forEach((input) => {
  input.addEventListener("input", () => {
    normalizeMoneyInput(input);
  });
  input.addEventListener("blur", () => normalizeMoneyInput(input));
});

setDefaults();
