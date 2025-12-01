-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create room_state table
CREATE TABLE IF NOT EXISTS public.room_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID UNIQUE REFERENCES public.rooms(id) ON DELETE CASCADE,
    state JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create whiteboard_shapes table
CREATE TABLE IF NOT EXISTS public.whiteboard_shapes (
    id TEXT PRIMARY KEY,
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whiteboard_shapes ENABLE ROW LEVEL SECURITY;

-- Enable Realtime for whiteboard_shapes
ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_shapes;

-- Policies for profiles
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- Policies for rooms
CREATE POLICY "Anyone can view rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Room creators can update their rooms" ON public.rooms FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Room creators can delete their rooms" ON public.rooms FOR DELETE USING (auth.uid() = created_by);

-- Policies for room_state
CREATE POLICY "Anyone can view room state" ON public.room_state FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert room state" ON public.room_state FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update room state" ON public.room_state FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Policies for whiteboard_shapes
CREATE POLICY "Anyone can view whiteboard shapes" ON public.whiteboard_shapes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert whiteboard shapes" ON public.whiteboard_shapes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update whiteboard shapes" ON public.whiteboard_shapes FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete whiteboard shapes" ON public.whiteboard_shapes FOR DELETE USING (auth.uid() IS NOT NULL);
-- Create ai_chats table
CREATE TABLE IF NOT EXISTS public.ai_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    is_ai BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_chats ENABLE ROW LEVEL SECURITY;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_chats;

-- Policies
CREATE POLICY "Anyone can view chats in their room" ON public.ai_chats
    FOR SELECT USING (true); -- Simplified for now, ideally check room access

CREATE POLICY "Authenticated users can insert chats" ON public.ai_chats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow AI (service role) to insert/update (handled by service role key usually, but good to be explicit if needed, though service role bypasses RLS)
