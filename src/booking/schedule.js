export const LOCATIONS = Object.freeze({
  magistral: 'Минск, ГСПК Магистраль-88 (ОМА Малиновка)',
  slobodskaya: 'Минск, ул. Слободская, 136',
});

export const HOURS = Object.freeze(Array.from({ length: 12 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`));
export const HORIZON = 28;

const minskClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Minsk',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function minskNow() {
  const parts = Object.fromEntries(minskClock.formatToParts().map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function addDays(date, days) {
  const target = new Date(`${date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

export function bookingDates(now = minskNow()) {
  return Array.from({ length: HORIZON }, (_, index) => addDays(now.date, index));
}

export function buildSchedule(bookingDb, location) {
  const now = minskNow();
  const bookings = new Set(bookingDb.reserved.all(location, now.date, addDays(now.date, HORIZON - 1))
    .map(({ date, time }) => `${date} ${time}`));
  const days = Array.from({ length: HORIZON }, (_, index) => {
    const date = addDays(now.date, index);
    const slots = HOURS.map((time) => {
      let status = 'available';
      if (bookings.has(`${date} ${time}`)) status = 'booked';
      else if (date === now.date && time <= now.time) status = 'unavailable';
      return { time, status };
    });
    return { date, slots };
  });
  return { location, locations: LOCATIONS, days };
}
