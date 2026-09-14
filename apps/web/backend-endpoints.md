# Backend API Contract & Endpoints Specification

> **READ ME FIRST (2026-09-14):** every endpoint in this document is now
> **implemented and live** (see `docs/architecture/backend-api-mapping.md` for the
> field-by-field audit). Statuses below still say "MOCKED" from when only the
> frontend existed — ignore those, they describe the *frontend service* files,
> not the backend. Real concept IDs are DB-canonical (e.g. `sci10-chemical-
> reactions`, `phy11-inertia`) — NOT `c1`/`cr-01`. New endpoints not in this
> doc: `PUT /api/users/me/profile/photo`, `POST /api/concepts/:id/doubts`,
> `POST /api/concepts/:id/mark-mastered`, `/media` now returns `quiz_status`
> + `flashcards[]`. Language params are optional everywhere (profile default
> applies). See `docs/archive/pending.md` for the wiring guide.

This document serves as the formal frontend-to-backend API contract for backend engineers.
Whenever a frontend feature requires backend data, authentication, database persistence, progress tracking, content generation, or language requests, this document is updated.

## Frontend Page-to-Endpoint Mapping (Exact Call Sites)

The sections below are the exact frontend pages and UI sections that should trigger each backend call. This is the clearest route-to-endpoint map for implementation and handoff.

- `/login`
  - `POST /api/auth/login` — Login form submit action on the login screen.
  - `POST /api/auth/google` — Continue with Google button on the login screen.

- `/signup`
  - `POST /api/auth/signup` — Create Account form submit action on the signup screen.
  - `POST /api/auth/google` — Continue with Google button on the signup screen.

- `/onboarding/class` and `/onboarding/language`
  - `PATCH /api/users/me/profile` — Onboarding selection save for class and default language.

- `/home`
  - `GET /api/users/me/profile` — App load / persisted auth state, used to read the current user profile, class, and default language.
  - `GET /api/curriculum/subjects?class={class}` — Subject cards section in the main curriculum dashboard.

- `/home/:subject`
  - `GET /api/curriculum/subjects/:subjectId/chapters` — The subject chapter list section that renders chapter cards and progress bars.

- `/home/:subject/:chapter`
  - `GET /api/curriculum/subjects/:subjectId/chapters/:chapterId` — Chapter detail load for the constellation learning path.
  - `GET /api/curriculum/subjects/:subjectId/chapters` — Optional chapter list refresh if the subject page is revisited.

- `/library`
  - `GET /api/library/summary` — Header counters and repository-wide content summary.
  - `GET /api/library/concepts` — Search and subject filter logic for the library browsing section.
  - `GET /api/library/hierarchy` — Subject/domain grouping for initial library view and category expansion.

- `/library/:subjectId`
  - `GET /api/library/hierarchy` — Subject-specific library section with chapter filters, language filters, and concept cards.
  - `GET /api/curriculum/subjects/:subjectId/chapters` — Chapter dropdown list and chapter metadata.

- `/progress`
  - `GET /api/progress/summary` — Summary KPI cards and top-level metrics section.
  - `GET /api/progress/learning-map` — The touched concepts grouping used by the "Your Progress" and revisit sections.
  - `GET /api/diagnostics/misconceptions` — The weak concepts / worth another look section.
  - `POST /api/diagnostics/:diagnosticId/resolve` — When a misconception is resolved after re-practice.

- `/profile`
  - `GET /api/users/me/profile` — Profile page load for name, email, class, and language.
  - `PATCH /api/users/me/profile` — Class change and default language change actions.
  - `GET /api/users/me/interests` — Interests section load.
  - `PUT /api/users/me/interests` — Add/remove interests chips.
  - `GET /api/languages/demand` — Live demand board in the language request section.
  - `POST /api/languages/request` — Submit a new requested language.
  - `GET /api/users/me/preferences` and `PATCH /api/users/me/preferences` — Data Saver toggle in preferences.
  - `GET /api/users/me/offline-chapters` and `DELETE /api/users/me/offline-chapters/:id` — Offline chapters section.

- `/learn/:conceptId`
  - `GET /api/concepts/:conceptId/generation-status?lang={language}` — Video loading state and generation pipeline status.
  - `GET /api/concepts/:conceptId/media` — Full learning bundle for video, script, and side chat content.

- `/explain/:conceptId`
  - `GET /api/concepts/:conceptId/media` — Load concept data for the teaching/explanation stage.
  - `POST /api/concepts/:conceptId/evaluate-explanation` — Submit the student's explanation for Feynman evaluation.

- `/practice/:conceptId`
  - `GET /api/concepts/:conceptId/media` — Shared concept bundle used by the Listen, Concept Card, Mind Map, and Quiz modes.

---

## 1. Authentication Endpoints

### 1.1 POST `/api/auth/login`

- **Purpose**: Authenticate an existing user via email and password credentials.
- **Authentication Required**: No (Public endpoint)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/login`
  - Action: Form submission on the "Login" button

#### Request Body

```json
{
  "email": "user@example.com",
  "password": "user_secure_password"
}
```

#### Expected Response (200 OK)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr_9872341",
    "name": "Jane Doe",
    "email": "user@example.com",
    "profile_photo": "https://example.com/avatar.jpg",
    "class": 10,
    "default_language": "hi",
    "onboarding_completed": true
  }
}
```

