"use client";

import { Github, KeyRound, Loader2, LogIn, Mail, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { useId, useMemo, useState } from "react";

interface AuthConsoleProps {
  pendingVerificationEmail: string | null;
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  onSignIn: (email: string, password: string) => void;
  onSignUp: (name: string, email: string, password: string) => void;
  onVerifyEmail: (email: string, otp: string) => void;
  onOAuth: (provider: "google" | "github") => void;
}

export function AuthConsole({
  pendingVerificationEmail,
  isSubmitting,
  error,
  notice,
  onSignIn,
  onSignUp,
  onVerifyEmail,
  onOAuth
}: AuthConsoleProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const nameInputId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const otpInputId = useId();
  const formNoticeId = useId();
  const formErrorId = useId();
  const verificationNoticeId = useId();
  const verificationErrorId = useId();

  const verificationEmail = useMemo(() => pendingVerificationEmail ?? email, [email, pendingVerificationEmail]);
  const verificationDescriptionIds = [notice ? verificationNoticeId : null, error ? verificationErrorId : null]
    .filter(Boolean)
    .join(" ");
  const formDescriptionIds = [notice ? formNoticeId : null, error ? formErrorId : null]
    .filter(Boolean)
    .join(" ");

  if (pendingVerificationEmail) {
    return (
      <div style={shellStyle}>
        <div style={panelStyle}>
          <div style={eyebrowStyle}>MasterBuild Access</div>
          <div style={titleStyle}>Verify your InsForge account</div>
          <div style={copyStyle}>
            Enter the 6-digit code sent to <span style={{ color: "#e2e8f0" }}>{pendingVerificationEmail}</span>.
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (verificationEmail && otp.trim()) {
                onVerifyEmail(verificationEmail, otp.trim());
              }
            }}
            aria-describedby={verificationDescriptionIds || undefined}
            style={{ display: "grid", gap: 14, marginTop: 18 }}
          >
            <label htmlFor={otpInputId} style={fieldLabelStyle}>
              Verification code
              <input
                id={otpInputId}
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="123456"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={verificationDescriptionIds || undefined}
                style={inputStyle}
              />
            </label>

            <button
              type="submit"
              disabled={!otp.trim() || isSubmitting}
              aria-busy={isSubmitting}
              style={primaryButtonStyle(!otp.trim() || isSubmitting)}
            >
              {isSubmitting ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldCheck size={15} />}
              Verify & Enter
            </button>
          </form>

          {notice ? (
            <div id={verificationNoticeId} role="status" aria-live="polite" style={noticeStyle}>
              {notice}
            </div>
          ) : null}
          {error ? (
            <div id={verificationErrorId} role="alert" aria-live="assertive" style={errorStyle}>
              {error}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={panelStyle}>
        <div style={eyebrowStyle}>MasterBuild Access</div>
        <div style={titleStyle}>Sign in to the command center</div>
        <div style={copyStyle}>
          InsForge authentication protects the dashboard while the local worker on your Mac streams fresh browser frames into the mission view.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            aria-pressed={mode === "sign-in"}
            style={tabButtonStyle(mode === "sign-in")}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("sign-up")}
            aria-pressed={mode === "sign-up"}
            style={tabButtonStyle(mode === "sign-up")}
          >
            Create Account
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!email.trim() || !password.trim()) return;
            if (mode === "sign-in") {
              onSignIn(email.trim(), password);
              return;
            }
            onSignUp(name.trim(), email.trim(), password);
          }}
          aria-describedby={formDescriptionIds || undefined}
          style={{ display: "grid", gap: 14, marginTop: 18 }}
        >
          {mode === "sign-up" ? (
            <label htmlFor={nameInputId} style={fieldLabelStyle}>
              Name
              <input
                id={nameInputId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                name="name"
                autoComplete="name"
                placeholder="Operator name"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={formDescriptionIds || undefined}
                style={inputStyle}
              />
            </label>
          ) : null}

          <label htmlFor={emailInputId} style={fieldLabelStyle}>
            Email
            <input
              id={emailInputId}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@domain.com"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={formDescriptionIds || undefined}
              style={inputStyle}
            />
          </label>

          <label htmlFor={passwordInputId} style={fieldLabelStyle}>
            Password
            <input
              id={passwordInputId}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              name="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              placeholder="••••••••"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={formDescriptionIds || undefined}
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={!email.trim() || !password.trim() || isSubmitting}
            aria-busy={isSubmitting}
            style={primaryButtonStyle(!email.trim() || !password.trim() || isSubmitting)}
          >
            {isSubmitting ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <LogIn size={15} />}
            {mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={dividerStyle}>
          <span>or continue with</span>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" onClick={() => onOAuth("google")} style={secondaryButtonStyle} disabled={isSubmitting}>
            <Mail size={15} />
            Google
          </button>
          <button type="button" onClick={() => onOAuth("github")} style={secondaryButtonStyle} disabled={isSubmitting}>
            <Github size={15} />
            GitHub
          </button>
        </div>

        <div style={hintStyle}>
          <KeyRound size={14} />
          Local browser sessions stay on your machine. Only mission state and preview frames are relayed through InsForge.
        </div>

        {notice ? (
          <div id={formNoticeId} role="status" aria-live="polite" style={noticeStyle}>
            {notice}
          </div>
        ) : null}
        {error ? (
          <div id={formErrorId} role="alert" aria-live="assertive" style={errorStyle}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const shellStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background:
    "radial-gradient(circle at top, rgba(34,211,238,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(239,68,68,0.12), transparent 30%), #020408",
  padding: 24,
  fontFamily: "'JetBrains Mono', monospace"
};

const panelStyle: CSSProperties = {
  width: "min(540px, 100%)",
  borderRadius: 28,
  border: "1px solid rgba(71, 85, 105, 0.34)",
  background: "rgba(3, 9, 18, 0.9)",
  backdropFilter: "blur(18px)",
  boxShadow: "0 30px 80px rgba(2, 8, 23, 0.45)",
  padding: 28,
  color: "#cbd5e1"
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 2.4,
  textTransform: "uppercase",
  color: "#22d3ee"
};

const titleStyle: CSSProperties = {
  marginTop: 10,
  fontSize: 28,
  color: "#f8fafc"
};

const copyStyle: CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  lineHeight: 1.7,
  color: "#94a3b8"
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 11,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#64748b"
};

const inputStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(71, 85, 105, 0.3)",
  background: "rgba(15, 23, 42, 0.7)",
  padding: "14px 16px",
  color: "#e2e8f0",
  outline: "none"
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    borderRadius: 999,
    border: active ? "1px solid rgba(34, 211, 238, 0.4)" : "1px solid rgba(71, 85, 105, 0.22)",
    background: active ? "rgba(6, 182, 212, 0.18)" : "transparent",
    color: active ? "#67e8f9" : "#94a3b8",
    padding: "10px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5
  };
}

