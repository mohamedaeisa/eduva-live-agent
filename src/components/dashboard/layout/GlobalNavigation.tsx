
import React, { useState } from 'react';
import { EduvaIcon } from '../../Layout';
import { useDashboard } from '../context/DashboardContext';
import { UserProfile, AppView, UserRole } from '../../../types';
import { TRANSLATIONS } from '../../../constants';
import { getModules } from '../../../core/modules/registry';

interface GlobalNavigationProps {
    user: UserProfile;
    onNavigate: (view: AppView) => void;
    onLogout: () => void;
}

const GlobalNavigation: React.FC<GlobalNavigationProps> = ({ user, onNavigate, onLogout }) => {
    const { dispatch, state } = useDashboard();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const t = TRANSLATIONS[user.preferences.defaultLanguage] || TRANSLATIONS.English;

    // Dynamic Modules
    const moduleItems = getModules()
        .sort((a, b) => (a.menu.order || 99) - (b.menu.order || 99))
        .map(m => ({
            id: AppView.MY_PRIVATE_TEACHER, // Mapping to the existing View Enum for now
            label: m.menu.label,
            icon: m.menu.icon,
            // We might need to handle custom 'route' mapping in the future
        }));

    const navItems = [
        { id: AppView.LIVING_DASHBOARD, label: 'Home', icon: '🏠' },
        { id: AppView.LIBRARY, label: 'Library', icon: '📚' },
        ...moduleItems,
        { id: AppView.CLASSROOM, label: 'Classes', icon: '👥' },
        { id: AppView.GAMIFICATION, label: 'Achievements', icon: '🏆' },
    ];

    if (user.role === UserRole.ADMIN || user.email === 'nour@nour.nour') {
        navItems.push({ id: AppView.ADMIN, label: 'Admin', icon: '🛡️' });
    }

    return (
        <>
            <div className={`fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-[400] transition-all duration-500 ${state.state === 'FLOW' ? 'bg-transparent pointer-events-none' : 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm'}`}>

                {/* Left Section: Logo & Main Nav */}
                <div className={`flex items-center gap-8 transition-opacity duration-300 ${state.state === 'FLOW' ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate(AppView.LIVING_DASHBOARD)}>
                        <EduvaIcon className="w-8 h-8 text-indigo-600" />
                        <span className="font-black text-lg tracking-tight text-slate-800 dark:text-white uppercase italic">EDUVA<span className="text-indigo-600">.LIVE</span></span>
                    </div>

                    {/* RESTORED NAVIGATION LINKS */}
                    <nav className="hidden lg:flex items-center gap-1">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all flex items-center gap-2"
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Right Section: Icons & User Account Menu */}
                <div className={`flex items-center gap-4 transition-all duration-500 ${state.state === 'FLOW' ? 'translate-y-[-200%]' : 'translate-y-0'}`}>

                    {/* Simple Desktop Icons (from reference) */}
                    <div className="hidden sm:flex items-center gap-2 mr-2">
                        <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg font-bold text-xs">ع</button>
                        <button className="p-2 text-amber-500 hover:text-amber-600 transition-colors text-lg">🌙</button>
                    </div>

                    <div className="relative">
                        {/* COLLAPSIBLE TRIGGER */}
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className={`flex items-center gap-2 p-1 rounded-xl transition-all active:scale-95 group ${isMenuOpen ? 'ring-4 ring-indigo-500/10' : ''}`}
                        >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs transition-all shadow-sm ${isMenuOpen ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                {(user.photoURL) ? <img src={user.photoURL} className="w-full h-full rounded-xl object-cover" /> : (user.name || 'U').charAt(0).toUpperCase()}
                            </div>
                        </button>

                        {/* EXPANDABLE SUB-MENU - COMPACT VERSION */}
                        {isMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-[-1]"
                                    onClick={() => setIsMenuOpen(false)}
                                ></div>
                                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 rounded-3xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.2)] border border-slate-100 dark:border-slate-800 p-2 animate-slide-up transform origin-top-right overflow-hidden">

                                    {/* Compact Header */}
                                    <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl mb-1 border border-slate-100/50 dark:border-slate-800/50 flex items-center gap-3">
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-700 shadow-sm overflow-hidden">
                                                {(user.photoURL) ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-sm">🎓</div>}
                                            </div>
                                        </div>

                                        <div className="overflow-hidden min-w-0 flex-1">
                                            <h3 className="font-black text-xs text-slate-900 dark:text-white truncate">{user.name.split(' ')[0]}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[8px] font-black uppercase rounded border border-indigo-200 dark:border-indigo-800 leading-none">
                                                    LVL {user.gamification.level}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase truncate">
                                                    {user.preferences.defaultYear || 'Guest'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Compact Navigation Links */}
                                    <div className="py-1 space-y-0.5">
                                        <button
                                            onClick={() => { onNavigate(AppView.PROFILE); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all flex items-center gap-3 group"
                                        >
                                            <span className="text-base opacity-60 group-hover:scale-110 transition-transform">👤</span>
                                            <span>Profile</span>
                                        </button>

                                        <button
                                            onClick={() => { onNavigate(AppView.SETTINGS); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all flex items-center gap-3 group"
                                        >
                                            <span className="text-base opacity-60 group-hover:rotate-12 transition-transform">⚙️</span>
                                            <span>Settings</span>
                                        </button>

                                        <button
                                            onClick={() => { onNavigate(AppView.LIVING_DASHBOARD); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 rounded-xl transition-all flex items-center gap-3 group"
                                        >
                                            <span className="text-base group-hover:animate-pulse">✨</span>
                                            <span>Dashboard</span>
                                        </button>

                                        <div className="my-1 h-px bg-slate-100 dark:bg-slate-800"></div>

                                        <button
                                            onClick={() => { onNavigate(AppView.PRICING); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-xl transition-all flex items-center gap-3 group"
                                        >
                                            <span className="text-base group-hover:scale-110 transition-transform">💎</span>
                                            <span>Plans & Billing</span>
                                        </button>

                                        <button
                                            onClick={() => { onLogout(); setIsMenuOpen(false); }}
                                            className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all flex items-center gap-3 group"
                                        >
                                            <span className="text-base opacity-60 group-hover:-translate-x-1 transition-transform">🚪</span>
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* MOBILE BOTTOM NAVIGATION - Always Visible */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-[500] shadow-lg">
                <nav className="flex items-center justify-around px-2 py-2 safe-area-inset-bottom">
                    {navItems.slice(0, 5).map((item) => {
                        // Simplified - no active state for now
                        return (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                className="flex flex-col items-center justify-center min-w-[64px] px-3 py-2 rounded-xl transition-all active:scale-95 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                            >
                                <span className="text-xl mb-1">{item.icon}</span>
                                <span className="text-[9px] font-black uppercase tracking-wider leading-none">
                                    {item.label.split(' ')[0]}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </>
    );
};


export default GlobalNavigation;