#### Error Responses

- `400 Bad Request`: Missing email or password format invalid.
- `401 Unauthorized`: Invalid email or password credentials.

#### Database Fields Affected

- `users.last_login_at` (updated timestamp)
- `sessions` / `refresh_tokens` (new token record created)

---

### 1.2 POST `/api/auth/signup`

- **Purpose**: Register a new user account with name, email, and password.
- **Authentication Required**: No (Public endpoint)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/signup`
  - Action: Form submission on the "Create Account" button

#### Request Body

```json
{
  "name": "Alex Smith",
  "email": "alex@example.com",
  "password": "user_secure_password"
}
```

#### Expected Response (201 Created)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr_1029384",
    "name": "Alex Smith",
    "email": "alex@example.com",
    "profile_photo": null,
    "class": null,
    "default_language": null,
    "onboarding_completed": false
  }
}
```

#### Error Responses

- `400 Bad Request`: Validation failure (e.g. invalid email format, password too short).
- `409 Conflict`: User with this email already exists.

#### Database Fields Affected

- `users.id` (primary key generated)
- `users.name`
- `users.email`
- `users.password_hash`
- `users.onboarding_completed` (default: `false`)
- `users.created_at`
- `users.updated_at`

---

### 1.3 GET/POST `/api/auth/google`

- **Purpose**: Unified Google OAuth 2.0 authentication flow used by BOTH `/login` and `/signup`. Handles both existing user sign-in and new user registration automatically.
- **Authentication Required**: Google OAuth authorization token/code
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/login` and `/signup`
  - Action: Clicking "Continue with Google" button

#### Behavior & Requirements

1. The backend handles the Google OAuth exchange (or receives the client-side Google credential/ID token).
2. Backend extracts Google-provided `name`, `email`, `profile_photo` (picture), and `google_id` (`sub`).
3. **If Google account already exists in DB**: Authenticate/log in the user, update last login, and return profile.
4. **If Google account does not exist**: Automatically create the new user account using Google's name, email, and picture.
5. Returns session/token and user data with `onboarding_completed` flag so the frontend can route immediately to onboarding (if `false`) or dashboard (if `true`).
6. **Important Constraint**: The frontend never prompts the user to enter their name, email, or photo when authenticating via Google.

#### Request Body (POST method with ID token)

```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
  "provider": "google"
}
```

#### Expected Response (200 OK)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr_google_45678",
    "name": "Alex Johnson",
    "email": "alex.johnson@gmail.com",
    "profile_photo": "https://lh3.googleusercontent.com/a/...",
    "class": null,
    "default_language": null,
    "onboarding_completed": false
  }
}
```

#### Error Responses

- `400 Bad Request`: Invalid or expired Google OAuth credential.
- `502 Bad Gateway`: Failure connecting to Google OAuth provider.

#### Database Fields Affected

- `users.id`
- `users.google_id`
- `users.name` (pre-filled from Google profile)
- `users.email` (pre-filled from Google profile)
- `users.profile_photo` (pre-filled from Google profile)
- `users.onboarding_completed` (set to `false` for new accounts)
- `users.last_login_at`

---

## 2. Onboarding & User Profile Endpoints

After authentication, users who have not completed onboarding (`onboarding_completed: false`) must choose:

1. **Class**: `6`, `7`, `8`, `9`, `10`, `11`, or `12`
2. **Default Language**: e.g., `"hi"` (Hindi), `"en"` (English), etc.

These values are required in the database because the backend will use them to tailor curriculum subjects, content language, lesson recommendations, and future learning tracking.

---

### 2.1 GET `/api/users/me/profile`

- **Purpose**: Fetch current authenticated user's profile and onboarding completion status.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: App initialization, `/profile`, Onboarding gate check
  - Action: Determining if user needs redirection to `/onboarding` or `/`

#### Request Headers

```http
Authorization: Bearer <token>
```

#### Expected Response (200 OK)

```json
{
  "id": "usr_9872341",
  "name": "Jane Doe",
  "email": "user@example.com",
  "profile_photo": "https://example.com/avatar.jpg",
  "class": 10,
  "default_language": "hi",
  "onboarding_completed": true,
  "created_at": "2026-09-11T10:00:00.000Z",
  "updated_at": "2026-09-11T12:00:00.000Z"
}
```

#### Error Responses

- `401 Unauthorized`: Token missing, invalid, or expired.
- `404 Not Found`: User account no longer exists.

#### Database Fields Read

- `users.id`
- `users.name`
- `users.email`
- `users.profile_photo`
- `users.class`
- `users.default_language`
- `users.onboarding_completed`

---

### 2.2 PATCH `/api/users/me/profile`

- **Purpose**: Save/update onboarding selections (Class and Default Language) or editable profile details. When both `class` and `default_language` are provided, `onboarding_completed` must be set to `true`.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/onboarding/class`, `/onboarding/language`, `/profile`
  - Action: Onboarding form submission (selecting class and language) or profile settings update

#### Request Headers

```http
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

