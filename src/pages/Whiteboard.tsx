import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tldraw, createTLStore, defaultShapeUtils, TLRecord } from 'tldraw';
import 'tldraw/tldraw.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Whiteboard = () => {
  const { roomId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Load room data
  useEffect(() => {
    if (!roomId || !user?.id) return;

    let isActive = true;

    const loadRoomData = async () => {
      try {
        // Fetch room details
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', roomId)
          .single();

        if (roomError) throw roomError;
        if (isActive) setRoomName(room.name);

        // Fetch initial shapes
        const { data: shapesData, error: shapesError } = await supabase
          .from('whiteboard_shapes')
          .select('data')
          .eq('room_id', roomId);

        if (shapesError) throw shapesError;

        // Load shapes into store
        if (shapesData && isActive) {
          store.mergeRemoteChanges(() => {
            const shapes = shapesData.map(s => s.data as TLRecord);
            store.put(shapes);
          });
        }

        if (isActive) setLoading(false);
      } catch (error: any) {
        console.error('Error loading room:', error);
        if (isActive) {
          toast({
            title: "Error",
            description: "Failed to load room",
            variant: "destructive",
          });
          navigate('/dashboard');
        }
      }
    };

    loadRoomData();

    return () => {
      isActive = false;
    };
  }, [roomId, user?.id, navigate, toast, store]);

  // Handle Realtime Subscription
  useEffect(() => {
    if (!roomId || !user?.id) return;

    console.log('Setting up subscription for room:', roomId);
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whiteboard_shapes',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('Received Realtime Payload:', payload);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            console.log('Processing INSERT/UPDATE:', payload.new);
            const newShape = payload.new.data as TLRecord;
            store.mergeRemoteChanges(() => {
              store.put([newShape]);
            });
          } else if (payload.eventType === 'DELETE') {
            console.log('Processing DELETE:', payload.old);
            const deletedId = payload.old.id;
            store.mergeRemoteChanges(() => {
              store.remove([deletedId as any]);
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription Status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to room changes');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('Subscription channel error');
        }
        if (status === 'TIMED_OUT') {
          console.error('Subscription timed out');
        }
      });

    return () => {
      console.log('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id, store]);

  // Handle Local Changes
  useEffect(() => {
    if (!roomId || !user?.id) return;

    const handleChange = (event: any) => {
      // Filter out ephemeral changes (cursor, selection, etc)
      // We only want to sync document changes
      Object.values(event.changes.added).forEach(async (record: any) => {
        if (record.typeName === 'instance' || record.typeName === 'camera' || record.typeName === 'pointer') return;

        const { error } = await supabase
          .from('whiteboard_shapes')
          .upsert({
            id: record.id,
            room_id: roomId,
            data: record as any
          });

        if (error) console.error('Error adding shape:', error);
      });

      Object.values(event.changes.updated).forEach(async (record: any) => {
        if (record[1].typeName === 'instance' || record[1].typeName === 'camera' || record[1].typeName === 'pointer') return;

        const { error } = await supabase
          .from('whiteboard_shapes')
          .upsert({
            id: record[1].id,
            room_id: roomId,
            data: record[1] as any
          });

        if (error) console.error('Error updating shape:', error);
      });

      Object.values(event.changes.removed).forEach(async (record: any) => {
        if (record.typeName === 'instance' || record.typeName === 'camera' || record.typeName === 'pointer') return;

        const { error } = await supabase
          .from('whiteboard_shapes')
          .delete()
          .eq('id', record.id);

        if (error) console.error('Error deleting shape:', error);
      });
    };

    const cleanup = store.listen(handleChange, { source: 'user', scope: 'document' });

    return () => {
      cleanup();
    };
  }, [roomId, user?.id, store]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading whiteboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{roomName}</h1>
            <p className="text-xs text-muted-foreground">Real-time collaborative whiteboard</p>
          </div>
        </div>
      </div>
      <div className="flex-1">
        <Tldraw store={store} />
      </div>
    </div>
  );
};

export default Whiteboard;
