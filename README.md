# Feyenoord News Dashboard

![Dashboard](docs/assets/screenshot-dashboard.png)

## Run Locally

Clone the project

```bash
  git clone https://github.com/owen282000/Feyenoord-News-Dashboard.git
```

Go to the project directory

```bash
  cd Feyenoord-News-Dashboard
```

Create container

```bash
  docker build -t feyenoord-news-display .
```

Start container on port 80

```bash
  docker run -p 80:3000 -e WEATHER_API_KEY=your_api_key_ --name fnd -d feyenoord-news-display
```

Go to the webUI

```bash
  http://localhost
```

## Environment Variables

To run this project, you can set the following environment variables in Docker: 

`WEATHER_API_KEY` - `required` - retrieve from https://www.weatherapi.com/

`PORT` - `optional` - `default` `3000` - set another listening port withing the container 
\
(if changed, change the port in the docker command and Dockerfile accordingly)

## Accessable Links

Main news board

```bash
  http://localhost:80
```
    
FR12 RSS Feed Clone

```bash
  http://localhost:80/rss
```
    
FR12 Article Clone

```bash
  http://localhost:80/get-article-content?url=...
  http://localhost:80/get-article-content?url=https://www.fr12.nl/nieuws/lukaku-sprak-met-karsdorp-feyenoord-speelt-heel-goed
```
    
Weather Article Clone

```bash
  http://localhost:80/weather?city=...
  http://localhost:80/weather?city=rotterdam
```
    