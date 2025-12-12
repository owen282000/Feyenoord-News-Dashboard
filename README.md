# Feyenoord News Dashboard

![Dashboard](docs/assets/screenshot-dashboard.png)

Real-time Feyenoord news dashboard with live match scores, Eredivisie standings, and news articles from FR12.

## Features

- Live match scores with 1-minute updates during games
- Real-time Eredivisie standings (top 5 teams around Feyenoord)
- Automatic news rotation from FR12
- Weather information for Rotterdam

## Run Locally

Clone the project

```bash
  git clone https://github.com/owen282000/Feyenoord-News-Dashboard.git
```

Go to the project directory

```bash
  cd Feyenoord-News-Dashboard
```

Build container

```bash
  docker build -t feyenoord-news-display .
```

Start container on port 80

```bash
  docker run -p 80:3000 -e WEATHER_API_KEY=your_api_key_ --name fnd -d feyenoord-news-display
```

View dashboard

```bash
  http://localhost
```

## Environment Variables

To run this project, you can set the following environment variables in Docker: 

`WEATHER_API_KEY` - `optional` - retrieve from https://www.weatherapi.com/

Weather will show "Weer niet beschikbaar" if not provided

`PORT` - `optional` - `default` `3000` - listening port within container

## API Endpoints

Main dashboard

```bash
  http://localhost/
```

Match data (ESPN API)

```bash
  http://localhost/matches
```

Standings data (ESPN API)

```bash
  http://localhost/standings
```

RSS feed

```bash
  http://localhost/rss
```

Article content

```bash
  http://localhost/get-article-content?url=<article_url>
```

Weather

```bash
  http://localhost/weather?city=rotterdam
```
    