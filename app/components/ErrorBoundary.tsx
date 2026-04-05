"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MasterBuild] Uncaught error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "linear-gradient(180deg, #08111f 0%, #020408 100%)",
          color: "#d9e6f2",
          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
          padding: 32,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "grid",
            placeItems: "center",
            fontSize: 24,
          }}
        >
          ⚠
        </div>

        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 1,
            margin: 0,
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            fontSize: 13,
            color: "#94a3b8",
            maxWidth: 480,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {this.state.error?.message ?? "An unexpected error occurred."}
        </p>

        <button
          onClick={this.handleRetry}
          style={{
            padding: "10px 24px",
            background: "rgba(14, 165, 233, 0.15)",
            border: "1px solid rgba(14, 165, 233, 0.35)",
            borderRadius: 8,
            color: "#7dd3fc",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            letterSpacing: 0.5,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(14, 165, 233, 0.25)";
            e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.55)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(14, 165, 233, 0.15)";
            e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.35)";
          }}
        >
          Try Again
        </button>
      </div>
    );
  }
}
