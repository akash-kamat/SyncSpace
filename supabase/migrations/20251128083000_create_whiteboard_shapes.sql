create table public.whiteboard_shapes (
  id text primary key, -- This will be the tldraw shape id
  room_id uuid references public.rooms(id) on delete cascade not null,
  data jsonb not null,
  updated_at timestamptz default now() not null
);

alter table public.whiteboard_shapes enable row level security;

create policy "Anyone can view whiteboard shapes"
  on public.whiteboard_shapes for select
  using (true);

create policy "Authenticated users can insert whiteboard shapes"
  on public.whiteboard_shapes for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can update whiteboard shapes"
  on public.whiteboard_shapes for update
  using (auth.uid() is not null);

create policy "Authenticated users can delete whiteboard shapes"
  on public.whiteboard_shapes for delete
  using (auth.uid() is not null);

alter publication supabase_realtime add table public.whiteboard_shapes;
