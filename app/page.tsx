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
  { label: "Stay", share: 0.38 },
  { label: "Food", share: 0.24 },
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
  return `${formatValue(min)} - ${formatValue(max)}`;
};

const detectCurrencySymbol = (days: ItineraryDay[]) => {
  const joined = days.map((day) => day.estimated_cost).join(" ");
  const symbolMatch = joined.match(/[$€£₹¥]/);
  return symbolMatch?.[0] ?? "$";
};

const parseDayCostRange = (value: string) => {
  const numericTokens = value.match(/\d[\d,.]*/g) ?? [];
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
      pushToast("success", `Rebalanced days ${startDay}-${tripDays} to match your new flow.`);
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
    "rounded-xl border border-slate-300/90 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition duration-200 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
  const actionButtonClass =
    "rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition duration-200 hover:-translate-y-0.5 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60";

  if (isAuthLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading session...
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
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:gap-8 sm:px-6 lg:px-10 lg:py-10">
        <header className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_28px_80px_-44px_rgba(15,23,42,0.6)] backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600">
                Atlas AI Planner
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
                Build trips like a modern travel startup
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Turn rough ideas into structured day plans, realistic budget
                ranges, and an execution-ready travel workspace in minutes.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-sky-50 px-4 py-3 text-sm text-indigo-700 shadow-sm">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs text-indigo-600">{session.user.email}</p>
                  <p>
                    Saved Trips:{" "}
                    <span className="font-semibold">{savedTrips.length} saved</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition duration-200 hover:bg-indigo-50 focus-visible:outline-indigo-500"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              {result ? "Trip active" : "Ready for your next trip"}
            </span>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Checklist: {completedChecklistCount}/{checklist.length} done
            </span>
            {selectedTripId ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  isUnsavedChanges
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {isUnsavedChanges ? "Unsaved changes" : "All changes saved"}
              </span>
            ) : result ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Draft not saved
              </span>
            ) : null}
            {activeOperationLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {activeOperationLabel}...
              </span>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.45)] transition duration-200 lg:col-span-2 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Plan a New Trip</h2>
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
                Smart Intake
              </span>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">
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

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">
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

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
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

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
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

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Budget</span>
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
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Calculated duration
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {tripDays} day{tripDays > 1 ? "s" : ""}
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
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
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">
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
                {isLoading ? "Generating your travel plan..." : "Build itinerary"}
              </button>
            </form>
          </article>

          <aside className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.45)] sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight">Saved Trips</h2>
            <p className="mt-2 text-sm text-slate-600">
              Reopen, continue editing, or remove past trips.
            </p>
            <div className="mt-4 space-y-3">
              {isFetchingTrips && (
                <>
                  {[...Array.from({ length: 3 })].map((_, idx) => (
                    <div
                      key={`trip-skeleton-${idx}`}
                      className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5"
                    >
                      <div className="h-3 w-1/2 rounded bg-slate-200" />
                      <div className="mt-2 h-2.5 w-5/6 rounded bg-slate-200" />
                      <div className="mt-3 h-2.5 w-2/3 rounded bg-slate-200" />
                    </div>
                  ))}
                </>
              )}

              {!isFetchingTrips && savedTrips.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">No saved trips yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Build your first itinerary and save it to quickly reopen later.
                  </p>
                </div>
              )}

              {savedTrips.map((trip) => (
                <div
                  key={trip.id}
                  className={`rounded-2xl border bg-gradient-to-br p-3.5 transition duration-200 hover:-translate-y-0.5 ${
                    selectedTripId === trip.id
                      ? "from-indigo-50 to-sky-50 border-indigo-300 ring-2 ring-indigo-100"
                      : "from-white to-slate-50 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenTrip(trip)}
                    className="w-full text-left transition"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {trip.formData.tripTitle || "Untitled Trip"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {trip.formData.destination}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {trip.formData.startDate} to {trip.formData.endDate}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Updated {new Date(trip.updatedAt).toLocaleString()}
                    </p>
                  </button>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {trip.days} day{trip.days > 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrip(trip.id)}
                      disabled={deletingTripId === trip.id}
                      className="rounded-md px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingTripId === trip.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

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

        {toasts.length > 0 && (
          <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur transition ${
                  toast.kind === "success"
                    ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
                    : toast.kind === "error"
                      ? "border-red-200 bg-red-50/95 text-red-800"
                      : "border-indigo-200 bg-indigo-50/95 text-indigo-800"
                }`}
                role="status"
              >
                {toast.message}
              </div>
            ))}
          </div>
        )}

        {isLoading && !result && (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array.from({ length: 4 })].map((_, idx) => (
                <div
                  key={`summary-skeleton-${idx}`}
                  className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="h-3 w-20 rounded bg-slate-200" />
                  <div className="mt-3 h-5 w-28 rounded bg-slate-200" />
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="animate-pulse space-y-3">
                <div className="h-5 w-44 rounded bg-slate-200" />
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-5/6 rounded bg-slate-200" />
                <div className="h-24 w-full rounded-2xl bg-slate-100" />
              </div>
            </div>
          </section>
        )}

        {!result && !isLoading && (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-center">
            <p className="text-lg font-semibold text-slate-800">Ready to build your itinerary</p>
            <p className="mt-2 text-sm text-slate-600">
              Fill your trip details and generate a plan to unlock the dashboard, notes, budget,
              and day-by-day schedule.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Tip: include interests like &quot;street food, museums, and easy day trips&quot; for
              sharper itinerary quality.
            </p>
          </section>
        )}

        {result && (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Destination
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {formData.destination || "Untitled Trip"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Duration
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {formData.startDate} to {formData.endDate}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Planned Budget
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {budgetEstimate
                    ? formatCurrencyRange(
                        budgetEstimate.currencySymbol,
                        budgetEstimate.totalMin,
                        budgetEstimate.totalMax,
                      )
                    : result.total_estimated_budget}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Travel Style
                </p>
                <p className="mt-2 text-lg font-semibold capitalize">
                  {formData.travelStyle}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.45)] lg:col-span-2 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {formData.tripTitle || "Day-by-Day Itinerary"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">{result.trip_summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditMode((prev) => !prev)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50"
                    >
                      {isEditMode ? "Finish editing" : "Edit itinerary"}
                    </button>
                    <button
                      type="button"
                      onClick={generateItinerary}
                      disabled={isLoading || isRebalancing}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition duration-200 hover:-translate-y-0.5 hover:bg-slate-700 disabled:opacity-60"
                    >
                      {isLoading ? "Regenerating..." : "Regenerate full itinerary"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTrip}
                      disabled={
                        isSavingTrip ||
                        isRebalancing ||
                        (selectedTripId !== null && !isUnsavedChanges)
                      }
                      className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {isSavingTrip
                        ? selectedTripId
                          ? "Updating..."
                          : "Saving..."
                        : selectedTripId
                          ? isUnsavedChanges
                            ? "Save changes"
                            : "Saved"
                          : "Save Trip"}
                    </button>
                  </div>
                </div>
                {rebalancePrompt && (
                  <div className="mt-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Rebalance remaining itinerary?
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Day {rebalancePrompt.fromDay} was refreshed. Rebalancing updates days{" "}
                      {rebalancePrompt.fromDay + 1}-{tripDays} to preserve pacing, style, and
                      budget continuity while keeping earlier days unchanged.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={rebalanceRemainingDays}
                        disabled={isRebalancing}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
                      >
                        {isRebalancing ? "Rebalancing..." : "Yes, rebalance"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRebalancePrompt(null);
                          pushToast("info", "Keeping remaining days unchanged.");
                        }}
                        disabled={isRebalancing}
                        className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60"
                      >
                        Keep as-is
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 space-y-4">
                  {result.days.map((day) => (
                    <div
                      key={day.day}
                      className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white p-4 transition duration-200 hover:border-slate-300 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {isEditMode ? (
                          <input
                            value={day.title}
                            onChange={(event) =>
                              updateDay(day.day, (currentDay) => ({
                                ...currentDay,
                                title: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:max-w-md"
                          />
                        ) : (
                          <h3 className="text-base font-semibold sm:text-lg">
                            Day {day.day}: {day.title}
                          </h3>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                            {day.estimated_cost}
                          </span>
                          <button
                            type="button"
                            onClick={() => regenerateSingleDay(day.day)}
                            disabled={isDayLoading === day.day || isRebalancing}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition duration-200 hover:bg-slate-100 disabled:opacity-60"
                          >
                            {isDayLoading === day.day ? "Refreshing..." : "Regenerate day"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="font-medium text-slate-900">Morning</p>
                          <ul className="mt-2 space-y-1">
                            {day.activities.morning.map((activity, index) => (
                              <li key={index} className="leading-relaxed">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      value={activity}
                                      onChange={(event) =>
                                        updateActivity(
                                          day.day,
                                          "morning",
                                          index,
                                          event.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeActivity(day.day, "morning", index)}
                                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  activity
                                )}
                              </li>
                            ))}
                          </ul>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => addActivity(day.day, "morning")}
                              className="mt-2 text-xs font-medium text-indigo-600"
                            >
                              + Add activity
                            </button>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="font-medium text-slate-900">Afternoon</p>
                          <ul className="mt-2 space-y-1">
                            {day.activities.afternoon.map((activity, index) => (
                              <li key={index} className="leading-relaxed">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      value={activity}
                                      onChange={(event) =>
                                        updateActivity(
                                          day.day,
                                          "afternoon",
                                          index,
                                          event.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeActivity(day.day, "afternoon", index)
                                      }
                                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  activity
                                )}
                              </li>
                            ))}
                          </ul>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => addActivity(day.day, "afternoon")}
                              className="mt-2 text-xs font-medium text-indigo-600"
                            >
                              + Add activity
                            </button>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="font-medium text-slate-900">Evening</p>
                          <ul className="mt-2 space-y-1">
                            {day.activities.evening.map((activity, index) => (
                              <li key={index} className="leading-relaxed">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      value={activity}
                                      onChange={(event) =>
                                        updateActivity(
                                          day.day,
                                          "evening",
                                          index,
                                          event.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeActivity(day.day, "evening", index)}
                                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  activity
                                )}
                              </li>
                            ))}
                          </ul>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => addActivity(day.day, "evening")}
                              className="mt-2 text-xs font-medium text-indigo-600"
                            >
                              + Add activity
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditMode ? (
                        <textarea
                          value={day.tips}
                          onChange={(event) =>
                            updateDay(day.day, (currentDay) => ({
                              ...currentDay,
                              tips: event.target.value,
                            }))
                          }
                          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                          rows={2}
                        />
                      ) : (
                        <p className="mt-3 text-sm text-slate-600">
                          <span className="font-medium text-slate-900">Tip:</span>{" "}
                          {day.tips}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.45)]">
                  <h3 className="text-base font-semibold">Budget Planner</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Estimates are generated from day costs and calibrated by your budget style.
                  </p>
                  {budgetEstimate && (
                    <>
                      <div className="mt-3 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-3 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-wide text-indigo-600">
                          Total expected range
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {formatCurrencyRange(
                            budgetEstimate.currencySymbol,
                            budgetEstimate.totalMin,
                            budgetEstimate.totalMax,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Daily average:{" "}
                          {formatCurrencyRange(
                            budgetEstimate.currencySymbol,
                            budgetEstimate.dailyMin,
                            budgetEstimate.dailyMax,
                          )}
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {budgetEstimate.categories.map((category) => (
                          <div
                            key={category.label}
                            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-slate-700">{category.label}</span>
                            <span className="text-slate-600">
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

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.45)]">
                  <h3 className="text-base font-semibold">Trip Notes</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Keep quick notes, reminders, or booking details for this trip.
                  </p>
                  <textarea
                    value={tripNotes}
                    onChange={(event) => setTripNotes(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    rows={6}
                    placeholder="Flight details, restaurant reservations, packing reminders..."
                  />
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.45)]">
                  <h3 className="text-base font-semibold">Checklist</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Track pre-trip tasks and packing items.
                  </p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                      style={{
                        width: `${checklist.length === 0 ? 0 : (completedChecklistCount / checklist.length) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={checklistInput}
                      onChange={(event) => setChecklistInput(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                      placeholder="Add checklist item"
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition duration-200 hover:bg-slate-700"
                    >
                      Add
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {checklist.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <label className="flex items-center gap-2">
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
                          />
                          <span
                            className={
                              item.done ? "text-slate-400 line-through" : "text-slate-700"
                            }
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
                          className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove
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