// ESPN API simulator for local development.
//
// Serves the same endpoints as ESPN, built from real responses captured in
// dev/fixtures, with the match state rewritten to whatever scenario is
// selected. Point the dashboard at it with ESPN_BASE_URL and the server code
// runs completely unchanged.
//
//   node dev/espn-simulator.js
//   ESPN_BASE_URL=http://localhost:3099 npm start
//
// Switch scenario while everything keeps running:
//   curl -X POST 'http://localhost:3099/_sim/scenario?name=live-second-half'
//   curl http://localhost:3099/_sim/scenarios

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.SIM_PORT || 3099;
const FIXTURES = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

// Each scenario describes the match state the dashboard should see.
// clock/period are only read for in-progress states.
const SCENARIOS = {
  'scheduled-far': {
    description: 'Wedstrijd over 5 dagen (normale rustsituatie)',
    status: 'STATUS_SCHEDULED',
    date: () => minutesFromNow(5 * 24 * 60),
    home: '0', away: '0', displayClock: "0'", period: 0
  },
  'scheduled-soon': {
    description: 'Aftrap over 20 minuten (server schakelt naar 1 min cache)',
    status: 'STATUS_SCHEDULED',
    date: () => minutesFromNow(20),
    home: '0', away: '0', displayClock: "0'", period: 0
  },
  'live-kickoff': {
    description: 'Net afgetrapt, 0-0',
    status: 'STATUS_FIRST_HALF',
    date: () => minutesFromNow(-2),
    home: '0', away: '0', displayClock: "2'", period: 1
  },
  'live-first-half': {
    description: 'Eerste helft, Feyenoord voor 1-0',
    status: 'STATUS_FIRST_HALF',
    date: () => minutesFromNow(-31),
    home: '1', away: '0', displayClock: "31'", period: 1
  },
  'live-halftime': {
    description: 'Rust, 1-0',
    status: 'STATUS_HALFTIME',
    date: () => minutesFromNow(-47),
    home: '1', away: '0', displayClock: 'HT', period: 1
  },
  'live-second-half': {
    description: 'Tweede helft, 2-1 spannend',
    status: 'STATUS_SECOND_HALF',
    date: () => minutesFromNow(-78),
    home: '2', away: '1', displayClock: "78'", period: 2
  },
  'live-losing': {
    description: 'Tweede helft, Feyenoord achter 1-3',
    status: 'STATUS_SECOND_HALF',
    date: () => minutesFromNow(-70),
    home: '1', away: '3', displayClock: "70'", period: 2
  },
  'finished-win': {
    description: 'Afgelopen, gewonnen 3-1',
    status: 'STATUS_FULL_TIME',
    date: () => minutesFromNow(-120),
    home: '3', away: '1', displayClock: "90'", period: 2
  },
  'postponed': {
    description: 'Uitgesteld',
    status: 'STATUS_POSTPONED',
    date: () => minutesFromNow(2 * 24 * 60),
    home: '0', away: '0', displayClock: "0'", period: 0
  },
  'suspended': {
    description: 'Gestaakt tijdens de wedstrijd',
    status: 'STATUS_SUSPENDED',
    date: () => minutesFromNow(-55),
    home: '1', away: '1', displayClock: "55'", period: 2
  },
  'canceled': {
    description: 'Afgelast (server valt terug op het schema)',
    status: 'STATUS_CANCELED',
    date: () => minutesFromNow(3 * 24 * 60),
    home: '0', away: '0', displayClock: "0'", period: 0
  },
  'error-500': {
    description: 'ESPN geeft een serverfout (test de stale-cache fallback)',
    fail: 500
  },
  'error-timeout': {
    description: 'ESPN reageert niet (test de timeout/fallback)',
    hang: true
  }
};

// Scenarios that advance the clock on their own, so a running match actually
// ticks forward instead of freezing on one minute
const AUTO_ADVANCING = new Set(['live-kickoff', 'live-first-half', 'live-second-half', 'live-losing']);

let current = process.env.SIM_SCENARIO || 'scheduled-far';
let scenarioStartedAt = Date.now();

if (!SCENARIOS[current]) {
  console.error(`Unknown SIM_SCENARIO "${current}", falling back to scheduled-far`);
  current = 'scheduled-far';
}

function statusType(name) {
  const map = {
    STATUS_SCHEDULED: { id: '1', state: 'pre', completed: false, description: 'Scheduled' },
    STATUS_FIRST_HALF: { id: '2', state: 'in', completed: false, description: 'First Half' },
    STATUS_HALFTIME: { id: '3', state: 'in', completed: false, description: 'Halftime' },
    STATUS_SECOND_HALF: { id: '4', state: 'in', completed: false, description: 'Second Half' },
    STATUS_FULL_TIME: { id: '28', state: 'post', completed: true, description: 'Full Time' },
    STATUS_POSTPONED: { id: '6', state: 'post', completed: false, description: 'Postponed' },
    STATUS_SUSPENDED: { id: '7', state: 'post', completed: false, description: 'Suspended' },
    STATUS_CANCELED: { id: '5', state: 'post', completed: false, description: 'Canceled' }
  };
  const base = map[name] || map.STATUS_SCHEDULED;
  return Object.assign({ name: name, detail: base.description, shortDetail: base.description }, base);
}

