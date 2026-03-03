
import React, { useState, useEffect } from 'react';
import { ParentWallet, UpgradeRecommendation, ProgressSignal } from '../types';
import { getUpgradeRecommendation } from '../services/parentService';
import Card from './ui/Card';
import Button from './ui/Button';

interface ParentWalletProps {
  wallet: ParentWallet;
  recentSignals: ProgressSignal[];
}

const ParentWalletComponent: React.FC<ParentWalletProps> = ({ wallet, recentSignals }) => {
  const [recommendation, setRecommendation] = useState<UpgradeRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Example Quota calculation
  const totalAllocated = wallet.subscriptionTier === 'FREE' ? 50 : 500;
  const percentUsed = Math.round(((totalAllocated - wallet.balanceCredits) / totalAllocated) * 100);

  useEffect(() => {
    const fetchRec = async () => {
        setLoading(true);
        try {
            const res = await getUpgradeRecommendation(wallet, recentSignals);
            setRecommendation(res);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    fetchRec();
  }, [wallet.balanceCredits, recentSignals.length]);

  return (
    <div className="space-y-8 animate-slide-up">
      {/* WALLET HUD */}
      <Card className="bg-slate-900 text-white border-0 shadow-2xl relative overflow-hidden p-10 rounded-[2.5rem]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-600/10 rounded-full blur-[80px] -ml-24 -mb-24"></div>
        
        <div className="relative z-10">
           <div className="flex justify-between items-start mb-10">
              <div>
                 <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">Neural Logistics</span>
                 <h2 className="text-5xl font-black mt-6 tracking-tighter italic">{wallet.balanceCredits} <span className="text-lg opacity-40 non-italic">Cr</span></h2>
              </div>
              <div className="text-right">
                  <span className={`inline-block px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all ${wallet.boostActive ? 'bg-amber-500 border-amber-400 text-white shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-indigo-600 border-indigo-500 text-white'}`}>
                    {wallet.boostActive ? '⚡ BOOST ACTIVE' : wallet.subscriptionTier}
                  </span>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Renews: {new Date(wallet.renewalDate).toLocaleDateString()}</p>
              </div>
           </div>

           <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black uppercase opacity-60 tracking-widest">
                 <span>Bandwidth Consumption</span>
                 <span>{percentUsed}% Load</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5">
                 <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${percentUsed}%` }}></div>
              </div>
           </div>

           <div className="mt-12 flex gap-4">
              <Button className="flex-1 bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest text-xs py-4">Top Up Credits</Button>
              <Button variant="outline" className="flex-1 border-white/20 text-white hover:bg-white/10 font-black uppercase tracking-widest text-xs py-4">Subscription Deck</Button>
           </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* CONSUMPTION ANALYTICS */}
         <Card className="p-8 rounded-[2rem]">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">Consumption Metadata</h4>
            <div className="space-y-8">
               {(wallet.consumption || []).map((c, i) => (
                   <div key={i} className="group">
                       <div className="flex justify-between items-end mb-2">
                           <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{c.feature}</span>
                           <span className="text-xs font-mono font-black text-indigo-600">{c.credits} cr</span>
                       </div>
                       <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-300 dark:bg-slate-600 group-hover:bg-indigo-500 transition-colors" style={{ width: `${(c.credits / totalAllocated) * 100}%` }}></div>
                       </div>
                       <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-tighter">{c.count} individual assets produced</p>
                   </div>
               ))}
            </div>
         </Card>

         {/* AI STRATEGY RECOMMENDATION */}
         <Card className={`p-8 rounded-[2rem] border-2 transition-all duration-500 ${recommendation?.urgency === 'HIGH' ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-900/10' : 'border-indigo-100 dark:border-indigo-900/30'}`}>
            <div className="flex justify-between items-center mb-6">
                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${recommendation?.urgency === 'HIGH' ? 'text-amber-600' : 'text-indigo-600'}`}>
                    AI Financial Strategy
                </h4>
                {recommendation?.urgency === 'HIGH' && <span className="animate-ping w-2 h-2 rounded-full bg-amber-500"></span>}
            </div>
            
            {loading ? (
                <div className="py-20 flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyzing Wallet Health...</p>
                </div>
            ) : recommendation ? (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-tight italic tracking-tighter">"{recommendation.title}"</h3>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed italic opacity-80">{recommendation.description}</p>
                    </div>
                    
                    <div className="bg-white/50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-4">
                        <span className="text-3xl">{recommendation.isBoost ? '🚀' : '💎'}</span>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">Target Selection</p>
                            <p className="text-xs font-bold">{recommendation.isBoost ? 'Temporary Power-up' : 'Permanent Tier Upgrade'}</p>
                        </div>
                    </div>

                    <div className="pt-6">
                        <button className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-xl hover:scale-[1.02] transition-all active:scale-95 ${recommendation.urgency === 'HIGH' ? 'bg-slate-900 text-white' : 'bg-indigo-600 text-white'}`}>
                            {recommendation.cta} →
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-slate-400 italic text-sm text-center py-20">No active financial advisories.</p>
            )}
         </Card>
      </div>

      <div className="p-10 bg-slate-50 dark:bg-slate-900/50 rounded-[3rem] border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
          <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm flex items-center justify-center text-3xl">🛡️</div>
              <div>
                  <p className="text-sm font-black uppercase tracking-tight">Abuse Prevention Protocol</p>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">Velocity checks & Fingerprinting: ACTIVE</p>
              </div>
          </div>
          <button className="px-6 py-3 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-widest border-2 border-indigo-100 hover:bg-indigo-50 transition-all">Audit Consumption Logs</button>
      </div>
    </div>
  );
};

export default ParentWalletComponent;
