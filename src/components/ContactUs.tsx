import React, { useState, useEffect } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { db, auth } from '../services/firebaseConfig';

const ContactUs: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        type: 'General Question',
        subject: '',
        message: '',
        rating: 0,
        feedbackEmoji: '',
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [activeForm, setActiveForm] = useState<'feedback' | 'inquiry'>('inquiry');

    // Animation states
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        setIsVisible(true);
    }, []);

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.name) newErrors.name = 'Full Name is required';
        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Email is invalid';
        }
        if (!formData.message) newErrors.message = 'Message is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setIsSubmitting(true);
        try {
            const inquiryData = {
                ...formData,
                userId: auth.currentUser?.uid || 'guest',
                createdAt: Date.now(),
                status: 'NEW',
                source: activeForm === 'feedback' ? 'FEEDBACK_SESSION' : 'CONTACT_PAGE'
            };

            await db.collection('contact_inquiries').add(inquiryData);

            await db.collection('mail').add({
                to: 'eduvame.ai@gmail.com',
                message: {
                    subject: `[EDUVA ${activeForm === 'feedback' ? 'FEEDBACK' : 'CONTACT'}] ${formData.type}: ${formData.subject || 'New Inquiry'}`,
                    html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; max-width: 600px; margin: auto;">
                        <h2 style="color: #2563eb; text-align: center;">${activeForm === 'feedback' ? 'New Feedback Received' : 'New Contact Inquiry'}</h2>
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p><strong>Name:</strong> ${formData.name}</p>
                        <p><strong>Email:</strong> ${formData.email}</p>
                        <p><strong>Type:</strong> ${formData.type}</p>
                        ${formData.feedbackEmoji ? `<p><strong>Mood:</strong> ${formData.feedbackEmoji}</p>` : ''}
                        <p><strong>Rating:</strong> ${formData.rating ? '⭐'.repeat(formData.rating) : 'N/A'}</p>
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px;">
                            <p><strong>Message:</strong></p>
                            <p style="white-space: pre-wrap;">${formData.message}</p>
                        </div>
                        <p style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 20px;">Sent via Eduva Portal</p>
                    </div>
                `
                }
            });

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setFormData({
                    name: '',
                    email: '',
                    phone: '',
                    type: 'General Question',
                    subject: '',
                    message: '',
                    rating: 0,
                    feedbackEmoji: '',
                });
            }, 3000);
        } catch (error) {
            console.error("Error submitting form:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const [selectedPolicy, setSelectedPolicy] = useState<{ name: string, desc: string, details: string[] } | null>(null);

    const policies = [
        {
            name: 'Privacy Architecture',
            desc: 'Secure encryption for your cognitive data.',
            details: [
                "Neural Data Encryption: All learning patterns and interaction logs are encrypted using AES-256 standards.",
                "Voice Anonymization: Audio inputs are stripped of biometric identifiers before being processed by our AI engines.",
                "Zero-Knowledge Storage: We ensure that only the student and authorized mentors can access personal study histories.",
                "Biometric Privacy: Face and voice data used for live sessions are never stored on our permanent servers."
            ]
        },
        {
            name: 'Nexus Terms',
            desc: 'Governance of our digital learning spaces.',
            details: [
                "AI Engagement Rules: Users must interact with the AI Private Teacher in a respectful and constructive manner.",
                "Account Integrity: Credentials must not be shared; one account per student ensures accurate AI personalization.",
                "Academic Honesty: Eduva tools are designed to assist learning, not to facilitate plagiarism or automated cheating.",
                "Usage Limits: Standard tier accounts are subject to fair-use policies regarding AI response tokens."
            ]
        },
        {
            name: 'Mastery Agreement',
            desc: 'Our commitment to your educational growth.',
            details: [
                "Service Level Guarantee: We commit to 99.9% availability for the AI Private Teacher and Study Library.",
                "Student Pledge: By using Eduva, you agree to engage authentically with labs, quizzes, and assigned materials.",
                "Iterative Improvement: We promise to constantly update our models based on your direct feedback signals.",
                "Subscription Transparency: Clear and upfront billing with easy cancellation and refund paths."
            ]
        },
        {
            name: 'Cookie Pulse',
            desc: 'Progress tracking with total anonymity.',
            details: [
                "Session Preservation: We use essential cookies to maintain your login state and active study sessions.",
                "Anonymized Telemetry: Navigation data is used to improve UI/UX without ever identifying the specific individual.",
                "Local Storage: Heavy data like board drawings and document states are stored locally for instant recovery.",
                "Opt-Out Availability: You can choose to disable non-essential tracking via your dashboard privacy settings."
            ]
        }
    ];

    const [showInteractionHub, setShowInteractionHub] = useState(false);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 overflow-x-hidden selection:bg-brand-500/30">
            {/* FLOATING ACTION BUTTON */}
            <button
                onClick={() => setShowInteractionHub(true)}
                className="fixed bottom-10 right-10 z-[80] group flex items-center gap-3"
            >
                <div className="bg-brand-500 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(59,130,246,0.5)] transform transition-all duration-500 group-hover:scale-105 group-hover:-translate-x-2 opacity-0 group-hover:opacity-100 hidden md:block">
                    Elevate Pulse
                </div>
                <div className="w-16 h-16 bg-gradient-to-tr from-brand-600 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 group-hover:rotate-12 group-hover:scale-110 relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="text-2xl animate-pulse">✨</span>
                </div>
            </button>

            {/* INTERACTION HUB MODAL */}
            {showInteractionHub && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8 animate-fade-in">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" onClick={() => setShowInteractionHub(false)}></div>
                    <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-white/80 dark:bg-slate-900/50 rounded-[3rem] border-slate-200 dark:border-slate-800 shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-fade-in-up custom-scrollbar">

                        <div className="p-8 md:p-16">
                            <div className="flex justify-between items-center mb-12">
                                <div>
                                    <h2 className="text-4xl font-black bg-gradient-to-r from-brand-400 to-indigo-400 bg-clip-text text-transparent mb-2">The Intersection</h2>
                                    <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Your feedback is our primary signal</p>
                                </div>
                                <button
                                    onClick={() => setShowInteractionHub(false)}
                                    className="w-12 h-12 rounded-full bg-white/80 dark:bg-slate-900/50 flex items-center justify-center hover:bg-white/10 transition-all text-xl"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* SECTION 3: INTERACTION HUB (Feedback vs Inquiry) */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">

                                {/* LEFT: FEEDBACK HUB */}
                                <div className="lg:col-span-5 space-y-8">
                                    <h2 className="text-3xl font-black mb-4 flex items-center gap-3 text-slate-900 dark:text-white">
                                        <span className="w-2 h-10 bg-brand-500 rounded-full"></span>
                                        Student Pulse
                                    </h2>
                                    <p className="text-slate-600 dark:text-slate-400 font-bold mb-8">
                                        Your experience shapes the future of Eduva. Tell us how you feel!
                                    </p>

                                    <div className="grid grid-cols-5 gap-3 mb-8">
                                        {['😢', '😕', '😐', '😊', '🤩'].map((emoji, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, feedbackEmoji: emoji, rating: i + 1 }));
                                                    setActiveForm('feedback');
                                                }}
                                                className={`h-16 bg-white dark:bg-slate-900/50 rounded-2xl text-3xl flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-slate-50 dark:hover:bg-white/10 ${formData.feedbackEmoji === emoji ? 'bg-brand-50 border-brand-500 transform scale-110 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : ''
                                                    }`}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>

                                </div>

                                {/* RIGHT: THE SMART FORM */}
                                <div className="lg:col-span-7">
                                    <div className="bg-white/80 dark:bg-slate-900/50 p-8 md:p-12 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                                        <div className="flex flex-wrap gap-4 mb-10 pb-6 border-b border-slate-200 dark:border-slate-800">
                                            <button
                                                onClick={() => setActiveForm('inquiry')}
                                                className={`px-6 py-2 rounded-full font-black text-sm transition-all ${activeForm === 'inquiry' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-200'
                                                    }`}
                                            >
                                                General Inquiry
                                            </button>
                                            <button
                                                onClick={() => setActiveForm('feedback')}
                                                className={`px-6 py-2 rounded-full font-black text-sm transition-all ${activeForm === 'feedback' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-200'
                                                    }`}
                                            >
                                                Deep Feedback
                                            </button>
                                        </div>

                                        <form onSubmit={handleSubmit} className="space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Identity</label>
                                                    <input
                                                        name="name"
                                                        value={formData.name}
                                                        onChange={handleChange}
                                                        placeholder="Full Name"
                                                        className="w-full px-5 py-4 rounded-2xl bg-white dark:bg-slate-800 focus:border-brand-500 transition-all outline-none font-bold text-sm border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                                                    />
                                                    {errors.name && <p className="text-[10px] font-black text-red-400 uppercase tracking-wider pl-1">{errors.name}</p>}
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Portal</label>
                                                    <input
                                                        name="email"
                                                        type="email"
                                                        value={formData.email}
                                                        onChange={handleChange}
                                                        placeholder="Email Address"
                                                        className="w-full px-5 py-4 rounded-2xl bg-white dark:bg-slate-800 focus:border-brand-500 transition-all outline-none font-bold text-sm border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                                                    />
                                                    {errors.email && <p className="text-[10px] font-black text-red-400 uppercase tracking-wider pl-1">{errors.email}</p>}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Category</label>
                                                    <select
                                                        name="type"
                                                        value={formData.type}
                                                        onChange={handleChange}
                                                        className="w-full px-5 py-4 rounded-2xl bg-white dark:bg-slate-800 focus:border-brand-500 transition-all outline-none font-bold text-sm border-slate-200 dark:border-slate-800 appearance-none cursor-pointer text-slate-800 dark:text-slate-200"
                                                    >
                                                        <option>General Question</option>
                                                        <option>Technical Issue</option>
                                                        <option>Feature Request</option>
                                                        <option>Billing / Account</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Subject</label>
                                                    <input
                                                        name="subject"
                                                        value={formData.subject}
                                                        onChange={handleChange}
                                                        placeholder="What is this about?"
                                                        className="w-full px-5 py-4 rounded-2xl bg-white dark:bg-slate-800 focus:border-brand-500 transition-all outline-none font-bold text-sm border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2 relative">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Insights</label>
                                                <textarea
                                                    name="message"
                                                    rows={5}
                                                    value={formData.message}
                                                    onChange={handleChange}
                                                    placeholder="Your detailed thoughts..."
                                                    className="w-full px-5 py-4 rounded-2xl bg-white dark:bg-slate-800 focus:border-brand-500 transition-all outline-none font-bold text-sm border-slate-200 dark:border-slate-800 resize-none text-slate-800 dark:text-slate-200"
                                                />
                                                <div className="absolute bottom-4 right-4 text-[9px] font-black text-slate-600 bg-white/5 px-2 py-1 rounded tracking-widest">
                                                    {formData.message.length} PULSES
                                                </div>
                                                {errors.message && <p className="text-[10px] font-black text-red-400 uppercase tracking-wider pl-1">{errors.message}</p>}
                                            </div>

                                            <Button
                                                isLoading={isSubmitting}
                                                className={`w-full py-5 rounded-2xl text-sm font-black tracking-[0.2em] uppercase transition-all duration-500 shadow-2xl ${success ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-gradient-to-r from-brand-600 to-indigo-600'
                                                    }`}
                                            >
                                                {success ? '✓ Inbound Synchronized' : 'Transmit Signal'}
                                            </Button>

                                            {success && (
                                                <div className="text-center p-4 bg-emerald-500/10 text-emerald-400 rounded-xl font-bold text-[10px] animate-fade-in border border-emerald-500/20 uppercase tracking-widest">
                                                    Data persistent. Our team will review your signal shortly.
                                                </div>
                                            )}
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* POLICY MODAL */}
            {selectedPolicy && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={() => setSelectedPolicy(null)}></div>
                    <div className="relative bg-white/80 dark:bg-slate-900/50 w-full max-w-2xl rounded-[2.5rem] border-slate-200 dark:border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in-up">
                        <div className="p-8 md:p-12">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h3 className="text-3xl font-black mb-2 bg-gradient-to-r from-brand-400 to-indigo-400 bg-clip-text text-transparent">{selectedPolicy.name}</h3>
                                    <p className="text-slate-600 dark:text-slate-400 font-bold text-sm uppercase tracking-widest">{selectedPolicy.desc}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedPolicy(null)}
                                    className="w-10 h-10 rounded-full bg-white/80 dark:bg-slate-900/50 flex items-center justify-center hover:bg-white/10 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="space-y-6">
                                {selectedPolicy.details.map((detail, idx) => (
                                    <div key={idx} className="flex gap-4 group">
                                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] shrink-0"></div>
                                        <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                            {detail}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-12">
                                <Button onClick={() => setSelectedPolicy(null)} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs">
                                    I Understand the Pulse
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-blob { animation: blob 7s infinite alternate; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .glass-dark { background: rgba(0, 0, 0, 0.2); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.05); }
        .neon-glow { text-shadow: 0 0 10px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.3); }
        .mesh-bg {
          background-image: radial-gradient(at 0% 0%, hsla(253,16%,95%,1) 0, transparent 50%),
                            radial-gradient(at 50% 0%, hsla(225,39%,90%,1) 0, transparent 50%),
                            radial-gradient(at 100% 0%, hsla(339,49%,90%,1) 0, transparent 50%);
        }
        .dark .mesh-bg {
          background-image: radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%),
                            radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%),
                            radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%);
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 1s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

            {/* SECTION 1: COSMIC HERO */}
            <section className="relative min-h-[60vh] flex items-center justify-center pt-32 pb-48 px-4 mesh-bg">
                <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-72 h-72 bg-brand-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

                <div className={`max-w-4xl mx-auto text-center z-10 transition-all duration-1000 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                    <div className="mb-8 flex flex-col items-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-400 mb-2 opacity-70 animate-pulse">A Personal Message from our Founder</p>
                        <div className="glass px-6 py-4 rounded-2xl border border-white/5 shadow-2xl relative mb-6">
                            <span className="absolute -top-3 -left-3 text-4xl opacity-20 text-slate-900 dark:text-white">“</span>
                            <p className="text-sm md:text-base font-bold italic text-slate-600 dark:text-slate-300">"We don't just build technology; we architect the future of human potential."</p>
                            <div className="mt-2 flex items-center justify-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-brand-500"></span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mohamed Eisa, CEO</span>
                            </div>
                        </div>
                    </div>

                    <div className="inline-block px-4 py-1.5 mb-6 glass rounded-full border border-white/10 shadow-xl">
                        <span className="text-xs font-black tracking-widest text-brand-400 uppercase">Available 24/7 for you</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter leading-tight text-slate-900 dark:text-white">
                        Let's <span className="bg-gradient-to-r from-brand-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent neon-glow">Elevate</span> <br />
                        Learning Together
                    </h1>
                    <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed opacity-80 mb-10">
                        Whether you're a student seeking mastery or a parent tracking progress, our team is always just one pulse away.
                    </p>
                    <button
                        onClick={() => setShowInteractionHub(true)}
                        className="px-10 py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto"
                    >
                        Reach Us Now <span className="text-lg">✨</span>
                    </button>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 -mt-32 relative z-20 pb-32">

                {/* SECTION: VISION & MISSION */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20 animate-fade-in-up">
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-brand-500/20 p-10 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl group-hover:bg-brand-500/20 transition-all"></div>
                        <h3 className="text-2xl font-black mb-4 flex items-center gap-3 text-slate-900 dark:text-white">
                            <span className="text-brand-400">🔭</span> Our Vision
                        </h3>
                        <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                            To become the world's most intelligent and personalized learning companion, empowering every student to unlock their unique potential and achieve true mastery through the synergy of AI and human curiosity.
                        </p>
                    </Card>
                    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-purple-500/20 p-10 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
                        <h3 className="text-2xl font-black mb-4 flex items-center gap-3 text-slate-900 dark:text-white">
                            <span className="text-purple-400">🚀</span> Our Mission
                        </h3>
                        <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                            We combine cutting-edge large language models with foundational cognitive science to build adaptive, intuitive tools that simplify complex concepts and inspire a lifelong passion for learning.
                        </p>
                    </Card>
                </div>

                {/* SECTION 2: INSTANT CONNECT (Bento Grid) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                    {[
                        {
                            title: "Rapid Response",
                            desc: "support@eduvatech.com",
                            icon: "📧",
                            color: "border-blue-500/30",
                            action: "mailto:support@eduvatech.com"
                        },
                        {
                            title: "Global Reach",
                            desc: "Available across all regions",
                            icon: "🌍",
                            color: "border-emerald-500/30",
                            action: "#"
                        },
                        {
                            title: "Quick Sync",
                            desc: "+20 100 XXX XXXX",
                            icon: "📱",
                            color: "border-amber-500/30",
                            action: "tel:+201000000000"
                        }
                    ].map((card, i) => (
                        <a
                            key={i}
                            href={card.action}
                            className={`p-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-3xl border ${card.color} hover:bg-white dark:hover:bg-white/5 transition-all duration-500 group transform hover:-translate-y-2 cursor-pointer shadow-2xl`}
                        >
                            <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-500">
                                {card.icon}
                            </div>
                            <h3 className="text-xl font-black mb-2 text-slate-900 dark:text-white">{card.title}</h3>
                            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">{card.desc}</p>
                        </a>
                    ))}
                </div>


            </div>

            <div className="max-w-7xl mx-auto px-4 pb-32">

                {/* SECTION 4: KNOWLEDGE BASE GRID */}
                <div className="mt-16">
                    <div className="text-center mb-16">
                        <h3 className="text-4xl font-black mb-4 text-slate-900 dark:text-white">Quick Guidance</h3>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Instant answers to common questions</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { q: "Account Setup", a: "Sync your dashboard in seconds." },
                            { q: "Study Credits", a: "Learn how the pulse system works." },
                            { q: "Data Privacy", a: "Your security is our core mission." },
                            { q: "Upgrade Paths", a: "Mastery tiers for every level." }
                        ].map((faq, i) => (
                            <div key={i} className="p-6 bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-100 dark:border-white/5 hover:border-brand-200 dark:hover:border-white/20 transition-all cursor-crosshair shadow-sm dark:shadow-none">
                                <div className="mb-4 text-brand-500 dark:text-brand-400">⚡</div>
                                <h4 className="font-black mb-2 text-sm uppercase tracking-wide text-slate-800 dark:text-slate-200">{faq.q}</h4>
                                <p className="text-xs font-medium text-slate-500 leading-relaxed">{faq.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* SECTION 5: FOOTER PRESENCE */}
            <footer className="py-20 bg-slate-100 dark:bg-slate-900/50 border-t border-slate-200 dark:border-white/5 relative overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 flex flex-col items-center">
                    <div className="flex gap-6 mb-12">
                        {['🌐', '𝕏', '📸', '💼'].map((social, i) => (
                            <button key={i} className="w-14 h-14 rounded-2xl bg-white dark:bg-white/5 flex items-center justify-center text-xl hover:bg-brand-500 hover:text-white transition-all duration-300 transform hover:rotate-12 cursor-pointer shadow-sm text-slate-600 dark:text-slate-300">
                                {social}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 w-full max-w-6xl mb-16">
                        {policies.map((link, i) => (
                            <div
                                key={i}
                                onClick={() => setSelectedPolicy(link)}
                                className="flex flex-col items-center text-center group cursor-pointer"
                            >
                                <button className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-brand-400 transition-colors mb-2">
                                    {link.name}
                                </button>
                                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest group-hover:text-slate-500 transition-colors">
                                    {link.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em]">
                        © 2026 EDUVA NEXUS • BUILT FOR THE FUTURE
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default ContactUs;
