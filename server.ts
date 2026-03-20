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

// In-memory mock data stores
let mockEmails = [
  { id: "1", snippet: "Hey, are we still on for tomorrow? Let me know if we need to reschedule.", subject: "Lunch plans", from: "Alice <alice@example.com>", date: new Date().toISOString(), read: false },
  { id: "2", snippet: "Your weekly report is ready to view. Please review the Q3 metrics.", subject: "Weekly Report", from: "Reports <reports@example.com>", date: new Date(Date.now() - 86400000).toISOString(), read: false },
  { id: "3", snippet: "Don't forget to submit your expenses for this month. The deadline is Friday.", subject: "Action Required: Expenses", from: "Finance <finance@example.com>", date: new Date(Date.now() - 172800000).toISOString(), read: false },
  { id: "4", snippet: "The new design assets have been uploaded to Figma. Please take a look.", subject: "Design Assets Updated", from: "Design Team <design@example.com>", date: new Date(Date.now() - 259200000).toISOString(), read: false },
  { id: "5", snippet: "Reminder: Company all-hands meeting tomorrow at 10 AM PST.", subject: "Reminder: All Hands", from: "HR <hr@example.com>", date: new Date(Date.now() - 345600000).toISOString(), read: false },
  { id: "6", snippet: "I've reviewed the latest draft of the proposal. Looks good, just a few minor tweaks needed on page 4.", subject: "Re: Project Proposal Draft", from: "David <david@example.com>", date: new Date(Date.now() - 432000000).toISOString(), read: true },
  { id: "7", snippet: "Welcome to our new platform! Here are some tips to get you started.", subject: "Welcome aboard!", from: "Onboarding <welcome@example.com>", date: new Date(Date.now() - 518400000).toISOString(), read: true },
  { id: "8", snippet: "Your subscription will renew in 3 days. No action is required.", subject: "Subscription Renewal Notice", from: "Billing <billing@example.com>", date: new Date(Date.now() - 604800000).toISOString(), read: true },
];

let mockEvents = [
  { id: "e1", summary: "Team Sync", start: { dateTime: new Date(Date.now() + 3600000).toISOString() }, end: { dateTime: new Date(Date.now() + 7200000).toISOString() } },
  { id: "e2", summary: "Project Review", start: { dateTime: new Date(Date.now() + 86400000).toISOString() }, end: { dateTime: new Date(Date.now() + 90000000).toISOString() } },
  { id: "e3", summary: "Company All Hands", start: { dateTime: new Date(Date.now() + 172800000).toISOString() }, end: { dateTime: new Date(Date.now() + 176400000).toISOString() } },
  { id: "e4", summary: "1:1 with Bob", start: { dateTime: new Date(Date.now() + 259200000).toISOString() }, end: { dateTime: new Date(Date.now() + 262800000).toISOString() } },
  { id: "e5", summary: "Dentist Appointment", start: { dateTime: new Date(Date.now() + 345600000).toISOString() }, end: { dateTime: new Date(Date.now() + 349200000).toISOString() } },
  { id: "e6", summary: "Client Pitch: Acme Corp", start: { dateTime: new Date(Date.now() + 432000000).toISOString() }, end: { dateTime: new Date(Date.now() + 435600000).toISOString() } },
];

let mockTasks = [
  { id: "t1", title: "Review Q3 OKRs", due: new Date(Date.now() + 86400000 * 2).toISOString(), completed: false },
  { id: "t2", title: "Update documentation", due: new Date(Date.now() + 86400000 * 3).toISOString(), completed: false },
  { id: "t3", title: "Prepare slides for All Hands", due: new Date(Date.now() + 86400000 * 1).toISOString(), completed: false },
  { id: "t4", title: "Approve pending pull requests", due: new Date(Date.now() + 86400000 * 4).toISOString(), completed: false },
  { id: "t5", title: "Book flights for conference", due: new Date(Date.now() + 86400000 * 5).toISOString(), completed: false },
  { id: "t6", title: "Send feedback to design team", due: new Date(Date.now() + 86400000 * 6).toISOString(), completed: false },
];

