"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AuthConsole } from "./components/AuthConsole";
import { BusinessPlanEvolution } from "./components/BusinessPlanEvolution";
import { CommandOverlay } from "./components/CommandOverlay";
import { ContentWhiteboard } from "./components/ContentWhiteboard";
import { ObservabilityDashboard } from "./components/ObservabilityDashboard";
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
  const [viewMode, setViewMode] = useState<"command" | "observe">("command");
  const {
    latestMission,
    agents,
    discoveries,
    logs,
    signals,
    thoughts,
    memory,
    businessPlans,
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
      5: latestMission.liveUrl5 ?? null
    };
  }, [latestMission]);

  const isRunning = useMemo(() => latestMission?.status === "active", [latestMission]);
  const activeAgentCount = useMemo(
    () => agents.filter((agent) => !["idle", "stopped", "error"].includes(agent.status)).length,
    [agents]
  );

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {viewMode === "command" ? (
        <>
          <ResizablePane
            defaultWidth={380}
            minWidth={280}
            maxWidth={600}
            left={
              <div style={{ height: "100%", overflow: "auto", padding: "72px 16px 16px", background: "linear-gradient(180deg, #06101b, #020408)" }}>
                <BusinessPlanEvolution
                  plans={businessPlans}
                  agents={agents}
                  discoveries={discoveries}
                  missionPrompt={latestMission?.prompt ?? ""}
                  finalOptions={latestMission?.finalOptions ?? null}
                  isRunning={Boolean(isRunning)}
                  onStopAll={stopAll}
                />
              </div>
            }
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
        </>
      ) : (
        <div style={{ display: "flex", height: "100%", background: "#020408" }}>
          <div style={{ flex: 1, padding: "50px 20px 20px 20px", overflow: "hidden" }}>
            <ObservabilityDashboard
              thoughts={thoughts}
              signals={signals}
              logs={logs}
              memory={memory}
              businessPlans={businessPlans}
              agents={agents}
              discoveries={discoveries}
              missionPrompt={latestMission?.prompt ?? ""}
              finalOptions={latestMission?.finalOptions ?? null}
              isRunning={Boolean(isRunning)}
              onStopAll={stopAll}
            />
          </div>
          <div style={{ width: 450, borderLeft: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <ContentWhiteboard content={discoveries} isRunning={Boolean(isRunning)} />
          </div>
        </div>
      )}

      <CommandOverlay
        userEmail={userEmail}
        isRunning={Boolean(isRunning)}
        isDeploying={isCreatingMission}
        missionPrompt={latestMission?.prompt ?? ""}
        finalOptions={latestMission?.finalOptions ?? null}
        logs={logs}
        activeAgentCount={activeAgentCount}
        isLoading={isLoading}
        error={error}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
