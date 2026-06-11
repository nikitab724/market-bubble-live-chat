// Show schedule: Thursdays 1PM Pacific. The countdown targets wall-clock
// 13:00 in America/Los_Angeles, so it stays correct across PST/PDT switches.

const BROADCAST_TIME_ZONE = "America/Los_Angeles";
const BROADCAST_WEEKDAY = 4; // Thursday
const BROADCAST_HOUR = 13;

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const wallClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: BROADCAST_TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

export function getNextBroadcastTime(now = new Date()) {
  const wall = getWallClockParts(now);

  let daysAhead = (BROADCAST_WEEKDAY - wall.weekday + 7) % 7;
  if (daysAhead === 0 && wall.hour >= BROADCAST_HOUR) {
    daysAhead = 7;
  }

  // Date.UTC normalizes day overflow, giving the target calendar date.
  const targetDate = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + daysAhead));

  return new Date(zonedWallTimeToEpochMs(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
    BROADCAST_HOUR,
  ));
}

export function getCountdownParts(target, now = new Date()) {
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(totalMs / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
  };
}

// Convert a Los Angeles wall-clock time to an instant: start from the UTC
// guess, then correct by however far the zone's rendering of that instant
// misses the requested wall time. Two passes converge across DST switches.
function zonedWallTimeToEpochMs(year, monthIndex, day, hour) {
  const wantedAsUtc = Date.UTC(year, monthIndex, day, hour);
  let epochMs = wantedAsUtc;

  for (let pass = 0; pass < 2; pass += 1) {
    const wall = getWallClockParts(new Date(epochMs));
    const renderedAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    epochMs += wantedAsUtc - renderedAsUtc;
  }

  return epochMs;
}

function getWallClockParts(date) {
  const parts = {};
  for (const { type, value } of wallClockFormat.formatToParts(date)) {
    parts[type] = value;
  }

  return {
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
