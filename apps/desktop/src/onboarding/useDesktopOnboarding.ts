import { useCallback, useEffect, useState } from "react";
import {
  completeOnboardingProgress,
  createOnboardingProgress,
  type OnboardingProgress,
} from "@tarlog/core";
import {
  loadDesktopOnboardingLaunch,
  setDesktopOnboardingProgress,
} from "../data/onboarding";

type LoadPhase = "idle" | "loading" | "ready" | "error";

interface OnboardingSession {
  open: boolean;
  required: boolean;
  /** Replays never persist an in-progress checkpoint over completed state. */
  replay: boolean;
  progress: OnboardingProgress;
}

const INITIAL_SESSION: OnboardingSession = {
  open: false,
  required: false,
  replay: false,
  progress: createOnboardingProgress(),
};

/** A replay begins at welcome but keeps useful workspace references. */
export function createDesktopReplayProgress(current: OnboardingProgress): OnboardingProgress {
  return createOnboardingProgress({
    customerId: current.customerId,
    projectId: current.projectId,
  });
}

/** Required first-run checkpoints are durable; replay checkpoints are transient. */
export function shouldPersistDesktopCheckpoint(replay: boolean): boolean {
  return !replay;
}

export interface DesktopOnboardingController extends OnboardingSession {
  phase: LoadPhase;
  error: string | null;
  retry: () => void;
  openReplay: () => void;
  dismissReplay: () => void;
  checkpoint: (progress: OnboardingProgress) => Promise<void>;
  complete: (progress: OnboardingProgress) => Promise<void>;
}

/** Own first-run resolution and the distinction between required and replay. */
export function useDesktopOnboarding(enabled: boolean): DesktopOnboardingController {
  const [phase, setPhase] = useState<LoadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [session, setSession] = useState<OnboardingSession>(INITIAL_SESSION);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setPhase("loading");
    setError(null);
    void loadDesktopOnboardingLaunch()
      .then((launch) => {
        if (!active) return;
        setSession({
          open: launch.show,
          required: launch.required,
          replay: false,
          progress: launch.progress,
        });
        setPhase("ready");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [enabled, nonce]);

  const retry = useCallback(() => setNonce((current) => current + 1), []);

  const openReplay = useCallback(() => {
    setSession((current) => ({
      open: true,
      required: false,
      replay: true,
      progress: createDesktopReplayProgress(current.progress),
    }));
  }, []);

  const dismissReplay = useCallback(() => {
    setSession((current) => current.required ? current : { ...current, open: false, replay: false });
  }, []);

  const checkpoint = useCallback(async (progress: OnboardingProgress) => {
    // A voluntary replay stays transient until it is completed. In particular,
    // closing it must not overwrite a durable `completed` state with in_progress.
    if (shouldPersistDesktopCheckpoint(session.replay)) {
      await setDesktopOnboardingProgress(progress);
    }
    setSession((current) => ({ ...current, progress }));
  }, [session.replay]);

  const complete = useCallback(async (progress: OnboardingProgress) => {
    const completed = completeOnboardingProgress(progress);
    await setDesktopOnboardingProgress(completed);
    setSession({
      open: false,
      required: false,
      replay: false,
      progress: completed,
    });
  }, []);

  return {
    ...session,
    phase,
    error,
    retry,
    openReplay,
    dismissReplay,
    checkpoint,
    complete,
  };
}
