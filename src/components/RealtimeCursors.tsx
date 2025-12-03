import { Cursor } from '@/components/Cursor'
import { useRealtimeCursors } from '@/hooks/useRealtimeCursors'

const THROTTLE_MS = 50

export const RealtimeCursors = ({ roomId, userId, userName }: { roomId: string; userId: string; userName: string }) => {
    const { cursors } = useRealtimeCursors({ roomId, userId, userName, throttleMs: THROTTLE_MS })

    return (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
            {Object.keys(cursors).map((id) => (
                <Cursor
                    key={id}
                    className="transition-transform duration-100 ease-linear"
                    style={{
                        transform: `translate(${cursors[id].position.x}px, ${cursors[id].position.y}px)`,
                    }}
                    color={cursors[id].color}
                    name={cursors[id].user.name}
                />
            ))}
        </div>
    )
}