function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    borderRadius: 16,
    border: "1px solid rgba(34, 211, 238, 0.35)",
    background: disabled ? "#0f172a" : "linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)",
    color: disabled ? "#475569" : "#03111d",
    padding: "14px 18px",
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 700,
    fontFamily: "inherit"
  };
}

const secondaryButtonStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(71, 85, 105, 0.25)",
  background: "rgba(8, 15, 28, 0.74)",
  color: "#cbd5e1",
  padding: "14px 18px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: "inherit"
};

const dividerStyle: CSSProperties = {
  margin: "18px 0 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1.8,
  color: "#475569"
};

const hintStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 11,
  lineHeight: 1.6,
  color: "#94a3b8"
};

const noticeStyle: CSSProperties = {
  marginTop: 16,
  borderRadius: 16,
  border: "1px solid rgba(34, 197, 94, 0.24)",
  background: "rgba(21, 128, 61, 0.12)",
  color: "#86efac",
  padding: "12px 14px",
  fontSize: 11,
  lineHeight: 1.6
};

const errorStyle: CSSProperties = {
  marginTop: 16,
  borderRadius: 16,
  border: "1px solid rgba(248, 113, 113, 0.24)",
  background: "rgba(127, 29, 29, 0.2)",
  color: "#fca5a5",
  padding: "12px 14px",
  fontSize: 11,
  lineHeight: 1.6
};
