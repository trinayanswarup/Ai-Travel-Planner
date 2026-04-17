import { supabase } from "@/lib/supabase/client";
import type { PersistedTripPayload, SavedTrip } from "@/lib/types/planner";

type TripRow = {
  id: string;
  user_id: string;
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  days: number;
  budget: string;
  travel_style: string;
  interests: string;
  notes: string;
  checklist: PersistedTripPayload["checklist"];
  itinerary: PersistedTripPayload["itinerary"];
  created_at: string;
  updated_at: string;
};

const assertSupabase = () => {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
};

const toSavedTrip = (row: TripRow): SavedTrip => ({
  id: row.id,
  formData: {
    tripTitle: row.trip_title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    budget: row.budget as SavedTrip["formData"]["budget"],
    travelStyle: row.travel_style as SavedTrip["formData"]["travelStyle"],
    interests: row.interests,
  },
  days: row.days,
  notes: row.notes ?? "",
  checklist: row.checklist ?? [],
  itinerary: row.itinerary,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toTripWritePayload = (userId: string, payload: PersistedTripPayload) => ({
  user_id: userId,
  trip_title: payload.formData.tripTitle,
  destination: payload.formData.destination,
  start_date: payload.formData.startDate,
  end_date: payload.formData.endDate,
  days: payload.days,
  budget: payload.formData.budget,
  travel_style: payload.formData.travelStyle,
  interests: payload.formData.interests,
  notes: payload.notes,
  checklist: payload.checklist,
  itinerary: payload.itinerary,
});

export const listTrips = async (userId: string): Promise<SavedTrip[]> => {
  const client = assertSupabase();
  const { data, error } = await client
    .from("trips")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as TripRow[]).map(toSavedTrip);
};

export const createTrip = async (
  userId: string,
  payload: PersistedTripPayload,
): Promise<SavedTrip> => {
  const client = assertSupabase();
  const { data, error } = await client
    .from("trips")
    .insert(toTripWritePayload(userId, payload))
    .select("*")
    .single();

  if (error) throw error;
  return toSavedTrip(data as TripRow);
};

export const updateTrip = async (
  userId: string,
  id: string,
  payload: PersistedTripPayload,
): Promise<SavedTrip> => {
  const client = assertSupabase();
  const { data, error } = await client
    .from("trips")
    .update(toTripWritePayload(userId, payload))
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return toSavedTrip(data as TripRow);
};

export const deleteTrip = async (userId: string, id: string): Promise<void> => {
  const client = assertSupabase();
  const { error } = await client
    .from("trips")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
};
