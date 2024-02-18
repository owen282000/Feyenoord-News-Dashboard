// Import necessary modules
const express = require('express');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const cors = require('cors');

// Initialize express app
const app = express();

// Port configuration
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS
app.use(express.static('public')); // Serve static files

// Route to fetch RSS feed
app.get('/rss', async (req, res) => {
  const RSS_URL = 'https://www.fr12.nl/sitemap/news.xml';
  try {
    const response = await fetch(RSS_URL);
    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    res.status(500).send('Error fetching RSS feed');
  }
});

// Route to fetch weather data
app.get('/weather', async (req, res) => {
  const city = req.query.city;
  const apiKey = process.env.WEATHER_API_KEY;
  const weatherApiUrl = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`;

  try {
    const response = await fetch(weatherApiUrl);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching weather data:', error);
    res.status(500).send('Error fetching weather data');
  }
});

// Route to get the content of an article
app.get('/get-article-content', async (req, res) => {
  const articleUrl = req.query.url;

  try {
    const response = await fetch(articleUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const content = dom.window.document.querySelector('#article-content');

    if (content) {
      const firstParagraph = content.querySelector('p') ? `<p>${content.querySelector('p').innerHTML}</p>` : '';
      res.json({ content: firstParagraph });
    } else {
      res.status(404).send('Article content not found');
    }
  } catch (error) {
    console.error('Error fetching article content:', error);
    res.status(500).send('Error fetching article');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
