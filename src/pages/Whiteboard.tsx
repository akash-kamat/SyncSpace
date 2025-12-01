import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tldraw, createTLStore, defaultShapeUtils, TLRecord, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Users, RefreshCcw, Sparkles, MessageSquare } from 'lucide-react';
import { AiSidebar, AiSidebarRef } from '@/components/AiSidebar';
import { useToast } from '@/hooks/use-toast';

const Whiteboard = () => {
  const { roomId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState('');
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [retryTrigger, setRetryTrigger] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const aiSidebarRef = useRef<AiSidebarRef>(null);

  // AI State
  const [editor, setEditor] = useState<Editor | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

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
            const shapes = shapesData.map(s => s.data as unknown as TLRecord);
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

    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout: NodeJS.Timeout;

    const setupSubscription = () => {
      // Cleanup existing subscription if any
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

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
            try {
              // console.log('Received Realtime Payload:', payload);

              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                // console.log('Processing INSERT/UPDATE:', payload.new);
                const newShape = payload.new.data as TLRecord;

                // Ignore updates from self to prevent jitter
                if (payload.new.updated_by === user.id) {
                  return;
                }

                store.mergeRemoteChanges(() => {
                  store.put([newShape]);
                });
              } else if (payload.eventType === 'DELETE') {
                // console.log('Processing DELETE:', payload.old);
                const deletedId = payload.old.id;
                store.mergeRemoteChanges(() => {
                  store.remove([deletedId as any]);
                });
              }
            } catch (error) {
              console.error('Error processing Realtime message:', error);
            }
          }
        )
        .on('broadcast', { event: 'update' }, ({ payload }) => {
          try {
            // console.log('Received Broadcast:', payload);
            if (payload.updated_by === user.id) return;

            const newShape = payload.data as TLRecord;
            store.mergeRemoteChanges(() => {
              store.put([newShape]);
            });
          } catch (error) {
            console.error('Error processing Broadcast update:', error);
          }
        })
        .on('broadcast', { event: 'delete' }, ({ payload }) => {
          try {
            if (payload.updated_by === user.id) return;

            const deletedId = payload.id;
            store.mergeRemoteChanges(() => {
              store.remove([deletedId]);
            });
          } catch (error) {
            console.error('Error processing Broadcast delete:', error);
          }
        })
        .on('presence', { event: 'sync' }, () => {
          try {
            const newState = channel.presenceState();
            const count = Object.keys(newState).length;
            console.log('Presence sync:', count, newState);
            setConnectedUsers(count);
          } catch (error) {
            console.error('Error syncing presence:', error);
          }
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('User joined:', key, newPresences);
          setConnectedUsers((prev) => prev + 1);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('User left:', key, leftPresences);
          setConnectedUsers((prev) => Math.max(0, prev - 1));
        })
        .subscribe(async (status) => {
          console.log('Subscription Status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to room changes');
            setConnectionStatus('connected');
            retryCount = 0; // Reset retries on success
            await channel.track({
              online_at: new Date().toISOString(),
              user_id: user.id
            });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Subscription error: ${status}`);
            setConnectionStatus('disconnected');
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
              retryTimeout = setTimeout(setupSubscription, 2000 * retryCount);
            }
          } else if (status === 'CLOSED') {
            setConnectionStatus('disconnected');
          }
        });

      channelRef.current = channel;
    };

    setupSubscription();

    return () => {
      console.log('Cleaning up subscription');
      clearTimeout(retryTimeout);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomId, user?.id, store, retryTrigger]);

  const handleManualReconnect = () => {
    setRetryTrigger(prev => prev + 1);
  };

  // Handle Local Changes
  useEffect(() => {
    if (!roomId || !user?.id) return;

    const handleChange = (event: any) => {
      try {
        // Filter out ephemeral changes (cursor, selection, etc)
        // We only want to sync document changes
        Object.values(event.changes.added).forEach(async (record: any) => {
          if (record.typeName === 'instance' || record.typeName === 'camera' || record.typeName === 'pointer') return;

          const { error } = await supabase
            .from('whiteboard_shapes')
            .upsert({
              id: record.id,
              room_id: roomId,
              data: record as any,
              updated_by: user.id
            });

          if (error) console.error('Error adding shape:', error);

          // Broadcast change
          channelRef.current?.send({
            type: 'broadcast',
            event: 'update',
            payload: { data: record, updated_by: user.id }
          });
        });

        Object.values(event.changes.updated).forEach(async (record: any) => {
          if (record[1].typeName === 'instance' || record[1].typeName === 'camera' || record[1].typeName === 'pointer') return;

          const { error } = await supabase
            .from('whiteboard_shapes')
            .upsert({
              id: record[1].id,
              room_id: roomId,
              data: record[1] as any,
              updated_by: user.id
            });

          if (error) console.error('Error updating shape:', error);

          // Broadcast change
          channelRef.current?.send({
            type: 'broadcast',
            event: 'update',
            payload: { data: record[1], updated_by: user.id }
          });
        });

        Object.values(event.changes.removed).forEach(async (record: any) => {
          if (record.typeName === 'instance' || record.typeName === 'camera' || record.typeName === 'pointer') return;

          const { error } = await supabase
            .from('whiteboard_shapes')
            .delete()
            .eq('id', record.id);

          if (error) console.error('Error deleting shape:', error);

          // Broadcast change
          channelRef.current?.send({
            type: 'broadcast',
            event: 'delete',
            payload: { id: record.id, updated_by: user.id }
          });
        });
      } catch (error) {
        console.error('Error handling local change:', error);
      }
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`flex items-center gap-1.5 ${connectionStatus === 'connected' ? 'text-green-500' :
                connectionStatus === 'connecting' ? 'text-yellow-500' : 'text-red-500'
                }`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connectionStatus === 'connected' ? 'bg-green-500' :
                    connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${connectionStatus === 'connected' ? 'bg-green-500' :
                    connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></span>
                </span>
                {connectionStatus === 'connected' ? 'Connected' :
                  connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 hover:bg-transparent"
                onClick={handleManualReconnect}
                title="Refresh connection"
              >
                <RefreshCcw className={`w-3 h-3 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`} />
              </Button>
              <span className="text-muted-foreground/30">|</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-7 text-xs"
                onClick={() => aiSidebarRef.current?.analyze()}
              >
                <Sparkles className="w-3 h-3 text-purple-500" />
                AI Analyze
              </Button>
              <span className="text-muted-foreground/30">|</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {connectedUsers} online
              </span>
              <span className="text-muted-foreground/30">|</span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 h-7 text-xs"
                onClick={() => setAiOpen(!aiOpen)}
              >
                <MessageSquare className="w-3 h-3 text-purple-500" />
                AI Companion
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden relative border-4 border-red-500">
        <div className="flex-1 relative min-h-[500px] border-4 border-blue-500">
          <Tldraw store={store} onMount={setEditor} />
        </div>
        {/* <AiSidebar
          ref={aiSidebarRef}
          open={aiOpen}
          onOpenChange={setAiOpen}
          roomId={roomId || ''}
          userId={user?.id || ''}
          editor={editor}
        /> */}
      </div>
    </div>
  );
};

export default Whiteboard;
