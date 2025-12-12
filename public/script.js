document.addEventListener('DOMContentLoaded', function() {
    initializePage();

    function initializePage() {
        setEventListeners();
        fetchData();
    }

    function setEventListeners() {
        window.addEventListener('load', adjustArticleLayout);
        window.addEventListener('resize', adjustArticleLayout);
    }

    function fetchData() {
        fetchRSSFeed();
        updateDateTime();
        updateWeather('Rotterdam');
        fetchMatches();
        fetchStandings();
        setInterval(updateDateTime, 60000); // Update the date and time every minute
        setInterval(fetchMatches, 60000); // Update matches every minute
        setInterval(fetchStandings, 300000); // Update standings every 5 minutes
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

    function processRSSFeed(data) {
        const allItems = Array.from(data.querySelectorAll("item"));
        const items = allItems.filter(isItemFromLastWeek);
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
        const imageUrl = item.querySelector("enclosure").getAttribute("url");
        const img = new Image();
        img.src = imageUrl;

        // Preload article content
        const link = item.querySelector("link").textContent;
        fetch(`/get-article-content?url=${encodeURIComponent(link)}`)
            .catch(err => console.error('Error preloading article content:', err));
    }

    function isItemFromLastWeek(item) {
        const pubDate = new Date(item.querySelector("pubDate").textContent);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 2); // Use news items from 2 days max
        return pubDate > weekAgo;
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
        const title = item.querySelector("title").textContent;
        const link = item.querySelector("link").textContent;
        const imageUrl = item.querySelector("enclosure").getAttribute("url");
        const date = new Date(item.querySelector("pubDate").textContent);
        const dateString = formatDate(date);

        document.getElementById('news-image').style.backgroundImage = `url(${imageUrl})`;
        document.getElementById('news-title').textContent = title;
        document.getElementById('news-date-time').textContent = dateString;

        fetchArticleContent(link);
    }

    function fetchArticleContent(link) {
        fetch(`/get-article-content?url=${encodeURIComponent(link)}`)
            .then(response => response.json())
            .then(article => document.getElementById('news-description').innerHTML = article.content)
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

    function displayMatch(match) {
        if (!match) {
            displayMatchesError('Geen wedstrijden gepland');
            return;
        }

        let html = '<div class="match-card';

        // Handle different match statuses
        if (match.isLive) {
            html += ' live">';
            html += '<span class="live-indicator">LIVE</span>';
            html += '<div class="match-teams">';
            html += `<span>${match.homeTeam}</span>`;
            html += `<span class="match-score">${match.homeScore} - ${match.awayScore}</span>`;
            html += `<span>${match.awayTeam}</span>`;
            html += '</div>';
            if (match.displayClock) {
                // Replace HT with Dutch "Rust" for halftime
                const clockText = match.displayClock === 'HT' ? 'Rust' : match.displayClock;
                html += `<span class="match-time">${clockText}</span>`;
            }
        } else if (match.isPostponed) {
            const matchDate = new Date(match.date);
            const formattedDate = formatMatchDate(matchDate);
            html += '">';
            html += '<span class="match-status postponed">UITGESTELD</span>';
            html += `<span class="match-time">${formattedDate}</span>`;
            html += '<div class="match-teams">';
            html += `<span>${match.homeTeam}</span>`;
            html += `<span class="match-score">vs</span>`;
            html += `<span>${match.awayTeam}</span>`;
            html += '</div>';
        } else if (match.isSuspended) {
            html += '">';
            html += '<span class="match-status suspended">ONDERBROKEN</span>';
            html += '<div class="match-teams">';
            html += `<span>${match.homeTeam}</span>`;
            html += `<span class="match-score">${match.homeScore} - ${match.awayScore}</span>`;
            html += `<span>${match.awayTeam}</span>`;
            html += '</div>';
        } else if (match.isCanceled) {
            html += '">';
            html += '<span class="match-status canceled">GEANNULEERD</span>';
            html += '<div class="match-teams">';
            html += `<span>${match.homeTeam}</span>`;
            html += `<span class="match-score">vs</span>`;
            html += `<span>${match.awayTeam}</span>`;
            html += '</div>';
        } else if (match.isCompleted) {
            // Completed match (showing because no upcoming matches)
            const matchDate = new Date(match.date);
            const formattedDate = formatMatchDate(matchDate);
            html += '">';
            html += '<span class="match-status" style="background-color: rgba(100, 100, 100, 0.3); border: 1px solid rgba(100, 100, 100, 0.6);">LAATSTE WEDSTRIJD</span>';
            html += '<div class="match-teams">';
            html += `<span>${match.homeTeam}</span>`;
            html += `<span class="match-score">${match.homeScore} - ${match.awayScore}</span>`;
            html += `<span>${match.awayTeam}</span>`;
            html += '</div>';
            html += `<span class="match-time" style="opacity: 0.7;">${formattedDate}</span>`;
        } else {
            // Scheduled match
            const matchDate = new Date(match.date);
            const formattedDate = formatMatchDate(matchDate);
            html += '">';
            html += `<span class="match-time">${formattedDate}</span>`;
            html += '<div class="match-teams">';
            html += `<span>${match.homeTeam}</span>`;
            html += `<span class="match-score">vs</span>`;
            html += `<span>${match.awayTeam}</span>`;
            html += '</div>';
        }

        html += '</div>';

        // Update both original and duplicate elements
        document.getElementById('upcoming-match').innerHTML = html;
        document.getElementById('upcoming-match-duplicate').innerHTML = html;
        document.getElementById('recent-results').innerHTML = '';

        // Ensure seamless scrolling by duplicating content multiple times if needed
        ensureTickerContinuity();
    }

    function formatMatchDate(date) {
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        const day = date.getDate();
        const month = date.toLocaleDateString('nl-NL', { month: 'long' });
        const time = date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day} ${month}, ${time}`;
    }

    function getCountdown(matchDate) {
        const now = new Date();
        const diff = matchDate - now;

        if (diff < 0) return '';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) {
            return `Over ${days} dag${days > 1 ? 'en' : ''}`;
        } else if (hours > 0) {
            return `Over ${hours} uur`;
        } else {
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            return `Over ${minutes} minuten`;
        }
    }

    function displayMatchesError(message) {
        document.getElementById('upcoming-match').innerHTML =
            `<div class="error-message">${message}</div>`;
        document.getElementById('recent-results').innerHTML = '';
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
            html += `<td class="position">${team.position}</td>`;
            html += `<td class="team-name">${team.team}</td>`;
            html += `<td class="points">${team.points}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('standings-table').innerHTML = html;
        document.getElementById('standings-table-duplicate').innerHTML = html;

        // Ensure seamless scrolling by duplicating content multiple times if needed
        ensureTickerContinuity();
    }

    let tickerInitialized = false;

    function ensureTickerContinuity() {
        // Only run once and wait longer for DOM to fully update
        if (tickerInitialized) return;

        setTimeout(() => {
            const ticker = document.getElementById('ticker-container');
            const sidebar = document.querySelector('.sidebar');
            const matchInfo = document.getElementById('match-info');
            const standings = document.getElementById('standings');

            if (!ticker || !sidebar || !matchInfo || !standings) return;

            // Check if data is actually loaded (not showing loading messages)
            const isMatchLoaded = !matchInfo.innerHTML.includes('laden');
            const isStandingsLoaded = !standings.innerHTML.includes('laden');

            if (!isMatchLoaded || !isStandingsLoaded) return;

            // Mark as initialized
            tickerInitialized = true;

            // Remove any existing extra clones first
            const existingClones = ticker.querySelectorAll('.match-info:not(#match-info):not(#match-info-duplicate), .standings:not(#standings):not(#standings-duplicate)');
            existingClones.forEach(clone => clone.remove());

            // Get the width of the ticker content (only original + first duplicate)
            const matchInfoDup = document.getElementById('match-info-duplicate');
            const standingsDup = document.getElementById('standings-duplicate');

            if (!matchInfoDup || !standingsDup) return;

            const tickerWidth = ticker.scrollWidth / 2;
            const sidebarWidth = sidebar.offsetWidth;

            // If ticker content is less than 3x the sidebar width, we need more duplicates
            if (tickerWidth < sidebarWidth * 3) {
                // Add 2 more sets of duplicates to ensure continuous scrolling
                const clone1Match = matchInfo.cloneNode(true);
                const clone1Standings = standings.cloneNode(true);
                const clone2Match = matchInfo.cloneNode(true);
                const clone2Standings = standings.cloneNode(true);

                // Remove IDs from clones to avoid conflicts
                clone1Match.removeAttribute('id');
                clone1Standings.removeAttribute('id');
                clone2Match.removeAttribute('id');
                clone2Standings.removeAttribute('id');

                // Append clones
                ticker.appendChild(clone1Match);
                ticker.appendChild(clone1Standings);
                ticker.appendChild(clone2Match);
                ticker.appendChild(clone2Standings);
            }
        }, 500);
    }

    function displayStandingsError(message) {
        document.getElementById('standings-table').innerHTML =
            `<div class="error-message">${message}</div>`;
    }
});