```json
{
  "class": 10,
  "default_language": "hi"
}
```

_(Optionally accepts `name` or `profile_photo` when updated from profile screen)_

#### Expected Response (200 OK)

```json
{
  "id": "usr_9872341",
  "name": "Jane Doe",
  "email": "user@example.com",
  "profile_photo": "https://example.com/avatar.jpg",
  "class": 10,
  "default_language": "hi",
  "onboarding_completed": true,
  "updated_at": "2026-09-11T12:30:00.000Z"
}
```

#### Business Logic & Rules

- Valid `class` values: `6`, `7`, `8`, `9`, `10`, `11`, `12`.
- Valid `default_language` values: ISO language codes (e.g. `"hi"`, `"en"`).
- If both `class` and `default_language` are present and valid, the backend automatically transitions `onboarding_completed` from `false` to `true`.

#### Database Fields Affected

- `users.class`
- `users.default_language`
- `users.onboarding_completed` (computed to `true` when required values exist)
- `users.updated_at`

---

## 3. Curriculum & Concept Mastery Endpoints

These endpoints power the authenticated `/home` dashboard and `/home/:subject` chapter exploration. They ensure that curriculum content matches the authenticated user's registered class and tracks concept mastery.

---

### 3.1 GET `/api/users/me/profile`

- **Purpose**: Fetch the authenticated user's current profile, including their academic class and default language.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Simulated in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/home`, `/home/:subject`, `/profile`
  - Action: Page load to determine current student standard and display user initial in persistent navbar
- **Request / Parameters**:
  - Headers: `Authorization: Bearer <token>`
- **Expected Response (200 OK)**:

```json
{
  "id": "usr_9872341",
  "name": "Poorvika",
  "email": "student@akara.edu",
  "profile_photo": null,
  "class": 10,
  "default_language": "hi",
  "onboarding_completed": true,
  "created_at": "2026-09-11T10:00:00.000Z",
  "updated_at": "2026-09-11T12:00:00.000Z"
}
```

- **DB / Data Required**:
  - `users.id`, `users.name`, `users.email`, `users.class`, `users.default_language`, `users.onboarding_completed`
- **Error Responses**:
  - `401 Unauthorized`: Missing or expired token.

---

### 3.2 GET `/api/curriculum/subjects?class={class}`

- **Purpose**: Fetch subjects appropriate to the user's class standard.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Simulated in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/home` (Subject Picker dashboard)
  - Action: On `/home` load, displays subject cards tailored to student's class
- **Request / Parameters**:
  - Query Parameter: `class` (integer: `6`, `7`, `8`, `9`, `10`, `11`, or `12`). If omitted, defaults to authenticated user's class.
  - Headers: `Authorization: Bearer <token>`
- **Business Logic & Rules**:
  - **Classes 6–10**: Returns **Science** and **Maths**.
  - **Classes 11–12**: Returns **Physics**, **Chemistry**, **Biology**, and **Maths**.
  - **Strict Rule**: Science must **NOT** be returned for classes 11–12.
- **Expected Response (200 OK)**:

```json
{
  "class": 10,
  "subjects": [
    {
      "id": "science",
      "name": "Science",
      "code": "SCI",
      "description": "Physics, Chemistry & Biology principles from NCERT",
      "total_chapters": 12,
      "total_concepts": 84,
      "mastered_concepts": 57
    },
    {
      "id": "maths",
      "name": "Maths",
      "code": "MATH",
      "description": "Algebra, Geometry, Trigonometry, Statistics & Number Systems",
      "total_chapters": 14,
      "total_concepts": 81,
      "mastered_concepts": 54
    }
  ]
}
```

- **DB / Data Required**:
  - `subjects` table filtered by `class_grade`
  - Aggregated count of `chapters` and concept mastery from `user_concept_mastery` table.

---

### 3.3 GET `/api/curriculum/subjects/:subjectId/chapters`

- **Purpose**: Fetch vertical list of chapters for a selected subject, including student's concept mastery progress.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Simulated in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/home/:subject`
  - Action: On subject selection, renders vertical list of chapter rows with small progress rings and concept counters (e.g. `6/8`)
- **Request / Parameters**:
  - Path Parameter: `:subjectId` (`string`, e.g., `"science"`, `"maths"`, `"physics"`)
  - Query Parameter: `class` (`integer`, optional, e.g. `10`)
  - Headers: `Authorization: Bearer <token>`
- **Expected Response (200 OK)**:

```json
{
  "subject_id": "science",
  "subject_name": "Science",
  "class": 10,
  "chapters": [
    {
      "id": "chemical-reactions",
      "subject_id": "science",
      "chapter_number": 1,
      "name": "Chemical Reactions and Equations",
      "mastered_concepts": 6,
      "total_concepts": 8
    },
    {
      "id": "acids-bases-salts",
      "subject_id": "science",
      "chapter_number": 2,
      "name": "Acids, Bases and Salts",
      "mastered_concepts": 5,
      "total_concepts": 7
    },
    {
      "id": "metals-non-metals",
      "subject_id": "science",
      "chapter_number": 3,
      "name": "Metals and Non-metals",
      "mastered_concepts": 4,
      "total_concepts": 9
    }
  ]
}
```

