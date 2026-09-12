import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import OnboardingClass from './pages/OnboardingClass';
import OnboardingLanguage from './pages/OnboardingLanguage';
import HomeDashboard from './pages/HomeDashboard';
import SubjectChapters from './pages/SubjectChapters';
import ChapterDetail from './pages/ChapterDetail';
import Profile from './pages/Profile';
import Progress from './pages/Progress';
import Library from './pages/Library';
import SubjectLibrary from './pages/SubjectLibrary';
import Learn from './pages/Learn';
import Explain from './pages/Explain';
import Practice from './pages/Practice';
import { ProtectedRoute } from './components/ProtectedRoute';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location}>
        {/* Public Landing & Authentication */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Onboarding Flow */}
        <Route path="/onboarding" element={<Navigate to="/onboarding/class" replace />} />
        <Route path="/onboarding/class" element={<OnboardingClass />} />
        <Route path="/onboarding/language" element={<OnboardingLanguage />} />

        {/* Protected Authenticated Curriculum & Profile Routes */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home/:subject"
          element={
            <ProtectedRoute>
              <SubjectChapters />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home/:subject/:chapter"
          element={
            <ProtectedRoute>
              <ChapterDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <Library />
            </ProtectedRoute>
          }
        />
        <Route
          path="/library/:subjectId"
          element={
            <ProtectedRoute>
              <SubjectLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learn/:conceptId"
          element={
            <ProtectedRoute>
              <Learn />
            </ProtectedRoute>
          }
        />
        <Route
          path="/explain/:conceptId"
          element={
            <ProtectedRoute>
              <Explain />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice/:conceptId"
          element={
            <ProtectedRoute>
              <Practice />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice/:conceptId/:mode"
          element={
            <ProtectedRoute>
              <Practice />
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <Progress />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute requireOnboarding={false}>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Catch-all redirect to /home */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <Router>
      <AnimatedRoutes />
    </Router>
  );
}
