"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Budget, TravelStyle } from "@/lib/types/itinerary";
import { AuthPanel } from "@/components/auth-panel";
import {
  getCurrentSession,
  onAuthStateChanged,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
} from "@/lib/supabase/auth";
import { createTrip, deleteTrip, listTrips, updateTrip } from "@/lib/supabase/trips";
import type {
  ChecklistItem,
  FormDataState,
  ItineraryDay,
  ItineraryResponse,
  SavedTrip,
} from "@/lib/types/planner";

const budgetOptions: Budget[] = ["low", "medium", "high"];
const travelStyleOptions: TravelStyle[] = [
  "relaxed",
  "packed",
  "nightlife",
  "cultural",
  "nature",
];

const MS_IN_DAY = 1000 * 60 * 60 * 24;
const TOAST_DURATION_MS = 3200;

type ToastKind = "success" | "error" | "info";

type ToastMessage = {
  id: number;
  kind: ToastKind;
  message: string;
};

type BudgetEstimate = {
  currencySymbol: string;
  totalMin: number;
  totalMax: number;
  dailyMin: number;
  dailyMax: number;
  categories: Array<{ label: string; min: number; max: number }>;
};

type RebalancePromptState = {
  fromDay: number;
  fromDayTitle: string;
} | null;

const baseDailyRangesByBudget: Record<Budget, { min: number; max: number }> = {
  low: { min: 80, max: 140 },
  medium: { min: 140, max: 260 },
  high: { min: 260, max: 480 },
};

const categoryShares = [
  { label: "Accommodation", share: 0.38 },
  { label: "Dining", share: 0.24 },
  { label: "Transport", share: 0.16 },
  { label: "Experiences", share: 0.16 },
  { label: "Buffer", share: 0.06 },
] as const;

const formatCurrencyRange = (symbol: string, min: number, max: number) => {
  const formatValue = (value: number) =>
    `${symbol}${Math.round(value).toLocaleString()}`;
  if (Math.abs(min - max) < 1) {
    return formatValue(min);
  }
  return `${formatValue(min)} – ${formatValue(max)}`;
};

const detectCurrencySymbol = (days: ItineraryDay[]) => {
  const joined = days.map((day) => day.estimated_cost).join(" ");
  const symbolMatch = joined.match(/[$€£₹¥]/);
  return symbolMatch?.[0] ?? "$";
};

const parseDayCostRange = (value: string) => {
  const numericTokens = value?.match(/\d[\d,.]*/) ?? [];
  const numbers = numericTokens
    .map((token) => Number.parseFloat(token.replace(/,/g, "")))
    .filter((token) => Number.isFinite(token) && token > 0);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return { min, max };
};

const estimateBudget = (itinerary: ItineraryResponse, budget: Budget): BudgetEstimate => {
  const currencySymbol = detectCurrencySymbol(itinerary.days);
  let totalMin = 0;
  let totalMax = 0;
  let parsedDays = 0;

  itinerary.days.forEach((day) => {
    const parsed = parseDayCostRange(day.estimated_cost);
    if (!parsed) return;
    parsedDays += 1;
    totalMin += parsed.min;
    totalMax += parsed.max;
  });

  if (parsedDays !== itinerary.days.length) {
    const fallback = baseDailyRangesByBudget[budget];
    const missingDays = itinerary.days.length - parsedDays;
    totalMin += fallback.min * missingDays;
    totalMax += fallback.max * missingDays;
  }

  const dayCount = Math.max(1, itinerary.days.length);
  const dailyMin = totalMin / dayCount;
  const dailyMax = totalMax / dayCount;

  const categories = categoryShares.map((item) => ({
    label: item.label,
    min: totalMin * item.share,
    max: totalMax * item.share,
  }));

  return {
    currencySymbol,
    totalMin,
    totalMax,
    dailyMin,
    dailyMax,
    categories,
  };
};

const calculateTripDays = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diff = Math.floor((end.getTime() - start.getTime()) / MS_IN_DAY) + 1;
  return Math.max(1, diff);
};

const createDefaultEndDate = () => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
};

const toTitleCase = (str: string): string => {
  if (!str) return str;
  return str
    .split(",")
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" "),
    )
    .join(", ");
};

const formatDateRange = (start: string, end: string): string => {
  if (!start || !end) return `${start} – ${end}`;
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
};

