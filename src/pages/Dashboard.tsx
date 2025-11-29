import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Plus, LogOut, Users, Clock, Trash2 } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  profiles: {
    display_name: string | null;
    email: string;
  } | null;
}

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchRooms();

      const channel = supabase
        .channel('rooms-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rooms'
          },
          () => {
            fetchRooms();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        profiles:created_by (
          display_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rooms:', error);
      toast({
        title: "Error",
        description: "Failed to fetch rooms",
        variant: "destructive",
      });
      return;
    }

    setRooms(data || []);
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setCreatingRoom(true);
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: roomName,
          created_by: user.id,
        })
        .select()
        .single();

      if (roomError) throw roomError;

      const { error: stateError } = await supabase
        .from('room_state')
        .insert({
          room_id: room.id,
          state: {},
        });

      if (stateError) throw stateError;

      toast({
        title: "Room created!",
        description: "Joining your new whiteboard room...",
      });

      setRoomName('');
      setIsDialogOpen(false);
      navigate(`/room/${room.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create room",
        variant: "destructive",
      });
    } finally {
      setCreatingRoom(false);
    }
  };

  const deleteRoom = async () => {
    if (!roomToDelete) return;

    try {
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomToDelete);

      if (error) throw error;

      toast({
        title: "Room deleted",
        description: "The room has been successfully deleted.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete room",
        variant: "destructive",
      });
    } finally {
      setRoomToDelete(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <div>
            <h1 className="text-4xl font-bold text-primary mb-2 tracking-tight">
              SyncSpace
            </h1>
            <p className="text-muted-foreground text-lg">
              Welcome back, {user?.email}
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="hover:bg-destructive/10 hover:text-destructive transition-colors">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25 h-12 px-6 text-lg">
                <Plus className="w-5 h-5 mr-2" />
                Create New Room
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create a new whiteboard room</DialogTitle>
                <DialogDescription>
                  Give your room a name and start collaborating
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roomName">Room Name</Label>
                  <Input
                    id="roomName"
                    placeholder="My Awesome Whiteboard"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    required
                    className="focus-visible:ring-primary"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={creatingRoom}
                >
                  {creatingRoom ? 'Creating...' : 'Create Room'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          {rooms.length === 0 ? (
            <Card className="col-span-full border-dashed border-2 bg-muted/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center text-lg">
                  No rooms yet. Create your first whiteboard room to get started!
                </p>
              </CardContent>
            </Card>
          ) : (
            rooms.map((room) => (
              <Card
                key={room.id}
                className="group hover:shadow-xl transition-all duration-300 border-border/50 hover:border-primary/50 bg-card/50 backdrop-blur-sm"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-xl">
                    <div
                      className="flex items-center gap-2 truncate cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/room/${room.id}`)}
                    >
                      <Users className="w-5 h-5 text-primary shrink-0" />
                      <span className="truncate">{room.name}</span>
                    </div>
                    {user?.id === room.created_by && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoomToDelete(room.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-2 text-xs">
                    <Clock className="w-3 h-3" />
                    Created {new Date(room.created_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Created by: <span className="font-medium text-foreground">{room.profiles?.display_name || room.profiles?.email || 'Unknown'}</span>
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <AlertDialog open={!!roomToDelete} onOpenChange={() => setRoomToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the room and all its whiteboard data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteRoom} className="bg-destructive hover:bg-destructive/90">
                Delete Room
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Dashboard;
