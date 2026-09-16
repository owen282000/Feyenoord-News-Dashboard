#!/bin/bash
# Switch the ESPN simulator between match scenarios.
#
#   ./dev/sim.sh                     list scenarios, marking the active one
#   ./dev/sim.sh live-second-half    switch to that scenario
#
# Override the simulator location with SIM_URL if it is not on localhost:3099.

SIM_URL="${SIM_URL:-http://localhost:3099}"

if ! curl -sf "$SIM_URL/_sim/scenarios" >/dev/null 2>&1; then
  echo "No simulator reachable at $SIM_URL"
  echo "Start it with: node dev/espn-simulator.js"
  exit 1
fi

if [ -z "$1" ]; then
  curl -s "$SIM_URL/_sim/scenarios" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      const { current, scenarios } = JSON.parse(d);
      console.log('Scenarios (actief: ' + current + ')\n');
      for (const s of scenarios) {
        console.log((s.active ? ' > ' : '   ') + s.name.padEnd(20) + s.description);
      }
      console.log('\nWisselen: ./dev/sim.sh <naam>');
    });"
  exit 0
fi

curl -sf -X POST "$SIM_URL/_sim/scenario?name=$1" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
    const r = JSON.parse(d);
    if (r.error) { console.error(r.error); console.error('Beschikbaar: ' + r.available.join(', ')); process.exit(1); }
    console.log('Scenario: ' + r.current + ' - ' + r.description);
  });" || {
    echo "Onbekend scenario '$1'. Gebruik ./dev/sim.sh om de lijst te zien."
    exit 1
  }
