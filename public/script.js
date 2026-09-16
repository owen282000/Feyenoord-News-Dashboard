document.addEventListener('DOMContentLoaded', function() {
    // Article rotation timing. The progress bar is driven by these, so keep
    // FADE_DURATION in sync with the fadeOut animation in styles.css
    const ROTATION_INTERVAL = 30000;
    const PRELOAD_LEAD_TIME = 3000;
    const FADE_DURATION = 1000;

    initializePage();

    function initializePage() {
        setEventListeners();
        fetchData();
    }

    function setEventListeners() {
        // Timers get throttled while the page is hidden, so refresh on return
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshLiveData();
        });

        // Catch up immediately once the network is back
        window.addEventListener('online', refreshLiveData);
    }

    function refreshLiveData() {
        updateDateTime();
        fetchMatches();
        fetchStandings();
        updateWeather('Rotterdam');
    }

    function fetchData() {
        fetchRSSFeed();
        updateDateTime();
        updateWeather('Rotterdam');
        fetchMatches();
        fetchStandings();
        setInterval(updateDateTime, 30000); // Update the clock every 30 seconds
        setInterval(fetchMatches, 30000); // Update matches every 30 seconds (faster for live matches)
        setInterval(fetchStandings, 300000); // Update standings every 5 minutes
        setInterval(() => updateWeather('Rotterdam'), 600000); // Update weather every 10 minutes
    }

    function fetchRSSFeed() {
        fetch('/rss')
            .then(response => {
                if (!response.ok) {
                    throw new Error('RSS feed unavailable');
                }
                return response.text();
            })
            .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
            .then(data => {
                // Cache the RSS feed to localStorage
                localStorage.setItem('feyenoord_rss_cache', new XMLSerializer().serializeToString(data));
                localStorage.setItem('feyenoord_rss_cache_time', Date.now().toString());
                processRSSFeed(data);
            })
            .catch(err => {
                console.error('Error fetching RSS feed:', err);

                // Try to load from cache
                const cachedRSS = localStorage.getItem('feyenoord_rss_cache');
                const cacheTime = localStorage.getItem('feyenoord_rss_cache_time');

                if (cachedRSS) {
                    console.log('Loading RSS from localStorage cache');
                    const parser = new window.DOMParser();
                    const cachedData = parser.parseFromString(cachedRSS, "text/xml");
                    const cacheAge = Date.now() - parseInt(cacheTime || '0');
                    const cacheAgeHours = Math.floor(cacheAge / (1000 * 60 * 60));

                    displayNewsWarning(`Getoond vanuit cache (${cacheAgeHours} uur oud)`);
                    processRSSFeed(cachedData);
                } else {
                    displayNewsError('Nieuws tijdelijk niet beschikbaar. Er is geen gecachte content beschikbaar.');
                }
            });
    }

    function displayNewsError(message) {
        const contentWrapper = document.querySelector('.content-wrapper');
        contentWrapper.style.display = 'flex';
        contentWrapper.style.alignItems = 'center';
        contentWrapper.style.justifyContent = 'center';

        document.getElementById('news-image').style.display = 'none';
        document.getElementById('news-title').textContent = 'Feyenoord Nieuws Dashboard';
        document.getElementById('news-description').innerHTML =
            `<div class="error-message" style="text-align: center; padding: 40px;">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#d50032" stroke-width="2" style="margin-bottom: 20px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p style="font-size: 2.5vh; margin: 10px 0;">${message}</p>
                <p style="font-size: 1.8vh; color: #666;">Probeer de pagina te verversen</p>
            </div>`;
        document.getElementById('news-date-time').textContent = '';
    }

    function displayNewsWarning(message) {
        const warning = document.createElement('div');
        warning.className = 'cache-warning';
        warning.style.cssText = 'position: fixed; top: 6vh; right: 2%; background: rgba(255, 165, 0, 0.9); color: white; padding: 10px 20px; border-radius: 5px; z-index: 100; font-size: 1.5vh;';
        warning.textContent = '⚠️ ' + message;
        document.body.appendChild(warning);
        setTimeout(() => warning.remove(), 5000);
    }

    function getItemText(item, selector) {
        const element = item.querySelector(selector);
        return element ? element.textContent.trim() : '';
    }

    function getItemImage(item) {
        const enclosure = item.querySelector("enclosure");
        return enclosure ? enclosure.getAttribute("url") : '';
    }

    function getItemDate(item) {
        const raw = getItemText(item, "pubDate");
        if (!raw) return null;
        const date = new Date(raw);
        return isNaN(date.getTime()) ? null : date;
    }

    // An item is only usable if we can show a title and fetch its content
    function isUsableItem(item) {
        return getItemText(item, "title") !== '' && getItemText(item, "link") !== '';
    }

    function processRSSFeed(data) {
        const allItems = Array.from(data.querySelectorAll("item")).filter(isUsableItem);
        let items = allItems.filter(isItemFromLastTwoDays);

        // Nothing recent enough: fall back to the newest items we do have,
        // so the kiosk never ends up with an empty screen and a reload loop
        if (items.length === 0 && allItems.length > 0) {
            console.warn('No items from the last 2 days, falling back to most recent items');
            items = allItems
                .slice()
                .sort((a, b) => {
                    const dateA = getItemDate(a);
                    const dateB = getItemDate(b);
                    return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
                })
                .slice(0, 10);
        }

        if (items.length === 0) {
            displayNewsError('Geen nieuwsberichten beschikbaar');
            return;
        }

        let currentItemIndex = 0;

        // Immediately display the first item
        displayNextItem(items, currentItemIndex++);
        startArticleProgress(currentItemIndex < items.length);

        // Continue displaying items at intervals with preloading
        const displayInterval = setInterval(() => {
            // Preload next item 3 seconds before displaying
            if (currentItemIndex < items.length) {
                preloadNextItem(items[currentItemIndex]);
            }

            setTimeout(() => {
                const hasMoreItems = displayNextItem(items, currentItemIndex++);
                if (!hasMoreItems) {
                    clearInterval(displayInterval);
                    startArticleProgress(false);
                    setTimeout(() => window.location.reload(), 10000);
                } else {
                    startArticleProgress(currentItemIndex < items.length);
                }
            }, PRELOAD_LEAD_TIME); // Wait for the preload before displaying
        }, ROTATION_INTERVAL);
    }

    // Runs from the moment an article becomes visible until the next one does
    function startArticleProgress(hasMoreItems) {
        const container = document.getElementById('article-progress');
        const bar = document.getElementById('article-progress-bar');
        if (!container || !bar) return;

        // Nothing follows this article, so a progress bar would promise a
        // transition that never comes
        if (!hasMoreItems) {
            container.hidden = true;
            bar.classList.remove('running');
            return;
        }

        container.hidden = false;

        // Restart the animation: removing the class alone is not enough
        // because the browser coalesces both style changes into one frame
        bar.classList.remove('running');
        void bar.offsetWidth;
        bar.style.animationDuration = `${ROTATION_INTERVAL}ms`;
        bar.style.animationDelay = `${FADE_DURATION}ms`;
        bar.classList.add('running');
    }

    function preloadNextItem(item) {
        if (!item) return;

        // Preload image
        const imageUrl = getItemImage(item);
        if (imageUrl) {
            const img = new Image();
            img.src = imageUrl;
        }

        // Preload article content
        const link = getItemText(item, "link");
        if (link) {
            fetch(`/get-article-content?url=${encodeURIComponent(link)}`)
                .catch(err => console.error('Error preloading article content:', err));
        }
    }

    function isItemFromLastTwoDays(item) {
        const pubDate = getItemDate(item);
        if (!pubDate) return false;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 2); // Use news items from 2 days max
        return pubDate > cutoff;
    }

    function displayNextItem(items, index) {
        if (index < items.length) {
            const item = items[index];

            // Fade out current content
            const contentWrapper = document.querySelector('.content-wrapper');
            contentWrapper.classList.remove('fade-in');
            contentWrapper.classList.add('fade-out');

            // Wait for fade out, then update content and fade in
            setTimeout(() => {
                updatePageContent(item);
                contentWrapper.classList.remove('fade-out');
                contentWrapper.classList.add('fade-in');
            }, FADE_DURATION); // Match the fadeOut animation duration

            return true;
        }
        return false;
    }

    function updatePageContent(item) {
        const title = getItemText(item, "title");
        const link = getItemText(item, "link");
        const imageUrl = getItemImage(item);
        const date = getItemDate(item);

        const newsImage = document.getElementById('news-image');
        newsImage.style.backgroundImage = imageUrl ? `url(${imageUrl})` : 'none';
        document.getElementById('news-title').textContent = title;
        document.getElementById('news-date-time').textContent = date ? formatDate(date) : '';
        document.getElementById('news-description').textContent = '';

        if (link) {
            fetchArticleContent(link);
        }
    }

    function fetchArticleContent(link) {
        fetch(`/get-article-content?url=${encodeURIComponent(link)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Article unavailable (status ${response.status})`);
                }
                return response.json();
            })
            .then(article => {
                // Plain text from the server, rendered as text so no external markup runs
                document.getElementById('news-description').textContent = article.text || '';
            })
            .catch(err => console.error('Error fetching article content:', err));
    }

    function updateDateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('datetime').textContent = timeStr;
    }

    function updateWeather(city) {
        fetch(`/weather?city=${encodeURIComponent(city)}`)
            .then(response => response.json())
            .then(data => {
                if (!data.current) {
                    throw new Error(data.message || 'Weather data unavailable');
                }
                const temperature = data.current.temp_c;
                const conditionIcon = data.current.condition.icon;
                const weatherHTML = `<img src="https:${conditionIcon}" alt="Weather Icon"> ${temperature}°C`;

                document.getElementById('weather').innerHTML = weatherHTML;

                // Cache weather data
                localStorage.setItem('feyenoord_weather_cache', weatherHTML);
                localStorage.setItem('feyenoord_weather_cache_time', Date.now().toString());
            })
            .catch(error => {
                console.error('Error fetching weather data:', error);

                // Try to load from cache
                const cachedWeather = localStorage.getItem('feyenoord_weather_cache');
                if (cachedWeather) {
                    document.getElementById('weather').innerHTML = cachedWeather;
                } else {
                    // Keep the slot quiet rather than shouting an error at shoppers
                    document.getElementById('weather').innerHTML = '<span class="weather-placeholder">-°C</span>';
                }
            });
    }

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    }

    function capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    // Reads more naturally on a display than 14-09-2026: the year is never
    // what a viewer wants to know, the day is
    function formatDate(date) {
        const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        if (isSameDay(date, now)) {
            return `Vandaag ${time}`;
        }

        if (isSameDay(date, yesterday)) {
            return `Gisteren ${time}`;
        }

        // Within the past week a weekday is clearer than a date
        const daysAgo = (now - date) / (1000 * 60 * 60 * 24);
        if (daysAgo > 0 && daysAgo < 7) {
            return `${capitalize(date.toLocaleDateString('nl-NL', { weekday: 'long' }))} ${time}`;
        }

        // Keep the year for anything outside the current one, so an old
        // article is never mistaken for a recent one
        const options = { day: 'numeric', month: 'long' };
        if (date.getFullYear() !== now.getFullYear()) {
            options.year = 'numeric';
        }
        return `${date.toLocaleDateString('nl-NL', options)}, ${time}`;
    }

    function fetchMatches() {
        fetch('/matches')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    displayMatchesError(data.message);
                    return;
                }
                displayMatch(data.match);
            })
            .catch(err => {
                console.error('Error fetching matches:', err);
                displayMatchesError('Wedstrijden tijdelijk niet beschikbaar');
            });
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    // Renders the home/score/away row shared by every match status
    function renderTeams(match, middle) {
        return '<div class="match-teams">' +
            `<span>${escapeHtml(match.homeTeam)}</span>` +
            `<span class="match-score">${escapeHtml(middle)}</span>` +
            `<span>${escapeHtml(match.awayTeam)}</span>` +
            '</div>';
    }

    function renderMatchTime(match) {
        const matchDate = new Date(match.date);
        return isNaN(matchDate.getTime()) ? '' : formatMatchDate(matchDate);
    }

    // Returns the inner HTML of a match card plus the modifier class it needs,
    // so callers can render it into an existing .match-card element
    function buildMatchCard(match) {
        const score = `${match.homeScore} - ${match.awayScore}`;

        if (match.isLive) {
            let inner = '<span class="live-indicator">LIVE</span>' + renderTeams(match, score);

            if (match.displayClock) {
                // Show "Rust" badge for halftime status
                if (match.displayClock === 'HT' || match.status === 'STATUS_HALFTIME') {
                    inner += '<span class="halftime-badge">RUST</span>';
                } else {
                    inner += `<span class="match-time">${escapeHtml(match.displayClock)}</span>`;
                }
            }

            return { className: 'match-card live', inner: inner };
        }

        if (match.isPostponed) {
            return {
                className: 'match-card',
                inner: '<span class="match-status postponed">UITGESTELD</span>' +
                    `<span class="match-time">${escapeHtml(renderMatchTime(match))}</span>` +
                    renderTeams(match, 'vs')
            };
        }

        if (match.isSuspended) {
            return {
                className: 'match-card',
                inner: '<span class="match-status suspended">ONDERBROKEN</span>' +
                    renderTeams(match, score)
            };
        }

        if (match.isCanceled) {
            return {
                className: 'match-card',
                inner: '<span class="match-status canceled">GEANNULEERD</span>' +
                    renderTeams(match, 'vs')
            };
        }

        if (match.isCompleted) {
            // Completed match (showing because no upcoming matches)
            return {
                className: 'match-card',
                inner: '<span class="match-status finished">LAATSTE WEDSTRIJD</span>' +
                    renderTeams(match, score) +
                    `<span class="match-time past">${escapeHtml(renderMatchTime(match))}</span>`
            };
        }

        // Scheduled match
        return {
            className: 'match-card',
            inner: `<span class="match-time">${escapeHtml(renderMatchTime(match))}</span>` +
                renderTeams(match, 'vs')
        };
    }

    function displayMatch(match) {
        if (!match) {
            displayMatchesError('Geen wedstrijden gepland');
            return;
        }

        const card = buildMatchCard(match);

        // Update every copy of the ticker group so both halves stay identical
        document.querySelectorAll('[data-match-card]').forEach(el => {
            el.className = card.className;
            el.innerHTML = card.inner;
        });

        displayNextMatchBlock(match);
    }

    // Label and middle column depend on what stage the match is in
    function describeMatch(match) {
        if (match.isLive) {
            const label = (match.displayClock === 'HT' || match.status === 'STATUS_HALFTIME')
                ? 'Rust'
                : (match.displayClock ? `Live ${match.displayClock}` : 'Live');
            return {
                label: label,
                separator: `${match.homeScore} - ${match.awayScore}`,
                date: ''
            };
        }

        if (match.isPostponed) {
            return { label: 'Uitgesteld', separator: 'vs', date: renderMatchTime(match) };
        }

        if (match.isSuspended) {
            return {
                label: 'Onderbroken',
                separator: `${match.homeScore} - ${match.awayScore}`,
                date: ''
            };
        }

        if (match.isCanceled) {
            return { label: 'Afgelast', separator: 'vs', date: renderMatchTime(match) };
        }

        if (match.isCompleted) {
            return {
                label: 'Laatste wedstrijd',
                separator: `${match.homeScore} - ${match.awayScore}`,
                date: renderMatchTime(match)
            };
        }

        return { label: 'Volgende wedstrijd', separator: 'vs', date: renderMatchTime(match) };
    }

    function displayNextMatchBlock(match) {
        const block = document.getElementById('next-match');
        if (!block) return;

        const info = describeMatch(match);

        document.getElementById('next-match-label').textContent = info.label;
        document.getElementById('next-match-home').textContent = match.homeTeam || '';
        document.getElementById('next-match-separator').textContent = info.separator;
        document.getElementById('next-match-away').textContent = match.awayTeam || '';

        const dateEl = document.getElementById('next-match-date');
        dateEl.textContent = info.date;
        dateEl.hidden = info.date === '';

        block.classList.toggle('live', Boolean(match.isLive));
        block.hidden = false;
    }

    function formatMatchDate(date) {
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        const day = date.getDate();
        const month = date.toLocaleDateString('nl-NL', { month: 'long' });
        const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day} ${month}, ${time}`;
    }

    function displayMatchesError(message) {
        document.querySelectorAll('[data-match-card]').forEach(el => {
            el.className = 'match-card';
            el.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
        });

        // Hide rather than keep showing a fixture we can no longer confirm
        const block = document.getElementById('next-match');
        if (block) {
            block.hidden = true;
            block.classList.remove('live');
        }
    }

    function fetchStandings() {
        fetch('/standings')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    displayStandingsError(data.message);
                    return;
                }
                displayStandings(data.standings);
            })
            .catch(err => {
                console.error('Error fetching standings:', err);
                displayStandingsError('Stand tijdelijk niet beschikbaar');
            });
    }

    function displayStandings(standings) {
        if (!standings || standings.length === 0) {
            displayStandingsError('Stand niet beschikbaar');
            return;
        }

        // Display teams around Feyenoord (already filtered by server)
        let html = '<table><thead><tr>';
        html += '<th class="position">#</th>';
        html += '<th class="team-name">Team</th>';
        html += '<th class="points">Ptn</th>';
        html += '</tr></thead><tbody>';

        standings.forEach(team => {
            html += `<tr class="${team.isFeyenoord ? 'feyenoord' : ''}">`;
            html += `<td class="position">${escapeHtml(team.position)}</td>`;
            html += `<td class="team-name">${escapeHtml(team.team)}</td>`;
            html += `<td class="points">${escapeHtml(team.points)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Update every copy of the ticker group so both halves stay identical
        document.querySelectorAll('[data-standings-table]').forEach(el => {
            el.innerHTML = html;
        });
    }

    function displayStandingsError(message) {
        document.querySelectorAll('[data-standings-table]').forEach(el => {
            el.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
        });
    }
});
