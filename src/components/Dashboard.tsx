import React, { useState, useEffect, useRef } from "react";
import { Mail, Calendar as CalendarIcon, CheckSquare, Send, Bot, User, RefreshCw, Settings, MessageSquare, Github, Plus, Edit2, Trash2, Move, X, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [emails, setEmails] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [slackMessages, setSlackMessages] = useState<any[]>([]);
  const [githubIssues, setGithubIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [weather, setWeather] = useState<{ temp: number, code: number } | null>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=38.9072&longitude=-77.0369&current_weather=true&temperature_unit=fahrenheit")
      .then(res => res.json())
      .then(data => {
        if (data && data.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            code: data.current_weather.weathercode
          });
        }
      })
      .catch(console.error);
  }, []);

  const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="w-4 h-4 text-amber-500" />;
    if (code >= 1 && code <= 3) return <Cloud className="w-4 h-4 text-zinc-400" />;
    if (code >= 51 && code <= 67) return <CloudRain className="w-4 h-4 text-blue-400" />;
    if (code >= 71 && code <= 86) return <CloudSnow className="w-4 h-4 text-sky-200" />;
    if (code >= 95) return <CloudLightning className="w-4 h-4 text-purple-500" />;
    return <Cloud className="w-4 h-4 text-zinc-400" />;
  };

  const processMessageText = (text: string) => {
    return text.replace(/\[([^\]]+)\]\((action:\/\/[^\)]+)\)/g, (match, label, url) => {
      return `[${label}](${encodeURI(url)})`;
    });
  };

  const [messages, setMessages] = useState<{ role: "user" | "model"; text: string }[]>([
    { role: "model", text: "Hello! I'm your triage agent. I can help you manage your emails, calendar, and tasks. What would you like to do?" }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [mcpServers, setMcpServers] = useState([
    { name: "Local Filesystem", status: "connected", url: "stdio://fs" },
    { name: "GitHub", status: "disconnected", url: "https://mcp.github.com" }
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const mockToken = localStorage.getItem("mock_token");
      const headers: any = {};
      if (mockToken) {
        headers["Authorization"] = `Bearer ${mockToken}`;
      }
      const [emailsRes, eventsRes, tasksRes, slackRes, githubRes] = await Promise.all([
        fetch("/api/gmail/messages", { headers }),
        fetch("/api/calendar/events", { headers }),
        fetch("/api/tasks", { headers }),
        fetch("/api/slack/messages", { headers }),
        fetch("/api/github/issues", { headers })
      ]);

      if (emailsRes.ok) setEmails(await emailsRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (slackRes.ok) setSlackMessages(await slackRes.json());
      if (githubRes.ok) setGithubIssues(await githubRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleEmailAction = (action: string, email: any) => {
    let message = "";
    if (action === "Archive") {
      message = `I've archived this email. Would you like me to archive similar emails in the future?`;
      setEmails(prev => prev.filter(e => e.id !== email.id));
    } else if (action === "Delete") {
      message = `I've deleted this email. Would you like me to delete similar emails in the future?`;
      setEmails(prev => prev.filter(e => e.id !== email.id));
    } else if (action === "Mark as Read") {
      message = `I've marked this email as read. Would you like me to mark similar emails as read in the future?`;
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, read: true } : e));
    }
    
    setMessages(prev => [...prev, { role: "model", text: message }]);
  };

  const handleSendEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const subject = formData.get("subject") as string;
    const body = formData.get("body") as string;
    
    try {
      const mockToken = localStorage.getItem("mock_token");
      const headers: any = { "Content-Type": "application/json" };
      if (mockToken) headers["Authorization"] = `Bearer ${mockToken}`;
      
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ subject, body })
      });
      if (res.ok) {
        setShowEmailModal(false);
        fetchData();
        setMessages(prev => [...prev, { role: "model", text: "I've sent the email." }]);
      }
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const summary = formData.get("summary") as string;
    const start = new Date(formData.get("start") as string).toISOString();
    const end = new Date(formData.get("end") as string).toISOString();
    
    try {
      const mockToken = localStorage.getItem("mock_token");
      const headers: any = { "Content-Type": "application/json" };
      if (mockToken) headers["Authorization"] = `Bearer ${mockToken}`;
      
      const url = editingEvent ? `/api/calendar/events/${editingEvent.id}` : "/api/calendar/events";
      const method = editingEvent ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({ summary, start: { dateTime: start }, end: { dateTime: end } })
      });
      if (res.ok) {
        setShowEventModal(false);
        setEditingEvent(null);
        fetchData();
        setMessages(prev => [...prev, { role: "model", text: editingEvent ? "I've updated the event." : "I've added the new event." }]);
      }
    } catch (error) {
      console.error("Error saving event:", error);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const mockToken = localStorage.getItem("mock_token");
      const headers: any = {};
      if (mockToken) headers["Authorization"] = `Bearer ${mockToken}`;
      
      const res = await fetch(`/api/calendar/events/${id}`, {
        method: "DELETE",
        headers
      });
      if (res.ok) {
        fetchData();
        setMessages(prev => [...prev, { role: "model", text: "I've deleted the event." }]);
      }
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleSaveTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const due = new Date(formData.get("due") as string).toISOString();
    
    try {
      const mockToken = localStorage.getItem("mock_token");
      const headers: any = { "Content-Type": "application/json" };
      if (mockToken) headers["Authorization"] = `Bearer ${mockToken}`;
      
      const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
      const method = editingTask ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({ title, due })
      });
      if (res.ok) {
        setShowTaskModal(false);
        setEditingTask(null);
        fetchData();
        setMessages(prev => [...prev, { role: "model", text: editingTask ? "I've updated the task." : "I've added the new task." }]);
      }
    } catch (error) {
      console.error("Error saving task:", error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setIsTyping(true);

    try {
      // Create a context string from current data
      const context = `
Current Data Context:
Emails (${emails.length} unread):
${emails.map(e => `- From: ${e.from}, Subject: ${e.subject}`).join('\n')}

Upcoming Events (${events.length}):
${events.map(e => `- ${e.summary} at ${e.start?.dateTime ? format(parseISO(e.start.dateTime), 'PP p') : 'All day'}`).join('\n')}

Tasks (${tasks.length}):
${tasks.map(t => `- ${t.title}`).join('\n')}

Slack Messages (${slackMessages.length}):
${slackMessages.map(s => `- [${s.channel}] ${s.sender}: ${s.text}`).join('\n')}

GitHub Issues (${githubIssues.length}):
${githubIssues.map(g => `- [${g.repo}] #${g.number} ${g.title} (${g.status})`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${context}\n\nUser Request: ${userMessage}`,
        config: {
          systemInstruction: "You are a helpful AI assistant that triages the user's emails, calendar, and tasks. Use the provided context to answer their questions. Be concise and actionable. If they ask to perform an action (like sending an email or creating a task), explain that you are currently in read-only mode but can help them draft or plan. Format your output using Markdown. Include citations or links where possible. Add relevant action buttons by formatting them as markdown links with the 'action://' protocol, e.g., [Create Task](action://create-task). IMPORTANT: If you include parameters in the action URL, you MUST URL-encode them (e.g., replace spaces with %20) so the markdown parser does not break.",
        }
      });

      setMessages(prev => [...prev, { role: "model", text: response.text || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      console.error("Agent error:", error);
      setMessages(prev => [...prev, { role: "model", text: "Sorry, I encountered an error while processing your request." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans transition-colors">
      {/* Sidebar / Agent Chat */}
      <div className="w-80 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 transition-colors">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative flex items-center justify-center shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-xl transform rotate-6 shadow-lg shadow-cyan-500/30"></div>
              <div className="absolute inset-0 bg-gradient-to-tr from-pink-500 to-purple-500 rounded-xl transform -rotate-3 opacity-90 mix-blend-multiply dark:mix-blend-screen"></div>
              <div className="relative z-10 w-4 h-4 bg-white rounded-full shadow-sm"></div>
            </div>
            <h2 className="font-bold text-lg tracking-tight text-zinc-900 dark:text-zinc-100">Andreas Triage Agent</h2>
          </div>
          <button onClick={onLogout} className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            Disconnect
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`px-4 py-3 rounded-2xl max-w-[90%] text-sm shadow-sm ${msg.role === 'user' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-tr-sm' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-tl-sm'}`}>
                <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert dark:prose-zinc' : 'prose-zinc dark:prose-invert'}`}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({node, href, children, ...props}) => {
                        if (href?.startsWith('action://')) {
                          return (
                            <button 
                              className="inline-block mt-2 mb-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                              onClick={() => {
                                const action = decodeURI(href.replace('action://', ''));
                                setInput(`Execute action: ${action}`);
                              }}
                            >
                              {children}
                            </button>
                          );
                        }
                        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium" {...props}>{children}</a>;
                      },
                      p: ({children}) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                      ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                      li: ({children}) => <li className="mb-1">{children}</li>,
                      code: ({node, inline, className, children, ...props}: any) => {
                        return inline ? (
                          <code className="bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 px-1 py-0.5 rounded text-xs" {...props}>{children}</code>
                        ) : (
                          <pre className="bg-zinc-800 dark:bg-zinc-950 text-zinc-100 p-2 rounded-lg text-xs overflow-x-auto mb-2">
                            <code {...props}>{children}</code>
                          </pre>
                        );
                      }
                    }}
                  >
                    {processMessageText(msg.text)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-tl-sm flex gap-1">
                <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-colors">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to triage..."
              className="w-full pl-4 pr-12 py-3 bg-zinc-100 dark:bg-zinc-800 border-transparent focus:bg-white dark:focus:bg-zinc-900 focus:border-indigo-500/30 dark:focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 rounded-xl text-sm transition-all dark:text-zinc-100 dark:placeholder-zinc-500 outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 transition-colors">
        <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-8 shrink-0 transition-colors">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Dashboard</h1>
          <div className="flex items-center gap-4">
            {weather && (
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full transition-colors">
                <MapPin className="w-3.5 h-3.5" />
                <span>Washington DC</span>
                <span className="w-px h-3 bg-zinc-300 dark:bg-zinc-700 mx-1"></span>
                {getWeatherIcon(weather.code)}
                <span className="font-medium">{weather.temp}°F</span>
              </div>
            )}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={fetchData} className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 max-w-[1600px] mx-auto">
            
            {/* Column 1: Emails & Slack */}
            <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
              {/* Emails */}
              <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                    <h2 className="font-medium text-zinc-900 dark:text-zinc-100">Emails</h2>
                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs py-0.5 px-2 rounded-full font-medium transition-colors">
                      {emails.length}
                    </span>
                  </div>
                  <button onClick={() => setShowEmailModal(true)} className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {loading ? (
                    <div className="animate-pulse space-y-3">
                      {[1, 2].map(i => <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors" />)}
                    </div>
                  ) : emails.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">Inbox zero!</div>
                  ) : (
                    emails.map((email, i) => (
                      <div key={i} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm group">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[70%]">{email.from.split('<')[0]}</span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{email.date ? format(new Date(email.date), 'MMM d') : ''}</span>
                        </div>
                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 line-clamp-1">{email.subject}</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-3">{email.snippet}</p>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); handleEmailAction('Archive', email); }} className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors">Archive</button>
                          <button onClick={(e) => { e.stopPropagation(); handleEmailAction('Delete', email); }} className="px-2 py-1 text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-md transition-colors">Delete</button>
                          <button onClick={(e) => { e.stopPropagation(); handleEmailAction('Mark as Read', email); }} className="px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors">Mark as Read</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Slack */}
              <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-100">Slack</h2>
                  <span className="ml-auto bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs py-0.5 px-2 rounded-full font-medium transition-colors">
                    {slackMessages.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {loading ? (
                    <div className="animate-pulse space-y-3">
                      {[1, 2].map(i => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors" />)}
                    </div>
                  ) : slackMessages.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">No new messages</div>
                  ) : (
                    slackMessages.map((msg, i) => (
                      <div key={i} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{msg.sender} <span className="text-zinc-500 dark:text-zinc-400 font-normal">in {msg.channel}</span></span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{msg.timestamp ? format(new Date(msg.timestamp), 'p') : ''}</span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{msg.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: Calendar & GitHub */}
            <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
              {/* Calendar */}
              <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                    <h2 className="font-medium text-zinc-900 dark:text-zinc-100">Calendar</h2>
                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs py-0.5 px-2 rounded-full font-medium transition-colors">
                      {events.length}
                    </span>
                  </div>
                  <button onClick={() => { setEditingEvent(null); setShowEventModal(true); }} className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {loading ? (
                    <div className="animate-pulse space-y-3">
                      {[1, 2, 3].map(i => <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors" />)}
                    </div>
                  ) : events.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">No upcoming events</div>
                  ) : (
                    events.map((event, i) => {
                      const isAllDay = !event.start?.dateTime;
                      const date = isAllDay ? parseISO(event.start.date) : parseISO(event.start.dateTime);
                      return (
                        <div key={i} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm flex gap-4 group">
                          <div className="flex flex-col items-center justify-center w-12 shrink-0 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg transition-colors">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">{format(date, 'MMM')}</span>
                            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{format(date, 'd')}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 truncate">{event.summary}</h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {isAllDay ? 'All day' : `${format(date, 'p')} - ${format(parseISO(event.end.dateTime), 'p')}`}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingEvent(event); setShowEventModal(true); }} className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => { setEditingEvent(event); setShowEventModal(true); }} className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors" title="Move"><Move className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteEvent(event.id)} className="p-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-md transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* GitHub */}
              <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <Github className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-100">GitHub Projects</h2>
                  <span className="ml-auto bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs py-0.5 px-2 rounded-full font-medium transition-colors">
                    {githubIssues.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {loading ? (
                    <div className="animate-pulse space-y-3">
                      {[1, 2].map(i => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors" />)}
                    </div>
                  ) : githubIssues.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">No open issues</div>
                  ) : (
                    githubIssues.map((issue, i) => (
                      <div key={i} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm flex items-start gap-3">
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${issue.status === 'Open' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{issue.repo}</span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">#{issue.number}</span>
                          </div>
                          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">{issue.title}</h3>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Column 3: Tasks */}
            <div className="flex flex-col h-[calc(100vh-8rem)]">
              <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                    <h2 className="font-medium text-zinc-900 dark:text-zinc-100">Tasks</h2>
                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs py-0.5 px-2 rounded-full font-medium transition-colors">
                      {tasks.length}
                    </span>
                  </div>
                  <button onClick={() => { setEditingTask(null); setShowTaskModal(true); }} className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {loading ? (
                    <div className="animate-pulse space-y-2">
                      {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-colors" />)}
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">All caught up!</div>
                  ) : (
                    tasks.map((task, i) => (
                      <div key={i} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm flex items-start gap-3 group">
                        <div className="mt-0.5 w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">{task.title}</h3>
                          {task.due && <p className="text-xs text-red-500 dark:text-red-400 mt-1">Due {format(parseISO(task.due), 'MMM d')}</p>}
                        </div>
                        <button onClick={() => { setEditingTask(task); setShowTaskModal(true); }} className="opacity-0 group-hover:opacity-100 p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md transition-opacity shrink-0">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Modals */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg p-6 shadow-xl transition-colors">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Compose Email</h2>
              <button onClick={() => setShowEmailModal(false)} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Subject</label>
                <input name="subject" required className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Body</label>
                <textarea name="body" required rows={4} className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEmailModal(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">Send</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-xl transition-colors">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{editingEvent ? 'Edit Event' : 'Add Event'}</h2>
              <button onClick={() => { setShowEventModal(false); setEditingEvent(null); }} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Summary</label>
                <input name="summary" defaultValue={editingEvent?.summary} required className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Start Time</label>
                <input type="datetime-local" name="start" defaultValue={editingEvent?.start?.dateTime ? new Date(editingEvent.start.dateTime).toISOString().slice(0, 16) : ''} required className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">End Time</label>
                <input type="datetime-local" name="end" defaultValue={editingEvent?.end?.dateTime ? new Date(editingEvent.end.dateTime).toISOString().slice(0, 16) : ''} required className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowEventModal(false); setEditingEvent(null); }} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-xl transition-colors">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{editingTask ? 'Edit Task' : 'Add Task'}</h2>
              <button onClick={() => { setShowTaskModal(false); setEditingTask(null); }} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
                <input name="title" defaultValue={editingTask?.title} required className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Due Date</label>
                <input type="datetime-local" name="due" defaultValue={editingTask?.due ? new Date(editingTask.due).toISOString().slice(0, 16) : ''} required className="w-full p-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowTaskModal(false); setEditingTask(null); }} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-xl transition-colors">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Settings & MCP Connections</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Connect Model Context Protocol (MCP) servers to give your agent access to more tools and data sources.</p>
            
            <div className="space-y-3 mb-6">
              {mcpServers.map((server, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{server.name}</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{server.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${server.status === 'connected' ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 capitalize">{server.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full py-2 border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors mb-6">
              + Add MCP Server
            </button>

            <div className="flex justify-end">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