// Live scenarios advance one match minute per real second, so a full half
// plays out in about 45 seconds of watching
function liveClock(scenario) {
  if (!AUTO_ADVANCING.has(current)) {
    return { displayClock: scenario.displayClock, period: scenario.period };
  }
  const elapsed = Math.floor((Date.now() - scenarioStartedAt) / 1000);
  const startMinute = parseInt(scenario.displayClock, 10) || 0;
  const minute = startMinute + elapsed;
  const cap = scenario.period === 1 ? 45 : 90;
  return { displayClock: `${Math.min(minute, cap)}'`, period: scenario.period };
}

function applyScenario(event) {
  const scenario = SCENARIOS[current];
  const competition = event.competitions[0];
  const clock = liveClock(scenario);

  event.date = scenario.date();
  competition.date = event.date;
  competition.status = {
    clock: 0,
    addedClock: 0,
    displayClock: clock.displayClock,
    period: clock.period,
    type: statusType(scenario.status)
  };

  const home = competition.competitors.find(c => c.homeAway === 'home');
  const away = competition.competitors.find(c => c.homeAway === 'away');
  if (home) home.score = scenario.home;
  if (away) away.score = scenario.away;

  return event;
}

// Fault injection happens before any payload is built
function maybeFail(req, res) {
  const scenario = SCENARIOS[current];
  if (scenario.hang) {
    console.log(`[sim] ${req.path} -> hanging (scenario ${current})`);
    return true; // never responds
  }
  if (scenario.fail) {
    console.log(`[sim] ${req.path} -> ${scenario.fail} (scenario ${current})`);
    res.status(scenario.fail).json({ error: 'Simulated upstream failure' });
    return true;
  }
  return false;
}

app.get('/apis/site/v2/sports/soccer/ned.1/teams/:id', (req, res) => {
  if (maybeFail(req, res)) return;

  const data = loadFixture('espn-team.json');
  if (data.team?.nextEvent?.length) {
    data.team.nextEvent[0] = applyScenario(data.team.nextEvent[0]);
  }
  console.log(`[sim] team -> ${current} (${SCENARIOS[current].status || 'n/a'})`);
  res.json(data);
});

app.get('/apis/site/v2/sports/soccer/ned.1/teams/:id/schedule', (req, res) => {
  if (maybeFail(req, res)) return;

  const data = loadFixture('espn-schedule.json');
  // Canceled is the one case where the server falls through to the schedule,
  // so give it a valid upcoming match to find there
  if (current === 'canceled' && data.events?.length) {
    const event = applyScenario(JSON.parse(JSON.stringify(data.events[0])));
    event.date = minutesFromNow(7 * 24 * 60);
    event.competitions[0].date = event.date;
    event.competitions[0].status = {
      clock: 0, addedClock: 0, displayClock: "0'", period: 0,
      type: statusType('STATUS_SCHEDULED')
    };
    data.events = [event];
  }
  console.log(`[sim] schedule -> ${current}`);
  res.json(data);
});

app.get('/apis/v2/sports/soccer/ned.1/standings', (req, res) => {
  if (maybeFail(req, res)) return;
  console.log('[sim] standings');
  res.json(loadFixture('espn-standings.json'));
});

// Control plane
app.get('/_sim/scenarios', (req, res) => {
  res.json({
    current: current,
    scenarios: Object.entries(SCENARIOS).map(([name, s]) => ({
      name: name,
      description: s.description,
      active: name === current
    }))
  });
});

// The dashboard caches ESPN responses, so a scenario switch would otherwise
// only show up once the TTL expires
async function flushDashboardCache() {
  const target = process.env.DASHBOARD_URL || 'http://localhost:3000';
  try {
    const response = await fetch(`${target}/_dev/flush-cache`, { method: 'POST' });
    if (response.ok) {
      console.log(`[sim] flushed dashboard cache at ${target}`);
      return true;
    }
    console.log(`[sim] dashboard at ${target} refused the flush (${response.status})`);
  } catch (error) {
    console.log(`[sim] no dashboard reachable at ${target} to flush`);
  }
  return false;
}

app.post('/_sim/scenario', async (req, res) => {
  const name = req.query.name;
  if (!SCENARIOS[name]) {
    return res.status(400).json({
      error: `Unknown scenario "${name}"`,
      available: Object.keys(SCENARIOS)
    });
  }
  current = name;
  scenarioStartedAt = Date.now();
  console.log(`[sim] scenario -> ${name}: ${SCENARIOS[name].description}`);

  // ?keepCache=1 leaves the dashboard cache intact, which is what an outage
  // really looks like: ESPN fails while a previous response is still cached
  const keepCache = req.query.keepCache === '1';
  const flushed = keepCache ? false : await flushDashboardCache();

  res.json({
    current: current,
    description: SCENARIOS[name].description,
    cacheFlushed: flushed,
    cacheKept: keepCache
  });
});

app.listen(PORT, () => {
  console.log(`ESPN simulator listening on http://localhost:${PORT}`);
  console.log(`Scenario: ${current} (${SCENARIOS[current].description})`);
  console.log(`Point the dashboard at it with ESPN_BASE_URL=http://localhost:${PORT}`);
});
