// Import necessary modules
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');

// Initialize express app
const app = express();

// Port configuration
const PORT = process.env.PORT || 3000;

// ESPN API configuration (no API key required)
const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1';
const FEYENOORD_ESPN_ID = 142; // Feyenoord Rotterdam ESPN team ID

// Only these hosts may be fetched by /get-article-content
const ALLOWED_ARTICLE_HOSTS = new Set(['www.fr12.nl', 'fr12.nl']);

function isAllowedArticleUrl(url) {
  return url.protocol === 'https:' && ALLOWED_ARTICLE_HOSTS.has(url.hostname);
}

// In-memory cache for news articles and football data
let newsCache = null;
let standingsCache = null;
let matchesCache = null;
let weatherCache = {};
let cacheTimestamp = {
  news: null,
  standings: null,
  matches: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CACHE_DURATION_LIVE_MATCH = 30 * 1000; // 30 seconds for live matches
const CACHE_DURATION_NEAR_KICKOFF = 60 * 1000; // 1 minute around kickoff
const WEATHER_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const WEATHER_CACHE_MAX_CITIES = 20; // Bound memory: the kiosk only ever asks for one city

// Article text cache, so the preload actually warms the real request
// and each article hits fr12.nl only once
const articleCache = new Map();
const ARTICLE_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const ARTICLE_CACHE_MAX_ENTRIES = 50;

// Middleware
app.use(cors()); // Enable CORS
app.use(express.static('public')); // Serve static files

// Route to fetch RSS feed with caching and fallback
app.get('/rss', async (req, res) => {
  const RSS_URL = 'https://www.fr12.nl/sitemap/news.xml';

  // Check if cache is valid
  const isCacheValid = cacheTimestamp.news &&
    (Date.now() - cacheTimestamp.news < CACHE_DURATION);

  if (isCacheValid && newsCache) {
    console.log('Serving RSS from cache');
    return res.type('application/xml').send(newsCache);
  }

  try {
    const response = await fetch(RSS_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.text();

    // Update cache
    newsCache = data;
    cacheTimestamp.news = Date.now();

    res.type('application/xml').send(data);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);

    // Return cached data if available, even if expired
    if (newsCache) {
      console.log('Serving stale cache due to error');
      return res.type('application/xml').send(newsCache);
    }

    res.status(500).json({
      error: 'Error fetching RSS feed',
      fallback: true,
      message: 'No news available at the moment'
    });
  }
});

// Route to fetch weather data
app.get('/weather', async (req, res) => {
  const city = req.query.city;
  const apiKey = process.env.WEATHER_API_KEY;

  if (!city) {
    return res.status(400).json({ error: 'Missing city parameter' });
  }

  if (!apiKey) {
    console.error('WEATHER_API_KEY is not configured');
    return res.status(503).json({
      error: 'Weather service not configured',
      message: 'Weer niet beschikbaar'
    });
  }

  // Serve from cache when still fresh
  const cached = weatherCache[city];
  if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_DURATION) {
    console.log(`Serving weather for ${city} from cache`);
    return res.json(cached.data);
  }

  const weatherApiUrl = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`;

  try {
    const response = await fetch(weatherApiUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Bound the cache so unknown city values can't grow memory indefinitely
    if (!weatherCache[city] && Object.keys(weatherCache).length >= WEATHER_CACHE_MAX_CITIES) {
      weatherCache = {};
    }
    weatherCache[city] = { data: data, timestamp: Date.now() };

    res.json(data);
  } catch (error) {
    console.error('Error fetching weather data:', error);

    // Return cached data if available, even if expired
    if (cached) {
      console.log('Serving stale weather cache due to error');
      return res.json(cached.data);
    }

    res.status(500).json({
      error: 'Error fetching weather data',
      message: 'Weer niet beschikbaar'
    });
  }
});

// Route to get the content of an article
app.get('/get-article-content', async (req, res) => {
  const articleUrl = req.query.url;

  // Only allow fetching articles from the known news source (prevents SSRF)
  let parsedUrl;
  try {
    parsedUrl = new URL(articleUrl);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!isAllowedArticleUrl(parsedUrl)) {
    console.warn(`Blocked article fetch for disallowed URL: ${articleUrl}`);
    return res.status(403).json({ error: 'URL not allowed' });
  }

  // Serve from cache: the client preloads each article before displaying it,
  // so without this every article would hit fr12.nl twice
  const cachedArticle = articleCache.get(parsedUrl.href);
  if (cachedArticle && Date.now() - cachedArticle.timestamp < ARTICLE_CACHE_DURATION) {
    return res.json({ text: cachedArticle.text });
  }

  try {
    const response = await fetch(parsedUrl.href);

    // Re-check after redirects, so a redirect can't escape the allowlist
    if (!isAllowedArticleUrl(new URL(response.url))) {
      console.warn(`Blocked article fetch: redirected to disallowed URL ${response.url}`);
      return res.status(403).json({ error: 'URL not allowed' });
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const firstParagraph = $('#article-content p').first();

    // Return plain text only: the client renders this as textContent, so no
    // markup from the external site can reach the page
    const text = firstParagraph.text().replace(/\s+/g, ' ').trim();

    if (!text) {
      return res.status(404).json({ error: 'Article content not found' });
    }

    if (articleCache.size >= ARTICLE_CACHE_MAX_ENTRIES) {
      // Drop the oldest entry (Map preserves insertion order)
      articleCache.delete(articleCache.keys().next().value);
    }
    articleCache.set(parsedUrl.href, { text: text, timestamp: Date.now() });

    res.json({ text: text });
  } catch (error) {
    console.error('Error fetching article content:', error);
    res.status(500).json({ error: 'Error fetching article' });
  }
});

// Route to fetch Eredivisie standings from ESPN API
app.get('/standings', async (req, res) => {
  // Check cache validity - 30 minutes for standings (updated less frequently)
  const STANDINGS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  const isCacheValid = cacheTimestamp.standings &&
    (Date.now() - cacheTimestamp.standings < STANDINGS_CACHE_DURATION);

  if (isCacheValid && standingsCache) {
    console.log('Serving standings from cache');
    return res.json(standingsCache);
  }

  try {
    // Fetch current Eredivisie standings from ESPN
    const response = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/ned.1/standings');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Get the current season standings (first child)
    if (!data.children || data.children.length === 0) {
      throw new Error('No standings data found in ESPN response');
    }

    const currentSeason = data.children[0];
    const entries = currentSeason.standings?.entries;

    if (!entries || entries.length === 0) {
      throw new Error('No standings entries found');
    }

    const standings = [];
    let feyenoordIndex = -1;

    // Parse standings entries
    entries.forEach((entry, index) => {
      const team = entry.team;
      const pointsStat = entry.stats.find(s => s.name === 'points');
      const points = pointsStat ? parseInt(pointsStat.value) : 0;

      const isFeyenoord = team.displayName.includes('Feyenoord');

      standings.push({
        position: index + 1,
        team: team.shortDisplayName || team.displayName,
        points: points,
        isFeyenoord: isFeyenoord
      });

      if (isFeyenoord) {
        feyenoordIndex = index;
      }
    });

    // Filter to show teams around Feyenoord
    let filteredStandings = standings;
    if (feyenoordIndex !== -1) {
      let startIndex, endIndex;

      if (feyenoordIndex === 0) {
        // First place: show 4 below
        startIndex = 0;
        endIndex = Math.min(5, standings.length);
      } else if (feyenoordIndex === 1) {
        // Second place: show 1 above, 3 below
        startIndex = 0;
        endIndex = Math.min(5, standings.length);
      } else {
        // Other positions: show 2 above, 2 below
        startIndex = Math.max(0, feyenoordIndex - 2);
        endIndex = Math.min(feyenoordIndex + 3, standings.length);
      }

      filteredStandings = standings.slice(startIndex, endIndex);
    }

    const result = { standings: filteredStandings };

    // Update cache
    standingsCache = result;
    cacheTimestamp.standings = Date.now();

    console.log(`Fetched ${filteredStandings.length} standings from ESPN API`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching standings from ESPN:', error);

    // Return cached data if available
    if (standingsCache) {
      console.log('Serving stale standings cache due to error');
      return res.json(standingsCache);
    }

    res.status(500).json({
      error: 'Error fetching standings',
      fallback: true,
      message: 'Standings unavailable'
    });
  }
});

// Route to fetch next Feyenoord match from ESPN API
app.get('/matches', async (req, res) => {
  // Check if there's a live match in cache to determine cache duration
  let cacheDuration = CACHE_DURATION; // Default 5 minutes

  if (matchesCache && matchesCache.match) {
    const status = matchesCache.match.status;
    const hasLiveMatch = status === 'STATUS_IN_PROGRESS' ||
      status === 'STATUS_FIRST_HALF' ||
      status === 'STATUS_SECOND_HALF' ||
      status === 'STATUS_HALFTIME';

    if (hasLiveMatch) {
      cacheDuration = CACHE_DURATION_LIVE_MATCH; // 30 seconds during live match
    } else {
      // Poll more often around kickoff so the switch to a live score is quick
      const kickoff = new Date(matchesCache.match.date);
      const minutesToKickoff = isNaN(kickoff.getTime())
        ? Infinity
        : (kickoff.getTime() - Date.now()) / 60000;
      const isNearKickoff = minutesToKickoff <= 30 && minutesToKickoff >= -180;

      cacheDuration = isNearKickoff ? CACHE_DURATION_NEAR_KICKOFF : CACHE_DURATION;
    }
  }

  const isCacheValid = cacheTimestamp.matches &&
    (Date.now() - cacheTimestamp.matches < cacheDuration);

  if (isCacheValid && matchesCache) {
    console.log(`Serving matches from cache (${cacheDuration/1000}s TTL)`);
    return res.json(matchesCache);
  }

  try {
    // Fetch Feyenoord's team data including next event from ESPN
    const response = await fetch(`${ESPN_API_BASE}/teams/${FEYENOORD_ESPN_ID}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Get next event from team data
    let nextMatch = null;
    let showingMostRecent = false;

    if (data.team?.nextEvent && data.team.nextEvent.length > 0) {
      const nextEvent = data.team.nextEvent[0];
      const eventStatus = nextEvent.competitions[0].status.type.name;

      // Skip canceled matches and fetch from schedule instead
      if (eventStatus === 'STATUS_CANCELED') {
        console.log(`Next event is canceled: ${nextEvent.name}, fetching schedule for next valid match`);
      } else {
        nextMatch = nextEvent;
        console.log(`Next match: ${nextMatch.name}`);
      }
    }

    if (!nextMatch) {
      // Fallback: fetch schedule to find next valid match or most recent completed match
      console.log('No nextEvent found, fetching schedule');
      const scheduleResponse = await fetch(`${ESPN_API_BASE}/teams/${FEYENOORD_ESPN_ID}/schedule`);
      const scheduleData = await scheduleResponse.json();

      if (scheduleData.events && scheduleData.events.length > 0) {
        const currentTime = new Date();
        let nextUpcomingMatch = null;
        let mostRecentMatch = null;

        for (const event of scheduleData.events) {
          const matchDate = new Date(event.date);
          const status = event.competitions[0].status.type.name;

          // Skip canceled matches
          if (status === 'STATUS_CANCELED') {
            continue;
          }

          // Look for next upcoming match (scheduled or postponed)
          if (matchDate > currentTime && (status === 'STATUS_SCHEDULED' || status === 'STATUS_POSTPONED')) {
            if (!nextUpcomingMatch || matchDate < new Date(nextUpcomingMatch.date)) {
              nextUpcomingMatch = event;
            }
          }

          // Also track most recent completed match as fallback
          if (matchDate < currentTime && status === 'STATUS_FULL_TIME') {
            if (!mostRecentMatch || matchDate > new Date(mostRecentMatch.date)) {
              mostRecentMatch = event;
            }
          }
        }

        // Prefer upcoming match, fall back to most recent
        if (nextUpcomingMatch) {
          nextMatch = nextUpcomingMatch;
          console.log(`Found next upcoming match: ${nextMatch.name}`);
        } else if (mostRecentMatch) {
          nextMatch = mostRecentMatch;
          showingMostRecent = true;
          console.log(`No upcoming matches, showing most recent: ${nextMatch.name}`);
        }
      }
    }

    if (!nextMatch) {
      throw new Error('No matches found');
    }

    const competition = nextMatch.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
    const status = competition.status.type.name;

    // Extract scores - handle both string and object formats
    const homeScore = typeof homeTeam.score === 'object' ? (homeTeam.score.displayValue || homeTeam.score.value || '0') : (homeTeam.score || '0');
    const awayScore = typeof awayTeam.score === 'object' ? (awayTeam.score.displayValue || awayTeam.score.value || '0') : (awayTeam.score || '0');

    const result = {
      match: {
        homeTeam: homeTeam.team.shortDisplayName || homeTeam.team.displayName,
        awayTeam: awayTeam.team.shortDisplayName || awayTeam.team.displayName,
        homeScore: String(homeScore),
        awayScore: String(awayScore),
        date: nextMatch.date,
        status: status,
        displayClock: competition.status.displayClock || '',
        period: competition.status.period || 0,
        competition: 'Eredivisie',
        isLive: status === 'STATUS_IN_PROGRESS' || status === 'STATUS_FIRST_HALF' || status === 'STATUS_SECOND_HALF' || status === 'STATUS_HALFTIME',
        isPostponed: status === 'STATUS_POSTPONED',
        isSuspended: status === 'STATUS_SUSPENDED',
        isCanceled: status === 'STATUS_CANCELED',
        isPastMatch: showingMostRecent,
        isCompleted: status === 'STATUS_FULL_TIME'
      }
    };

    // Update cache
    matchesCache = result;
    cacheTimestamp.matches = Date.now();

    res.json(result);
  } catch (error) {
    console.error('Error fetching matches from ESPN:', error);

    // Return cached data if available
    if (matchesCache) {
      console.log('Serving stale matches cache due to error');
      return res.json(matchesCache);
    }

    res.status(500).json({
      error: 'Error fetching matches',
      fallback: true,
      message: 'Match data unavailable'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
