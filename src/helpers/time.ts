/**
 * Converts a timestamp (in milliseconds) to a human-readable "time ago" string.
 * @param timestamp - The timestamp to convert (in milliseconds since epoch)
 * @returns A string representing the relative time (e.g., "just now", "5m ago", "2h ago")
 */
export const formatTimeAgo = (timestamp: number | undefined | null): string => {
    if (!timestamp) return '';

    const now = Date.now();
    const diffInSeconds = Math.floor((now - timestamp) / 1000);

    if (diffInSeconds < 60) {
        return 'just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes}m ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours}h ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays}d ago`;
    }

    // Fallback to absolute date if significantly older
    return new Date(timestamp).toLocaleDateString();
};
