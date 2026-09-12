import React, { useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authService } from '../services/api';
import { handleImageFallback } from '../components/CardThemeUtils';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      if (!res.user.onboarding_completed) {
        navigate('/onboarding/class');
      } else {
        navigate('/home');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const res = await authService.googleAuth();
      if (!res.user.onboarding_completed) {
        navigate('/onboarding/class');
      } else {
        navigate('/home');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[#F6F4F0] flex items-center justify-center p-4 sm:p-6 font-sans"
    >
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col md:flex-row w-full max-w-[940px] overflow-hidden"
      >
        {/* Left Side: Image with Appear/Pop Spring Animation */}
        <div className="w-full md:w-1/2 bg-[#F3F6F8] p-4 sm:p-6 md:p-7 flex items-center justify-center overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.65, y: 30 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              y: [-6, 6, -6] 
            }}
            transition={{ 
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { type: "spring", stiffness: 260, damping: 16, mass: 0.7 },
              y: { repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.4 }
            }}
            className="w-full flex justify-center items-center"
          >
            <img 
              src="/login.png" 
              alt="Login illustration" 
              className="w-full max-w-[460px] sm:max-w-[500px] md:max-w-[540px] max-h-[420px] md:max-h-[440px] object-contain drop-shadow-sm"
              onError={(e) => handleImageFallback(e)}
            />
          </motion.div>
        </div>

        {/* Right Side: Form (Compact layout) */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-10 flex flex-col justify-center items-center">
          <div className="w-full max-w-[350px] flex flex-col items-center">
            <div className="mb-4 flex justify-center w-full">
              <Logo size="small" />
            </div>
            
            <h1 className="text-xl md:text-2xl font-bold text-[#1a1a1a] mb-5 text-center tracking-tight">
              Welcome Back!
            </h1>

            {/* Continue with Google Button with #6B1302 background */}
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={loading}
              onClick={handleGoogleAuth}
              className="w-full flex items-center justify-center gap-3 bg-[#6B1302] text-white font-medium py-2.5 rounded-lg hover:bg-[#580f01] transition-all mb-4 shadow-sm shadow-[#6B1302]/20 disabled:opacity-70 cursor-pointer"
            >
              <div className="w-5 h-5 bg-white rounded-full p-0.5 flex items-center justify-center shrink-0">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-3.5 h-3.5" onError={(e) => { e.currentTarget.src = 'https://placehold.co/400x400?text=G'; }} />
              </div>
              <span className="text-sm font-semibold">Continue with Google</span>
            </motion.button>

            <div className="w-full flex items-center gap-3 mb-4">
              <div className="flex-1 h-[1px] bg-gray-200"></div>
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">or</span>
              <div className="flex-1 h-[1px] bg-gray-200"></div>
            </div>

            <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Email</label>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email" 
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2 text-sm outline-none focus:border-[#6B1302] focus:ring-1 focus:ring-[#6B1302] transition-all bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" 
                    className="w-full border border-gray-300 rounded-lg pl-3.5 pr-10 py-2 text-sm outline-none focus:border-[#6B1302] focus:ring-1 focus:ring-[#6B1302] transition-all bg-white"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit" 
                className="w-full bg-[#6B1302] text-white font-medium py-2.5 rounded-lg hover:bg-[#580f01] transition-colors mt-1.5 shadow-sm text-sm"
              >
                Login
              </motion.button>
            </form>

            <p className="mt-4 text-xs sm:text-sm text-gray-500">
              Don't have an account? <Link to="/signup" className="text-[#6B1302] font-semibold hover:underline">Create Account</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
