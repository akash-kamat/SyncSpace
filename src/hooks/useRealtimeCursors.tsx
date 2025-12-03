import { supabase } from '@/integrations/supabase/client'
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Throttle a callback to a certain delay, It will only call the callback if the delay has passed, with the arguments
 * from the last call
 */
const useThrottleCallback = <Params extends unknown[], Return>(
    callback: (...args: Params) => Return,
    delay: number
) => {
    const lastCall = useRef(0)
    const timeout = useRef<NodeJS.Timeout | null>(null)

    return useCallback(
        (...args: Params) => {
            const now = Date.now()
            const remainingTime = delay - (now - lastCall.current)

            if (remainingTime <= 0) {
                if (timeout.current) {
                    clearTimeout(timeout.current)
                    timeout.current = null
                }
                lastCall.current = now
                callback(...args)
            } else if (!timeout.current) {
                timeout.current = setTimeout(() => {
                    lastCall.current = Date.now()
                    timeout.current = null
                    callback(...args)
                }, remainingTime)
            }
        },
        [callback, delay]
    )
}

const generateRandomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 100%, 70%)`

const EVENT_NAME = 'realtime-cursor-move'

type CursorEventPayload = {
    position: {
        x: number
        y: number
    }
    user: {
        id: string
        name: string
    }
    color: string
    timestamp: number
}

export const useRealtimeCursors = ({
    roomId,
    userId,
    userName,
    throttleMs = 50,
}: {
    roomId: string
    userId: string
    userName: string
    throttleMs?: number
}) => {
    const [color] = useState(generateRandomColor())
    const [cursors, setCursors] = useState<Record<string, CursorEventPayload>>({})
    const cursorPayload = useRef<CursorEventPayload | null>(null)

    const channelRef = useRef<RealtimeChannel | null>(null)

    const callback = useCallback(
        (event: MouseEvent) => {
            const { clientX, clientY } = event

            const payload: CursorEventPayload = {
                position: {
                    x: clientX,
                    y: clientY,
                },
                user: {
                    id: userId,
                    name: userName,
                },
                color: color,
                timestamp: new Date().getTime(),
            }

            cursorPayload.current = payload

            channelRef.current?.send({
                type: 'broadcast',
                event: EVENT_NAME,
                payload: payload,
            })
        },
        [color, userId, userName]
    )

    const handleMouseMove = useThrottleCallback(callback, throttleMs)

    useEffect(() => {
        if (!roomId || !userId) return;

        const channel = supabase.channel(`cursor-room:${roomId}`)

        channel
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                leftPresences.forEach(function (element) {
                    // Remove cursor when user leaves
                    setCursors((prev) => {
                        const newCursors = { ...prev }
                        // @ts-ignore
                        if (newCursors[element.user_id]) {
                            // @ts-ignore
                            delete newCursors[element.user_id]
                        }
                        return newCursors
                    })
                })
            })
            .on('presence', { event: 'join' }, () => {
                if (!cursorPayload.current) return

                // All cursors broadcast their position when a new cursor joins
                channelRef.current?.send({
                    type: 'broadcast',
                    event: EVENT_NAME,
                    payload: cursorPayload.current,
                })
            })
            .on('broadcast', { event: EVENT_NAME }, (data: { payload: CursorEventPayload }) => {
                const { user } = data.payload
                // Don't render your own cursor
                if (user.id === userId) return

                setCursors((prev) => ({
                    ...prev,
                    [user.id]: data.payload,
                }))
            })
            .subscribe(async (status) => {
                if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
                    await channel.track({ user_id: userId, online_at: new Date().toISOString() })
                    channelRef.current = channel
                } else {
                    // setCursors({})
                    // channelRef.current = null
                }
            })

        return () => {
            channel.unsubscribe()
            channelRef.current = null
        }
    }, [roomId, userId])

    useEffect(() => {
        // Add event listener for mousemove
        window.addEventListener('mousemove', handleMouseMove)

        // Cleanup on unmount
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
        }
    }, [handleMouseMove])

    return { cursors }
}
