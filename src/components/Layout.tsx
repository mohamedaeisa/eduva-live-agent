import React, { useEffect, useState } from 'react';
import { AppView, Language, UserProfile, StudyContext, XpNotification, UserRole } from '../types';
import { TRANSLATIONS } from '../constants';
import InstallPwaButton from './InstallPwaButton';

interface LayoutProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  children: React.ReactNode;
  appLanguage: Language;
  setAppLanguage: (lang: Language) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  user: UserProfile | null;
  onLogout: () => void;
  xpNotification: XpNotification | null;
}

// Icon Only - For Navbar (EV Symbol)
export const EduvaIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
  <svg className={`${className} animate-twist-pop`} viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="iconBlue" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
      <linearGradient id="iconPurple" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#d946ef" />
      </linearGradient>
    </defs>
    <g transform="translate(50, 50) scale(0.8)">
      {/* E Shape */}
      <path d="M160 80 C 100 80, 60 120, 60 180 V 340 C 60 400, 100 440, 160 440 H 260 L 290 380 H 160 C 130 380, 120 370, 120 340 V 290 H 240 C 250 290, 260 280, 260 270 V 250 C 260 240, 250 230, 240 230 H 120 V 180 C 120 150, 130 140, 160 140 H 240 L 210 80 H 160 Z" fill="url(#iconBlue)" />

      {/* Circuit Detail */}
      <circle cx="260" cy="260" r="15" fill="#0ea5e9" />
      <path d="M60 180 L 30 180" stroke="url(#iconBlue)" strokeWidth="12" strokeLinecap="round" opacity="0.5" />
      <circle cx="30" cy="180" r="8" fill="#0ea5e9" opacity="0.5" />

      {/* V Shape */}
      <path d="M290 440 L 370 440 L 460 140 L 400 140 L 330 380 L 290 440" fill="url(#iconPurple)" />
      <path d="M430 160 L 490 60 L 390 60 L 430 160 Z" fill="url(#iconPurple)" />
    </g>
  </svg>
);

// Full Logo Component using the SVG file
export const EduvaLogoFull = ({ className = "w-64" }: { className?: string }) => (
  <img src="/logo.svg" alt="EDUVA-Me Logo" className={className} />
);

// Backward compatibility alias
export const EduvaLogo = EduvaIcon;

