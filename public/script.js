document.addEventListener('DOMContentLoaded', function() {
    initializePage();

    function initializePage() {
        setEventListeners();
        fetchData();
    }

    function setEventListeners() {
        window.addEventListener('load', adjustArticleLayout);
        window.addEventListener('resize', adjustArticleLayout);

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

    function adjustArticleLayout() {
        adjustArticleHeight();
        adjustArticlePosition();
    }

    function adjustArticleHeight() {
        const headerHeight = document.querySelector('.header').offsetHeight;
        const imageHeight = document.querySelector('.news-image').offsetHeight;
        const windowHeight = window.innerHeight;
        const articleHeight = windowHeight - headerHeight - imageHeight;
        const newsArticle = document.querySelector('.news-article');

        newsArticle.style.maxHeight = `${articleHeight}px`;
        newsArticle.style.overflow = 'hidden';
    }

    function adjustArticlePosition() {
        const imageHeight = document.querySelector('.news-image').clientHeight;
        const newsArticle = document.querySelector('.news-article');

        newsArticle.style.marginTop = `${imageHeight}px`;
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
                    setTimeout(() => window.location.reload(), 10000);
                }
            }, 3000); // Wait 3 seconds after preload before displaying
        }, 30000);
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
            }, 1000); // Match the fadeOut animation duration

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
                    document.getElementById('weather').innerHTML = cachedWeather + ' <span style="opacity: 0.5;">⚠️</span>';
                } else {
                    document.getElementById('weather').innerHTML = '<span style="opacity: 0.5;">Weer niet beschikbaar</span>';
                }
            });
    }

    function formatDate(date) {
        return date.toLocaleDateString('nl-NL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
