
import React, { useState } from 'react';
import { signInWithGoogle, signInGuest, signOut } from '../services/firebaseAuth';
import { useSession } from '../hooks/useSession';

const AuthWidget: React.FC = () => {
  const { user, loading } = useSession();
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatErrorMessage = (rawError: string): string => {
    const err = rawError.toLowerCase();
    if (err.includes('auth/weak-password')) return "Password is too short.";
    if (err.includes('auth/email-already-in-use')) return "This email is already registered.";
    if (err.includes('auth/invalid-email')) return "The email address is invalid.";
    if (
      err.includes('auth/user-not-found') || 
      err.includes('auth/wrong-password') || 
      err.includes('auth/invalid-credential')
    ) {
      return "Incorrect credentials.";
    }
    // Clean up Firebase prefixes
    return rawError.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
  };

  const handleLogin = async (method: 'google' | 'guest') => {
    setAuthLoading(true);
    setError(null);
    
    let result;
    if (method === 'google') {
      result = await signInWithGoogle();
    } else {
      result = await signInGuest();
    }

    if (result.error) {
      setError(formatErrorMessage(result.error));
    }
    setAuthLoading(false);
  };

  if (loading) return <div>Loading App...</div>;

  if (user) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
              {user.displayName?.charAt(0) || 'G'}
            </div>
          )}
          <div className="text-left">
            <h3 className="font-bold text-slate-800 dark:text-white">Welcome, {user.displayName || 'Guest'}</h3>
            <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
              {user.isAnonymous ? 'Guest Mode' : 'Registered'}
            </span>
          </div>
        </div>
        <button 
          onClick={() => signOut()} 
          className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto p-6 bg-white dark:bg-slate-800 rounded-xl shadow-xl">
      <h2 className="text-2xl font-bold text-center mb-6 text-slate-800 dark:text-white">Sign In</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm">
          {error}
        </div>
      )}
      
      <div className="space-y-4">
        <button 
          onClick={() => handleLogin('google')} 
          disabled={authLoading}
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 font-bold py-3 px-4 rounded-lg transition-all shadow-sm disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          {authLoading ? 'Please Wait...' : 'Sign in with Google'}
        </button>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
          <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Or</span>
          <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
        </div>

        <button 
          onClick={() => handleLogin('guest')} 
          disabled={authLoading}
          className="w-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
        >
          {authLoading ? 'Please Wait...' : 'Continue as Guest'}
        </button>
      </div>
    </div>
  );
};

export default AuthWidget;
