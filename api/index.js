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

// ─────────────────────────────────────────────────────────────
// Cloudflare D1 Helper & SumoFlix Admin / Mobile Sync Endpoints
// ─────────────────────────────────────────────────────────────
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "69e9d5269f504e93cf63b4493b967494";
const CF_DATABASE_ID = process.env.CF_DATABASE_ID || "68eff295-f07f-4286-9b26-babbcc0a26fb";
const CF_AUTH_EMAIL = process.env.CF_AUTH_EMAIL || "sumocine@gmail.com";
const CF_AUTH_KEY = process.env.CF_AUTH_KEY || Buffer.from("Y2ZrX1Nka0dYZGQ1b3hIZktWb2dwNGllVktzaUVRcDlKZjVQZzA5OEluV2ozZTM2NDUxNA==", "base64").toString();

async function d1Query(sql, params = []) {
  try {
    let finalSql = sql;
    if (params && params.length > 0) {
      let idx = 0;
      finalSql = sql.replace(/\?/g, () => {
        const val = params[idx++];
        if (val === null || val === undefined) return "NULL";
        if (typeof val === "number") return String(val);
        if (typeof val === "boolean") return val ? "1" : "0";
        return `'${String(val).replace(/'/g, "''")}'`;
      });
    }

    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`,
      { sql: finalSql },
      {
        headers: {
          "X-Auth-Email": CF_AUTH_EMAIL,
          "X-Auth-Key": CF_AUTH_KEY,
          "Content-Type": "application/json"
        },
        timeout: 9000
      }
    );

    if (response.data && response.data.result && response.data.result[0]) {
      return response.data.result[0].results || [];
    }
    return [];
  } catch (err) {
    console.error("D1 query error:", err.message);
    return [];
  }
}

// 5. Fetch Active Hero Banners (synced with Admin Panel)
app.get("/api/banners", async (req, res) => {
  try {
    const banners = await d1Query(
      "SELECT id, title, description, image_url, action_url FROM hero_banners WHERE active = 1 ORDER BY priority DESC, created_at DESC"
    );
    return res.json({ success: true, banners });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// 6. Fetch Custom Content (synced with Admin Panel)
app.get("/api/custom-content", async (req, res) => {
  try {
    const items = await d1Query("SELECT * FROM custom_content ORDER BY created_at DESC");
    return res.json({ success: true, items });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// 7. SumoFlix User Login (Email, Username or Sumo Code)
app.post("/api/auth/login", async (req, res) => {
  const { identifier, password, code } = req.body;

  try {
    // A. Sumo Code Login
    if (code) {
      const cleanCode = String(code).trim().toUpperCase();
      const codeRows = await d1Query(
        "SELECT id, user_id, user_email, code_type, status, generated_code, device_limit FROM sumo_codes WHERE UPPER(generated_code) = ? AND status = 'Approved' LIMIT 1",
        [cleanCode]
      );

      if (!codeRows || codeRows.length === 0) {
        return res.status(400).json({ success: false, error: "Invalid or unapproved Sumo Code." });
      }

      const foundCode = codeRows[0];
      const userRows = await d1Query(
        "SELECT id, email, username, role, status, tokens, subscription_plan, subscription_days, subscription_expires_at FROM user_profiles WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [foundCode.user_id, foundCode.user_email]
      );

      const user = userRows && userRows.length > 0 ? userRows[0] : {
        id: foundCode.user_id || `sumo-${Date.now()}`,
        email: foundCode.user_email || `${cleanCode.toLowerCase()}@sumoflix.app`,
        username: `VIP-${cleanCode.slice(-4)}`,
        role: "vip",
        status: "active",
        tokens: 100,
        subscription_plan: "VIP 30-Day Pass",
        subscription_days: 30
      };

      return res.json({
        success: true,
        message: "Logged in via Sumo Code! 30-day VIP unlocked.",
        user
      });
    }

    // B. Standard Username or Email Login
    if (!identifier) {
      return res.status(400).json({ success: false, error: "Username or Email is required." });
    }

    const cleanIdent = String(identifier).trim().toLowerCase();
    const rows = await d1Query(
      "SELECT id, email, username, role, status, tokens, subscription_plan, subscription_days, subscription_expires_at, created_at FROM user_profiles WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1",
      [cleanIdent, cleanIdent]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: "User account not found. Please create an account." });
    }

    const user = rows[0];
    if (user.status === "banned") {
      return res.status(403).json({ success: false, error: "This account has been suspended by Admin." });
    }

    // Update last active
    await d1Query("UPDATE user_profiles SET last_active = datetime('now') WHERE id = ?", [user.id]);

    return res.json({
      success: true,
      message: "Login successful!",
      user
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. SumoFlix User Registration (Create Account)
app.post("/api/auth/signup", async (req, res) => {
  const { username, email, password, referral } = req.body;

  if (!username || !email) {
    return res.status(400).json({ success: false, error: "Username and Email are required." });
  }

  const cleanUser = String(username).trim();
  const cleanEmail = String(email).trim().toLowerCase();

  try {
    // Check if username or email already exists
    const existing = await d1Query(
      "SELECT id FROM user_profiles WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1",
      [cleanEmail, cleanUser.toLowerCase()]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, error: "Username or Email already registered. Please log in." });
    }

    const newId = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const startingTokens = referral ? 75 : 50;

    await d1Query(
      "INSERT INTO user_profiles (id, email, username, role, status, tokens, created_at, last_active, subscription_plan, subscription_days) VALUES (?, ?, ?, 'user', 'active', ?, datetime('now'), datetime('now'), 'free', 0)",
      [newId, cleanEmail, cleanUser, startingTokens]
    );

    // Send welcome notification
    const notifId = `notif-${Date.now()}`;
    await d1Query(
      "INSERT INTO notifications (id, title, message, target_type, sent_at) VALUES (?, '🎉 Welcome to SumoFlix!', 'Your account has been created. Enjoy high-speed Bollywood and Hollywood streaming!', ?, datetime('now'))",
      [notifId, cleanEmail]
    );

    return res.json({
      success: true,
      message: "Account created successfully! Welcome to SumoFlix.",
      user: {
        id: newId,
        email: cleanEmail,
        username: cleanUser,
        role: "user",
        status: "active",
        tokens: startingTokens,
        subscription_plan: "free",
        subscription_days: 0
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Get User Profile & Subscription Status
app.get("/api/auth/profile", async (req, res) => {
  const { id, email } = req.query;
  if (!id && !email) {
    return res.status(400).json({ success: false, error: "Missing id or email parameter." });
  }

  try {
    const rows = await d1Query(
      "SELECT id, email, username, role, status, tokens, subscription_plan, subscription_days, subscription_expires_at, created_at FROM user_profiles WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1",
      [id || "", email || ""]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    return res.json({ success: true, user: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
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
