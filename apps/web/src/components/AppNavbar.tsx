import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { authService, UserProfile } from '../services/api';
import { Home as HomeIcon, Library, TrendingUp, User } from 'lucide-react';

interface AppNavbarProps {
  user?: UserProfile | null;
  activeSubject?: string;
  activeChapter?: string;
}

/**
 * Avatar used across the app chrome: shows the user's profile photo
 * (uploaded or the Google account picture) whenever one exists, falling
 * back to the first-letter circle if there is no photo or it fails to load.
 */
function UserAvatar({ user, sizeClass }: { user: UserProfile | null; sizeClass: string }) {
  const [failed, setFailed] = useState(false);
  const photo = user?.profile_photo || null;
  const initial = (user?.name?.trim() ? user.name.trim()[0] : 'A').toUpperCase();

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={user?.name || 'Profile'}
        onError={() => setFailed(true)}
        className={`${sizeClass} rounded-full object-cover shadow-sm select-none`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={`${sizeClass} rounded-full bg-[#6b1302] text-white flex items-center justify-center font-bold shadow-sm select-none`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function AppNavbar({ user: propUser }: AppNavbarProps) {
  const location = useLocation();
  const user = propUser || authService.getCurrentUser();

  const isHomeActive = location.pathname === '/home' || location.pathname.startsWith('/home/');
  const isLibraryActive = location.pathname === '/library';
  const isProgressActive = location.pathname === '/progress';
  const isProfileActive = location.pathname === '/profile';

  return (
    <>
      {/* Desktop Navigation Bar - Exactly matching the main page layout, padding, and positioning */}
      <nav className="hidden md:grid w-full px-8 md:px-12 py-4 md:py-6 grid-cols-3 items-center z-10 relative">
        {/* Left: Small Logo */}
        <div className="justify-self-start flex items-center">
          <Link 
            to="/home" 
            id="nav-logo-link"
            className="flex items-center transition-transform hover:opacity-90 active:scale-95"
            aria-label="Akara Home"
          >
            <Logo size="small" />
          </Link>
        </div>

        {/* Center: Navigation Links */}
        <div className="justify-self-center hidden md:flex items-center gap-10 lg:gap-14">
          <Link 
            to="/home" 
            className={`text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase ${
              isHomeActive ? 'underline underline-offset-8 decoration-2' : ''
            }`}
          >
            Home
          </Link>
          <Link 
            to="/library" 
            id="nav-library-link"
            className={`text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase ${
              isLibraryActive ? 'underline underline-offset-8 decoration-2' : ''
            }`}
          >
            Library
          </Link>
          <Link 
            to="/progress" 
            id="nav-progress-link"
            className={`text-sm lg:text-base font-medium tracking-[0.15em] text-[#1a1a1a] hover:underline underline-offset-8 decoration-2 transition-all uppercase ${
              isProgressActive ? 'underline underline-offset-8 decoration-2' : ''
            }`}
          >
            Progress
          </Link>
        </div>

        {/* Right: User Initial Circle on EXTREME RIGHT */}
        <div className="justify-self-end flex items-center gap-4">
          <Link
            to="/profile"
            id="nav-profile-circle"
            className="shrink-0 rounded-full hover:ring-2 hover:ring-[#6b1302]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            aria-label="User Profile"
            title={user?.name || 'My Profile'}
          >
            <UserAvatar user={user} sizeClass="w-10 h-10 text-base" />
          </Link>
        </div>
      </nav>

      {/* Mobile Top Bar (Small Logo on Left, User Profile Circle on Right) */}
      <div className="md:hidden w-full px-6 py-4 flex items-center justify-between z-10 relative">
        <Link 
          to="/home" 
          className="flex items-center transition-transform hover:opacity-90 active:scale-95"
          aria-label="Akara Home"
        >
          <Logo size="small" />
        </Link>
        <Link
          to="/profile"
          className="shrink-0 rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer"
          aria-label="User Profile"
          title={user?.name || 'My Profile'}
        >
          <UserAvatar user={user} sizeClass="w-9 h-9 text-sm" />
        </Link>
      </div>

      {/* Mobile Bottom Navigation - Floating Pill matching main page */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] bg-[#F6F4EE] rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border-[2.5px] border-[#6B1302] z-50 px-7 py-2 sm:py-2.5 flex justify-between items-center">
        <Link to="/home" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5" aria-label="Home">
          <HomeIcon size={22} strokeWidth={2.2} />
          <div className={`w-1 h-1 bg-[#1a1a1a] rounded-full ${isHomeActive ? 'opacity-100' : 'opacity-0'}`}></div>
        </Link>
        <Link to="/library" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5" aria-label="Library">
          <Library size={22} strokeWidth={2.2} />
          <div className={`w-1 h-1 bg-[#1a1a1a] rounded-full ${isLibraryActive ? 'opacity-100' : 'opacity-0'}`}></div>
        </Link>
        <Link to="/progress" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5" aria-label="Progress">
          <TrendingUp size={22} strokeWidth={2.2} />
          <div className={`w-1 h-1 bg-[#1a1a1a] rounded-full ${isProgressActive ? 'opacity-100' : 'opacity-0'}`}></div>
        </Link>
        <Link to="/profile" className="flex flex-col items-center justify-center gap-1 text-[#1a1a1a] py-0.5" aria-label="Profile">
          <User size={22} strokeWidth={2.2} />
          <div className={`w-1 h-1 bg-[#1a1a1a] rounded-full ${isProfileActive ? 'opacity-100' : 'opacity-0'}`}></div>
        </Link>
      </div>
    </>
  );
}
