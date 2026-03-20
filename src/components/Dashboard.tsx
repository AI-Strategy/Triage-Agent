import React, { useState, useEffect, useRef } from "react";
import { Mail, Calendar as CalendarIcon, CheckSquare, Send, Bot, User, RefreshCw, Settings } from "lucide-react";
import { format, parseISO } from "date-fns";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [emails, setEmails] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      const [emailsRes, eventsRes, tasksRes] = await Promise.all([
        fetch("/api/gmail/messages", { headers }),
        fetch("/api/calendar/events", { headers }),
        fetch("/api/tasks", { headers })
      ]);

      if (emailsRes.ok) setEmails(await emailsRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
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
    } else if (action === "Delete") {
      message = `I've deleted this email. Would you like me to delete similar emails in the future?`;
    } else if (action === "Mark as Read") {
      message = `I've marked this email as read. Would you like me to mark similar emails as read in the future?`;
    }
    
    setMessages(prev => [...prev, { role: "model", text: message }]);
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
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${context}\n\nUser Request: ${userMessage}`,
        config: {
          systemInstruction: "You are a helpful AI assistant that triages the user's emails, calendar, and tasks. Use the provided context to answer their questions. Be concise and actionable. If they ask to perform an action (like sending an email or creating a task), explain that you are currently in read-only mode but can help them draft or plan.",
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
    <div className="flex h-screen bg-zinc-50 overflow-hidden font-sans">
      {/* Sidebar / Agent Chat */}
      <div className="w-96 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-zinc-900">Triage Agent</h2>
          </div>
          <button onClick={onLogout} className="text-xs text-zinc-500 hover:text-zinc-900">
            Disconnect
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-zinc-200 text-zinc-600' : 'bg-indigo-100 text-indigo-600'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${msg.role === 'user' ? 'bg-zinc-900 text-white rounded-tr-sm' : 'bg-zinc-100 text-zinc-800 rounded-tl-sm'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-zinc-100 text-zinc-500 rounded-tl-sm flex gap-1">
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-zinc-200 bg-white">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to triage..."
              className="w-full pl-4 pr-12 py-3 bg-zinc-100 border-transparent focus:bg-white focus:border-zinc-300 focus:ring-0 rounded-xl text-sm transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-zinc-200 bg-white flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
          <div className="flex items-center gap-4">
            <button onClick={fetchData} className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
            
            {/* Emails Column */}
            <div className="flex flex-col h-[calc(100vh-8rem)]">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Unread Emails</h2>
                <span className="ml-auto bg-zinc-100 text-zinc-600 text-xs py-0.5 px-2 rounded-full font-medium">
                  {emails.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {loading ? (
                  <div className="animate-pulse space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-zinc-100 rounded-xl" />)}
                  </div>
                ) : emails.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-zinc-200 rounded-xl">Inbox zero!</div>
                ) : (
                  emails.map((email, i) => (
                    <div key={i} className="p-4 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-colors shadow-sm group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-medium text-zinc-500 truncate max-w-[70%]">{email.from.split('<')[0]}</span>
                        <span className="text-xs text-zinc-400 shrink-0">{email.date ? format(new Date(email.date), 'MMM d') : ''}</span>
                      </div>
                      <h3 className="text-sm font-medium text-zinc-900 mb-1 line-clamp-1">{email.subject}</h3>
                      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{email.snippet}</p>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEmailAction('Archive', email); }}
                          className="px-2 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-md transition-colors"
                        >
                          Archive
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEmailAction('Delete', email); }}
                          className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-md transition-colors"
                        >
                          Delete
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEmailAction('Mark as Read', email); }}
                          className="px-2 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-md transition-colors"
                        >
                          Mark as Read
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Calendar Column */}
            <div className="flex flex-col h-[calc(100vh-8rem)]">
              <div className="flex items-center gap-2 mb-4">
                <CalendarIcon className="w-5 h-5 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Upcoming Events</h2>
                <span className="ml-auto bg-zinc-100 text-zinc-600 text-xs py-0.5 px-2 rounded-full font-medium">
                  {events.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {loading ? (
                  <div className="animate-pulse space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-20 bg-zinc-100 rounded-xl" />)}
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-zinc-200 rounded-xl">No upcoming events</div>
                ) : (
                  events.map((event, i) => {
                    const isAllDay = !event.start?.dateTime;
                    const date = isAllDay ? parseISO(event.start.date) : parseISO(event.start.dateTime);
                    return (
                      <div key={i} className="p-4 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-colors cursor-pointer shadow-sm flex gap-4">
                        <div className="flex flex-col items-center justify-center w-12 shrink-0 bg-zinc-50 rounded-lg">
                          <span className="text-xs font-medium text-zinc-500 uppercase">{format(date, 'MMM')}</span>
                          <span className="text-lg font-semibold text-zinc-900">{format(date, 'd')}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-zinc-900 mb-1 truncate">{event.summary}</h3>
                          <p className="text-xs text-zinc-500">
                            {isAllDay ? 'All day' : `${format(date, 'p')} - ${format(parseISO(event.end.dateTime), 'p')}`}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Tasks Column */}
            <div className="flex flex-col h-[calc(100vh-8rem)]">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-5 h-5 text-zinc-400" />
                <h2 className="font-medium text-zinc-900">Tasks</h2>
                <span className="ml-auto bg-zinc-100 text-zinc-600 text-xs py-0.5 px-2 rounded-full font-medium">
                  {tasks.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-zinc-100 rounded-xl" />)}
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-zinc-200 rounded-xl">All caught up!</div>
                ) : (
                  tasks.map((task, i) => (
                    <div key={i} className="p-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-colors cursor-pointer shadow-sm flex items-start gap-3">
                      <div className="mt-0.5 w-4 h-4 rounded border border-zinc-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-zinc-900 line-clamp-2">{task.title}</h3>
                        {task.due && <p className="text-xs text-red-500 mt-1">Due {format(parseISO(task.due), 'MMM d')}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-zinc-900 mb-4">Settings & MCP Connections</h2>
            <p className="text-sm text-zinc-500 mb-6">Connect Model Context Protocol (MCP) servers to give your agent access to more tools and data sources.</p>
            
            <div className="space-y-3 mb-6">
              {mcpServers.map((server, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-zinc-200 rounded-xl">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-900">{server.name}</h3>
                    <p className="text-xs text-zinc-500">{server.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${server.status === 'connected' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                    <span className="text-xs font-medium text-zinc-600 capitalize">{server.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full py-2 border border-dashed border-zinc-300 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors mb-6">
              + Add MCP Server
            </button>

            <div className="flex justify-end">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
