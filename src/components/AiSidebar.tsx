import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Copy, Check, X, Sparkles } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface AiSidebarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    loading: boolean;
    analysis: string | null;
}

export function AiSidebar({ open, onOpenChange, loading, analysis }: AiSidebarProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (analysis) {
            navigator.clipboard.writeText(analysis);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div
            className={cn(
                "border-l bg-background flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
                open ? "w-[400px] opacity-100" : "w-0 opacity-0"
            )}
        >
            <div className="p-6 flex flex-col h-full min-w-[400px]">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        <h2 className="text-lg font-semibold">AI Analysis</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="text-sm text-muted-foreground mb-6">
                    Get insights and summaries of your whiteboard content.
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p>Analyzing your masterpiece...</p>
                        </div>
                    ) : analysis ? (
                        <>
                            <ScrollArea className="flex-1 -mr-4 pr-4">
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown>{analysis}</ReactMarkdown>
                                </div>
                            </ScrollArea>
                            <div className="pt-4 mt-4 border-t flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopy}
                                    className="gap-2"
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {copied ? "Copied" : "Copy to Clipboard"}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <p>Click the Analyze button to start.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
