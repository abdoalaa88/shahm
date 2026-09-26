import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseConfig) {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
    throw new Error('VITE_SUPABASE_URL must use HTTPS outside local development.');
  }
} catch (error) {
  throw new Error(`Invalid VITE_SUPABASE_URL: ${error instanceof Error ? error.message : 'invalid URL'}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole =
  | 'volunteer'
  | 'requester'
  | 'ops_admin'
  | 'verification_admin'
  | 'analytics_viewer'
  | 'super_admin';

export type TripStatus = 'pending' | 'accepted' | 'completed' | 'cancelled' | 'expired';

export type RequesterRelation =
  | 'patient'
  | 'guardian'
  | 'companion';

export interface Profile {
  id: string;
  auth_user_id: string;
  first_name: string;
  phone_number: string;
  role: UserRole;
  verification_status: 'unverified' | 'pending_review' | 'verified' | 'rejected';
  is_active: boolean;
  vehicle_type?: string | null;
  vehicle_color?: string | null;
  vehicle_plate_number?: string | null;
  vehicle_data_responsibility_ack?: boolean;
  vehicle_data_acknowledged_at?: string | null;
  patient_age?: number | null;
  patient_condition?: string | null;
  created_at: string;
}

export interface PublicTrip {
  id: string;
  requester_id: string;
  requester_first_name?: string;
  volunteer_id?: string | null;
  origin_area_label: string;
  destination_area_label: string;
  status: TripStatus;
  requester_relation: RequesterRelation;
  scheduled_at: string;
  created_at: string;
  accepted_at?: string | null;
  completed_at?: string | null;
  distance_km?: number | null;
  problem_type?: string;
  people_count?: number;
  request_notes?: string;
  passenger_count?: number;
  special_notes?: string | null;
  patient_profile_id?: string | null;
  // Persisted cancellation metadata lets the requester understand a reopened trip after realtime refreshes.
  cancellation_reason?: string | null;
  last_cancellation_actor_role?: UserRole | null;
  last_cancelled_at?: string | null;
}

export interface PatientProfile {
  id: string;
  requester_profile_id: string;
  full_name: string;
  phone_number: string;
  age: number | null;
  condition_description: string | null;
  created_at: string;
}

export interface MedicalTripNearby extends Pick<PublicTrip,
  'id' | 'origin_area_label' | 'destination_area_label' | 'requester_relation' | 'people_count' | 'request_notes' | 'created_at'
> {
  distance_km: number;
  requester_id: string;
  requester_first_name: string;
}

// RPC result shapes used by the volunteer UI and realtime hooks.
export interface NearbyTrip extends Omit<MedicalTripNearby, 'people_count' | 'request_notes'> {
  passenger_count: number;
  special_notes: string | null;
}

export interface MyAssistanceRequest {
  assistance_id: string;
  issue_type: string;
  description: string;
  status: 'pending' | 'accepted';
  created_at: string;
  helper_id: string | null;
  helper_first_name: string | null;
  helper_phone: string | null;
}

export interface AssistanceContactData {
  assistance_id: string;
  requester_id: string;
  requester_first_name: string;
  requester_phone: string;
  issue_type: string;
  description: string;
  lat: number;
  lng: number;
}

export interface RatingSummary {
  average_rating: number;
  rating_count: number;
  positive_percentage: number | null;
}

export interface TripToRate {
  trip_id: string;
  other_profile_id: string;
  other_first_name: string;
  completed_at: string | null;
}

export interface MedicalTripContact {
  trip_id: string;
  requester_first_name: string;
  requester_phone: string;
  requester_relation: RequesterRelation;
  scheduled_at: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  distance_km: number | null;
  people_count: number;
  request_notes: string;
  patient_name: string;
  patient_phone: string;
  patient_age: number | null;
  patient_condition: string | null;
  requester_profile_id: string;
}

export interface CaptainAssistanceRequest {
  request_id: string;
  issue_type: string;
  notes: string;
  location_label: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
  accepted_at: string | null;
  accepted_distance_km: number | null;
  helper_name: string | null;
  helper_phone: string | null;
  vehicle_type: string | null;
  vehicle_color: string | null;
  vehicle_plate_number: string | null;
}

export interface NearbyCaptainAssistance {
  id: string;
  issue_type: string;
  notes: string;
  location_label: string;
  location_address: string;
  lat: number;
  lng: number;
  status: string;
  created_at: string;
  distance_km: number;
}

export interface AcceptedCaptainAssistance {
  request_id: string;
  requester_name: string;
  requester_phone: string;
  issue_type: string;
  notes: string;
  location_label: string;
  location_address: string;
  lat: number;
  lng: number;
  accepted_at: string;
  distance_km: number;
}

export interface VolunteerContactData {
  trip_id: string;
  volunteer_first_name: string;
  volunteer_phone: string;
  accepted_at: string | null;
  distance_km: number | null;
  vehicle_type: string | null;
  vehicle_color: string | null;
  vehicle_plate_number: string | null;
  volunteer_profile_id: string | null;
}

export interface ContactCardData {
  trip_id: string;
  requester_first_name: string;
  requester_phone: string;
  requester_relation: RequesterRelation;
  scheduled_at: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  distance_km: number | null;
  problem_type: string;
  people_count: number;
  request_notes: string;
  passenger_count?: number;
  special_notes?: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_profile_id?: string;
  trip_id?: string;
  reason: string;
  category: string;
  reporter_role: 'requester' | 'volunteer' | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
  resolution_notes?: string;
  created_at: string;
}
