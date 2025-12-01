import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X, Sparkles, Send, User } from "lucide-react";
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Editor } from "tldraw";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AiSidebarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roomId: string;
    userId: string;
    editor: Editor | null;
}

export interface AiSidebarRef {
    analyze: () => void;
}

interface ChatMessage {
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

export const AiSidebar = forwardRef<AiSidebarRef, AiSidebarProps>(({ open, onOpenChange, roomId, userId, editor }, ref) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Expose analyze method
    useImperativeHandle(ref, () => ({
        analyze: () => {
            if (!open) onOpenChange(true);
            handleSend("Analyze the whiteboard");
        }
    }));

    // Fetch initial messages
    useEffect(() => {
        if (!roomId) return;

        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('ai_chats')
                .select('*, profiles(display_name, email)')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching messages:', error);
            } else {
                setMessages(data || []);
            }
        };

        fetchMessages();

        // Subscribe to new messages
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
                    const newMessage = { ...payload.new } as ChatMessage;

                    // If it's a user message, we might need to fetch profile info
                    if (!newMessage.is_ai && newMessage.user_id) {
                        const { data } = await supabase
                            .from('profiles')
                            .select('display_name, email')
                            .eq('id', newMessage.user_id)
                            .single();

                        if (data) {
                            newMessage.profiles = data;
                        }
                    }

                    setMessages(prev => {
                        // Avoid duplicates if we optimistically added it (not doing that yet but good practice)
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

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, open]);

    const handleSend = async (messageOverride?: string) => {
        const messageText = messageOverride || input.trim();
        if ((!messageText && !editor) || isLoading) return;

        if (!messageOverride) setInput("");
        setIsLoading(true);

        try {
            // 1. Insert User Message
            const { error: insertError } = await supabase
                .from('ai_chats')
                .insert({
                    room_id: roomId,
                    user_id: userId,
                    message: messageText,
                    is_ai: false
                });

            if (insertError) throw insertError;

            // 2. Capture Image (if editor is available)
            let base64Image = null;
            if (editor) {
                const shapeIds = Array.from(editor.getCurrentPageShapeIds());
                if (shapeIds.length > 0) {
                    const result = await editor.toImage(shapeIds, {
                        format: 'png',
                        background: true
                    });
                    const blob = result.blob;
                    base64Image = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                }
            }

            // 3. Call Edge Function
            const { error: aiError } = await supabase.functions.invoke('gemini-ai', {
                body: {
                    messages: messages.map(m => ({
                        message: m.message,
                        is_ai: m.is_ai
                    })).concat([{ message: messageText, is_ai: false }]), // Include current message
                    image: base64Image,
                    roomId: roomId // Pass roomId to Edge Function
                }
            });

            if (aiError) throw aiError;

            // 4. AI Response is handled by Edge Function and Realtime subscription

        } catch (error) {
            console.error('Error in chat flow:', error);
            // Optionally show error toast
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div
            className={cn(
                "border-l bg-background flex flex-col transition-all duration-300 ease-in-out overflow-hidden shadow-xl z-10",
                open ? "w-[400px] opacity-100" : "w-0 opacity-0"
            )}
        >
            <div className="flex flex-col h-full min-w-[400px]">
                {/* Header */}
                <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        <h2 className="font-semibold">AI Companion</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center text-muted-foreground py-10">
                                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>Ask me anything about your whiteboard!</p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={cn(
                                    "flex gap-3",
                                    msg.is_ai ? "flex-row" : "flex-row-reverse"
                                )}
                            >
                                <Avatar className="w-8 h-8 border">
                                    {msg.is_ai ? (
                                        <>
                                            <AvatarImage src="/placeholder.svg" />
                                            <AvatarFallback className="bg-purple-100 text-purple-600"><Sparkles className="w-4 h-4" /></AvatarFallback>
                                        </>
                                    ) : (
                                        <AvatarFallback className="bg-blue-100 text-blue-600">
                                            {msg.profiles?.display_name?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                                        </AvatarFallback>
                                    )}
                                </Avatar>
                                <div
                                    className={cn(
                                        "rounded-lg p-3 max-w-[85%] text-sm",
                                        msg.is_ai
                                            ? "bg-muted text-foreground"
                                            : "bg-primary text-primary-foreground"
                                    )}
                                >
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
                        {isLoading && (
                            <div className="flex gap-3">
                                <Avatar className="w-8 h-8 border">
                                    <AvatarFallback className="bg-purple-100 text-purple-600"><Sparkles className="w-4 h-4" /></AvatarFallback>
                                </Avatar>
                                <div className="bg-muted rounded-lg p-3">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-4 border-t bg-background">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Ask AI or analyze board..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button onClick={() => handleSend()} disabled={isLoading || (!input.trim() && !editor)} size="icon">
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">
                        AI can see your whiteboard content.
                    </p>
                </div>
            </div>
        </div>
    );
});

AiSidebar.displayName = "AiSidebar";
