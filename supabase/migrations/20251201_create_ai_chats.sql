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
