"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearPreviewAccessTokenCookie,
  getInsforgeConfigError,
  hasInsforgeConfig,
  insforge,
  isPreviewAuthBypassed,
  isUnsignedSessionError,
  primeInsforgeAccessTokenFromCookie,
  shouldBootstrapInsforgeSession,
  syncPreviewAccessTokenCookie
} from "../lib/insforge";

interface MasterBuildUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  profile?: {
    name?: string;
    avatar_url?: string | null;
  } | null;
}

function getPreviewBypassUser(): MasterBuildUser {
  return {
    id: "local-preview-user",
    email: "local-preview@masterbuild.dev",
    emailVerified: true,
    profile: {
      name: "Local Preview"
    }
  };
}

export function useMasterBuildSession() {
  const [user, setUser] = useState<MasterBuildUser | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configError = useMemo(() => getInsforgeConfigError(), []);

  const refreshUser = useCallback(async () => {
    if (!hasInsforgeConfig) {
      setError(configError);
      setIsLoading(false);
      return;
    }

    if (!shouldBootstrapInsforgeSession()) {
      setUser(null);
      setError(null);
      clearPreviewAccessTokenCookie();
      setIsLoading(false);
      return;
    }

    try {
      if (isPreviewAuthBypassed()) {
        setUser(getPreviewBypassUser());
        setError(null);
        setNotice(null);
        setIsLoading(false);
        return;
      }

      primeInsforgeAccessTokenFromCookie();
      const result = await insforge.auth.getCurrentUser();
      if (result.error && !isUnsignedSessionError(result.error)) {
        throw result.error;
      }

      const nextUser = result.data?.user as MasterBuildUser | null | undefined;
      setUser(nextUser ?? null);
      syncPreviewAccessTokenCookie();
      setError(null);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load the current InsForge session.";
      setError(message);
      setUser(null);
      clearPreviewAccessTokenCookie();
    } finally {
      setIsLoading(false);
    }
  }, [configError]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setNotice(null);

      try {
        const result = await insforge.auth.signInWithPassword({ email, password });
        if (result.error) {
          throw result.error;
        }

        setPendingVerificationEmail(null);
        await refreshUser();
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : "Sign-in failed.";
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshUser]
  );

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    setIsSubmitting(true);
    setNotice(null);

    try {
      const result = await insforge.auth.signUp({ email, password, name });
      if (result.error) {
        throw result.error;
      }

      if (result.data?.requireEmailVerification) {
        setPendingVerificationEmail(email);
        setNotice("Verification code sent. Enter the 6-digit code to finish setup.");
      } else {
        await refreshUser();
      }
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Sign-up failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [refreshUser]);

  const verifyEmail = useCallback(
    async (email: string, otp: string) => {
      setIsSubmitting(true);

      try {
        const result = await insforge.auth.verifyEmail({ email, otp });
        if (result.error) {
          throw result.error;
        }

        setPendingVerificationEmail(null);
        setNotice("Email verified. Your dashboard is ready.");
        await refreshUser();
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : "Verification failed.";
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshUser]
  );

  const signInWithOAuth = useCallback(async (provider: "google" | "github") => {
    setIsSubmitting(true);
    setNotice(null);

    try {
      const redirectTo = `${window.location.origin}/`;
      const result = await insforge.auth.signInWithOAuth({ provider, redirectTo });
      if (result.error) {
        throw result.error;
      }
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "OAuth sign-in failed.";
      setError(message);
      setIsSubmitting(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsSubmitting(true);
    setNotice(null);

    try {
      if (isPreviewAuthBypassed()) {
        setUser(getPreviewBypassUser());
        clearPreviewAccessTokenCookie();
        setError(null);
        setNotice("Local preview auth bypass is enabled.");
        return;
      }

      const result = await insforge.auth.signOut();
      if (result.error) {
        throw result.error;
      }
      setUser(null);
      setPendingVerificationEmail(null);
      clearPreviewAccessTokenCookie();
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Sign-out failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
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
  };
}
