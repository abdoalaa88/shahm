import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://spazvrhgbtdzkwmpxlzw.supabase.co';
export const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing-anon-key';

// The linked project currently exposes an empty public schema in generated types.
// Keep runtime access untyped until the approved migrations are applied remotely.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole =
  | 'volunteer'
  | 'requester'
  | 'ops_admin'
  | 'verification_admin'
  | 'analytics_viewer'
  | 'super_admin';

export type TripStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';
export type RequesterRelation = 'patient' | 'guardian' | 'companion';

export interface Profile {
  id: string;
  first_name: string;
  phone_number: string;
  role: UserRole;
  verification_status: 'unverified' | 'pending_review' | 'verified' | 'rejected';
  is_active: boolean;
  created_at: string;
  patient_age?: number | null;
  patient_condition?: string | null;
}

export interface PublicTrip {
  id: string;
  requester_id: string;
  volunteer_id?: string;
  origin_area_label: string;
  destination_area_label: string;
  status: TripStatus;
  requester_relation: RequesterRelation;
  created_at: string;
  accepted_at?: string;
  completed_at?: string;
  scheduled_at?: string | null;
  passenger_count: number;
  special_notes?: string | null;
}

export interface NearbyTrip {
  id: string;
  requester_id?: string;
  volunteer_id?: string | null;
  origin_area_label: string;
  destination_area_label: string;
  status: TripStatus;
  requester_relation: RequesterRelation;
  created_at: string;
  scheduled_at: string | null;
  distance_km?: number;
  passenger_count: number;
  special_notes?: string | null;
}

export interface ContactCardData {
  trip_id: string;
  requester_id: string;
  requester_first_name: string;
  requester_phone: string;
  requester_relation: RequesterRelation;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  patient_age?: number | null;
  patient_condition?: string | null;
  passenger_count?: number;
  special_notes?: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_profile_id?: string;
  trip_id?: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
  resolution_notes?: string;
  created_at: string;
}
