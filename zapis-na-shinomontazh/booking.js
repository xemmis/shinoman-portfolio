const byId = (id) => document.getElementById(id);
const locationSelect = byId('location');
const state = byId('booking-state');
const notice = byId('booking-notice');
const retry = byId('retry');
const schedule = byId('schedule');
const daysList = byId('days');
const slotsList = byId('slots');
const dateLabel = byId('date-label');
const previousWeek = byId('previous-week');
const nextWeek = byId('next-week');
const dialog = byId('booking-dialog');
const form = byId('booking-form');
const success = byId('booking-success');
const formError = byId('form-error');
const submitButton = form.querySelector('button[type="submit"]');
const configuredApi = document.querySelector('meta[name="booking-api"]').content.trim();
const api = new URL(configuredApi || '../api/', window.location.href);
const weekSize = 7;

const shortDate = new Intl.DateTimeFormat('ru-BY', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('ru-BY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat('ru-BY', { weekday: 'short', timeZone: 'UTC' });
const parseDate = (date) => new Date(`${date}T00:00:00Z`);
const labels = { available: 'Свободно', booked: 'Занято', unavailable: 'Недоступно' };

let days = [];
let week = 0;
let selectedDate;
let loadController;
let lastSchedule = '';
let appointment;
let submitting = false;
let closing = false;
let backdropPressed = false;

function setState(key, message) {
  state.dataset.state = key;
  state.textContent = message;
}

function button(className, text) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  return element;
}

const hasSpace = (day) => day.slots.some((slot) => slot.status === 'available');

function showWeek() {
  const dayFocus = document.activeElement?.dataset.date;
  const slotFocus = document.activeElement?.dataset.time;
  const visibleDays = days.slice(week * weekSize, (week + 1) * weekSize);
  if (!visibleDays.some((day) => day.date === selectedDate)) {
    selectedDate = (visibleDays.find(hasSpace) ?? visibleDays[0]).date;
  }
  previousWeek.disabled = week === 0;
  nextWeek.disabled = (week + 1) * weekSize >= days.length;
  byId('week-label').textContent = `${shortDate.format(parseDate(visibleDays[0].date))} – ${shortDate.format(parseDate(visibleDays.at(-1).date))}`;
  daysList.replaceChildren(...visibleDays.map((day) => {
    const date = parseDate(day.date);
    const pick = button('booking-day', weekday.format(date));
    const number = document.createElement('strong');
    number.textContent = date.getUTCDate();
    pick.append(number);
    pick.dataset.date = day.date;
    pick.setAttribute('aria-pressed', String(day.date === selectedDate));
    pick.setAttribute('aria-label', `${fullDate.format(date)}, ${hasSpace(day) ? 'есть свободное время' : 'нет свободного времени'}`);
    pick.addEventListener('click', () => {
      selectedDate = day.date;
      showWeek();
    });
    return pick;
  }));

  const day = visibleDays.find((entry) => entry.date === selectedDate);
  dateLabel.textContent = fullDate.format(parseDate(day.date));
  setState(hasSpace(day) ? 'available' : 'booked', hasSpace(day) ? 'Есть свободное время' : 'На эту дату мест нет');
  slotsList.replaceChildren(...day.slots.map(({ time, status }) => {
    const pick = button(`booking-slot ${status}`, time);
    pick.dataset.time = time;
    pick.disabled = status !== 'available';
    pick.setAttribute('aria-label', `${time}, ${labels[status]}`);
    pick.addEventListener('click', () => openForm(day.date, time));
    return pick;
  }));
  if (dayFocus) {
    daysList.querySelector(`[data-date="${dayFocus}"]`)?.focus({ preventScroll: true });
  }
  if (slotFocus) {
    const slot = slotsList.querySelector(`[data-time="${slotFocus}"]:not(:disabled)`);
    (slot || dateLabel).focus({ preventScroll: true });
  }
}

async function loadSchedule({ switching = false } = {}) {
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  const url = new URL('availability', api);
  if (locationSelect.value) url.searchParams.set('location', locationSelect.value);
  if (switching) {
    setState('unavailable', 'Загружаем расписание');
    schedule.hidden = true;
    notice.textContent = '';
  }
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw new Error('Schedule unavailable');
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (!locationSelect.options.length) {
      for (const [id, name] of Object.entries(data.locations)) locationSelect.add(new Option(name, id));
      locationSelect.disabled = false;
    }
    locationSelect.value = data.location;
    const snapshot = JSON.stringify(data);
    const changed = snapshot !== lastSchedule || schedule.hidden;
    lastSchedule = snapshot;
    days = data.days;
    notice.textContent = '';
    retry.hidden = true;
    schedule.hidden = false;
    if (changed) {
      const dateIndex = days.findIndex((day) => day.date === selectedDate);
      if (dateIndex >= 0) week = Math.floor(dateIndex / weekSize);
      showWeek();
    }
  } catch {
    if (controller.signal.aborted) return;
    const moveFocus = schedule.contains(document.activeElement);
    schedule.hidden = true;
    setState('unavailable', 'Запись недоступна');
    notice.textContent = !configuredApi && window.location.hostname.endsWith('.github.io')
      ? 'Сервис записи ещё не подключён.'
      : 'Не удалось загрузить расписание. Попробуйте обновить его.';
    retry.hidden = false;
    if (moveFocus) retry.focus();
  }
}

