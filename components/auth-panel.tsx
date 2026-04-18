"use client";

import { FormEvent, useState } from "react";

type AuthMode = "login" | "signup";

type AuthPanelProps = {
  isSubmitting: boolean;
  error: string | null;
  message: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
};

export function AuthPanel({
  isSubmitting,
  error,
  message,
  onSignIn,
  onSignUp,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "login") {
      await onSignIn(email, password);
      return;
    }
    await onSignUp(email, password);
  };

  return (
    <main className="min-h-screen bg-[#F7F5F2] px-4 py-16 text-[#1A1A18]">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 text-center">
          <span className="inline-block rounded-full bg-[#1C3A2A] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
            Atlas AI Planner
          </span>
        </div>

        <div className="rounded-3xl border border-[#E8E4DF] bg-white p-8 shadow-[0_8px_40px_-12px_rgba(26,26,24,0.10)]">
          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A18]">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B6860]">
            {mode === "login"
              ? "Sign in to your private trip workspace."
              : "Start planning premium itineraries with AI."}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-xl bg-[#F3F1EE] p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                mode === "login"
                  ? "bg-white text-[#1A1A18] shadow-sm"
                  : "text-[#6B6860] hover:text-[#1A1A18]"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                mode === "signup"
                  ? "bg-white text-[#1A1A18] shadow-sm"
                  : "text-[#6B6860] hover:text-[#1A1A18]"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-[#E8E4DF] bg-[#F7F5F2] px-4 py-2.5 text-sm text-[#1A1A18] outline-none transition placeholder:text-[#9C9890] focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border border-[#E8E4DF] bg-[#F7F5F2] px-4 py-2.5 text-sm text-[#1A1A18] outline-none transition placeholder:text-[#9C9890] focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10"
            />
            <p className="text-xs text-[#9C9890]">
              Use at least 6 characters. For better security, use 12+.
            </p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 rounded-full bg-[#1C3A2A] px-4 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-[#2A4E38] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? mode === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Log in"
                  : "Sign up"}
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              {message}
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-[#9C9890]">
          Your itineraries are private and securely stored.
        </p>
      </div>
    </main>
  );
}
