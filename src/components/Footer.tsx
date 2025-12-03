import { Github, Heart } from 'lucide-react';

export const Footer = () => {
    return (
        <footer className="w-full py-6 mt-12 border-t border-border/40 bg-background/50 backdrop-blur-sm">
            <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                    <span>Built with</span>
                    <Heart className="w-3 h-3 text-red-500 fill-red-500 animate-pulse" />
                    <span>by</span>
                    <a
                        href="https://github.com/akash-kamat"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1"
                    >
                        Akash Kamat
                    </a>
                </div>

                <div className="flex items-center gap-6">
                    <a
                        href="https://github.com/akash-kamat"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors flex items-center gap-2"
                    >
                        <Github className="w-4 h-4" />
                        <span>GitHub</span>
                    </a>
                    <span className="text-muted-foreground/30">|</span>
                    <span>© {new Date().getFullYear()} SyncSpace</span>
                </div>
            </div>
        </footer>
    );
};
