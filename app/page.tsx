"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { AuthConsole } from "./components/AuthConsole";
import { CommandOverlay } from "./components/CommandOverlay";
import { ContentWhiteboard } from "./components/ContentWhiteboard";
import { ResizablePane } from "./components/ResizablePane";
import { useMasterBuildDashboard } from "./hooks/useMasterBuildDashboard";
import { useMasterBuildSession } from "./hooks/useMasterBuildSession";

const CommandCenterScene = dynamic(
  () => import("./components/CommandCenterScene").then((mod) => mod.CommandCenterScene),
  { ssr: false }
);

function DashboardShell({
  userEmail,
  onSignOut
}: {
  userEmail: string;
  onSignOut: () => void;
}) {
  const {
    latestMission,
    agents,
    discoveries,
    logs,
    signals,
    isLoading,
    isCreatingMission,
    error,
    createMission,
    stopAll,
    resetAll
  } = useMasterBuildDashboard();

  const liveUrls = useMemo(() => {
    if (!latestMission) {
      return {} as Record<number, string | null>;
    }

    return {
      1: latestMission.liveUrl ?? null,
      2: latestMission.liveUrl2 ?? null,
      3: latestMission.liveUrl3 ?? null,
      4: latestMission.liveUrl4 ?? null,
      5: latestMission.liveUrl5 ?? null,
      6: latestMission.liveUrl6 ?? null,
      7: latestMission.liveUrl7 ?? null,
      8: latestMission.liveUrl8 ?? null,
      9: latestMission.liveUrl9 ?? null
    };
  }, [latestMission]);

  const isRunning = useMemo(() => latestMission?.status === "active", [latestMission]);
  const activeAgentCount = useMemo(() => Object.values(liveUrls).filter(Boolean).length, [liveUrls]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <ResizablePane
        defaultWidth={500}
        minWidth={340}
        maxWidth={900}
        left={<ContentWhiteboard content={discoveries} isRunning={Boolean(isRunning)} />}
        right={
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <CommandCenterScene
              agents={agents}
              signals={signals}
              liveUrls={liveUrls}
              isRunning={Boolean(isRunning)}
            />
          </div>
        }
      />

      <CommandOverlay
        userEmail={userEmail}
        isRunning={Boolean(isRunning)}
        isDeploying={isCreatingMission}
        missionPrompt={latestMission?.prompt ?? ""}
        logs={logs}
        activeAgentCount={activeAgentCount}
        isLoading={isLoading}
        error={error}
        onCreateMission={createMission}
        onStopAll={stopAll}
        onResetAll={resetAll}
        onSignOut={onSignOut}
      />
    </div>
  );
}

export default function Home() {
  const {
    user,
    pendingVerificationEmail,
    isLoading,
    isSubmitting,
    error,
    notice,
    signIn,
    signUp,
    verifyEmail,
    signInWithOAuth,
    signOut
  } = useMasterBuildSession();

  if (isLoading) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "#020408",
          color: "#94a3b8",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 1.5,
          textTransform: "uppercase"
        }}
      >
        Connecting to InsForge session...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthConsole
        pendingVerificationEmail={pendingVerificationEmail}
        isSubmitting={isSubmitting}
        error={error}
        notice={notice}
        onSignIn={signIn}
        onSignUp={signUp}
        onVerifyEmail={verifyEmail}
        onOAuth={signInWithOAuth}
      />
    );
  }

  return <DashboardShell userEmail={user.email} onSignOut={signOut} />;
}