- **DB / Data Required**:
  - `chapters` table (`id`, `subject_id`, `chapter_number`, `name`, `class`)
  - `concepts` table (total concepts per chapter)
  - `user_concept_mastery` table (counts of mastered concepts for authenticated user)

---

### 3.4 GET `/api/curriculum/subjects/:subjectId/chapters/:chapterId`

- **Purpose**: Fetch details of a single chapter along with its concepts for constellation rendering.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Simulated in `/src/services/api.ts`)
- **Frontend Screen / Action**:
  - Screen: `/home/:subject/:chapter`
  - Action: Loading chapter breadcrumb, metadata, and concept list
- **Request / Parameters**:
  - Path Parameters: `:subjectId`, `:chapterId`
  - Headers: `Authorization: Bearer <token>`
- **Expected Response (200 OK)**:

```json
{
  "id": "chemical-reactions",
  "subject_id": "science",
  "chapter_number": 1,
  "name": "Chemical Reactions and Equations",
  "class": 10,
  "total_concepts": 8,
  "mastered_concepts": 6,
  "concepts": [
    { "id": "c1", "name": "Chemical Equation Balancing", "status": "mastered" },
    { "id": "c2", "name": "Combination & Decomposition", "status": "mastered" },
    { "id": "c3", "name": "Displacement Reactions", "status": "learning" }
  ]
}
```

- **DB / Data Required**:
  - `chapters`, `concepts`, `user_concept_mastery`

---

## 4. Summary of All Endpoints

| Method       | Endpoint                                                  | Auth  | Purpose                                         | Frontend Screen             | Status |
| ------------ | --------------------------------------------------------- | ----- | ----------------------------------------------- | --------------------------- | ------ |
| `POST`       | `/api/auth/login`                                         | No    | Email/password login                            | `/login`                    | MOCKED |
| `POST`       | `/api/auth/signup`                                        | No    | Email/password registration                     | `/signup`                   | MOCKED |
| `GET`/`POST` | `/api/auth/google`                                        | OAuth | Unified Google sign-in/sign-up                  | `/login`, `/signup`         | MOCKED |
| `GET`        | `/api/users/me/profile`                                   | Yes   | Get authenticated user profile & class          | `/home`, `/profile`         | MOCKED |
| `PATCH`      | `/api/users/me/profile`                                   | Yes   | Save class, language & onboarding preferences   | `/onboarding/*`, `/profile` | MOCKED |
| `GET`        | `/api/curriculum/subjects?class={class}`                  | Yes   | Get class-appropriate subjects (6–10 vs 11–12)  | `/home`                     | MOCKED |
| `GET`        | `/api/curriculum/subjects/:subjectId/chapters`            | Yes   | Get vertical chapter list with concept progress | `/home/:subject`            | MOCKED |
| `GET`        | `/api/curriculum/subjects/:subjectId/chapters/:chapterId` | Yes   | Get single chapter & concept details            | `/home/:subject/:chapter`   | MOCKED |

---

## 5. Frontend Navigation & Authentication State Contract

### 5.1 Landing Page (`/`) Navbar & Actions

- **Authenticated / Logged-in User**:
  - **Extreme Right**: Do **NOT** display a "Dashboard" button or "Sign In" text.
  - **Profile Circle**: Display a circular button on the extreme right containing the authenticated user's initial with background `#6b1302` and white text. Clicking this routes directly to `/profile`.
  - **Hero CTA Button**: Button text **strictly remains "Get Started"** (no "Enter Dashboard" or "Dashboard" text). Clicking it routes to `/home`.
- **Unauthenticated / Guest Visitor**:
  - **Extreme Right**: Displays **"Sign In"** linking to `/login`.
  - **Hero CTA Button**: Displays **"Get Started"** linking to `/signup`.

### 5.2 Authenticated Pages (`/home`, `/home/:subject`, `/home/:subject/:chapter`, `/profile`)

- **Persistent Navbar (matching main landing page)**:
  - **Left**: Akara branding logo linking to `/home`.
  - **Center**: Navigation Links ("HOME", "LIBRARY", "PROGRESS") with active state tracking.
  - **Right**: User's initial profile circle (background: `#6b1302`, white text) linking to `/profile`. No class badge next to the profile circle.
  - **Mobile**: Persistent floating bottom navigation pill for effortless switching between Home, Library, Progress, and Profile.