export default function Home() {
  const defaultDates = useMemo(() => createDefaultEndDate(), []);
  const [formData, setFormData] = useState<FormDataState>({
    tripTitle: "",
    destination: "",
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    budget: "medium",
    travelStyle: "relaxed",
    interests: "",
  });

  const [result, setResult] = useState<ItineraryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDayLoading, setIsDayLoading] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripNotes, setTripNotes] = useState("");
  const [checklistInput, setChecklistInput] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: 1, text: "Passport and travel documents", done: false },
    { id: 2, text: "Confirm accommodation details", done: false },
  ]);
  const [nextChecklistId, setNextChecklistId] = useState(3);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isFetchingTrips, setIsFetchingTrips] = useState(true);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);
  const [rebalancePrompt, setRebalancePrompt] = useState<RebalancePromptState>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);

  const tripDays = calculateTripDays(formData.startDate, formData.endDate);
  const completedChecklistCount = checklist.filter((item) => item.done).length;
  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        formData,
        result,
        tripNotes,
        checklist,
      }),
    [formData, result, tripNotes, checklist],
  );
  const isUnsavedChanges = selectedTripId !== null && lastSavedSignature !== currentSignature;
  const budgetEstimate = useMemo(
    () => (result ? estimateBudget(result, formData.budget) : null),
    [result, formData.budget],
  );
  const activeOperationLabel = isLoading
    ? "Generating itinerary"
    : isRebalancing
      ? "Rebalancing remaining days"
    : isSavingTrip
      ? selectedTripId
        ? "Updating trip"
        : "Saving trip"
      : isDayLoading
        ? `Refreshing day ${isDayLoading}`
        : isFetchingTrips
          ? "Syncing saved trips"
          : null;

  const pushToast = (kind: ToastKind, message: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
  };

  useEffect(() => {
    if (!saveMessage) return;
    const timeoutId = window.setTimeout(() => {
      setSaveMessage(null);
    }, 4500);
    return () => window.clearTimeout(timeoutId);
  }, [saveMessage]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [toasts]);

  const refreshSavedTrips = async (userId: string) => {
    const trips = await listTrips(userId);
    setSavedTrips(trips);
    return trips;
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const currentSession = await getCurrentSession();
        setSession(currentSession);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to read authentication session",
        );
      } finally {
        setIsAuthLoading(false);
      }
    };

    void loadSession();

    const unsubscribe = onAuthStateChanged((nextSession) => {
      setSession(nextSession);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadSavedTrips = async () => {
      if (!session?.user?.id) {
        setSavedTrips([]);
        setSelectedTripId(null);
        setLastSavedSignature(null);
        setIsFetchingTrips(false);
        return;
      }

      setIsFetchingTrips(true);
      try {
        await refreshSavedTrips(session.user.id);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch saved trips",
        );
      } finally {
        setIsFetchingTrips(false);
      }
    };

    void loadSavedTrips();
  }, [session?.user?.id]);

  const generateItinerary = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination: formData.destination,
          days: tripDays,
          budget: formData.budget,
          style: formData.travelStyle,
          interests: formData.interests,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate itinerary");
      }

      setResult(data as ItineraryResponse);
      pushToast("success", "New itinerary generated.");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Something went wrong";
      setError(message);
      pushToast("error", message);
    } finally {
      setIsLoading(false);
    }
  };

  const buildRebalanceContext = (days: ItineraryDay[], pivotDay: number) => {
    const recentDays = days
      .filter((day) => day.day <= pivotDay)
      .slice(-2)
      .map((day) => `Day ${day.day}: ${day.title}. Tip: ${day.tips}`)
      .join(" ");
    return recentDays;
  };

  const regenerateDayFromApi = async (
    targetDay: number,
    totalDays: number,
    contextHint: string,
  ) => {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        destination: formData.destination,
        days: 1,
        budget: formData.budget,
        style: formData.travelStyle,
        interests:
          `${formData.interests}.` +
          ` Keep continuity with this ${totalDays}-day trip.` +
          ` Generate day ${targetDay} with balanced pacing and budget realism.` +
          ` ${contextHint}`.trim(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Failed to regenerate day ${targetDay}`);
    }

    const replacementDay = (data as ItineraryResponse).days?.[0];
    if (!replacementDay) {
      throw new Error(`No day returned for day ${targetDay}`);
    }

    return { ...replacementDay, day: targetDay, title: `Day ${targetDay}` };
  };

  const regenerateSingleDay = async (targetDay: number) => {
    if (!result) return;
    setIsDayLoading(targetDay);
    setRebalancePrompt(null);
    setError(null);

    try {
      const replacementDay = await regenerateDayFromApi(
        targetDay,
        tripDays,
        `Focus on day ${targetDay} of ${tripDays}.`,
      );

      setResult((prev) => {
        if (!prev) return prev;
        const updatedDays = prev.days.map((day) =>
          day.day === targetDay ? replacementDay : day,
        );
        return { ...prev, days: updatedDays };
      });
      pushToast("success", `Day ${targetDay} regenerated.`);
      if (targetDay < tripDays) {
        setRebalancePrompt({
          fromDay: targetDay,
          fromDayTitle: replacementDay.title,
        });
      }
    } catch (dayError) {
      const message = dayError instanceof Error ? dayError.message : "Could not regenerate day";
      setError(message);
      pushToast("error", message);
    } finally {
      setIsDayLoading(null);
    }
  };

  const rebalanceRemainingDays = async () => {
    if (!result || !rebalancePrompt) return;
    const startDay = rebalancePrompt.fromDay + 1;
    if (startDay > tripDays) {
      setRebalancePrompt(null);
      return;
    }

    const originalDays = result.days;
    const updatedDays = [...originalDays];
    setIsRebalancing(true);
    setError(null);

    try {
      for (let dayNumber = startDay; dayNumber <= tripDays; dayNumber += 1) {
        const contextHint = buildRebalanceContext(updatedDays, dayNumber - 1);
        const replacementDay = await regenerateDayFromApi(dayNumber, tripDays, contextHint);
        const index = updatedDays.findIndex((entry) => entry.day === dayNumber);
        if (index >= 0) {
          updatedDays[index] = replacementDay;
        }
      }

      setResult((prev) => (prev ? { ...prev, days: updatedDays } : prev));
      setRebalancePrompt(null);
      pushToast("success", `Rebalanced days ${startDay}–${tripDays} to match your new flow.`);
      setSaveMessage("Itinerary rebalanced. Review and save changes.");
    } catch (rebalanceError) {
      const message =
        rebalanceError instanceof Error
          ? rebalanceError.message
          : "Could not rebalance remaining days";
      setError(message);
      pushToast("error", message);
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tripDays > 30) {
      pushToast("error", "Maximum trip duration is 30 days. Please adjust your dates.");
      return;
    }
    setResult(null);
    await generateItinerary();
  };

  const updateDay = (dayNumber: number, updater: (day: ItineraryDay) => ItineraryDay) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((day) => (day.day === dayNumber ? updater(day) : day)),
      };
    });
  };

  const addActivity = (
    dayNumber: number,
    slot: keyof ItineraryDay["activities"],
  ) => {
    updateDay(dayNumber, (day) => ({
      ...day,
      activities: {
        ...day.activities,
        [slot]: [...day.activities[slot], ""],
      },
    }));
  };

  const removeActivity = (
    dayNumber: number,
    slot: keyof ItineraryDay["activities"],
    index: number,
  ) => {
    updateDay(dayNumber, (day) => ({
      ...day,
      activities: {
        ...day.activities,
        [slot]: day.activities[slot].filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  };

  const updateActivity = (
    dayNumber: number,
    slot: keyof ItineraryDay["activities"],
    index: number,
    value: string,
  ) => {
    updateDay(dayNumber, (day) => ({
      ...day,
      activities: {
        ...day.activities,
        [slot]: day.activities[slot].map((item, itemIndex) =>
          itemIndex === index ? value : item,
        ),
      },
    }));
  };

  const addChecklistItem = () => {
    const text = checklistInput.trim();
    if (!text) return;
    setChecklist((prev) => [...prev, { id: nextChecklistId, text, done: false }]);
    setNextChecklistId((prev) => prev + 1);
    setChecklistInput("");
  };

  const handleSaveTrip = async () => {
    if (!result || !session?.user?.id) return;
    setIsSavingTrip(true);
    setSaveMessage(null);
    setError(null);

    try {
      const payload = {
        formData,
        days: tripDays,
        notes: tripNotes,
        checklist,
        itinerary: result,
      };

      const savedTrip = selectedTripId
        ? await updateTrip(session.user.id, selectedTripId, payload)
        : await createTrip(session.user.id, payload);

      const refreshedTrips = await refreshSavedTrips(session.user.id);
      const updatedSelectedTrip = refreshedTrips.find((trip) => trip.id === savedTrip.id);
      setSelectedTripId(updatedSelectedTrip?.id ?? savedTrip.id);
      setSaveMessage(selectedTripId ? "Trip updated." : "Trip saved.");
      pushToast("success", selectedTripId ? "Trip updated successfully." : "Trip saved successfully.");
      setLastSavedSignature(currentSignature);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to save trip";
      setError(message);
      pushToast("error", message);
    } finally {
      setIsSavingTrip(false);
    }
  };

  const handleOpenTrip = (trip: SavedTrip) => {
    setFormData(trip.formData);
    setTripNotes(trip.notes);
    setChecklist(trip.checklist);
    setNextChecklistId(
      trip.checklist.reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1,
    );
    setResult(trip.itinerary);
    setSelectedTripId(trip.id);
    setSaveMessage(`Loaded "${trip.formData.tripTitle || trip.formData.destination}".`);
    pushToast("info", "Saved trip loaded.");
    setLastSavedSignature(
      JSON.stringify({
        formData: trip.formData,
        result: trip.itinerary,
        tripNotes: trip.notes,
        checklist: trip.checklist,
      }),
    );
  };

  const handleDeleteTrip = async (id: string) => {
    if (!session?.user?.id) return;
    setDeletingTripId(id);
    setError(null);
    try {
      await deleteTrip(session.user.id, id);
      setSavedTrips((prev) => prev.filter((trip) => trip.id !== id));
      if (selectedTripId === id) {
        setSelectedTripId(null);
        setLastSavedSignature(null);
      }
      pushToast("success", "Trip deleted.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete trip";
      setError(message);
      pushToast("error", message);
    } finally {
      setDeletingTripId(null);
    }
  };

  const handleSignUp = async (email: string, password: string) => {
    setIsAuthSubmitting(true);
    setAuthMessage(null);
    setError(null);
    try {
      const data = await signUpWithEmail(email, password);
      if (data.user && !data.session) {
        setAuthMessage("Sign-up successful. Check your email to confirm your account.");
      } else {
        setAuthMessage("Account created and signed in.");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign-up failed");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    setIsAuthSubmitting(true);
    setAuthMessage(null);
    setError(null);
    try {
      await signInWithEmail(email, password);
      setAuthMessage("Logged in successfully.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Login failed");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setSaveMessage(null);
    try {
      await signOutUser();
      setResult(null);
      setTripNotes("");
      setChecklistInput("");
      setChecklist([
        { id: 1, text: "Passport and travel documents", done: false },
        { id: 2, text: "Confirm accommodation details", done: false },
      ]);
      setSelectedTripId(null);
      setLastSavedSignature(null);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Logout failed");
    }
  };

  const inputClass =
    "rounded-xl border border-[#E8E4DF] bg-[#F7F5F2] px-4 py-2.5 text-sm text-[#1A1A18] outline-none transition duration-150 placeholder:text-[#B0ACA6] focus:border-[#1C3A2A] focus:bg-white focus:ring-2 focus:ring-[#1C3A2A]/8";
  const actionButtonClass =
    "rounded-full bg-[#1C3A2A] px-6 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-[#243F2F] hover:shadow-[0_4px_12px_-4px_rgba(28,58,42,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55";

  if (isAuthLoading) {
    return (
      <main className="min-h-screen bg-[#F7F5F2] px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-[#E8E4DF] bg-white p-6 text-sm text-[#6B6860] shadow-sm">
          Loading session…
        </div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <AuthPanel
        isSubmitting={isAuthSubmitting}
        error={error}
        message={authMessage}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F5F2] text-[#1A1A18]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-5 py-8 sm:px-8 lg:gap-12 lg:px-14 lg:py-14">

        {/* ── Header ── */}
        <header className="rounded-3xl border border-[#E8E4DF] bg-white px-7 py-7 shadow-[0_2px_16px_-4px_rgba(26,26,24,0.07)] sm:px-10 sm:py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1C3A2A]">
                Atlas AI Planner
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A18] sm:text-3xl lg:text-[2rem] sm:leading-snug">
                Build trips like a modern travel startup
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-[#7A7670]">
                Turn rough ideas into structured day plans, realistic budgets,
                and an execution-ready travel workspace in minutes.
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border border-[#F0EDE8] bg-[#F9F8F6] px-4 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[11px] text-[#9C9890]">{session.user.email}</p>
                  <p className="mt-0.5 text-sm font-medium text-[#1A1A18]">
                    {savedTrips.length}{" "}
                    <span className="font-normal text-[#7A7670]">
                      {savedTrips.length === 1 ? "saved trip" : "saved trips"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full border border-[#E8E4DF] bg-white px-3.5 py-1.5 text-xs font-medium text-[#6B6860] transition-all duration-150 hover:border-[#1C3A2A]/25 hover:text-[#1C3A2A]"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#ECEAE6] bg-[#F9F8F6] px-3 py-1 text-[11px] font-medium text-[#7A7670]">
              {result ? "Trip active" : "Ready for your next trip"}
            </span>
            <span className="rounded-full border border-[#ECEAE6] bg-[#F9F8F6] px-3 py-1 text-[11px] font-medium text-[#7A7670]">
              {completedChecklistCount}/{checklist.length} checklist items done
            </span>
            {selectedTripId ? (
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                  isUnsavedChanges
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {isUnsavedChanges ? "Unsaved changes" : "All changes saved"}
              </span>
            ) : result ? (
              <span className="rounded-full border border-[#ECEAE6] bg-[#F9F8F6] px-3 py-1 text-[11px] font-medium text-[#7A7670]">
                Draft — not yet saved
              </span>
            ) : null}
            {activeOperationLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
                {activeOperationLabel}…
              </span>
            )}
          </div>
        </header>

        {/* ── Plan form + Saved trips ── */}
        <section className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          <article className="rounded-3xl border border-[#E8E4DF] bg-white p-7 shadow-[0_2px_16px_-4px_rgba(26,26,24,0.07)] lg:col-span-2 sm:p-8 lg:p-10">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[#1A1A18]">Plan a New Trip</h2>
                <p className="mt-0.5 text-xs text-[#9C9890]">Fill in your details and generate a full itinerary.</p>
              </div>
              <span className="rounded-full border border-[#ECEAE6] bg-[#F9F8F6] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9C9890]">
                Smart Intake
              </span>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">
                  Trip title
                </span>
                <input
                  className={inputClass}
                  value={formData.tripTitle}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      tripTitle: event.target.value,
                    }))
                  }
                  placeholder="Golden Week Escape"
                />
              </label>

              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">
                  Destination
                </span>
                <input
                  required
                  className={inputClass}
                  value={formData.destination}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      destination: event.target.value,
                    }))
                  }
                  placeholder="Tokyo, Japan"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">
                  Start date
                </span>
                <input
                  required
                  type="date"
                  className={inputClass}
                  value={formData.startDate}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">
                  End date
                </span>
                <input
                  required
                  type="date"
                  min={formData.startDate}
                  className={inputClass}
                  value={formData.endDate}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">Budget</span>
                <select
                  className={inputClass}
                  value={formData.budget}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      budget: event.target.value as Budget,
                    }))
                  }
                >
                  {budgetOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col justify-center rounded-xl border border-[#ECEAE6] bg-[#F9F8F6] px-4 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#B0ACA6]">
                  Calculated duration
                </p>
                <p className="mt-1 text-sm font-semibold text-[#1A1A18]">
                  {tripDays} {tripDays === 1 ? "day" : "days"}
                </p>
              </div>

              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">
                  Travel style
                </span>
                <select
                  className={inputClass}
                  value={formData.travelStyle}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      travelStyle: event.target.value as TravelStyle,
                    }))
                  }
                >
                  {travelStyleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9C9890]">
                  Interests
                </span>
                <input
                  required
                  className={inputClass}
                  value={formData.interests}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      interests: event.target.value,
                    }))
                  }
                  placeholder="food, museums, hiking"
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className={`sm:col-span-2 ${actionButtonClass}`}
              >
                {isLoading ? "Generating your travel plan…" : "Build itinerary"}
              </button>
            </form>
          </article>

          <aside className="rounded-3xl border border-[#E8E4DF] bg-white p-7 shadow-[0_2px_16px_-4px_rgba(26,26,24,0.07)] lg:p-8">
            <h2 className="text-base font-semibold tracking-tight text-[#1A1A18]">Saved Trips</h2>
            <p className="mt-1 text-xs text-[#9C9890]">
              Reopen, continue editing, or remove past trips.
            </p>
            <div className="mt-5 space-y-2.5">
              {isFetchingTrips && (
                <>
                  {[...Array.from({ length: 3 })].map((_, idx) => (
                    <div
                      key={`trip-skeleton-${idx}`}
                      className="animate-pulse rounded-2xl border border-[#ECEAE6] bg-[#F9F8F6] p-4"
                    >
                      <div className="h-3 w-1/2 rounded-full bg-[#E8E4DF]" />
                      <div className="mt-2 h-2.5 w-5/6 rounded-full bg-[#ECEAE6]" />
                      <div className="mt-2 h-2.5 w-2/3 rounded-full bg-[#ECEAE6]" />
                    </div>
                  ))}
                </>
              )}

              {!isFetchingTrips && savedTrips.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#E8E4DF] bg-[#F9F8F6] p-5">
                  <p className="text-sm font-medium text-[#1A1A18]">No saved trips yet</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#9C9890]">
                    Build your first itinerary and save it to quickly reopen later.
                  </p>
                </div>
              )}

              {savedTrips.map((trip) => (
                <div
                  key={trip.id}
                  className={`rounded-2xl border p-4 transition-all duration-150 hover:-translate-y-px ${
                    selectedTripId === trip.id
                      ? "border-[#1C3A2A]/20 bg-[#F0F5F2] ring-1 ring-[#1C3A2A]/15"
                      : "border-[#ECEAE6] bg-[#F9F8F6] hover:bg-white hover:shadow-sm"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenTrip(trip)}
                    className="w-full text-left"
                  >
                    <p className="text-sm font-semibold text-[#1A1A18]">
                      {toTitleCase(trip.formData.tripTitle) || "Untitled Trip"}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-[#6B6860]">
                      {toTitleCase(trip.formData.destination)}
                    </p>
                    <p className="mt-1.5 text-[11px] text-[#9C9890]">
                      {trip.formData.startDate} → {trip.formData.endDate}
                    </p>
                    <p className="mt-1 text-[11px] text-[#B0ACA6]">
                      Saved {new Date(trip.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </button>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full border border-[#E8E4DF] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7A7670]">
                      {trip.days}d
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrip(trip.id)}
                      disabled={deletingTripId === trip.id}
                      className="rounded-full px-3 py-1 text-[11px] font-medium text-red-400 transition-all duration-150 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      {deletingTripId === trip.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        {/* ── Error / Save banners ── */}
        {error && (
          <p
            role="status"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {saveMessage && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            {saveMessage}
          </p>
        )}

        {/* ── Toast stack ── */}
        {toasts.length > 0 && (
          <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all duration-200 ${
                  toast.kind === "success"
                    ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
                    : toast.kind === "error"
                      ? "border-red-200 bg-red-50/95 text-red-800"
                      : "border-[#E8E4DF] bg-white/95 text-[#6B6860]"
                }`}
                role="status"
              >
                {toast.message}
              </div>
            ))}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {isLoading && !result && (
          <section className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array.from({ length: 4 })].map((_, idx) => (
                <div
                  key={`summary-skeleton-${idx}`}
                  className="animate-pulse rounded-2xl border border-[#E8E4DF] bg-white p-5"
                >
                  <div className="h-2 w-16 rounded-full bg-[#ECEAE6]" />
                  <div className="mt-3 h-5 w-28 rounded-full bg-[#F3F1EE]" />
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-[#E8E4DF] bg-white p-7">
              <div className="animate-pulse space-y-4">
                <div className="h-2 w-20 rounded-full bg-[#ECEAE6]" />
                <div className="h-6 w-52 rounded-full bg-[#F3F1EE]" />
                <div className="h-3 w-full rounded-full bg-[#F3F1EE]" />
                <div className="h-3 w-4/5 rounded-full bg-[#F3F1EE]" />
                <div className="mt-2 h-32 w-full rounded-2xl bg-[#F7F5F2]" />
              </div>
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {!result && !isLoading && (
          <section className="rounded-3xl border border-dashed border-[#E0DDD8] bg-white px-8 py-14 text-center">
            <p className="text-base font-semibold text-[#1A1A18]">Ready to build your itinerary</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#7A7670]">
              Fill your trip details above to unlock the day-by-day schedule, budget planner, notes, and checklist.
            </p>
            <p className="mt-3 text-xs text-[#B0ACA6]">
              Tip: try interests like &ldquo;street food, museums, easy day trips&rdquo; for sharper results.
            </p>
          </section>
        )}

        {/* ── Dashboard ── */}
        {result && (
          <section className="space-y-10">

            {/* ── Summary strip ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#B0ACA6]">
                  Destination
                </p>
                <p className="mt-2 text-lg font-semibold leading-snug text-[#1A1A18]">
                  {toTitleCase(formData.destination) || "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#B0ACA6]">
                  Dates
                </p>
                <p className="mt-2 text-sm font-semibold leading-snug text-[#1A1A18]">
                  {formatDateRange(formData.startDate, formData.endDate)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#B0ACA6]">
                  Budget range
                </p>
                <p className="mt-2 text-lg font-semibold leading-snug text-[#1A1A18]">
                  {budgetEstimate
                    ? formatCurrencyRange(
                        budgetEstimate.currencySymbol,
                        budgetEstimate.totalMin,
                        budgetEstimate.totalMax,
                      )
                    : result.total_estimated_budget}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#B0ACA6]">
                  Travel style
                </p>
                <p className="mt-2 text-lg font-semibold capitalize leading-snug text-[#1A1A18]">
                  {formData.travelStyle}
                </p>
              </div>
            </div>

            {/* ── Itinerary + Sidebar ── */}
            <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 xl:gap-10">

              {/* Itinerary */}
              <article className="rounded-3xl border border-[#E8E4DF] bg-white p-7 shadow-[0_2px_20px_-6px_rgba(26,26,24,0.1)] lg:col-span-2 sm:p-8 lg:p-10">

                {/* Itinerary header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F3F1EE] pb-7">
                  <div className="min-w-0">
                    {formData.tripTitle ? (
                      <>
                        <h2 className="text-2xl font-semibold tracking-tight text-[#1A1A18] sm:text-3xl">
                          {toTitleCase(formData.tripTitle)}
                        </h2>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#9C9890]">
                          {toTitleCase(formData.destination)} &middot; {tripDays} days &middot; {formData.travelStyle}
                        </p>
                      </>
                    ) : (
                      <h2 className="text-xl font-semibold tracking-tight text-[#1A1A18]">
                        Day-by-Day Itinerary
                      </h2>
                    )}
                    <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-[#7A7670]">
                      {result.trip_summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditMode((prev) => !prev)}
                      className="rounded-full border border-[#E8E4DF] bg-white px-4 py-2 text-xs font-medium text-[#6B6860] transition-all duration-150 hover:border-[#C8C4BE] hover:text-[#1A1A18]"
                    >
                      {isEditMode ? "Finish editing" : "Edit itinerary"}
                    </button>
                    <button
                      type="button"
                      onClick={generateItinerary}
                      disabled={isLoading || isRebalancing}
                      className="rounded-full border border-[#E8E4DF] bg-white px-4 py-2 text-xs font-medium text-[#6B6860] transition-all duration-150 hover:border-[#C8C4BE] hover:text-[#1A1A18] disabled:opacity-50"
                    >
                      {isLoading ? "Regenerating…" : "Regenerate all"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTrip}
                      disabled={
                        isSavingTrip ||
                        isRebalancing ||
                        (selectedTripId !== null && !isUnsavedChanges)
                      }
                      className="rounded-full bg-[#1C3A2A] px-4 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-[#243F2F] hover:shadow-[0_4px_10px_-4px_rgba(28,58,42,0.35)] disabled:opacity-50"
                    >
                      {isSavingTrip
                        ? selectedTripId
                          ? "Updating…"
                          : "Saving…"
                        : selectedTripId
                          ? isUnsavedChanges
                            ? "Save changes"
                            : "Saved"
                          : "Save trip"}
                    </button>
                  </div>
                </div>

                {/* Rebalance prompt */}
                {rebalancePrompt && (
                  <div className="mt-5 rounded-2xl border border-[#C8A96A]/25 bg-[#FEFAF3] p-5">
                    <p className="text-sm font-semibold text-[#1A1A18]">
                      Rebalance remaining itinerary?
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#7A7670]">
                      Day {rebalancePrompt.fromDay} was refreshed. Rebalancing updates days{" "}
                      {rebalancePrompt.fromDay + 1}–{tripDays} to preserve pacing, style, and
                      budget continuity while keeping earlier days unchanged.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={rebalanceRemainingDays}
                        disabled={isRebalancing}
                        className="rounded-full bg-[#1C3A2A] px-4 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-[#243F2F] disabled:opacity-60"
                      >
                        {isRebalancing ? "Rebalancing…" : "Yes, rebalance"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRebalancePrompt(null);
                          pushToast("info", "Keeping remaining days unchanged.");
                        }}
                        disabled={isRebalancing}
                        className="rounded-full border border-[#E8E4DF] bg-white px-4 py-1.5 text-xs font-medium text-[#6B6860] transition-all duration-150 hover:border-[#C8C4BE] hover:text-[#1A1A18] disabled:opacity-60"
                      >
                        Keep as-is
                      </button>
                    </div>
                  </div>
                )}

                {/* Day cards */}
                <div className="mt-8 space-y-5">
                  {result.days.map((day) => (
                    <div
                      key={day.day}
                      className="rounded-2xl border border-[#ECEAE6] bg-[#F9F8F6] p-6 transition-all duration-150 hover:-translate-y-px hover:shadow-md sm:p-7"
                    >
                      {/* Card header */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          {isEditMode ? (
                            <input
                              value={day.title}
                              onChange={(event) =>
                                updateDay(day.day, (currentDay) => ({
                                  ...currentDay,
                                  title: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2 text-base font-semibold text-[#1A1A18] outline-none transition focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10 sm:max-w-sm"
                            />
                          ) : (
                            <>
                              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#B0ACA6]">
                                Day {day.day} of {tripDays}
                              </p>
                              <h3 className="mt-0.5 text-base font-semibold leading-snug text-[#1A1A18] sm:text-lg">
                                {day.title}
                              </h3>
                            </>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-[#D4B97A]/40 bg-[#FEFAF3] px-3 py-1 text-[11px] font-semibold text-[#9A7035]">
                            {day.estimated_cost}
                          </span>
                          <button
                            type="button"
                            onClick={() => regenerateSingleDay(day.day)}
                            disabled={isDayLoading === day.day || isRebalancing}
                            className="rounded-full border border-[#E8E4DF] bg-white px-3 py-1.5 text-[11px] font-medium text-[#6B6860] transition-all duration-150 hover:border-[#C8C4BE] hover:text-[#1C3A2A] disabled:opacity-50"
                          >
                            {isDayLoading === day.day ? "Refreshing…" : "Regenerate"}
                          </button>
                        </div>
                      </div>

                      {/* Morning / Afternoon / Evening — open grid, no boxes */}
                      <div className="mt-7 grid gap-x-10 gap-y-6 text-sm sm:grid-cols-3">

                        {/* Morning */}
                        <div>
                          <p className="border-b border-[#C8A96A]/30 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A96A]">
                            Morning
                          </p>
                          <ul className="mt-3 space-y-2.5">
                            {day.activities.morning.map((activity, index) => (
                              <li key={index} className="text-[13px] leading-[1.6]">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      value={activity}
                                      onChange={(event) =>
                                        updateActivity(day.day, "morning", index, event.target.value)
                                      }
                                      className="w-full rounded-lg border border-[#E8E4DF] bg-white px-2.5 py-1.5 text-sm text-[#1A1A18] outline-none focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeActivity(day.day, "morning", index)}
                                      className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  <span className="flex items-start gap-2.5 text-[#3A3A38]">
                                    <span className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#C8A96A]" />
                                    {activity}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => addActivity(day.day, "morning")}
                              className="mt-3 text-xs font-medium text-[#1C3A2A] hover:underline"
                            >
                              + Add activity
                            </button>
                          )}
                        </div>

                        {/* Afternoon */}
                        <div>
                          <p className="border-b border-[#9C9890]/25 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-[#9C9890]">
                            Afternoon
                          </p>
                          <ul className="mt-3 space-y-2.5">
                            {day.activities.afternoon.map((activity, index) => (
                              <li key={index} className="text-[13px] leading-[1.6]">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      value={activity}
                                      onChange={(event) =>
                                        updateActivity(day.day, "afternoon", index, event.target.value)
                                      }
                                      className="w-full rounded-lg border border-[#E8E4DF] bg-white px-2.5 py-1.5 text-sm text-[#1A1A18] outline-none focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeActivity(day.day, "afternoon", index)}
                                      className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  <span className="flex items-start gap-2.5 text-[#3A3A38]">
                                    <span className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#9C9890]/70" />
                                    {activity}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => addActivity(day.day, "afternoon")}
                              className="mt-3 text-xs font-medium text-[#1C3A2A] hover:underline"
                            >
                              + Add activity
                            </button>
                          )}
                        </div>

                        {/* Evening */}
                        <div>
                          <p className="border-b border-[#1C3A2A]/20 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-[#1C3A2A]/60">
                            Evening
                          </p>
                          <ul className="mt-3 space-y-2.5">
                            {day.activities.evening.map((activity, index) => (
                              <li key={index} className="text-[13px] leading-[1.6]">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      value={activity}
                                      onChange={(event) =>
                                        updateActivity(day.day, "evening", index, event.target.value)
                                      }
                                      className="w-full rounded-lg border border-[#E8E4DF] bg-white px-2.5 py-1.5 text-sm text-[#1A1A18] outline-none focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeActivity(day.day, "evening", index)}
                                      className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  <span className="flex items-start gap-2.5 text-[#3A3A38]">
                                    <span className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#1C3A2A]/40" />
                                    {activity}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => addActivity(day.day, "evening")}
                              className="mt-3 text-xs font-medium text-[#1C3A2A] hover:underline"
                            >
                              + Add activity
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tip */}
                      {isEditMode ? (
                        <textarea
                          value={day.tips}
                          onChange={(event) =>
                            updateDay(day.day, (currentDay) => ({
                              ...currentDay,
                              tips: event.target.value,
                            }))
                          }
                          className="mt-5 w-full rounded-xl border border-[#E8E4DF] bg-white px-4 py-3 text-sm text-[#1A1A18] outline-none transition focus:border-[#1C3A2A] focus:ring-2 focus:ring-[#1C3A2A]/10"
                          rows={2}
                        />
                      ) : (
                        <blockquote className="mt-5 border-l-2 border-[#C8A96A]/40 pl-4 text-[13px] italic leading-relaxed text-[#7A7670]">
                          {day.tips}
                        </blockquote>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              {/* Sidebar */}
              <div className="space-y-5 lg:sticky lg:top-8 lg:self-start">

                {/* Budget */}
                <article className="rounded-3xl border border-[#E8E4DF] bg-white p-6 shadow-[0_2px_16px_-4px_rgba(26,26,24,0.07)]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-[#1A1A18]">Trip Budget</h3>
                      <p className="mt-0.5 text-xs text-[#9C9890]">
                        {tripDays}-day estimate · {formData.budget} tier
                      </p>
                    </div>
                    <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
                      formData.budget === "low"
                        ? "bg-slate-100 text-slate-500"
                        : formData.budget === "medium"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-[#F0F5F2] text-[#1C3A2A]"
                    }`}>
                      {formData.budget}
                    </span>
                  </div>
                  {budgetEstimate && (
                    <>
                      <div className="mt-4 rounded-2xl bg-[#F9F8F6] p-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#B0ACA6]">
                          Estimated total
                        </p>
                        <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-[#1A1A18]">
                          {formatCurrencyRange(
                            budgetEstimate.currencySymbol,
                            budgetEstimate.totalMin,
                            budgetEstimate.totalMax,
                          )}
                        </p>
                        <p className="mt-1 text-[11px] text-[#9C9890]">
                          ~{formatCurrencyRange(
                            budgetEstimate.currencySymbol,
                            budgetEstimate.dailyMin,
                            budgetEstimate.dailyMax,
                          )} per day on average
                        </p>
                      </div>
                      <p className="mt-3 text-[11px] leading-relaxed text-[#B0ACA6]">
                        Covers accommodation, dining, transport, activities, and a 6% buffer. Actual costs may vary.
                      </p>
                      <div className="mt-3.5">
                        {budgetEstimate.categories.map((category) => (
                          <div
                            key={category.label}
                            className="flex items-center justify-between border-b border-[#F3F1EE] py-2.5 last:border-0"
                          >
                            <span className="text-xs text-[#7A7670]">{category.label}</span>
                            <span className="text-xs font-semibold tabular-nums text-[#1A1A18]">
                              {formatCurrencyRange(
                                budgetEstimate.currencySymbol,
                                category.min,
                                category.max,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </article>

                {/* Notes */}
                <article className="rounded-3xl border border-[#E8E4DF] bg-white p-6 shadow-[0_2px_16px_-4px_rgba(26,26,24,0.07)]">
                  <h3 className="text-base font-semibold text-[#1A1A18]">Trip Notes</h3>
                  <p className="mt-1 text-xs text-[#9C9890]">
                    Keep quick notes, reminders, or booking details.
                  </p>
                  <textarea
                    value={tripNotes}
                    onChange={(event) => setTripNotes(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-[#ECEAE6] bg-[#F9F8F6] p-4 text-sm leading-relaxed text-[#1A1A18] outline-none transition duration-150 placeholder:text-[#B0ACA6] focus:border-[#1C3A2A] focus:bg-white focus:ring-2 focus:ring-[#1C3A2A]/8"
                    rows={6}
                    placeholder="Flight details, restaurant reservations, packing reminders…"
                  />
                </article>

                {/* Checklist */}
                <article className="rounded-3xl border border-[#E8E4DF] bg-white p-6 shadow-[0_2px_16px_-4px_rgba(26,26,24,0.07)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-[#1A1A18]">Checklist</h3>
                    <span className="text-[11px] text-[#9C9890]">
                      {completedChecklistCount}/{checklist.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#9C9890]">
                    Track pre-trip tasks and packing items.
                  </p>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#F3F1EE]">
                    <div
                      className="h-full rounded-full bg-[#1C3A2A] transition-all duration-500"
                      style={{
                        width: `${checklist.length === 0 ? 0 : (completedChecklistCount / checklist.length) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      value={checklistInput}
                      onChange={(event) => setChecklistInput(event.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
                      className="w-full rounded-xl border border-[#ECEAE6] bg-[#F9F8F6] px-3.5 py-2 text-sm text-[#1A1A18] outline-none transition duration-150 placeholder:text-[#B0ACA6] focus:border-[#1C3A2A] focus:bg-white focus:ring-2 focus:ring-[#1C3A2A]/8"
                      placeholder="Add a task…"
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="rounded-xl bg-[#1C3A2A] px-3.5 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-[#243F2F]"
                    >
                      Add
                    </button>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {checklist.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#F3F1EE] bg-[#F9F8F6] px-3 py-2.5"
                      >
                        <label className="flex cursor-pointer items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() =>
                              setChecklist((prev) =>
                                prev.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, done: !entry.done }
                                    : entry,
                                ),
                              )
                            }
                            className="accent-[#1C3A2A]"
                          />
                          <span
                            className={`text-[13px] leading-snug ${
                              item.done ? "text-[#B0ACA6] line-through" : "text-[#1A1A18]"
                            }`}
                          >
                            {item.text}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setChecklist((prev) =>
                              prev.filter((entry) => entry.id !== item.id),
                            )
                          }
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-red-400 transition-all duration-150 hover:bg-red-50 hover:text-red-600"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
