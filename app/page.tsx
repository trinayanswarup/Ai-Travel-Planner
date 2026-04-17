"use client";

import { FormEvent, useState } from "react";
import type { Budget, TravelStyle } from "@/lib/types/itinerary";

const budgetOptions: Budget[] = ["low", "medium", "high"];
const travelStyleOptions: TravelStyle[] = [
  "relaxed",
  "packed",
  "nightlife",
  "cultural",
  "nature",
];

type FormDataState = {
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: Budget;
  travelStyle: TravelStyle;
  interests: string;
};

type ItineraryDay = {
  day: number;
  title: string;
  activities: {
    morning: string[];
    afternoon: string[];
    evening: string[];
  };
  estimated_cost: string;
  tips: string;
};

type ItineraryResponse = {
  trip_summary: string;
  total_estimated_budget: string;
  days: ItineraryDay[];
};

type ChecklistItem = {
  id: number;
  text: string;
  done: boolean;
};

const MS_IN_DAY = 1000 * 60 * 60 * 24;

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
  const { startDate, endDate } = createDefaultEndDate();
  const [formData, setFormData] = useState<FormDataState>({
    tripTitle: "",
    destination: "",
    startDate,
    endDate,
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

  const tripDays = calculateTripDays(formData.startDate, formData.endDate);

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
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateSingleDay = async (targetDay: number) => {
    if (!result) return;
    setIsDayLoading(targetDay);
    setError(null);

    try {
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
          interests: `${formData.interests}. Focus on day ${targetDay} of ${tripDays}.`,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to regenerate day");
      }

      const replacementDay = (data as ItineraryResponse).days?.[0];
      if (!replacementDay) {
        throw new Error("No day returned from regenerate");
      }

      setResult((prev) => {
        if (!prev) return prev;
        const updatedDays = prev.days.map((day) =>
          day.day === targetDay
            ? { ...replacementDay, day: targetDay, title: `Day ${targetDay}` }
            : day,
        );
        return { ...prev, days: updatedDays };
      });
    } catch (dayError) {
      setError(dayError instanceof Error ? dayError.message : "Could not regenerate day");
    } finally {
      setIsDayLoading(null);
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-600">
                Smart Trip Workspace
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Plan Every Trip in One Place
              </h1>
              <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
                Create a complete travel plan with itinerary blocks, budget
                overview, notes, and checklist tools in a premium
                dashboard layout.
              </p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              Saved Trips:{" "}
              <span className="font-semibold">{result ? 1 : 0} active</span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">
                New Trip Request
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Stage 1
              </span>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  Trip title
                </span>
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                className="sm:col-span-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Generating your travel plan..." : "Build itinerary"}
              </button>
            </form>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight">Saved Trips</h2>
            <p className="mt-2 text-sm text-slate-600">
              Placeholder structure for upcoming trip management.
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Spring Escape</p>
                <p className="text-xs text-slate-500">Draft itinerary</p>
              </div>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Beach Week</p>
                <p className="text-xs text-slate-500">Planning soon</p>
              </div>
            </div>
          </aside>
        </section>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {result && (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Destination
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {formData.destination || "Untitled Trip"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Duration
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {formData.startDate} to {formData.endDate}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Planned Budget
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {result.total_estimated_budget}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Travel Style
                </p>
                <p className="mt-2 text-lg font-semibold capitalize">
                  {formData.travelStyle}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 sm:p-6">
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
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      {isEditMode ? "Finish editing" : "Edit itinerary"}
                    </button>
                    <button
                      type="button"
                      onClick={generateItinerary}
                      disabled={isLoading}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                    >
                      {isLoading ? "Regenerating..." : "Regenerate full itinerary"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {result.days.map((day) => (
                    <div
                      key={day.day}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
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
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:max-w-md"
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
                            disabled={isDayLoading === day.day}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                          >
                            {isDayLoading === day.day ? "Refreshing..." : "Regenerate day"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3">
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
                        <div className="rounded-xl bg-white p-3">
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
                        <div className="rounded-xl bg-white p-3">
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
                          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">Budget Planner</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Placeholder section for category-based budget tracking.
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    Total estimate: {result.total_estimated_budget}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">Trip Notes</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Keep quick notes, reminders, or booking details for this trip.
                  </p>
                  <textarea
                    value={tripNotes}
                    onChange={(event) => setTripNotes(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    rows={6}
                    placeholder="Flight details, restaurant reservations, packing reminders..."
                  />
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold">Checklist</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Track pre-trip tasks and packing items.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={checklistInput}
                      onChange={(event) => setChecklistInput(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="Add checklist item"
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
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