- **Curriculum & Subject View (`/home`)**:
  - **All Content Rendered from Backend**:
    - User identity & academic class: Fetched via `GET /api/users/me/profile`
    - Subjects list: Fetched dynamically based on user class via `GET /api/curriculum/subjects?class={class}`
    - Subject titles, chapter counts, descriptions, and concept completion metrics are entirely supplied by the backend API payload.
  - **Greeting Header**:
    - `Welcome {user.name}` (from backend user profile)
    - `Here is your curriculum for Grade {user.class}` (from backend user profile)
  - **Dynamic Card Sizing**:
    - For 2 subjects (Classes 6–10: Science, Maths): 2-column wide layout (`grid-cols-1 md:grid-cols-2`) stretching across the full screen width.
    - For 3+ subjects (Classes 11–12: Physics, Chemistry, Biology, Maths): 3-column layout (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
  - **Card Anatomy**:
    - **Top Pastel Banner**: Soft pastel rounded container with tailored line-art vector illustration and icon elements (Science, Maths, Physics, Chemistry, Biology).
    - **Lower Content Area**: Subject title with chapter count, descriptive curriculum text, clean progress bar displaying "Your Progress" with percentage (e.g. `45%`).
    - **Progress Bar Theme Matching**: Progress bar fill line dynamically matches the container's theme color (`#6d0e00` for Science and Maths, indigo for Physics, coral for Chemistry, amber for Biology).
    - **Interactive Hover**: Container border transitions on hover to `#6d0e00` for Science and Maths, with progress bar in `#6d0e00`. No continue button; clicking the container navigates directly to the subject chapters page.
- **Subject Chapters View (`/home/:subject`, e.g., `/home/science`, `/home/maths`)**:
  - **Navbar Alignment**: Identical desktop 3-column grid and mobile top bar matching the main page and `/home` page (small logo on left, centered navigation, user profile circle on right).
  - **Clean Header**: Subject title (e.g. "Science", "Maths") and subtitle without any "Class 9" or "Class X" badges. No "Back to subjects" button.
  - **Chapter Containers**: Rendered in the exact container form as on the `/home` page:
    - Top pastel banner with subject/chapter-themed vector illustrations.
    - Chapter name, chapter number, and total concept count.
    - "Your Progress" progress bar in `#6d0e00` for Science and Maths chapters.
    - Container border transitions to `#6d0e00` on hover; clicking opens the chapter details.
  - **3 Chapters in One Line**: Displays 3 chapter containers per line/row across desktop screens (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), showing all chapters on the page without pagination.
- **Akara Constellation Gamified Learning Journey (`/home/:subject/:chapter`, e.g., `/home/science/chemical-reactions`)**:
  - **Reference-Matching Gamified Design**:
    - **No Breadcrumbs or Back Buttons**: The breadcrumb navigation ("Home / Science / Chapter Name") and "Back to Science Chapters" link are completely removed for an uncluttered, immersive experience.
    - **Native Warm Cream Canvas**: The learning path renders directly on the warm cream `#FAF7F2` background.
    - **Continuous Serpentine S-Curve Path with Wide Horizontal Spacing**:
      - A wide organic winding wave flowing down the canvas with ample horizontal separation between consecutive nodes (14% to 22% delta, ~120px–180px on desktop), giving clear breathing room.
      - Alternating topic/concept name positions with straight-line formatting (`whitespace-nowrap` in `text-[#6d0e00]`).
    - **Illustrations in Wave Pockets**:
      - Top-left pocket (alongside nodes 0..2): Boy on pencil (`/character_pencil.png`) flipped horizontally (`scale-x-[-1]`) with safe viewport bounds to prevent any cropping.
      - Bottom-right pocket (alongside nodes 5..7): Boy on pencil (`/character_pencil.png`) in natural orientation (not flipped).
      - Additional alternating pockets dynamically added for chapters with 12+ concepts.
    - **Typography**:
      - Straight-line topic names: Clean sans-serif typography (`font-sans font-semibold text-xs sm:text-base text-[#6d0e00] whitespace-nowrap`), avoiding premature word wrapping.
    - **State-Differentiated Node Circles**:
      - **Done / Mastered Concepts**: Solid green (`#166534`) circle with cream-colored checkmark (`Check` icon in `#FAF7F2`).
      - **Locked Concepts**: Cream-colored (`#FAF7F2`) circle with `#6d0e00` border and `#6d0e00` padlock icon (`Lock`).
      - **Available Concepts**: Solid `#6d0e00` circle with subtle active pulse aura and cream play icon (`Play`).
      - **Language Requested Concepts**: Cream-colored circle with dashed `#6d0e00` border and `#6d0e00` clock icon (`Clock`).
    - **Interactive Modal & Mastery Progression**:
      - Clicking any node opens the Popover (desktop) or Bottom Sheet (mobile) with `[ Learn ]`, `[ Explain ]`, `[ Practice ]`, and `[ Mark as Mastered ]`.
      - Marking a concept as mastered updates state, adds the cream tick, unlocks the dependent concept to available, and persists to local storage.
  - **Data Model**: Fully data-driven via `constellationService` with local storage persistence and backend-ready schema (`ConceptNode`, `TopicGroup`, `ChapterConstellation`).
- **Redirection Flow**:
  - Unauthenticated access to protected routes automatically redirects to `/login`.
  - Users with incomplete onboarding (`onboarding_completed = false`) automatically redirect to `/onboarding/class`.

---

## 6. Student Progress & Learning Diagnostics Endpoints

### 6.1 GET `/api/progress/summary`

- **Purpose**: Fetch personal student learning progress metrics for dashboard summary cards.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/progressData.ts`)
- **Frontend Screen**: `/progress`
- **Expected Response (200 OK)**:

```json
{
  "concepts_mastered": 7,
  "concepts_to_revisit": 4,
  "active_days_this_week": 4
}
```

---

### 6.2 GET `/api/progress/learning-map`

- **Purpose**: Fetch only concepts that the student has actually touched (mastered, available, needs-revisit), organized by subject. Excludes all untouched/locked curriculum items.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/progressData.ts`)
- **Frontend Screen**: `/progress`
- **Expected Response (200 OK)**:

