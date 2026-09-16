# ESPN-simulator

Een nepversie van de ESPN API, zodat wedstrijdsituaties (live, rust, gestaakt,
storing) te testen zijn op elke willekeurige dag in plaats van alleen tijdens
een echte wedstrijd.

De simulator serveert dezelfde endpoints als ESPN, gebouwd uit echte responses
in `dev/fixtures/`. De dashboardserver praat er ongewijzigd mee: alleen de
omgevingsvariabele `ESPN_BASE_URL` wijst hem een andere kant op.

## Starten

Met Docker (de simulator start automatisch mee):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Of zonder Docker, in twee terminals:

```bash
npm run sim      # simulator op poort 3099
npm run dev:sim  # dashboard op poort 3000, gekoppeld aan de simulator
```

## Scenario wisselen

```bash
./dev/sim.sh                    # toon alle scenario's, actieve gemarkeerd
./dev/sim.sh live-second-half   # schakel om
```

De pagina in de browser toont de nieuwe situatie binnen circa 30 seconden
(de client haalt elke 30 seconden op). De simulator leegt bij het wisselen
automatisch de servercache, anders zou je tot 5 minuten op de oude stand
blijven kijken.

## Scenario's

| Naam | Situatie |
| --- | --- |
| `scheduled-far` | Wedstrijd over 5 dagen (normale rustsituatie) |
| `scheduled-soon` | Aftrap over 20 minuten |
| `live-kickoff` | Net afgetrapt, 0-0 |
| `live-first-half` | Eerste helft, 1-0 voor |
| `live-halftime` | Rust, 1-0 |
| `live-second-half` | Tweede helft, 2-1 |
| `live-losing` | Tweede helft, 1-3 achter |
| `finished-win` | Afgelopen, 3-1 gewonnen |
| `postponed` | Uitgesteld |
| `suspended` | Gestaakt tijdens de wedstrijd |
| `canceled` | Afgelast (server pakt de volgende uit het schema) |
| `error-500` | ESPN geeft een serverfout |
| `error-timeout` | ESPN reageert niet |

Bij de vier doorlopende live-scenario's tikt de klok vanzelf door: één
wedstrijdminuut per seconde, zodat een helft in ongeveer 45 seconden voorbij is.

## Storingen testen

Een scenariowissel leegt normaal de cache. Bij een storingstest wil je dat
juist niet, want in het echt valt ESPN uit terwijl er nog een gecachet
antwoord ligt:

```bash
curl -X POST 'http://localhost:3099/_sim/scenario?name=error-500&keepCache=1'
```

Het dashboard hoort dan de laatst bekende stand te blijven tonen (HTTP 200),
niet een foutmelding.

## Fixtures verversen

De fixtures zijn echte ESPN-responses. Opnieuw ophalen:

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/teams/142" -o dev/fixtures/espn-team.json
curl -s "https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/teams/142/schedule" -o dev/fixtures/espn-schedule.json
curl -s "https://site.api.espn.com/apis/v2/sports/soccer/ned.1/standings" -o dev/fixtures/espn-standings.json
```

## Let op

`ESPN_BASE_URL` hoort alleen in de ontwikkelomgeving te staan. Staat hij
gezet, dan logt de server bij het starten een waarschuwing en is het
`/_dev/flush-cache`-endpoint actief. In productie is die variabele leeg en
gedraagt alles zich zoals altijd.
