import React, { useState } from "react";
import { LogIn } from "lucide-react";

export default function Auth({ onLogin }: { onLogin: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/mock-login", { method: "POST" });
      if (!response.ok) throw new Error("Failed to mock login");
      const data = await response.json();
      if (data.token) {
        localStorage.setItem("mock_token", data.token);
      }
      onLogin();
    } catch (error) {
      console.error("Login error:", error);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50">
      <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-zinc-200 text-center">
        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <LogIn className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 mb-2">
          Connect your accounts
        </h1>
        <p className="text-zinc-500 mb-8">
          To triage your emails, calendar, and tasks, we need access to your
          Google account.
        </p>

        <div className="text-left mb-8 p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-sm text-emerald-800">
          <p className="font-medium mb-1">Mock Mode Enabled</p>
          <p className="text-emerald-600">Clicking the button below will log you in with sample data so you can test the interface without setting up OAuth credentials.</p>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "Connecting..." : "Continue with Mock Data"}
        </button>
      </div>
    </div>
  );
}
