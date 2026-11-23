const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Browser user-agent to prevent simple scraping blocks
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
};

// 1. Root / Health Check
app.get("/", (req, res) => {
  res.json({
    status: "active",
    service: "SumoFlix Scraper API",
    version: "1.0.0",
    description: "Production-ready Multi-Source & Bollywood Movie Scraper API for Vercel",
    endpoints: {
      stream: "/api/stream?tmdb=550&type=movie",
      streamTv: "/api/stream?tmdb=1399&type=tv&season=1&episode=1",
      bollyflix: "/api/bollyflix?q=jawan",
      search: "/api/search?q=pathaan"
    }
  });
});

// 2. Stream Resolver Endpoint
app.get("/api/stream", async (req, res) => {
  const { tmdb, id, type = "movie", season = 1, episode = 1, title } = req.query;
  const targetId = tmdb || id;

  if (!targetId) {
    return res.status(400).json({
      success: false,
      error: "Missing required parameter: tmdb (e.g. ?tmdb=550&type=movie)"
    });
  }

  const isTv = type.toLowerCase() === "tv" || type.toLowerCase() === "series";
  const sNum = Number(season) || 1;
  const epNum = Number(episode) || 1;

  try {
    // Generate multi-server stream URLs with high reliability
    const sources = [];

    // Server A: AutoEmbed Multi-Source
    sources.push({
      name: "AutoEmbed Cloud (Ultra Fast / Multi-Lang)",
      type: "embed",
      quality: "1080p",
      url: isTv
        ? `https://player.autoembed.cc/embed/tv/${targetId}/${sNum}/${epNum}`
        : `https://player.autoembed.cc/embed/movie/${targetId}`
    });

    // Server B: SmashyStream (Strong Hindi/Dual-Audio Coverage)
    sources.push({
      name: "SmashyStream (Hindi Dubbed / Dual Audio)",
      type: "embed",
      quality: "1080p",
      url: isTv
        ? `https://player.smashystream.com/tv/${targetId}?s=${sNum}&e=${epNum}`
        : `https://player.smashystream.com/movie/${targetId}`
    });

    // Server C: VidSrc ICU
    sources.push({
      name: "VidSrc ICU (Clean Stream / Hindi Subtitles)",
      type: "embed",
      quality: "1080p",
      url: isTv
        ? `https://vidsrc.icu/embed/tv/${targetId}/${sNum}/${epNum}`
        : `https://vidsrc.icu/embed/movie/${targetId}`
    });

    // Server D: Noverse / MoviesAPI
    sources.push({
      name: "Noverse Cloud (High Speed CDN)",
      type: "embed",
      quality: "720p/1080p",
      url: isTv
        ? `https://moviesapi.club/tv/${targetId}-${sNum}-${epNum}`
        : `https://moviesapi.club/movie/${targetId}`
    });

    return res.json({
      success: true,
      targetId,
      type: isTv ? "tv" : "movie",
      season: isTv ? sNum : null,
      episode: isTv ? epNum : null,
      title: title || undefined,
      totalSources: sources.length,
      sources
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to resolve stream sources",
      message: error.message
    });
  }
});

// 3. BollyFlix Scraper Endpoint
app.get("/api/bollyflix", async (req, res) => {
  const query = req.query.q || req.query.query;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Missing search query parameter 'q' (e.g. /api/bollyflix?q=stree)"
    });
  }

  // Common active mirrors for Bollyflix
  const mirrorUrls = [
    `https://bollyflix.lat/?s=${encodeURIComponent(query)}`,
    `https://bollyflix.org.in/?s=${encodeURIComponent(query)}`,
    `https://bollyflix.dad/?s=${encodeURIComponent(query)}`
  ];

  let results = [];
  let fetched = false;

  for (const targetUrl of mirrorUrls) {
    try {
      const response = await axios.get(targetUrl, {
        headers: HEADERS,
        timeout: 4500
      });

      if (response.data) {
        const $ = cheerio.load(response.data);

        // BollyFlix uses article cards inside grid
        $("article, .post-item, .item").each((_, el) => {
          const $el = $(el);
          const title =
            $el.find(".entry-title, .title, h2, h3").text().trim() ||
            $el.find("a").attr("title") ||
            "";
          const link = $el.find("a").attr("href") || "";
          const poster =
            $el.find("img").attr("data-src") ||
            $el.find("img").attr("src") ||
            "";

          if (title && link) {
            results.push({
              title,
              link,
              poster,
              source: "BollyFlix"
            });
          }
        });

        if (results.length > 0) {
          fetched = true;
          break;
        }
      }
    } catch (err) {
      // Continue to next mirror if blocked or timeout
      continue;
    }
  }

  return res.json({
    success: true,
    query,
    count: results.length,
    results: results.slice(0, 20)
  });
});

// 4. Multi-Source Search Endpoint
app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Missing query 'q'" });
  }

  try {
    // Queries TMDB multi-search proxy for instant Hindi/Bollywood detection
    const tmdbKey = "84094a4597b474e64f0b2f5cb05eb38e";
    const tmdbRes = await axios.get(
      `https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${encodeURIComponent(
        query
      )}&include_adult=false&language=hi-IN`,
      { timeout: 4000 }
    );

    const items = (tmdbRes.data.results || []).map((item) => ({
      id: item.id,
      title: item.title || item.name,
      original_language: item.original_language,
      isHindi: item.original_language === "hi" || item.original_language === "ur",
      media_type: item.media_type,
      overview: item.overview,
      release_date: item.release_date || item.first_air_date,
      poster_path: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null,
      streamApiUrl: `/api/stream?tmdb=${item.id}&type=${item.media_type || "movie"}`
    }));

    return res.json({
      success: true,
      query,
      count: items.length,
      results: items
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Port listener for local Node.js execution
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`[SumoFlix Scraper API] Running on http://localhost:${PORT}`);
  });
}

// Export for Vercel Serverless Function
module.exports = app;
