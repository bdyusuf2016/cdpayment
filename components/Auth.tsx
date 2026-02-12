
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface AuthProps {
  onLogin: (session: any, url: string, key: string) => void;
  initialConfig: { url: string; key: string };
}

const Auth: React.FC<AuthProps> = ({ onLogin, initialConfig }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Supabase Config State
  const [showConfig, setShowConfig] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState(initialConfig.url || '');
  const [supabaseKey, setSupabaseKey] = useState(initialConfig.key || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialConfig.url || !initialConfig.key) {
      setShowConfig(true);
    }
  }, [initialConfig]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!supabaseUrl || !supabaseKey) {
      setError("Please configure Supabase URL and Key first.");
      setLoading(false);
      setShowConfig(true);
      return;
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      let result;
      if (isLogin) {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      } else {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0], // Default name from email
            }
          }
        });
      }

      if (result.error) {
        throw result.error;
      }

      if (result.data.session) {
        // Save config to local storage for persistence
        localStorage.setItem('supabase_url', supabaseUrl);
        localStorage.setItem('supabase_key', supabaseKey);
        onLogin(result.data.session, supabaseUrl, supabaseKey);
      } else if (!isLogin && result.data.user) {
        setError("Registration successful! Please check your email to verify account.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f172a] p-4 transition-colors duration-500">
      <div className="w-full max-w-md">
        
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mx-auto mb-4">
            <i className="fas fa-cube text-white text-3xl"></i>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">Customs Duty Pro</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-2">Secure Enterprise Access</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl p-8 border border-slate-100 dark:border-slate-700 relative overflow-hidden">
          
          {/* Config Toggle */}
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className="absolute top-6 right-6 text-slate-300 hover:text-blue-500 transition-colors"
          >
            <i className="fas fa-cog"></i>
          </button>

          {showConfig && (
            <div className="mb-6 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2">
               <h3 className="text-xs font-black uppercase text-blue-500 mb-4 flex items-center gap-2">
                 <i className="fas fa-database"></i> Database Configuration
               </h3>
               <div className="space-y-3">
                 <input 
                   type="text" 
                   placeholder="Supabase Project URL" 
                   value={supabaseUrl}
                   onChange={(e) => setSupabaseUrl(e.target.value)}
                   className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:border-blue-500 dark:text-white"
                 />
                 <input 
                   type="password" 
                   placeholder="Supabase Anon Key" 
                   value={supabaseKey}
                   onChange={(e) => setSupabaseKey(e.target.value)}
                   className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:border-blue-500 dark:text-white"
                 />
               </div>
            </div>
          )}

          <h2 className="text-xl font-black text-slate-800 dark:text-white mb-6">
            {isLogin ? 'Sign In' : 'Create Account'}
          </h2>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 flex items-start gap-3">
               <i className="fas fa-exclamation-circle text-red-500 mt-0.5"></i>
               <p className="text-xs font-bold text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Email Address</label>
               <div className="relative">
                 <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                 <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white font-bold text-sm outline-none focus:border-blue-500 transition-all"
                    placeholder="name@company.com"
                 />
               </div>
            </div>
            
            <div className="space-y-1">
               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Password</label>
               <div className="relative">
                 <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                 <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white font-bold text-sm outline-none focus:border-blue-500 transition-all"
                    placeholder="••••••••"
                 />
               </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl uppercase tracking-widest text-xs shadow-xl shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <i className="fas fa-circle-notch animate-spin"></i>}
              {isLogin ? 'Access Dashboard' : 'Register Account'}
            </button>
          </form>

          <div className="mt-8 text-center">
             <button 
               onClick={() => { setIsLogin(!isLogin); setError(null); }}
               className="text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
             >
               {isLogin ? "Don't have an account? Create one" : "Already have an account? Sign In"}
             </button>
          </div>
        </div>
        
        <p className="text-center text-[10px] font-bold text-slate-400 mt-8 uppercase tracking-[0.2em]">
           Protected by Supabase Auth
        </p>
      </div>
    </div>
  );
};

export default Auth;
