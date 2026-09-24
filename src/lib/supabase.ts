import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://giojwpngkxddnuhqqvnt.supabase.co';
export const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole =
  | 'volunteer'
  | 'requester'
  | 'ops_admin'
  | 'verification_admin'
  | 'analytics_viewer'
  | 'super_admin';

export type TripStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

export type RequesterRelation =
  | 'patient'
  | 'guardian'
  | 'companion';

export interface Profile {
  id: string;
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
  created_at: string;
}

export interface PublicTrip {
  id: string;
  requester_id: string;
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
  problem_type: string;
  people_count: number;
  request_notes: string;
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