function openForm(date, time) {
  if (dialog.open) return;
  appointment = { date, time, location: locationSelect.value, requestId: crypto.randomUUID() };
  form.reset();
  form.hidden = false;
  success.hidden = true;
  formError.textContent = '';
  dialog.querySelector('.booking-close').setAttribute('aria-label', 'Закрыть форму');
  byId('appointment').textContent = `${fullDate.format(parseDate(date))} · ${time}`;
  byId('appointment-location').textContent = locationSelect.selectedOptions[0].textContent;
  dialog.showModal();
  dialog.getBoundingClientRect();
  dialog.classList.add('is-visible');
}

async function closeForm() {
  if (!dialog.open || submitting || closing) return;
  closing = true;
  dialog.classList.remove('is-visible');
  await Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished));
  dialog.close();
  closing = false;
  form.reset();
  const slot = slotsList.querySelector(`[data-time="${appointment.time}"]:not(:disabled)`);
  if (!schedule.hidden) (slot || dateLabel).focus({ preventScroll: true });
  else retry.focus({ preventScroll: true });
  appointment = undefined;
}

locationSelect.addEventListener('change', () => loadSchedule({ switching: true }));
retry.addEventListener('click', async () => {
  await loadSchedule({ switching: true });
  if (!schedule.hidden && document.activeElement === document.body) locationSelect.focus();
});
previousWeek.addEventListener('click', () => {
  week -= 1;
  showWeek();
  if (previousWeek.disabled) daysList.querySelector('[aria-pressed="true"]').focus();
});
nextWeek.addEventListener('click', () => {
  week += 1;
  showWeek();
  if (nextWeek.disabled) daysList.querySelector('[aria-pressed="true"]').focus();
});
for (const close of dialog.querySelectorAll('[data-close]')) close.addEventListener('click', closeForm);
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeForm();
});
function isBackdrop(event) {
  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  return event.target === dialog
    && (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom);
}
dialog.addEventListener('pointerdown', (event) => {
  backdropPressed = isBackdrop(event);
});
dialog.addEventListener('click', (event) => {
  if (backdropPressed && isBackdrop(event)) closeForm();
  backdropPressed = false;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || closing) return;
  formError.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  submitting = true;
  submitButton.disabled = true;
  dialog.querySelector('.booking-close').disabled = true;
  submitButton.textContent = 'Отправляем…';
  try {
    const response = await fetch(new URL('bookings', api), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...appointment, ...data }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) {
      formError.textContent = response.status >= 500
        ? 'Сервис записи временно недоступен. Попробуйте ещё раз.'
        : result.error;
      if (response.status === 409) {
        submitButton.hidden = true;
        formError.focus();
        loadSchedule();
      }
      return;
    }
    if (result.saved !== true) throw new Error('Booking not acknowledged');
    form.hidden = true;
    success.hidden = false;
    dialog.querySelector('.booking-close').disabled = false;
    dialog.querySelector('.booking-close').setAttribute('aria-label', 'Закрыть подтверждение');
    success.querySelector('button').focus();
    loadSchedule();
  } catch {
    formError.textContent = 'Не удалось получить подтверждение. Проверьте подключение и повторите отправку.';
  } finally {
    submitting = false;
    submitButton.disabled = false;
    dialog.querySelector('.booking-close').disabled = false;
    submitButton.textContent = 'Записаться';
  }
});
dialog.addEventListener('close', () => { submitButton.hidden = false; });

if (window.location.protocol === 'file:') {
  setState('unavailable', 'Запись недоступна');
  notice.textContent = 'Для записи запустите node server.mjs и откройте сайт по адресу http://127.0.0.1:3000/.';
} else {
  loadSchedule();
  window.setInterval(() => {
    if (!document.hidden) loadSchedule();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadSchedule();
  });
}