```json
{
  "subjects": [
    {
      "subject_id": "science",
      "subject_name": "Science",
      "mastered_count": 4,
      "revisit_count": 2,
      "available_count": 1,
      "concepts": [
        {
          "id": "cr-01",
          "name": "Chemical Changes & Word Equations",
          "short_description": "Observing state transformations and writing word equations.",
          "status": "mastered",
          "chapter_id": "chemical-reactions",
          "chapter_name": "Chemical Reactions and Equations",
          "topic_name": "Chemical Equations & Balancing"
        },
        {
          "id": "cr-02",
          "name": "Balancing Chemical Equations",
          "short_description": "Systematic stoichiometric balancing of reactants and products.",
          "status": "needs-revisit",
          "chapter_id": "chemical-reactions",
          "chapter_name": "Chemical Reactions and Equations",
          "topic_name": "Chemical Equations & Balancing",
          "diagnostic_insight": "Tendency to modify chemical subscripts instead of adjusting stoichiometric coefficients."
        }
      ]
    }
  ]
}
```

---

### 6.3 GET `/api/diagnostics/misconceptions`

- **Purpose**: Retrieve actionable diagnostic log items driven by student error analysis and detected misconceptions for the "Worth Another Look" section.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/diagnosticData.ts`)
- **Frontend Screen**: `/progress`
- **Expected Response (200 OK)**:

```json
{
  "diagnostics": [
    {
      "id": "diag-01",
      "concept_id": "cr-02",
      "concept_name": "Balancing Chemical Equations",
      "subject_id": "science",
      "subject_name": "Science",
      "chapter_id": "chemical-reactions",
      "chapter_name": "Chemical Reactions and Equations",
      "topic_name": "Chemical Equations & Balancing",
      "detected_at": "2026-03-24T10:00:00Z",
      "severity": "high",
      "diagnostic_insight": "Tendency to modify chemical subscripts rather than adjusting stoichiometric coefficients when balancing oxygen atoms.",
      "actionable_hint": "Always keep formulas fixed; adjust only front stoichiometric multipliers so atom counts balance on both sides.",
      "status": "needs_review"
    }
  ]
}
```

---

### 6.4 POST `/api/diagnostics/:diagnosticId/resolve`

- **Purpose**: Mark a diagnostic misconception item as resolved after successful re-practice in the constellation.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/diagnosticData.ts`)

```json
{
  "success": true,
  "diagnostic_id": "diag-01",
  "status": "resolved"
}
```

---

## 7. Profile, Personalization & Language Demand Endpoints

### 7.1 GET `/api/users/me/interests`

- **Purpose**: Fetch the authenticated student's active personalization interests (used for generating customized analogies in explanations).
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/profilePreferences.ts`)
- **Frontend Screen / Action**: `/profile` page, Interests section.

#### Expected Response (200 OK)

```json
{
  "interests": ["Cricket", "Farming", "Bollywood", "Gaming"]
}
```

### 7.2 PUT `/api/users/me/interests`

- **Purpose**: Update the student's list of personalization interests.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/profilePreferences.ts`)
- **Frontend Screen / Action**: `/profile` page, Adding or removing interest chips.

#### Request Body

```json
{
  "interests": ["Cricket", "Farming", "Bollywood", "Gaming", "Robotics"]
}
```

#### Expected Response (200 OK)

```json
{
  "success": true,
  "interests": ["Cricket", "Farming", "Bollywood", "Gaming", "Robotics"]
}
```

---

### 7.3 GET `/api/languages/demand`

- **Purpose**: Retrieve live community demand counts for un-supported regional Indian languages.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/languageDemandService.ts`)
- **Frontend Screen / Action**: `/profile` page, Request a Regional Language section and live demand board.

#### Expected Response (200 OK)

```json
{
  "demands": [
    {
      "language": "Bhojpuri",
      "nativeScript": "भोजपुरी",
      "requestedCount": 512
    },
    { "language": "Maithili", "nativeScript": "मैथिली", "requestedCount": 348 },
    {
      "language": "Chhattisgarhi",
      "nativeScript": "छत्तीसगढ़ी",
      "requestedCount": 278
    },
    {
      "language": "Marwari",
      "nativeScript": "मारवाड़ी",
      "requestedCount": 231
    },
    { "language": "Kashmiri", "nativeScript": "कॉशुर", "requestedCount": 209 }
  ]
}
```

---

### 7.4 POST `/api/languages/request`

- **Purpose**: Submit a student's demand for an un-supported regional language, incrementing the live monthly demand signal and enqueuing the translation into the background batch-generation queue.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/languageDemandService.ts`)
- **Frontend Screen / Action**: `/profile` page, Request Language form submission.

