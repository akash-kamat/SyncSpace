import { cn } from '@/lib/utils'
import { MousePointer2 } from 'lucide-react'

export const Cursor = ({
    className,
    style,
    color,
    name,
}: {
    className?: string
    style?: React.CSSProperties
    color: string
    name: string
}) => {
    return (
        <div className={cn('pointer-events-none absolute top-0 left-0 z-50', className)} style={style}>
            <MousePointer2 color={color} fill={color} size={20} />
            <div
                className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold text-white text-center whitespace-nowrap shadow-sm"
                style={{ backgroundColor: color }}
            >
                {name}
            </div>
        </div>
    )
}
