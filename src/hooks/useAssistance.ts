import { useCallback, useRef, useState } from 'react';
import { supabase, AssistanceContactData, MyAssistanceRequest } from '../lib/supabase';

/**
 * The volunteer's own assistance request and the one they are helping with. Moved
 * verbatim out of App.tsx.
 */
export const useAssistance = () => {
  // The assistance request I (as a شهم) sent out, and its status/helper contact.
  const [myAssistanceRequest, setMyAssistanceRequestState] = useState<MyAssistanceRequest | null>(null);
  // The assistance request I'm currently helping someone else with.
  const [activeAssistanceHelp, setActiveAssistanceHelp] = useState<AssistanceContactData | null>(null);
  // True after a pending request of mine disappeared without me cancelling or
  // completing it — i.e. it passed its expires_at with nobody accepting.
  const [assistanceExpired, setAssistanceExpired] = useState(false);

  // Status of my request as of the last time this hook set it. Every writer
  // goes through the wrapper below, so cancel/complete (which clear the state
  // right away) also reset this to null and can never look like an expiry.
  const lastStatusRef = useRef<MyAssistanceRequest['status'] | null>(null);

  const setMyAssistanceRequest = useCallback((request: MyAssistanceRequest | null) => {
    lastStatusRef.current = request?.status ?? null;
    setMyAssistanceRequestState(request);
  }, []);

  // My own "عون الطريق" request (as the شهم who asked for help) — status
  // and, once someone accepts, that helper's contact info.
  const fetchMyAssistanceRequest = () => {
    supabase.rpc('get_my_assistance_request').then(({ data, error }) => {
      if (error) return;
      const row = (data as MyAssistanceRequest[] | null)?.[0] || null;
      if (row) setAssistanceExpired(false);
      else if (lastStatusRef.current === 'pending') setAssistanceExpired(true);
      setMyAssistanceRequest(row);
    });
  };

  // The assistance request I'm currently helping someone else with (as the
  // شهم who accepted) — re-fetched on mount/reconnect so the contact card
  // survives a reload instead of only living in local state.
  const fetchActiveAssistanceHelp = () => {
    supabase.rpc('get_my_active_assistance_help').then(({ data, error }) => {
      if (error) return;
      const row = (data as AssistanceContactData[] | null)?.[0];
      setActiveAssistanceHelp(row || null);
    });
  };

  return {
    myAssistanceRequest, setMyAssistanceRequest,
    activeAssistanceHelp, setActiveAssistanceHelp,
    assistanceExpired, setAssistanceExpired,
    fetchMyAssistanceRequest,
    fetchActiveAssistanceHelp,
  };
};
