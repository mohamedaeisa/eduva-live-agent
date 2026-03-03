import React from 'react';

export const LoadingSpinner: React.FC<{ message?: string, fullScreen?: boolean }> = ({ message = "Loading...", fullScreen = true }) => {
    const content = (
        <div className="flex flex-col items-center justify-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
            {message && <p className="text-gray-500 dark:text-gray-400 text-sm font-medium animate-pulse">{message}</p>}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
                {content}
            </div>
        );
    }

    return content;
};

export default LoadingSpinner;
