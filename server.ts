import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import { google } from "googleapis";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.set("trust proxy", 1); // Trust reverse proxy for secure cookies

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback_secret_for_dev",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// In-memory token store for simplicity in this prototype
// In a real app, store this in a database keyed by user ID
const tokenStore = new Map<string, any>();

function getOAuth2Client(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
];

// --- Auth Routes ---

app.get("/api/auth/url", (req, res) => {
  const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).send("Missing code");
    return;
  }

  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    (req.session as any).isAuthenticated = true; // Force session to save
    tokenStore.set(req.session.id, tokens);

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens", error);
    res.status(500).send("Authentication failed");
  }
});

app.post("/api/auth/mock-login", (req, res) => {
  console.log("Mock login called. Session ID:", req.session.id);
  res.json({ success: true, token: "mock-token-123" });
});

app.get("/api/auth/status", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader === "Bearer mock-token-123") {
    return res.json({ authenticated: true });
  }
  const tokens = tokenStore.get(req.session.id);
  console.log("Auth status called. Session ID:", req.session.id, "Authenticated:", !!tokens);
  res.json({ authenticated: !!tokens });
});

app.post("/api/auth/logout", (req, res) => {
  tokenStore.delete(req.session.id);
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// --- Data Routes ---

// Middleware to check auth and attach client
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader === "Bearer mock-token-123") {
    req.isMock = true;
    return next();
  }

  const tokens = tokenStore.get(req.session.id);
  if (!tokens) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (tokens.mock) {
    req.isMock = true;
    return next();
  }
  const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
  const oauth2Client = getOAuth2Client(redirectUri);
  oauth2Client.setCredentials(tokens);
  req.oauth2Client = oauth2Client;
  next();
};

app.get("/api/gmail/messages", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json([
      { id: "1", snippet: "Hey, are we still on for tomorrow?", subject: "Lunch plans", from: "Alice <alice@example.com>", date: new Date().toISOString() },
      { id: "2", snippet: "Your weekly report is ready to view.", subject: "Weekly Report", from: "Reports <reports@example.com>", date: new Date(Date.now() - 86400000).toISOString() },
      { id: "3", snippet: "Don't forget to submit your expenses for this month.", subject: "Action Required: Expenses", from: "Finance <finance@example.com>", date: new Date(Date.now() - 172800000).toISOString() }
    ]);
  }
  try {
    const gmail = google.gmail({ version: "v1", auth: req.oauth2Client });
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
      q: "is:unread",
    });

    const messages = response.data.messages || [];
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name === name)?.value || "";
        return {
          id: msg.id,
          snippet: detail.data.snippet,
          subject: getHeader("Subject"),
          from: getHeader("From"),
          date: getHeader("Date"),
        };
      })
    );

    res.json(detailedMessages);
  } catch (error) {
    console.error("Gmail API error", error);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

app.get("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json([
      { summary: "Team Sync", start: { dateTime: new Date(Date.now() + 3600000).toISOString() }, end: { dateTime: new Date(Date.now() + 7200000).toISOString() } },
      { summary: "Project Review", start: { dateTime: new Date(Date.now() + 86400000).toISOString() }, end: { dateTime: new Date(Date.now() + 90000000).toISOString() } },
      { summary: "Company All Hands", start: { dateTime: new Date(Date.now() + 172800000).toISOString() }, end: { dateTime: new Date(Date.now() + 176400000).toISOString() } }
    ]);
  }
  try {
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const timeMin = new Date().toISOString();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 7); // Next 7 days

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin,
      timeMax: timeMax.toISOString(),
      maxResults: 15,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.json(response.data.items || []);
  } catch (error) {
    console.error("Calendar API error", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

app.get("/api/tasks", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json([
      { title: "Review Q3 OKRs", due: new Date(Date.now() + 86400000 * 2).toISOString() },
      { title: "Update documentation", due: new Date(Date.now() + 86400000 * 3).toISOString() },
      { title: "Prepare slides for All Hands", due: new Date(Date.now() + 86400000 * 1).toISOString() }
    ]);
  }
  try {
    const tasks = google.tasks({ version: "v1", auth: req.oauth2Client });
    // Get default task list
    const listsResponse = await tasks.tasklists.list({ maxResults: 1 });
    const listId = listsResponse.data.items?.[0]?.id;

    if (!listId) {
      return res.json([]);
    }

    const response = await tasks.tasks.list({
      tasklist: listId,
      showCompleted: false,
      maxResults: 20,
    });

    res.json(response.data.items || []);
  } catch (error) {
    console.error("Tasks API error", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
