import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Plus, LogOut, Users, Clock, Trash2, LayoutGrid, ArrowRight, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";

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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>

      <div className="container mx-auto px-4 py-8 relative z-10 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SyncSpace</h1>
              <p className="text-sm text-muted-foreground">Collaborate in real-time</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ModeToggle />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full border border-border/50">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">{user?.email?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-muted-foreground">{user?.email}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
          <h2 className="text-xl font-semibold tracking-tight">Your Rooms</h2>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all">
                <Plus className="w-4 h-4 mr-2" />
                New Room
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

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          {/* Create New Card (First Item) */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <div className="group relative flex flex-col items-center justify-center h-[280px] rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 bg-muted/5 hover:bg-muted/10 transition-all cursor-pointer">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Create New Room</h3>
                <p className="text-sm text-muted-foreground">Start a new whiteboard session</p>
              </div>
            </DialogTrigger>
          </Dialog>

          {/* Room Cards */}
          {rooms.map(room => (
            <Card key={room.id} className="group overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 flex flex-col h-[280px]">
              {/* Gradient Placeholder */}
              <div className="h-32 w-full bg-gradient-to-br from-primary/5 via-primary/10 to-transparent relative group-hover:from-primary/10 group-hover:via-primary/20 transition-colors">
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {user?.id === room.created_by && (
                    <Button variant="destructive" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setRoomToDelete(room.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="absolute bottom-3 left-4">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm shadow-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    {new Date(room.created_at).toLocaleDateString()}
                  </Badge>
                </div>
              </div>

              <CardContent className="flex-1 p-5">
                <h3 className="font-semibold text-lg mb-2 truncate group-hover:text-primary transition-colors">{room.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px]">{room.profiles?.display_name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">Created by {room.profiles?.display_name || 'Unknown'}</span>
                </div>
              </CardContent>

              <CardFooter className="p-5 pt-0">
                <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground" variant="secondary" onClick={() => navigate(`/room/${room.id}`)}>
                  Enter Room
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </CardFooter>
            </Card>
          ))}
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