#### Request Body

```json
{
  "language": "Maithili"
}
```

#### Expected Response (200 OK - New Request)

```json
{
  "success": true,
  "message": "Maithili request received and added to batch generation queue.",
  "updatedCount": 349,
  "ticketId": "BATCH-LANG-7A9B2C",
  "alreadyRequested": false
}
```

#### Expected Response (200 OK - Duplicate Request within month)

```json
{
  "success": false,
  "message": "You have already requested Maithili this month.",
  "updatedCount": 348,
  "ticketId": "",
  "alreadyRequested": true
}
```

---

### 7.5 GET `/api/users/me/preferences` & PATCH `/api/users/me/preferences`

- **Purpose**: Manage client preferences including Data Saver Mode.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/profilePreferences.ts`)
- **Frontend Screen / Action**: `/profile` page, Data Saver toggle.

#### Request Body (PATCH)

```json
{
  "data_saver_mode": true
}
```

#### Expected Response (200 OK)

```json
{
  "data_saver_mode": true,
  "updated_at": "2026-03-24T12:00:00Z"
}
```

---

### 7.6 GET `/api/users/me/offline-chapters` & DELETE `/api/users/me/offline-chapters/:id`

- **Purpose**: Catalog and manage downloaded/cached chapters for offline learning.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/profilePreferences.ts`)
- **Frontend Screen / Action**: `/profile` page, Offline & Downloaded Chapters section.

#### Expected Response (GET 200 OK)

```json
{
  "downloaded_chapters": [
    {
      "id": "dl-01",
      "chapterId": "chemical-reactions",
      "chapterName": "Chemical Reactions and Equations",
      "subjectId": "science",
      "subjectName": "Science",
      "class": 10,
      "sizeMb": 24.6,
      "downloadedAt": "2026-09-08",
      "conceptCount": 7
    },
    {
      "id": "dl-02",
      "chapterId": "real-numbers",
      "chapterName": "Real Numbers",
      "subjectId": "maths",
      "subjectName": "Maths",
      "class": 10,
      "sizeMb": 18.2,
      "downloadedAt": "2026-09-10",
      "conceptCount": 6
    }
  ],
  "total_storage_used_mb": 42.8
}
```

---

## 8. Multilingual Knowledge Library & Repository Endpoints

### 8.1 GET `/api/library/summary`

- **Purpose**: Retrieve global live counter statistics for generated video explainers across ALL languages, total cataloged concepts, and coverage tiers.
- **Authentication Required**: No (Public or authenticated)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/libraryData.ts`)
- **Frontend Screen / Action**:
  - Screen: `/library`
  - Action: Live counter pill in header ("X videos generated across 12 languages")

#### Query Parameters: None

#### Expected Response (200 OK)

```json
{
  "total_generated_videos": 356,
  "total_concepts": 40,
  "total_languages_supported": 12,
  "average_languages_per_concept": 8.9,
  "coverage_tiers": {
    "full": 16,
    "high": 14,
    "moderate": 7,
    "low": 3
  }
}
```

---

### 8.2 GET `/api/library/concepts`

- **Purpose**: Search and browse concepts across the entire repository across all subjects, domains, and regional languages. Includes student personal progress cross-referencing.
- **Authentication Required**: Optional (Bearer token to resolve personal student mastery and misconception banks)
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/libraryData.ts`)
- **Frontend Screen / Action**:
  - Screen: `/library`
  - Action: Search bar input and Subject filter chips

#### Query Parameters

- `q` (string, optional): Search query matching concept title, description, domain, or chapter.
- `subject` (string, optional): Filter by subject slug (`all`, `science`, `maths`).

#### Expected Response (200 OK)

```json
{
  "concepts": [
    {
      "id": "cr-01",
      "name": "Chemical Changes & Word Equations",
      "short_description": "Observing state transformations, evolution of gas, temperature variations, and writing foundational word equations.",
      "subject_id": "science",
      "subject_name": "Science",
      "domain": "Chemistry",
      "chapter_id": "chemical-reactions",
      "chapter_name": "Chemical Reactions and Equations",
      "topic_name": "Chemical Equations & Balancing",
      "class": 10,
      "order": 1,
      "available_languages": [
        "hi",
        "en",
        "mr",
        "bn",
        "te",
        "ta",
        "gu",
        "kn",
        "ml",
        "pa",
        "ur",
        "or"
      ],
      "language_count": 12,
      "total_generated_videos": 12,
      "video_duration_minutes": 12,
      "student_progress": "mastered",
      "prerequisite_id": null
    }
  ],
  "total_results": 40
}
```

---

### 8.3 GET `/api/library/hierarchy`

- **Purpose**: Retrieve structured subject-to-domain-to-concept hierarchy for clean categorized browsing.
- **Authentication Required**: Optional
- **Status**: MOCKED (Frontend currently uses simulated service in `/src/services/libraryData.ts`)
- **Frontend Screen / Action**:
  - Screen: `/library`
  - Action: Initial page load and subject tab filtering

