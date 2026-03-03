import React, { useState, useEffect } from 'react';
import { Language, UserRole } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';
import { signIn, signUp, resetPassword } from '../services/firebaseAuth';
import { EduvaIcon } from './Layout';

interface AuthScreenProps {
  appLanguage: Language;
}

type AuthMode = 'login' | 'register' | 'forgot';

const AuthScreen: React.FC<AuthScreenProps> = ({ appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const [mode, setMode] = useState<AuthMode>('login');
  const [role, setRole] = useState<UserRole>(UserRole.STUDENT);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Clear states on mode switch
  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [mode]);

  const resetState = () => {
    setError(null);
    setMessage(null);
    setIsLoading(false);
  };

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
      return "Incorrect email or password.";
    }
    // Clean up Firebase prefixes for other errors
    return rawError.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
  };

  // Security Logic
  const [lastAttemptTime, setLastAttemptTime] = useState(0);
  const ATTEMPT_COOLDOWN_MS = 3000;

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePasswordStrength = (pass: string) => {
    // Requirements: 8+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
    const hasLength = pass.length >= 8;
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /\d/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);

    return {
      isValid: hasLength && hasUpper && hasLower && hasNumber && hasSpecial,
      checks: { hasLength, hasUpper, hasLower, hasNumber, hasSpecial }
    };
  };

  const sanitizeDisplayName = (name: string) => {
    // Remove HTML tags and leading/trailing whitespace
    return name.replace(/<[^>]*>/g, '').trim();
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. THROTTLING (Anti-Brute Force/Hacking)
    const now = Date.now();
    if (now - lastAttemptTime < ATTEMPT_COOLDOWN_MS) {
      setError(`Please wait a few seconds before another attempt.`);
      return;
    }
    setLastAttemptTime(now);

    resetState();
    setIsLoading(true);

    // 2. SANITIZATION & NORMALIZATION
    const cleanEmail = email.trim().toLowerCase();
    const cleanDisplayName = sanitizeDisplayName(displayName);

    try {
      if (mode === 'register') {
        // 3. COMPLEX VALIDATION (Registration)
        if (!validateEmail(cleanEmail)) {
          setError("Please enter a valid academic email address.");
          setIsLoading(false);
          return;
        }

        const strength = validatePasswordStrength(password);
        if (!strength.isValid) {
          let msg = "Password is too weak. Must include: ";
          const missing = [];
          if (!strength.checks.hasLength) missing.push("8+ characters");
          if (!strength.checks.hasUpper) missing.push("uppercase");
          if (!strength.checks.hasLower) missing.push("lowercase");
          if (!strength.checks.hasNumber) missing.push("number");
          if (!strength.checks.hasSpecial) missing.push("special character");
          setError(msg + missing.join(", ") + ".");
          setIsLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError("Password confirmation does not match.");
          setIsLoading(false);
          return;
        }

        const res = await signUp(cleanEmail, password, cleanDisplayName || cleanEmail.split('@')[0], role);
        if (res.error) {
          if (res.error.includes('auth/email-already-in-use')) {
            setMode('login'); // Self-direct to login
            setMessage("This email is already registered. Please log in instead.");
            setError(null);
          } else {
            setError(formatErrorMessage(res.error));
          }
        }
      } else if (mode === 'login') {
        if (!cleanEmail || !password) {
          setError("Email and password are required.");
          setIsLoading(false);
          return;
        }
        const res = await signIn(cleanEmail, password);
        if (res.error) setError(formatErrorMessage(res.error));
      } else if (mode === 'forgot') {
        if (!validateEmail(cleanEmail)) {
          setError("Valid email required for reset.");
          setIsLoading(false);
          return;
        }
        const res = await resetPassword(cleanEmail);
        if (res.success) setMessage("A secure core reset link was sent to your email.");
        else setError(formatErrorMessage(res.error || "Reset system temporarily unavailable."));
      }
    } catch (e) {
      setError("A security exception occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  // Theme logic based on selected role
  const isParent = role === UserRole.PARENT;
  const themeBorderClass = isParent ? 'border-red-500' : 'border-brand-500';
  const themeFocusClass = isParent ? 'focus:border-red-500' : 'focus:border-brand-500';
  const themeBtnClass = isParent ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-brand-600 hover:bg-brand-700 shadow-brand-500/20';
  const themeBgClass = isParent ? 'from-red-50 to-white dark:from-red-950 dark:to-slate-900' : 'from-blue-50 to-white dark:from-blue-950 dark:to-slate-900';
  const themeTextClass = isParent ? 'text-red-600' : 'text-brand-600';

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen animate-fade-in p-4 bg-gradient-to-b transition-colors duration-500 ${themeBgClass}`}>

      {/* BRANDING HEADER */}
      <div className="mb-8 flex flex-col items-center text-center w-full max-w-md">
        {/* Logo Icon */}
        <div className="mb-4">
          <EduvaIcon className="w-20 h-20 text-brand-600 drop-shadow-xl" />
        </div>

        {/* Stylized Text Logo */}
        <div className="flex flex-col items-center gap-1 mb-6">
          <div className="flex text-5xl font-black tracking-tight">
            <span className="text-brand-500">E</span>
            <span className="text-brand-500">D</span>
            <span className="text-slate-800 dark:text-white">U</span>
            <span className="text-purple-500">V</span>
            <span className="text-slate-800 dark:text-white">A</span>
            <span className="text-slate-800 dark:text-white">-Me</span>
          </div>
          <span className="text-4xl font-black text-slate-700 dark:text-slate-300 mt-1">إديوفا مى</span>
        </div>

        {/* Educate / Evaluate Pill */}
        <div className="inline-flex items-center gap-3 px-8 py-3 rounded-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm mb-10">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">Educate</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600"></span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500">Evaluate</span>
        </div>

        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium max-w-[280px]">
          Sign in to start your education and evaluation journey.
        </p>
      </div>

      {/* COMPACT FORM CARD */}
      <Card className={`w-full max-w-md bg-white shadow-2xl border-t-8 ${themeBorderClass} px-6 py-10 rounded-[3rem] dark:bg-slate-800 transition-all duration-500 overflow-visible relative`}>
        {error && <div className="mb-6 p-4 bg-red-50 text-red-700 text-[10px] font-black uppercase rounded-xl animate-shake border border-red-100">⚠️ {error}</div>}
        {message && <div className="mb-6 p-4 bg-green-50 text-green-700 text-[10px] font-black uppercase rounded-xl border border-green-100">✅ {message}</div>}

        {/* BIG ATTRACTIVE ROLE SELECTOR - SHOW ONLY DURING REGISTRATION */}
        {mode === 'register' && (
          <div className="grid grid-cols-2 gap-4 mb-10 animate-fade-in">
            <button
              type="button"
              onClick={() => setRole(UserRole.STUDENT)}
              className={`flex flex-col items-center gap-3 p-6 rounded-[2rem] border-2 transition-all group relative overflow-hidden ${role === UserRole.STUDENT ? 'border-brand-500 bg-brand-50/30 dark:bg-brand-900/20 shadow-lg ring-4 ring-brand-500/10' : 'border-slate-100 dark:border-slate-700 hover:border-brand-200'}`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl transition-transform ${role === UserRole.STUDENT ? 'scale-110' : 'grayscale opacity-40'}`}>
                🎓
              </div>
              <span className={`text-[11px] font-black uppercase tracking-widest ${role === UserRole.STUDENT ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400'}`}>Student</span>
              {role === UserRole.STUDENT && <div className="absolute top-3 right-3 w-2 h-2 bg-brand-500 rounded-full animate-pulse"></div>}
            </button>
            <button
              type="button"
              onClick={() => setRole(UserRole.PARENT)}
              className={`flex flex-col items-center gap-3 p-6 rounded-[2rem] border-2 transition-all group relative overflow-hidden ${role === UserRole.PARENT ? 'border-red-600 bg-red-50/30 dark:bg-red-900/20 shadow-lg ring-4 ring-red-600/10' : 'border-slate-100 dark:border-slate-700 hover:border-red-200'}`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl transition-transform ${role === UserRole.PARENT ? 'scale-110' : 'grayscale opacity-40'}`}>
                👨‍👩‍👧
              </div>
              <span className={`text-[11px] font-black uppercase tracking-widest ${role === UserRole.PARENT ? 'text-red-700 dark:text-red-300' : 'text-slate-400'}`}>Parent</span>
              {role === UserRole.PARENT && <div className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
            </button>
          </div>
        )}

        {/* INPUT FORM */}
        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'register' && (
            <input
              type="text" required
              className={`w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 outline-none ${themeFocusClass} text-sm font-bold transition-all shadow-inner`}
              placeholder="Display Name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          )}

          <input
            type="email" required
            className={`w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 outline-none ${themeFocusClass} text-sm font-bold transition-all shadow-inner`}
            placeholder="Email Address"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          {mode !== 'forgot' && (
            <input
              type="password" required
              className={`w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 outline-none ${themeFocusClass} text-sm font-bold transition-all shadow-inner`}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          )}

          {mode === 'register' && (
            <input
              type="password" required
              className={`w-full p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 outline-none ${themeFocusClass} text-sm font-bold transition-all shadow-inner`}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          )}

          <div className="pt-2">
            <Button
              type="submit"
              className={`w-full py-5 font-black uppercase tracking-[0.3em] text-[12px] shadow-xl transition-all active:scale-95 rounded-2xl border-none ${themeBtnClass}`}
              isLoading={isLoading}
            >
              {mode === 'register' ? `Register` : mode === 'forgot' ? "Send Link" : "Login"}
            </Button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className={`text-[11px] font-black uppercase tracking-widest hover:underline ${themeTextClass}`}>
            {mode === 'login' ? "New Account" : "Back to Login"}
          </button>
          {mode === 'login' && (
            <button onClick={() => setMode('forgot')} className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Forgot?</button>
          )}
        </div>
      </Card>

      <div className="mt-12 text-center opacity-40">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.5em]">Academic Intelligence Matrix V6.0</p>
      </div>
    </div>
  );
};

export default AuthScreen;