let mockSlackMessages = [
  { id: "s1", channel: "#engineering", sender: "Bob", text: "Has anyone looked at the recent CI pipeline failures?", timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: "s2", channel: "#general", sender: "Alice", text: "Donuts in the breakroom!", timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: "s3", channel: "Direct Message", sender: "Charlie", text: "Can you review my PR when you have a chance?", timestamp: new Date(Date.now() - 10800000).toISOString() },
  { id: "s4", channel: "#design", sender: "Diana", text: "New mockups are ready for the dashboard redesign.", timestamp: new Date(Date.now() - 14400000).toISOString() },
  { id: "s5", channel: "#marketing", sender: "Eve", text: "The Q4 campaign launch is scheduled for next Tuesday.", timestamp: new Date(Date.now() - 18000000).toISOString() },
];

let mockGithubIssues = [
  { id: "g1", repo: "frontend-app", title: "Fix navigation bug on mobile", status: "Open", number: 142 },
  { id: "g2", repo: "backend-api", title: "Optimize database queries for dashboard", status: "In Progress", number: 89 },
  { id: "g3", repo: "frontend-app", title: "Implement dark mode", status: "Open", number: 145 },
  { id: "g4", repo: "auth-service", title: "Add support for SSO", status: "Open", number: 32 },
  { id: "g5", repo: "frontend-app", title: "Upgrade React to version 19", status: "In Progress", number: 150 },
  { id: "g6", repo: "backend-api", title: "Fix memory leak in worker process", status: "Open", number: 95 },
];

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
    return res.json(mockEmails);
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

app.post("/api/gmail/send", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    const newEmail = {
      id: Math.random().toString(36).substr(2, 9),
      subject: req.body.subject || "No Subject",
      snippet: req.body.body ? req.body.body.substring(0, 50) : "",
      from: "Me <me@example.com>",
      date: new Date().toISOString(),
      read: true
    };
    mockEmails.unshift(newEmail);
    return res.json({ success: true, message: newEmail });
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.get("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json(mockEvents);
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

app.post("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    const newEvent = {
      id: Math.random().toString(36).substr(2, 9),
      summary: req.body.summary,
      start: { dateTime: req.body.start },
      end: { dateTime: req.body.end }
    };
    mockEvents.push(newEvent);
    mockEvents.sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
    return res.json({ success: true, event: newEvent });
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.put("/api/calendar/events/:id", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    const index = mockEvents.findIndex(e => e.id === req.params.id);
    if (index !== -1) {
      mockEvents[index] = { ...mockEvents[index], ...req.body };
      mockEvents.sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
      return res.json({ success: true, event: mockEvents[index] });
    }
    return res.status(404).json({ error: "Event not found" });
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.delete("/api/calendar/events/:id", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    mockEvents = mockEvents.filter(e => e.id !== req.params.id);
    return res.json({ success: true });
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.get("/api/tasks", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json(mockTasks);
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

app.put("/api/tasks/:id", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    const index = mockTasks.findIndex(t => t.id === req.params.id);
    if (index !== -1) {
      mockTasks[index] = { ...mockTasks[index], ...req.body };
      return res.json({ success: true, task: mockTasks[index] });
    }
    return res.status(404).json({ error: "Task not found" });
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.post("/api/tasks", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    const newTask = {
      id: Math.random().toString(36).substr(2, 9),
      title: req.body.title,
      due: req.body.due,
      completed: false
    };
    mockTasks.push(newTask);
    mockTasks.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    return res.json({ success: true, task: newTask });
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.get("/api/slack/messages", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json(mockSlackMessages);
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
});

app.get("/api/github/issues", requireAuth, async (req: any, res: any) => {
  if (req.isMock) {
    return res.json(mockGithubIssues);
  }
  res.status(501).json({ error: "Not implemented for real API yet" });
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
