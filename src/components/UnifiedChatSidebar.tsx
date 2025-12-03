import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X, Sparkles, Send, User } from "lucide-react";
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Editor } from "tldraw";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { useAuth } from "@/hooks/useAuth";

interface UnifiedChatSidebarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roomId: string;
    userId: string;
    editor: Editor | null;
}

export interface UnifiedChatSidebarRef {
    analyze: () => void;
}

interface AiChatMessage {
    id: string;
    message: string;
    is_ai: boolean;
    user_id: string | null;
    created_at: string;
    profiles?: {
        display_name: string;
        email: string;
    };
}

interface TeamChatMessage {
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

export const UnifiedChatSidebar = forwardRef<UnifiedChatSidebarRef, UnifiedChatSidebarProps>(({ open, onOpenChange, roomId, userId, editor }, ref) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<"ai" | "team">("team");

    // AI Chat State
    const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
    const [aiInput, setAiInput] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const aiScrollRef = useRef<HTMLDivElement>(null);

    // Team Chat State
    const [teamMessages, setTeamMessages] = useState<TeamChatMessage[]>([]);
    const [teamInput, setTeamInput] = useState("");
    const [isTeamLoading, setIsTeamLoading] = useState(true);
    const teamScrollRef = useRef<HTMLDivElement>(null);

    // Expose analyze method
    useImperativeHandle(ref, () => ({
        analyze: () => {
            if (!open) onOpenChange(true);
            setActiveTab("ai");
            handleAiSend("Analyze the whiteboard");
        }
    }));

    // --- AI Chat Logic ---
    useEffect(() => {
        if (!roomId) return;

        const fetchAiMessages = async () => {
            const { data, error } = await supabase
                .from('ai_chats')
                .select('*, profiles(display_name, email)')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching AI messages:', error);
            } else {
                setAiMessages(data || []);
            }
        };

        fetchAiMessages();

        const channel = supabase
            .channel(`ai_chats:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ai_chats',
                    filter: `room_id=eq.${roomId}`
                },
                async (payload) => {
                    const newMessage = { ...payload.new } as AiChatMessage;
                    if (!newMessage.is_ai && newMessage.user_id) {
                        const { data } = await supabase
                            .from('profiles')
                            .select('display_name, email')
                            .eq('id', newMessage.user_id)
                            .single();
                        if (data) newMessage.profiles = data;
                    }
                    setAiMessages(prev => {
                        if (prev.some(m => m.id === newMessage.id)) return prev;
                        return [...prev, newMessage];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);

    useEffect(() => {
        if (aiScrollRef.current && activeTab === 'ai') {
            aiScrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [aiMessages, open, activeTab]);

    const handleAiSend = async (messageOverride?: string) => {
        const messageText = messageOverride || aiInput.trim();
        if ((!messageText && !editor) || isAiLoading) return;

        if (!messageOverride) setAiInput("");
        setIsAiLoading(true);

        try {
            const { error: insertError } = await supabase
                .from('ai_chats')
                .insert({
                    room_id: roomId,
                    user_id: userId,
                    message: messageText,
                    is_ai: false
                });

            if (insertError) throw insertError;

            let base64Image = null;
            if (editor) {
                const shapeIds = Array.from(editor.getCurrentPageShapeIds());
                if (shapeIds.length > 0) {
                    const result = await editor.toImage(shapeIds, { format: 'png', background: true });
                    const blob = result.blob;
                    base64Image = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                }
            }

            const { error: aiError } = await supabase.functions.invoke('gemini-ai', {
                body: {
                    messages: aiMessages.map(m => ({ message: m.message, is_ai: m.is_ai })).concat([{ message: messageText, is_ai: false }]),
                    image: base64Image,
                    roomId: roomId
                }
            });

            if (aiError) throw aiError;
        } catch (error) {
            console.error('Error in AI chat flow:', error);
        } finally {
            setIsAiLoading(false);
        }
    };

    // --- Team Chat Logic ---
    useEffect(() => {
        if (!roomId) return;

        const fetchTeamMessages = async () => {
            const { data, error } = await supabase
                .from('messages_with_users')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching team messages:', error);
            } else {
                setTeamMessages(data as any || []);
            }
            setIsTeamLoading(false);
        };

        fetchTeamMessages();

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
                        setTeamMessages((prev) => [...prev, data as any]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);

    useEffect(() => {
        if (teamScrollRef.current && activeTab === 'team') {
            teamScrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [teamMessages, open, activeTab]);

    const handleTeamSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!teamInput.trim() || !user) return;

        const { error } = await supabase
            .from('messages')
            .insert({
                room_id: roomId,
                user_id: user.id,
                content: teamInput.trim()
            });

        if (error) {
            console.error('Error sending message:', error);
        } else {
            setTeamInput('');
        }
    };

    return (
        <div
            className={cn(
                "border-l bg-background flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
                open ? "w-[400px] opacity-100" : "w-0 opacity-0"
            )}
        >
            <div className="flex flex-col h-full min-w-[400px]">
                {/* Header */}
                <div className="p-2 border-b flex items-center justify-between bg-muted/30">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                        <div className="flex items-center justify-between w-full px-2">
                            <TabsList className="grid w-[200px] grid-cols-2 h-8">
                                <TabsTrigger value="team" className="text-xs">Team Chat</TabsTrigger>
                                <TabsTrigger value="ai" className="text-xs">AI Companion</TabsTrigger>
                            </TabsList>
                            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </Tabs>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {activeTab === 'ai' ? (
                        <div className="flex flex-col h-full">
                            <ScrollArea className="flex-1 p-4">
                                <div className="space-y-4">
                                    {aiMessages.length === 0 && (
                                        <div className="text-center text-muted-foreground py-10">
                                            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                            <p>Ask me anything about your whiteboard!</p>
                                        </div>
                                    )}
                                    {aiMessages.map((msg) => (
                                        <div key={msg.id} className={cn("flex gap-3", msg.is_ai ? "flex-row" : "flex-row-reverse")}>
                                            <Avatar className="w-8 h-8 border">
                                                <AvatarFallback className={cn("text-[10px]", msg.is_ai ? "bg-purple-100 text-purple-600" : "bg-primary/10 text-primary")}>
                                                    {msg.is_ai ? <Sparkles className="w-4 h-4" /> : (msg.profiles?.display_name?.[0] || "U")}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className={cn("rounded-lg p-3 max-w-[85%] text-sm", msg.is_ai ? "bg-muted text-foreground" : "bg-primary text-primary-foreground")}>
                                                {msg.is_ai ? (
                                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                                        <ReactMarkdown>{msg.message}</ReactMarkdown>
                                                    </div>
                                                ) : (
                                                    <p>{msg.message}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {isAiLoading && (
                                        <div className="flex gap-3">
                                            <Avatar className="w-8 h-8 border">
                                                <AvatarFallback className="bg-purple-100 text-purple-600"><Sparkles className="w-4 h-4" /></AvatarFallback>
                                            </Avatar>
                                            <div className="bg-muted rounded-lg p-3">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={aiScrollRef} />
                                </div>
                            </ScrollArea>
                            <div className="p-4 border-t bg-background">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Ask AI or analyze board..."
                                        value={aiInput}
                                        onChange={(e) => setAiInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAiSend())}
                                        disabled={isAiLoading}
                                        className="flex-1"
                                    />
                                    <Button onClick={() => handleAiSend()} disabled={isAiLoading || (!aiInput.trim() && !editor)} size="icon">
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-2 text-center">AI can see your whiteboard content.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <ScrollArea className="flex-1 p-4">
                                <div className="space-y-4">
                                    {isTeamLoading ? (
                                        <div className="text-center text-muted-foreground text-sm py-4">Loading messages...</div>
                                    ) : teamMessages.length === 0 ? (
                                        <div className="text-center text-muted-foreground text-sm py-4">No messages yet. Say hello!</div>
                                    ) : (
                                        teamMessages.map((msg) => {
                                            const isMe = msg.user_id === user?.id;
                                            return (
                                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                        <Avatar className="w-6 h-6 border">
                                                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                                {msg.user?.display_name?.[0] || <User className="w-3 h-3" />}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className={`px-3 py-2 rounded-lg text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted text-foreground rounded-bl-none'}`}>
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
                                    <div ref={teamScrollRef} />
                                </div>
                            </ScrollArea>
                            <div className="p-4 border-t bg-background">
                                <form onSubmit={handleTeamSend} className="flex gap-2">
                                    <Input
                                        value={teamInput}
                                        onChange={(e) => setTeamInput(e.target.value)}
                                        placeholder="Type a message..."
                                        className="flex-1"
                                    />
                                    <Button type="submit" size="icon" disabled={!teamInput.trim()}>
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

UnifiedChatSidebar.displayName = "UnifiedChatSidebar";
