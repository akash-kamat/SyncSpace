-- Enable full replica identity for realtime updates
ALTER TABLE public.room_state REPLICA IDENTITY FULL;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;