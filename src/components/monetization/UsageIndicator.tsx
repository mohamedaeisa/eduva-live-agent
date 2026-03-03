import { useEntitlement } from '../../hooks/useEntitlement';

interface UsageIndicatorProps {
    capability: 'quizzes' | 'ai_minutes' | 'notes';
    label: string;
}

export function UsageIndicator({ capability, label }: UsageIndicatorProps) {
    const { remaining, loading } = useEntitlement(capability);

    if (loading) return <div className="animate-pulse h-4 bg-gray-200 rounded w-24"></div>;

    // Unlimited case
    if (remaining === -1) {
        return (
            <div className="flex items-center text-sm font-medium text-green-600">
                <span>∞</span>
                <span className="ml-1">{label}</span>
            </div>
        );
    }

    // Limited case
    // Note: We'd ideally want 'total' and 'used' from the API to show a real progress bar.
    // For Phase 3, we only have 'remaining'. We can show that textually.

    return (
        <div className="flex flex-col text-sm">
            <div className="flex justify-between mb-1">
                <span>{label}</span>
                <span className={remaining === 0 ? 'text-red-500 font-bold' : 'text-gray-600'}>
                    {remaining} remaining
                </span>
            </div>
            {/* Visual bar placeholder - strictly we need 'total' for percentage */}
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full ${remaining === 0 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: remaining > 0 ? '100%' : '0%' }} // Dummy width until we expose 'total'
                ></div>
            </div>
        </div>
    );
}