const Layout: React.FC<LayoutProps> = ({
  currentView, onNavigate, children, appLanguage, setAppLanguage,
  theme, setTheme, user, onLogout, xpNotification
}) => {
  const [showCopyMsg, setShowCopyMsg] = useState(false);

  // Safe translation lookup with fallback to English
  const t = TRANSLATIONS[appLanguage] || TRANSLATIONS[Language.ENGLISH];

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (appLanguage === Language.ARABIC) {
      root.setAttribute('dir', 'rtl');
      root.setAttribute('lang', 'ar');
      body.classList.add('font-arabic');
      body.classList.remove('font-sans');
    } else {
      root.setAttribute('dir', 'ltr');
      root.setAttribute('lang', 'en');
      body.classList.add('font-sans');
      body.classList.remove('font-arabic');
    }
  }, [appLanguage]);

  // Apply dark mode class to document
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => setAppLanguage(appLanguage === Language.ENGLISH ? Language.ARABIC : Language.ENGLISH);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowCopyMsg(true);
    setTimeout(() => setShowCopyMsg(false), 2000);
  };

  const isAdmin = user && user.email === 'nour@nour.nour';

  const getNavItems = () => {
    if (!user) return [];

    if (user.role === UserRole.PARENT) {
      return [
        {
          id: AppView.PARENT_DASHBOARD,
          label: 'Parent Hub',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
        },
        {
          id: AppView.PROFILE,
          label: 'Profile',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
        },
        {
          id: AppView.SETTINGS,
          label: 'Settings',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
        }
      ];
    }

    const items = [
      {
        id: AppView.LIVING_DASHBOARD,
        label: t.menuCreate,
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
      },
      {
        id: AppView.STUDENT_HISTORY,
        label: 'My Journey',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      },
      {
        id: AppView.LIBRARY,
        label: t.menuLibrary,
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
      },
      {
        id: AppView.MY_PRIVATE_TEACHER,
        label: 'My Private Teacher',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z"></path>
      },
      {
        id: AppView.PRICING,
        label: 'Plans & Billing',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z"></path>
      },
      {
        id: AppView.CONTACT_US,
        label: 'Contact US',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
      },
      // {
      //   id: AppView.CLASSROOM,
      //   label: 'Classes',
      //   icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
      // },
      // {
      //   id: AppView.GAMIFICATION,
      //   label: t.menuGamification,
      //   icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172V9.938a3.75 3.75 0 00-7.5 0v5.64c0 1.126-.336 2.199-.982 3.172m9.964 0a4.5 4.5 0 002.97-4.25c0-1.413-1.066-2.615-2.34-2.941a7.584 7.584 0 00-.529-2.929m-10.086 9.07c-2.486-.35-4.41-2.122-4.41-4.25 0-1.413 1.066-2.615 2.34-2.941a7.584 7.584 0 00.529-2.929"></path>
      // }
    ];

    if (isAdmin) {
      items.push({
        id: AppView.ADMIN,
        label: 'Admin',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
      });
    }

    return items;
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">

      {/* 
        =======================================================================
         FIXED HEADER
         App logic will pad content by pt-16 to avoid occlusion. 
        =======================================================================
      */}
      <header className="fixed top-0 left-0 right-0 w-full z-[999] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">

            {/* BRAND */}
            <div className="flex items-center cursor-pointer group" onClick={() => user && onNavigate(user.role === UserRole.PARENT ? AppView.PARENT_DASHBOARD : AppView.LIVING_DASHBOARD)}>
              <EduvaIcon className="w-9 h-9 text-brand-600 dark:text-brand-400 ltr:mr-2 rtl:ml-2 transform group-hover:scale-110 transition-transform duration-300 drop-shadow-md" />
              <div className="flex flex-col">
                <span className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-brand-500 to-blue-600 leading-tight">
                  EDUVA-Me
                </span>
                <span className="text-[0.6rem] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase group-hover:text-brand-500 transition-colors">
                  DEVELOPED BY MOHAMED EISA
                </span>
              </div>
            </div>

            {/* DESKTOP ACTIONS */}
            <div className="flex items-center gap-3">
              {user && (
                <nav className="hidden md:flex ltr:space-x-4 rtl:space-x-reverse rtl:space-x-4">
                  {navItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id as AppView)}
                      className={`text-sm font-medium transition-colors px-3 py-1.5 rounded-lg ${currentView === item.id
                        ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 font-bold'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              )}

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden md:block mx-1"></div>

              {/* Install PWA */}
              <InstallPwaButton />

              {/* Share */}
              <button
                onClick={handleShare}
                className="p-1.5 text-slate-500 hover:text-brand-600 transition-colors relative hidden sm:block"
                title={t.shareApp}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                {showCopyMsg && (
                  <span className="absolute top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap animate-fade-in z-50">
                    {t.appLinkCopied}
                  </span>
                )}
              </button>

              {/* Theme & Language Toggles */}
              <button onClick={toggleLanguage} className="px-2 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200">
                {appLanguage === Language.ENGLISH ? 'ع' : 'EN'}
              </button>

              <button onClick={toggleTheme} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                {theme === 'light' ? '🌙' : '☀️'}
              </button>

              {/* User Menu */}
              {user && (
                <div className="relative group ml-1">
                  <button className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-lg">
                    {(user.name || 'U').charAt(0).toUpperCase()}
                  </button>

                  {/* DROPDOWN */}
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-1 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all duration-200 z-50 origin-top-right transform scale-95 group-hover:scale-100">
                    <div className="px-4 py-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl mb-1 text-center">
                      <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 border-2 border-brand-500 mx-auto mb-2 flex items-center justify-center text-lg overflow-hidden">
                        {(user.photoURL) ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <span>🎓</span>}
                      </div>
                      <p className="font-bold text-slate-900 dark:text-white truncate">{user.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">{user.email}</p>
                    </div>

                    <div className="space-y-0.5">
                      <button onClick={() => onNavigate(AppView.PROFILE)} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg flex items-center gap-2">
                        <span>👤</span> Profile
                      </button>
                      <button onClick={() => onNavigate(AppView.SETTINGS)} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg flex items-center gap-2">
                        <span>⚙️</span> Settings
                      </button>

                      <button onClick={() => onNavigate(AppView.PRICING)} className="w-full text-left px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-lg flex items-center gap-2">
                        <span>💎</span> Plans & Billing
                      </button>



                      <div className="border-t border-slate-100 dark:border-slate-700 pt-1">
                        <button onClick={onLogout} className="w-full text-left px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2">
                          <span>🚪</span> {t.logout}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 
         =======================================================================
         MAIN CONTENT WRAPPER 
         Padded at top to respect Fixed Header. 
         Padded at bottom (mobile) to respect Fixed Footer.
         =======================================================================
      */}
      <div className="pt-16 flex flex-col flex-grow relative w-full">

        {/* XP Toast Notification */}
        {xpNotification && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[80] animate-bounce">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-2 rounded-full shadow-2xl flex items-center gap-3 border-2 border-white/20">
              <span className="text-xl">🏆</span>
              <div className="flex flex-col">
                <span className="font-black text-sm">+{xpNotification.amount} XP</span>
                <span className="text-[10px] font-medium opacity-90">{xpNotification.message}</span>
              </div>
              {xpNotification.levelUp && (
                <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase animate-pulse">Level Up!</span>
              )}
            </div>
          </div>
        )}

        {/* 
            Main Render Area 
            NOTE: We remove max-w constraints here to allow full-width modules (like Quiz or Maps)
            Modules themselves should constrain their own width if needed.
        */}
        <main className="flex-grow w-full pb-24 md:pb-0">
          {children}
        </main>
      </div>

      {/* 
        =======================================================================
         MOBILE BOTTOM NAVIGATION
         Fixed at bottom, visible only on small screens.
        =======================================================================
      */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 z-[999] safe-area-bottom">
          <div className="flex items-center justify-around px-2 py-2">
            {navItems.map(item => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id as AppView)}
                  className={`flex flex-col items-center justify-center w-14 py-1 space-y-1 transition-all duration-200 
                    ${isActive
                      ? 'text-brand-600 dark:text-brand-400 transform scale-105'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                  <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                    {/* Clone icon to adjust size if needed, or rely on SVG viewBox */}
                    <div className="w-5 h-5 text-current">
                      <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        {item.icon}
                      </svg>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold truncate max-w-full leading-none tracking-tight">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};

export default Layout;
