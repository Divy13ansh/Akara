import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppNavbar } from '../components/AppNavbar';
import { authService, UserProfile } from '../services/api';
import { languageDemandService } from '../services/languageDemandService';
import {
  X,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Check,
  Camera,
  Loader2,
} from 'lucide-react';

const SUPPORTED_LANGUAGES = [
  { code: 'hi', native: 'हिन्दी', name: 'Hindi' },
  { code: 'en', native: 'English', name: 'English' },
  { code: 'mr', native: 'मराठी', name: 'Marathi' },
  { code: 'bn', native: 'বাংলা', name: 'Bengali' },
  { code: 'te', native: 'తెలుగు', name: 'Telugu' },
  { code: 'ta', native: 'தமிழ்', name: 'Tamil' },
  { code: 'gu', native: 'ગુજરાતી', name: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ', name: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', name: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', name: 'Punjabi' },
  { code: 'ur', native: 'اردو', name: 'Urdu' },
  { code: 'or', native: 'ଓଡ଼ିଆ', name: 'Odia' },
];

const ROW1_CLASSES = [6, 7, 8];
const ROW2_CLASSES = [9, 10, 11];
const ROW3_CLASSES = [12];

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [loading, setLoading] = useState(true);

  // Class selection modal state
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);

  // Language state & custom dropdown
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // Request language state
  const [requestInput, setRequestInput] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestStatusMsg, setRequestStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasUserRequestedCurrent, setHasUserRequestedCurrent] = useState(false);

  // Profile photo upload state (PUT /api/users/me/profile/photo → R2)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingPhoto) return;
    setPhotoError(null);
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo must be under 5 MB.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const updated = await authService.uploadPhoto(file);
      setUser(updated);
    } catch {
      setPhotoError('Upload failed. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        // FRONTEND BACKEND HOOK (page-level):
        // This screen loads the authenticated student profile via GET /api/users/me/profile.
        // It then writes profile changes through PATCH /api/users/me/profile and submits language requests
        // via POST /api/languages/request in the handlers below.
        const profile = await authService.getProfile();
        setUser(profile);
      } catch (err) {
        console.error('Failed to load profile data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Handle clicking outside custom dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        langDropdownRef.current &&
        !langDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLangDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Check if current input was already requested
  useEffect(() => {
    const trimmed = requestInput.trim();
    if (!trimmed) {
      setHasUserRequestedCurrent(false);
      return;
    }
    const hasRequested = languageDemandService.hasUserRequested(trimmed);
    setHasUserRequestedCurrent(hasRequested);
  }, [requestInput]);

  // Handle Changing Default Language via custom dropdown
  const handleSelectLanguage = async (code: string) => {
    setIsLangDropdownOpen(false);
    setSavingLanguage(true);
    try {
      const updated = await authService.updateProfile({ default_language: code });
      setUser(updated);
    } catch (err) {
      console.error('Failed to update language:', err);
    } finally {
      setSavingLanguage(false);
    }
  };

  // Handle Changing Academic Class from modal
  const handleSelectClass = async (classNum: number) => {
    try {
      const updated = await authService.updateProfile({ class: classNum });
      setUser(updated);
      setIsClassModalOpen(false);
    } catch (err) {
      console.error('Failed to update class:', err);
    }
  };

  // Handle Submitting Language Request
  const handleSubmitLanguageRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = requestInput.trim();
    if (!trimmed) return;

    setSubmittingRequest(true);
    setRequestStatusMsg(null);

    try {
      const result = await languageDemandService.requestLanguage(trimmed);
      if (result.success) {
        setRequestStatusMsg({
          type: 'success',
          text: `Thank you! We've registered your request for ${trimmed}.`,
        });
        setRequestInput('');
        setHasUserRequestedCurrent(true);
      } else {
        setRequestStatusMsg({
          type: 'error',
          text: result.message || 'You have already requested this language.',
        });
      }
    } catch {
      setRequestStatusMsg({
        type: 'error',
        text: 'Unable to register request right now. Please try again later.',
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Sign out handler
  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === (user?.default_language || 'hi')) ||
    SUPPORTED_LANGUAGES[0];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1a1a1a] flex flex-col font-sans antialiased">
      <AppNavbar user={user} />

      {/* Margins matched exactly with HomeDashboard (px-8 md:px-12 max-w-[1520px]) */}
      <main className="flex-1 w-full px-8 md:px-12 py-6 sm:py-8 pb-24 md:pb-12 max-w-[1520px] mx-auto">
        {/* Header Title */}
        <header className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight mb-2">
            Student Profile &amp; Settings
          </h1>
          <p className="text-stone-600 text-sm sm:text-base font-normal max-w-2xl leading-relaxed">
            Manage your academic grade, learning language, and preferences.
          </p>
        </header>

        {loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-44 bg-white/70 rounded-3xl border border-stone-200/60" />
            <div className="h-44 bg-white/70 rounded-3xl border border-stone-200/60" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Account Info Card */}
            <section
              id="profile-account-section"
              aria-labelledby="heading-account-section"
              className="bg-white rounded-3xl border border-stone-200/80 p-6 sm:p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)]"
            >
              {/* User Identity: Name and Email */}
              <div className="flex items-center gap-4 sm:gap-5 pb-6">
                <div className="shrink-0 relative">
                  {user?.profile_photo ? (
                    <img
                      src={user.profile_photo}
                      alt={user?.name || 'User Profile'}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-stone-200/80 shadow-xs"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = 'https://placehold.co/100x100?text=' + (user?.name?.[0] || 'U');
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-2xl sm:text-3xl shadow-xs">
                      {(user?.name?.trim() ? user.name.trim()[0] : 'P').toUpperCase()}
                    </div>
                  )}
                  {/* Photo upload: camera badge over the avatar */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelected}
                    aria-label="Upload profile photo"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    title={user?.profile_photo ? 'Change profile photo' : 'Add profile photo'}
                    aria-label={user?.profile_photo ? 'Change profile photo' : 'Add profile photo'}
                    className="absolute -bottom-1 -right-1 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#6d0e00] hover:bg-[#540b00] disabled:opacity-60 text-white flex items-center justify-center shadow-md border-2 border-white transition-all active:scale-95 cursor-pointer"
                  >
                    {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  </button>
                </div>

                <div>
                  <h2
                    id="heading-account-section"
                    className="text-xl sm:text-2xl font-bold text-[#1a1a1a] tracking-tight"
                  >
                    {user?.name || 'Poorvika'}
                  </h2>
                  <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
                    {user?.email || 'poorvika@akara.edu'}
                  </p>
                  {photoError && (
                    <p role="alert" className="text-xs font-medium text-red-700 mt-1">{photoError}</p>
                  )}
                </div>
              </div>

              {/* Settings Sub-Row: Class & Default Language */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Current Academic Class */}
                <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-stone-200/70 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      Current Academic Class
                    </div>
                    <div className="text-base sm:text-xl font-bold text-gray-900 mt-0.5">
                      Class {user?.class ?? 10}
                    </div>
                  </div>

                  {/* Bigger, tactile Change button */}
                  <button
                    type="button"
                    id="btn-change-class"
                    onClick={() => setIsClassModalOpen(true)}
                    className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm active:scale-95 shadow-xs transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
                  >
                    Change
                  </button>
                </div>

                {/* 2. Default Learning Language with custom rounded dropdown */}
                <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-stone-200/70 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      Default Learning Language
                    </div>
                    <div className="text-base sm:text-xl font-bold text-gray-900 mt-0.5 truncate">
                      {currentLangObj.native} ({currentLangObj.name})
                    </div>
                  </div>

                  {/* Custom Language Dropdown Selector */}
                  <div className="relative shrink-0" ref={langDropdownRef}>
                    <button
                      type="button"
                      id="btn-profile-language-dropdown"
                      aria-haspopup="listbox"
                      aria-expanded={isLangDropdownOpen}
                      disabled={savingLanguage}
                      onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                      className="inline-flex items-center gap-2 bg-white hover:bg-stone-50 border border-stone-300/90 text-stone-900 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-full shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span>{currentLangObj.native}</span>
                      <ChevronDown
                        size={15}
                        className={`text-stone-600 transition-transform duration-200 ${
                          isLangDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Pop-open dropdown menu with round edges and matching UI style */}
                    {isLangDropdownOpen && (
                      <div
                        role="listbox"
                        className="absolute right-0 mt-2 w-56 sm:w-64 bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-xl p-2 z-50 max-h-72 overflow-y-auto animate-fadeIn"
                      >
                        <div className="px-3 py-1.5 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                          Select Language
                        </div>
                        {SUPPORTED_LANGUAGES.map((lang) => {
                          const isSelected = (user?.default_language || 'hi') === lang.code;
                          return (
                            <button
                              key={lang.code}
                              role="option"
                              aria-selected={isSelected}
                              type="button"
                              onClick={() => handleSelectLanguage(lang.code)}
                              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-stone-900 text-white font-bold'
                                  : 'text-stone-800 hover:bg-[#FAF7F2] font-medium'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{lang.native}</span>
                                <span
                                  className={`text-[11px] ${
                                    isSelected ? 'text-stone-300' : 'text-stone-500'
                                  }`}
                                >
                                  ({lang.name})
                                </span>
                              </div>
                              {isSelected && <Check size={14} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Request a Regional Language with completely round containers and shifted to extreme right */}
            <section
              id="profile-request-language-section"
              aria-labelledby="heading-request-language"
              className="bg-white rounded-3xl border border-stone-200/80 p-6 sm:p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)]"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Left: Explanatory text */}
                <div className="max-w-xl">
                  <h2
                    id="heading-request-language"
                    className="text-lg sm:text-xl font-bold text-[#1a1a1a] tracking-tight mb-2"
                  >
                    Request a Regional Language
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    Don&apos;t see your mother tongue? Submit a language request. We compile student demand signals to prioritize batch generation for regional translations.
                  </p>
                </div>

                {/* Right / Extreme Right: Round input container and round button */}
                <div className="w-full lg:max-w-xl flex flex-col items-stretch lg:items-end">
                  <form onSubmit={handleSubmitLanguageRequest} className="w-full space-y-3">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 justify-end">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          id="input-request-language"
                          value={requestInput}
                          onChange={(e) => setRequestInput(e.target.value)}
                          placeholder="Enter language name (e.g. Maithili, Odia, Santali)..."
                          className="w-full px-5 py-3 rounded-full text-xs sm:text-sm bg-[#FAF7F2] border border-stone-200/90 focus:outline-hidden focus:border-stone-900 focus:bg-white text-stone-900 placeholder:text-stone-400 transition-colors shadow-2xs"
                        />
                      </div>
                      <button
                        type="submit"
                        id="btn-submit-language-request"
                        disabled={!requestInput.trim() || submittingRequest || hasUserRequestedCurrent}
                        className="px-6 py-3 rounded-full bg-stone-900 text-white text-xs sm:text-sm font-bold hover:bg-stone-800 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center shadow-2xs shrink-0 cursor-pointer whitespace-nowrap"
                      >
                        <span>
                          {submittingRequest
                            ? 'Submitting...'
                            : hasUserRequestedCurrent
                            ? 'Already Requested'
                            : 'Request Language'}
                        </span>
                      </button>
                    </div>

                    {/* Feedback Message */}
                    {requestStatusMsg && (
                      <div
                        className={`text-xs px-4 py-2.5 rounded-full border flex items-center gap-2 ${
                          requestStatusMsg.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-stone-100 border-stone-200 text-stone-800'
                        }`}
                      >
                        {requestStatusMsg.type === 'success' ? (
                          <CheckCircle2 size={15} className="shrink-0" />
                        ) : (
                          <AlertCircle size={15} className="shrink-0" />
                        )}
                        <span>{requestStatusMsg.text}</span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </section>

            {/* Sign Out Section (Clean, without separating lines or email text) */}
            <div className="flex justify-end pt-2 pb-2">
              <button
                type="button"
                id="btn-profile-signout"
                onClick={handleLogout}
                className="inline-flex items-center justify-center px-6 py-3 rounded-full text-xs sm:text-sm font-bold text-stone-800 bg-stone-100 hover:bg-red-600 hover:text-white hover:border-red-600 active:scale-95 transition-all border border-stone-300/80 shadow-2xs cursor-pointer"
              >
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Class Selection Popup Modal with Circles - Title: Change Your Class */}
      {isClassModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative animate-fadeIn">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsClassModalOpen(false)}
              aria-label="Close dialog"
              className="absolute top-5 right-5 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="text-center mb-6">
              <h3 id="class-modal-title" className="text-xl sm:text-2xl font-bold text-[#1a1a1a]">
                Change Your Class
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 mt-1">
                Choose your academic grade to update curriculum
              </p>
            </div>

            {/* Circles Grid (Rows 1, 2, 3 as on sign-up) */}
            <div className="flex flex-col items-center gap-3.5 my-4">
              {/* Row 1: 6, 7, 8 */}
              <div className="flex items-center justify-center gap-4">
                {ROW1_CLASSES.map((cls) => {
                  const isCurrent = (user?.class ?? 10) === cls;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => handleSelectClass(cls)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-base transition-all duration-200 cursor-pointer ${
                        isCurrent
                          ? 'bg-stone-900 text-white shadow-md scale-105 ring-2 ring-stone-900/20'
                          : 'bg-[#F9F8F6] border border-stone-200 text-stone-800 hover:bg-stone-900 hover:text-white hover:border-stone-900 hover:scale-105'
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>

              {/* Row 2: 9, 10, 11 */}
              <div className="flex items-center justify-center gap-4">
                {ROW2_CLASSES.map((cls) => {
                  const isCurrent = (user?.class ?? 10) === cls;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => handleSelectClass(cls)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-base transition-all duration-200 cursor-pointer ${
                        isCurrent
                          ? 'bg-stone-900 text-white shadow-md scale-105 ring-2 ring-stone-900/20'
                          : 'bg-[#F9F8F6] border border-stone-200 text-stone-800 hover:bg-stone-900 hover:text-white hover:border-stone-900 hover:scale-105'
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>

              {/* Row 3: 12 */}
              <div className="flex items-center justify-center gap-4">
                {ROW3_CLASSES.map((cls) => {
                  const isCurrent = (user?.class ?? 10) === cls;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => handleSelectClass(cls)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-base transition-all duration-200 cursor-pointer ${
                        isCurrent
                          ? 'bg-stone-900 text-white shadow-md scale-105 ring-2 ring-stone-900/20'
                          : 'bg-[#F9F8F6] border border-stone-200 text-stone-800 hover:bg-stone-900 hover:text-white hover:border-stone-900 hover:scale-105'
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