#### Expected Response (200 OK)

```json
{
  "sections": [
    {
      "subject_id": "science",
      "subject_name": "Science",
      "total_concepts": 20,
      "domains": [
        {
          "domain_name": "Chemistry",
          "subject_id": "science",
          "subject_name": "Science",
          "concepts": [...]
        },
        {
          "domain_name": "Biology",
          "subject_id": "science",
          "subject_name": "Science",
          "concepts": [...]
        },
        {
          "domain_name": "Physics",
          "subject_id": "science",
          "subject_name": "Science",
          "concepts": [...]
        }
      ]
    },
    {
      "subject_id": "maths",
      "subject_name": "Mathematics",
      "total_concepts": 20,
      "domains": [
        {
          "domain_name": "Number Systems",
          "concepts": [...]
        },
        {
          "domain_name": "Algebra",
          "concepts": [...]
        },
        {
          "domain_name": "Geometry",
          "concepts": [...]
        },
        {
          "domain_name": "Trigonometry",
          "concepts": [...]
        },
        {
          "domain_name": "Statistics & Probability",
          "concepts": [...]
        }
      ]
    }
  ]
}
```

---

## 9. Concept Learning, Explanation & Practice Endpoints

### 9.1 GET `/api/concepts/:conceptId/generation-status`

- **Purpose**: Retrieve backend cache & video generation state for a specific concept + language.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Handled by `/src/services/conceptMediaService.ts`)
- **Frontend Screen / Action**:
  - Screen: `/learn/:conceptId`
  - Action: Determines whether to show standard instant player, lightweight "Finishing the dub…" notice, or the full "Generating this for the first time…" pipeline state.
- **Request Parameters**:
  - Path Parameter: `:conceptId` (e.g., `"cr-02"`)
  - Query Parameter: `lang` (e.g., `"hi"`, `"mr"`, `"en"`)
- **Response Format (200 OK)**:

```json
{
  "status": "instant",
  "progress_percent": 100,
  "current_stage": "Synthesizing localized neural audio track…",
  "estimated_seconds_remaining": 0,
  "available_languages": [
    "hi",
    "en",
    "mr",
    "bn",
    "te",
    "ta",
    "gu",
    "kn",
    "ml",
    "pa",
    "ur",
    "or"
  ],
  "concept_id": "cr-02",
  "language": "hi"
}
```

---

### 9.2 GET `/api/concepts/:conceptId/media`

- **Purpose**: Returns unified generated concept bundle (video/audio, script for Concept Card, scene-graph for Mind Map, and script-derived quiz questions).
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Handled by `/src/services/conceptMediaService.ts`)
- **Frontend Screen / Action**:
  - Screens: `/learn/:conceptId`, `/explain/:conceptId`, `/practice/:conceptId`
- **Response Format (200 OK)**:

```json
{
  "concept_id": "cr-02",
  "concept_name": "Balancing Chemical Equations",
  "ncert_citation": "NCERT — Class 10 Science · Chapter Chemical Reactions and Equations · Section Chemical Equations & Balancing",
  "language": "hi",
  "video": {
    "title": "Balancing Chemical Equations — Full Explainer",
    "duration_seconds": 840,
    "duration_formatted": "14:00"
  },
  "script": {
    "summary_bullets": ["..."],
    "key_definitions": [...],
    "ncert_summary": "..."
  },
  "scene_graph": {
    "nodes": [...],
    "edges": [...]
  },
  "quiz": [
    {
      "id": "q-01",
      "question": "Which fundamental scientific law mandates that chemical equations must be balanced?",
      "options": ["Law of Definite Proportions", "Law of Conservation of Mass", "Avogadro's Law", "Boyle's Law"],
      "correct_index": 1,
      "explanation": "..."
    }
  ],
  "mentor_prompt": {
    "scenario": "mastery_confirmation",
    "question_text": "..."
  }
}
```

---

### 9.3 POST `/api/concepts/:conceptId/evaluate-explanation`

- **Purpose**: Evaluates a student's spoken transcript or typed explanation using the pedagogical Feynman criteria.
- **Authentication Required**: Yes (`Bearer <token>`)
- **Status**: MOCKED (Handled by `/src/services/conceptMediaService.ts`)
- **Frontend Screen / Action**:
  - Screen: `/explain/:conceptId`
  - Action: Submits explanation; if cleared, updates student mastery and resolves any active misconception diagnostic.
- **Request Body**:

```json
{
  "student_answer_text": "Mass cannot be created or destroyed...",
  "scenario": "mastery_confirmation",
  "language": "hi"
}
```

- **Response Format (200 OK)**:

```json
{
  "is_mastered": true,
  "score_percent": 90,
  "feedback_headline": "Feynman Mastery Cleared!",
  "mentor_feedback_text": "Outstanding explanation! You clearly demonstrated why stoichiometric coefficients are used...",
  "points_covered": [
    "Referenced the Law of Conservation of Mass.",
    "Distinguished between subscripts and coefficients."
  ],
  "points_missed": [],
  "diagnostic_resolved": true
}
```
