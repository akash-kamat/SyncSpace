import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PeerData {
    peerId: string;
    peer: SimplePeer.Instance;
}



const RemoteAudio = ({ stream }: { stream: MediaStream }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(e => {
                if (e.name !== 'AbortError') {
                    console.error('Error playing audio:', e);
                }
            });
        }
    }, [stream]);

    return <audio ref={audioRef} autoPlay playsInline />;
};

export const AudioRoom = ({ roomId, onMuteChange }: { roomId: string; onMuteChange?: (muted: boolean) => void }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isMuted, setIsMuted] = useState(true);
    const [peers, setPeers] = useState<PeerData[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [volume, setVolume] = useState(0);
    const userStream = useRef<MediaStream | null>(null);
    const peersRef = useRef<PeerData[]>([]);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const visualizerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!roomId || !user) return;

        const initAudio = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                userStream.current = stream;

                // Setup Audio Analysis
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                const analyser = audioContext.createAnalyser();
                analyserRef.current = analyser;
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 256;

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const updateVolume = () => {
                    if (!analyserRef.current) return;
                    analyserRef.current.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / bufferLength;

                    if (visualizerRef.current) {
                        const height = Math.min(100, average * 1.5);
                        visualizerRef.current.style.height = `${height}%`;
                    }

                    animationFrameRef.current = requestAnimationFrame(updateVolume);
                };
                updateVolume();

                // Start muted
                stream.getAudioTracks().forEach(track => track.enabled = false);
                setIsMuted(true);

                // Join the signaling channel
                const channel = supabase.channel(`audio:${roomId}`);

                channel
                    .on('broadcast', { event: 'signal' }, ({ payload }) => {
                        const { signal, from, to } = payload;
                        if (to === user.id) {
                            const peerObj = peersRef.current.find(p => p.peerId === from);
                            if (peerObj) {
                                try {
                                    peerObj.peer.signal(signal);
                                } catch (e) {
                                    console.warn('Error signaling peer:', e);
                                }
                            } else {
                                // Incoming connection
                                const peer = addPeer(signal, from, stream);
                                peersRef.current.push({ peerId: from, peer });
                                setPeers([...peersRef.current]);
                            }
                        }
                    })
                    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                        // Initiate connection to new users
                        newPresences.forEach((presence: any) => {
                            if (presence.user_id !== user.id) {
                                // Check if already connected
                                if (!peersRef.current.find(p => p.peerId === presence.user_id)) {
                                    const peer = createPeer(presence.user_id, stream);
                                    peersRef.current.push({ peerId: presence.user_id, peer });
                                    setPeers([...peersRef.current]);
                                }
                            }
                        });
                    })
                    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                        leftPresences.forEach((presence: any) => {
                            const peerObj = peersRef.current.find(p => p.peerId === presence.user_id);
                            if (peerObj) {
                                peerObj.peer.destroy();
                            }
                            peersRef.current = peersRef.current.filter(p => p.peerId !== presence.user_id);
                            setPeers([...peersRef.current]);

                            // Remove stream
                            setRemoteStreams(prev => {
                                const newMap = new Map(prev);
                                newMap.delete(presence.user_id);
                                return newMap;
                            });
                        });
                    })
                    .subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await channel.track({ user_id: user.id });
                            channelRef.current = channel;
                        }
                    });

            } catch (err) {
                console.error('Error accessing microphone:', err);
                toast({
                    title: "Microphone Error",
                    description: "Could not access microphone. Please check permissions.",
                    variant: "destructive"
                });
            }
        };

        initAudio();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
            userStream.current?.getTracks().forEach(track => track.stop());
            peersRef.current.forEach(p => p.peer.destroy());
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [roomId, user]);

    const createPeer = (userToSignal: string, stream: MediaStream) => {
        console.log('Creating peer for:', userToSignal);
        const peer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            console.log('Sending signal to:', userToSignal);
            channelRef.current?.send({
                type: 'broadcast',
                event: 'signal',
                payload: { signal, to: userToSignal, from: user?.id }
            });
        });

        peer.on('connect', () => {
            console.log('Peer connected:', userToSignal);
        });

        peer.on('stream', remoteStream => {
            console.log('Received stream from:', userToSignal);
            setRemoteStreams(prev => new Map(prev).set(userToSignal, remoteStream));
        });

        peer.on('error', err => {
            console.error('Peer error:', err);
        });

        return peer;
    };

    const addPeer = (incomingSignal: any, callerId: string, stream: MediaStream) => {
        console.log('Adding peer from:', callerId);
        const peer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on('signal', signal => {
            console.log('Returning signal to:', callerId);
            channelRef.current?.send({
                type: 'broadcast',
                event: 'signal',
                payload: { signal, to: callerId, from: user?.id }
            });
        });

        peer.on('connect', () => {
            console.log('Peer connected:', callerId);
        });

        peer.on('stream', remoteStream => {
            console.log('Received stream from:', callerId);
            setRemoteStreams(prev => new Map(prev).set(callerId, remoteStream));
        });

        peer.on('error', err => {
            console.error('Peer error:', err);
        });

        peer.signal(incomingSignal);

        return peer;
    };

    const toggleMute = () => {
        if (userStream.current) {
            userStream.current.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            const newMutedState = !isMuted;
            setIsMuted(newMutedState);
            onMuteChange?.(newMutedState);
        }
    };

    return (
        <>
            {Array.from(remoteStreams.entries()).map(([id, stream]) => (
                <RemoteAudio key={id} stream={stream} />
            ))}
            <div className="flex items-center gap-2">
                <Button
                    variant={isMuted ? "outline" : "ghost"}
                    size="sm"
                    className={`gap-2 h-7 text-xs relative overflow-hidden border ${!isMuted ? 'text-primary border-primary/50' : ''}`}
                    onClick={toggleMute}
                    title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                    {/* Visualizer Background */}
                    {!isMuted && (
                        <div
                            ref={visualizerRef}
                            className="absolute bottom-0 left-0 right-0 bg-green-500/40 transition-none"
                            style={{ height: '0%' }}
                        />
                    )}

                    {isMuted ? <MicOff className="w-3 h-3 z-10" /> : <Mic className="w-3 h-3 z-10" />}
                    <span className="z-10">{isMuted ? "Mic Off" : "Mic On"}</span>
                </Button>
                {
                    peers.length > 0 && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {peers.length} connected
                        </span>
                    )
                }
            </div >
        </>
    );
};
