import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquare, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';

interface Message {
    id: string;
    room_id: string;
    user_id: string;
    content: string;
    created_at: string;
    user?: {
        email: string;
        display_name?: string;
    };
}

export const Chat = ({ roomId, onClose }: { roomId: string; onClose: () => void }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!roomId) return;

        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages_with_users')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching messages:', error);
            } else {
                setMessages(data as any || []);
            }
            setLoading(false);
        };

        fetchMessages();

        const channel = supabase
            .channel(`chat:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `room_id=eq.${roomId}`
                },
                async (payload) => {
                    const { data, error } = await supabase
                        .from('messages_with_users')
                        .select('*')
                        .eq('id', payload.new.id)
                        .single();

                    if (!error && data) {
                        setMessages((prev) => [...prev, data as any]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        const { error } = await supabase
            .from('messages')
            .insert({
                room_id: roomId,
                user_id: user.id,
                content: newMessage.trim()
            });

        if (error) {
            console.error('Error sending message:', error);
        } else {
            setNewMessage('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border w-80 shadow-xl absolute right-0 top-0 bottom-0 z-[50]">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                <h3 className="font-semibold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Chat
                </h3>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                    {loading ? (
                        <div className="text-center text-muted-foreground text-sm py-4">Loading messages...</div>
                    ) : messages.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-4">No messages yet. Say hello!</div>
                    ) : (
                        messages.map((msg) => {
                            const isMe = msg.user_id === user?.id;
                            return (
                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <Avatar className="h-6 w-6 mb-1">
                                            <AvatarFallback className="text-[10px]">
                                                {msg.user_id.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div
                                            className={`px-3 py-2 rounded-lg text-sm ${isMe
                                                ? 'bg-primary text-primary-foreground rounded-br-none'
                                                : 'bg-muted text-foreground rounded-bl-none'
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                                        {format(new Date(msg.created_at), 'HH:mm')}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-border bg-background">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
};
