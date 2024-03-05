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
        setInterval(updateDateTime, 60000); // Update the date and time every minute
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
            .then(response => response.text())
            .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
            .then(data => processRSSFeed(data))
            .catch(err => console.error('Error fetching RSS feed:', err));
    }

    function processRSSFeed(data) {
        const allItems = Array.from(data.querySelectorAll("item"));
        const items = allItems.filter(isItemFromLastWeek);
        let currentItemIndex = 0;

        // Immediately display the first item
        displayNextItem(items, currentItemIndex++);

        // Continue displaying items at intervals
        const displayInterval = setInterval(() => {
            const hasMoreItems = displayNextItem(items, currentItemIndex++);
            if (!hasMoreItems) {
                clearInterval(displayInterval);
                setTimeout(() => window.location.reload(), 10000); // Reload after all items are displayed
            }
        }, 30000);
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
            updatePageContent(item);
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
                document.getElementById('weather').innerHTML = `<img src="https:${conditionIcon}" alt="Weather Icon"> ${temperature}°C`;
            })
            .catch(error => console.error('Error fetching weather data:', error));
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
});
