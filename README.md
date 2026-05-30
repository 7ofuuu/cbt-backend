# CBT Backend API

REST API server for Computer-Based Test (CBT) system. Provides 92 endpoints for authentication, question management, exam administration, student exam operations, dynamic taxonomy, and image upload.

**Built with:** Node.js 18+ | Express.js 5 | Prisma 6 | MySQL 8

---

## Features

### Authentication & Authorization
- **JWT Authentication** — Token-based auth, 24-hour expiry
- **Role-Based Access Control** — Three roles: Admin, Teacher, Student
- **Super Admin Protection** — Special admin account cannot be deleted or modified by other admins
- **Password Policy** — 8+ chars, uppercase, lowercase, digits required

### Question Management (Teacher)
- **Question Banks** — Create banks with globally unique names
- **Question Types** — Single Choice, Multiple Choice, Essay
- **Answer Options** — Configure correct/incorrect options per question
- **Bulk Assign** — Assign entire banks to exams
- **Question Filtering** — Filter by subject, grade level, major, type

### Exam Management (Teacher)
- **Exam Creation** — Define exams with start/end dates, duration
- **Student Auto-Assign** — Automatically assign matching students by grade + major
- **Question Assignment** — Assign individual questions or entire banks
- **Question Shuffle** — Optional randomization of question order
- **Participant Tracking** — Monitor exam participation status

### Exam Taking (Student)
- **Encrypted Pre-Download** — Download the exam package (questions, no answer keys) from H-1 as a sealed envelope; opened locally with the proctor-announced password (PBKDF2-HMAC-SHA256 → AES-256-GCM)
- **Start Exam** — Begin exam session online (records status + `start_time`); questions come from the decrypted package
- **Auto-Save Answers** — Submit answers to server on selection
- **Question Navigation** — View all questions, track answered/unanswered
- **Auto-Finish** — Exam auto-finishes when deadline expires (server-side)

### Grading & Results
- **Auto-Grading** — Instant scoring for Multiple Choice questions
- **Manual Grading** — Teacher can grade essay questions and finalize scores
- **Result Tracking** — Persist final scores and submission metadata

### Background Automation
- **Auto-Finish Scheduler** — Checks every 60s, auto-finishes sessions past deadline
- **Auto-Expire Scheduler** — Checks every 60s, marks exams ENDED after deadline
- **Deadline Enforcement** — Global `end_date` binding for all participants

### Admin Controls
- **User Management** — CRUD admin/teacher/student accounts, batch import
- **Activity Monitoring** — Real-time exam status view (not started, in progress, completed)
- **Block/Unblock** — Block cheating students, generate unlock codes for unblock
- **Activity Logs** — View login history, exam events (start, finish, auto-finish)
- **Active Users** — List users logged in within N hours

### Analytics
- **Teacher Dashboard** — Exam overview, question statistics, performance metrics
- **Coordinator Audit** — Multi-teacher analytics and comparison data
- **Score Distribution** — Analyze results by exam, class, or student

### School Profile
- **Public Endpoint** — Fetch school name, logo, contact info
- **Admin Update** — Update school identity information

### Dynamic Taxonomy
- **Subjects / Grade Levels / Majors** — Stored as editable rows instead of hardcoded constants
- **Public Read** — Dashboard and Flutter pull dropdown options from one endpoint
- **Soft Delete** — Deactivated rows still resolve on historical exam/student data
- **Opt-in Cascade Rename** — Admin can propagate a rename across `Exam`, `QuestionBank`, `Question`, `Teacher`, and `Student` snapshots in a single transaction

### File Upload
- **Multer Disk Storage** — Image-only, 5 MB cap, PNG / JPG / WEBP / GIF
- **Two Buckets** — `uploads/logos/` (admin only) and `uploads/questions/` (teacher + admin)
- **Static Serving** — `/uploads/*` served with `Cross-Origin-Resource-Policy: cross-origin` so the dashboard on a different port can render the images

### Exam Archival
- **Teacher Submit** — Once grading is final, teacher submits the exam to move it from active to archive
- **`teacher_submitted_at`** — Timestamp gates inclusion in the active vs archived list endpoints
- **Shared Formatter** — `formatExamForList` keeps the active and archived projections identical

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 18+ |
| Framework | Express.js | 5.x |
| ORM | Prisma | 6.19+ |
| Database | MySQL | 8.0+ |
| Auth | JWT (jsonwebtoken) | Latest |
| Encryption | bcryptjs | Latest |
| Validation | Joi | Latest |
| File Upload | multer | Latest |
| Security | helmet (CSP disabled, CORP cross-origin) | Latest |
| Task Scheduling | setInterval (60 s tick) | — |
| Testing | Jest + supertest | Latest |

---

## Prerequisites

- **Node.js** v18 or higher
- **MySQL** 8.0+ (running on port 3306)
  - XAMPP, Docker, or standalone MySQL installation
- **npm** (comes with Node.js)

---

## Installation & Setup

### 1. Clone Repository

```bash
cd cbt-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create `.env` file in project root:

```env
DATABASE_URL="mysql://root:@localhost:3306/cbt"
PORT=3000
JWT_SECRET=ViegoOTP123
CORS_ORIGINS="http://localhost:3001,http://localhost:3000"
```

**Environment Variables Reference:**
- `DATABASE_URL` — MySQL connection string (user:password@host:port/database)
- `PORT` — Server port (default 3000)
- `JWT_SECRET` — Secret key for JWT signing (use strong random string in production)
- `CORS_ORIGINS` — Comma-separated allowed origins for CORS
- `ALLOW_NGROK_ORIGINS` — Set `true` to permit any `*.ngrok-free.app` / `*.ngrok.app` origin (dev only — keep off in production). See [NGROK-FIREBASE-SETUP.md](../NGROK-FIREBASE-SETUP.md).
- `ALLOW_VERCEL_ORIGINS` — Set `true` to permit any `*.vercel.app` origin so the Vercel-hosted dashboard can call this API (it reaches the backend via the ngrok URL). For production, pin the exact Vercel domain in `CORS_ORIGINS` and keep this off.

### 4. Setup Database

```bash
# Generate Prisma Client
npx prisma generate

# Create schema and tables
npx prisma db push

# Seed sample data
npx prisma db seed
```

**After Seeding:**
- School profile (singleton, id = 1)
- Taxonomy: 14 subjects, 3 grade levels, 3 majors
- 3 Admins (1 Super Admin: `admin1`)
- 8 Teachers (1 coordinator)
- 108 Students
- 36 Question Banks with 720 Questions
- 13 Sample Exams (mixed `SCHEDULED` / `ONGOING` / `ENDED`)
- ~156 Exam Participants (including 5 blocked)
- ~510 Answers
- 25 Exam Results
- ~142 Activity Logs

**Reset Database (⚠️ Deletes all data):**
```bash
npx prisma db push --force-reset
npx prisma db seed
```

---

## Self-Hosting (Backend di laptop + Frontend di Vercel)

Setup yang dipakai saat ini: **backend berjalan di laptop Anda** dan diekspos ke
internet lewat **ngrok**, sementara **frontend (dashboard) di-host di Vercel** dan
memanggil backend Anda melalui URL ngrok. Selama demo/ujian berlangsung, laptop Anda
harus tetap menyala dan menjalankan backend + ngrok.

```
[Dashboard @ Vercel] ──HTTPS──┐
                              ├──► [ngrok static domain] ──► [backend @ laptop Anda :3000]
[APK Flutter @ HP]   ──HTTPS──┘
```

### 1. Setup ngrok (sekali)

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <TOKEN>   # dari https://dashboard.ngrok.com
```

Klaim 1 **static domain** gratis di <https://dashboard.ngrok.com/domains>, lalu isikan
ke `domain:` pada `ngrok.yml`. Static domain membuat URL backend tetap sama tiap sesi,
jadi frontend dan APK tidak perlu dikonfigurasi ulang.

### 2. Jalankan tiap sesi (di laptop Anda)

```bash
npm run dev      # backend di http://localhost:3000
npm run ngrok    # ekspos backend ke https://<static-domain>
```

Biarkan keduanya berjalan selama sistem dipakai. Backend `.env`:

```env
ALLOW_NGROK_ORIGINS=true    # izinkan CORS dari *.ngrok-free.app
ALLOW_VERCEL_ORIGINS=true   # izinkan CORS dari *.vercel.app (frontend Vercel)
```

### 3. Arahkan frontend (Vercel) ke backend Anda

Di **Project Settings → Environment Variables** Vercel, set ke URL ngrok Anda:

```env
NEXT_PUBLIC_HOST_NGROK=https://<static-domain>/api/
NEXT_PUBLIC_HOST=https://<static-domain>/api/
```

Dashboard otomatis memilih URL ngrok ini saat diakses dari domain Vercel. Setiap ganti
static domain, perbarui env ini lalu redeploy.

### 4. Arahkan aplikasi mobile ke backend Anda

Set static domain di `cbt_app/lib/utils/url.dart` (`_ngrokHost`) dan `useNgrok = true`
saat build APK. Distribusi APK via Firebase App Distribution: lihat `NGROK-FIREBASE-SETUP.md`.

---

## Running the Application

### Development Mode (Auto-reload)

```bash
npm run dev
```

Server starts at `http://localhost:3000` with two background schedulers:
- **Auto-Finish Scheduler** — Runs every 60s, auto-finishes sessions past deadline
- **Auto-Expire Scheduler** — Runs every 60s, marks exams as ENDED

### Production Mode

```bash
node index.js
```

---

## Useful Commands

```bash
npm run dev                              # Development server with auto-reload
npm run lint                             # Lint check all JavaScript files
npm run check                            # Alias for lint (quick health check)
npm run cleanup:question-text-tags       # Remove legacy [XII-IPS] prefixes from questions

# Prisma Database Commands
npx prisma studio                        # Open GUI database browser
npx prisma generate                      # Regenerate Prisma Client
npx prisma db push                       # Sync schema to database
npx prisma db push --force-reset         # Reset database (delete all data + recreate)
npx prisma db seed                       # Run seeder
npx prisma migrate resolve --rolled-back # Fix migration conflicts
```

---

## API Documentation

**Full API reference:** See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

**Base URL:** `http://localhost:3000/api`

**93 Endpoints** organized in 13 route groups:
1. **Auth** (`/auth`) — Register, login, logout, profile, password change
2. **Questions** (`/questions`) — Question banks, CRUD questions
3. **Exams** (`/exams`) — Exam CRUD, assign questions/students
4. **Student Exams** (`/student`) — Prefetch encrypted package, start exam, submit answers, finish exam
5. **Users** (`/users`) — User management, role changes, batch import
6. **Activities** (`/activities`) — Real-time exam monitoring, block/unblock
7. **Activity Logs** (`/activity-logs`) — Query login/exam events
8. **Exam Results** (`/exam-results`) — Grade essays, finalize scores, submit to archive
9. **School Profile** (`/school-profile`) — Fetch/update school info
10. **Analytics** (`/analytics`) — Teacher performance, question stats
11. **Taxonomy** (`/taxonomy`) — Dynamic subjects / grade levels / majors with cascade rename
12. **Upload** (`/upload`) — Logo + question image upload (multer disk storage)
13. **Misc** (`/time`) — Trusted server time for client clock validation

**All endpoints (except `/auth/login` and `/auth/register`) require JWT:**
```
Authorization: Bearer <token>
```

---

## Coding Standards

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Prisma Model | PascalCase | `QuestionBank`, `ExamParticipant` |
| Prisma Field | snake_case | `question_bank_id`, `full_name` |
| Database Table | snake_case (via `@@map`) | `question_banks`, `exam_participants` |
| Enum Type | PascalCase | `ExamStatus`, `QuestionType` |
| Enum Value | UPPER_SNAKE | `SINGLE_CHOICE`, `IN_PROGRESS` |
| JavaScript Variable | camelCase | `examParticipant`, `totalScore` |
| JavaScript Function | camelCase | `getMyExams()`, `startExam()` |
| Route Path | kebab-case | `/assign-question`, `/exam-results` |
| File Name | camelCase | `examController.js`, `examRoutes.js` |

### Project Structure

```
cbt-backend/
├── index.js                         # Entry point, mount routes, start schedulers
├── package.json
├── API_DOCUMENTATION.md             # Complete API reference
├── README.md                        # This file
│
├── prisma/
│   ├── schema.prisma                # Database schema (14 models, 4 enums)
│   ├── seed.js                      # Sample data seeder
│   └── migrations/                  # Migration history
│
├── src/
│   ├── config/
│   │   └── db.js                    # Prisma Client singleton
│   │
│   ├── controllers/                 # Request/response handling
│   │   ├── authController.js
│   │   ├── questionController.js
│   │   ├── examController.js
│   │   ├── studentController.js
│   │   ├── userController.js
│   │   ├── activityController.js
│   │   ├── examResultController.js
│   │   ├── schoolProfileController.js
│   │   └── analyticsController.js
│   │
│   ├── middlewares/                       # Auth, validation, role checks, uploads
│   │   ├── validationMiddleware.js        # JWT verify, role check, Joi validate(),
│   │   │                                  # adminOnly / teacherOnly / studentOnly shortcuts
│   │   ├── resolveRole.js                 # Resolve teacher/student profile from JWT
│   │   └── uploadMiddleware.js            # Multer disk storage, image-only, 5 MB cap
│   │
│   ├── routes/                            # HTTP route definitions
│   │   ├── authRoutes.js
│   │   ├── questionRoutes.js
│   │   ├── examRoutes.js
│   │   ├── studentRoutes.js
│   │   ├── userRoutes.js
│   │   ├── activityRoutes.js
│   │   ├── examResultRoutes.js
│   │   ├── activityLogRoutes.js
│   │   ├── schoolProfileRoutes.js
│   │   ├── analyticsRoutes.js
│   │   ├── taxonomyRoutes.js              # Dynamic taxonomy CRUD
│   │   └── uploadRoutes.js                # Logo + question image upload
│   │
│   ├── controllers/
│   │   └── ... taxonomyController.js, uploadController.js included
│   │
│   ├── services/                          # Business logic
│   │   ├── activityLogService.js          # createLog + logFromRequest wrapper
│   │   ├── autoFinishService.js           # Auto-finish expired sessions
│   │   ├── autoExpireExamService.js       # Auto-expire exam status
│   │   ├── examService.js
│   │   ├── examResultFormatter.js         # Shared EXAM_LIST_INCLUDE + formatter
│   │   ├── scoreService.js
│   │   ├── subjectAccessService.js
│   │   ├── taxonomyCascadeService.js      # cascadeRename across snapshot tables
│   │   ├── userService.js
│   │   └── analyticsService.js
│   │
│   └── utils/                             # Helper utilities
│       ├── asyncHandler.js                # asyncHandler + AppError + errorHandler
│       └── response.js                    # ok / created / paginated helpers
│
├── uploads/                               # Multer-managed image storage (gitignored)
│   ├── logos/
│   └── questions/
│
└── tests/
    ├── setup.js
    ├── blackbox/                    # Integration tests
    ├── unit/                        # Unit tests
    └── helpers/
```

### Key Principles

- **Controllers** → Handle HTTP request/response only
- **Services** → Encapsulate business logic (scoring, scheduling, analytics)
- **Middleware** → Auth verification, role checking, input validation
- **Routes** → Mounting order matters! Named routes (`/assign-question`) before parameterized (`/:id`)
- **Error Format** → `{ error: "message" }` for errors, `{ message: "...", data: {...} }` for success
- **Database** → All field names in English (snake_case); Prisma matches DB columns directly

### Useful Commands

```bash
npm run lint              # Syntax check all backend JavaScript files
npm run check             # Alias for lint (quick local health check)
npm run cleanup:question-text-tags # Remove legacy [XII-IPS]/[MULTIPLE] prefixes from question_text
npx prisma studio          # GUI database browser
npx prisma db push --force-reset  # Reset database (delete all data + recreate)
npx prisma db seed          # Re-seed sample data
npx prisma generate         # Regenerate client after schema changes
```

After `db push --force-reset`, run seed and login again in dashboard because old JWT sessions become invalid.

## Coding Standards

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Prisma Model | PascalCase English | `QuestionBank`, `ExamParticipant` |
| Prisma Field | snake_case English | `question_bank_id`, `full_name` |
| DB Table | snake_case English (via `@@map`) | `question_banks`, `exam_participants` |
| DB Column | Same as field name (no `@map`) | `full_name`, `grade_level` |
| Enum Type | PascalCase English | `ExamStatus`, `QuestionType` |
| Enum Value | UPPER_SNAKE English | `SINGLE_CHOICE`, `IN_PROGRESS` |
| JS Variable | camelCase | `examParticipant`, `totalScore` |
| JS Function | camelCase | `getMyExams`, `startExam` |
| Route Path | kebab-case | `/assign-question`, `/exam-results` |
| File Name | camelCase | `studentController.js`, `examRoutes.js` |

### Code Style

- **Controllers** handle request/response only — business logic in services when complex
- **Services** encapsulate reusable logic (activity logging, auto-finish scoring, etc.)
- **Middleware** handles auth verification, role checking, input validation
- **Routes** define HTTP method + path + middleware chain + controller function
- Named routes (e.g., `/assign-question`) must be defined **before** parameterized routes (e.g., `/:id`) to avoid Express route shadowing
- All Prisma queries use **English field names** — DB columns match field names directly (no `@map` translation)
- Error responses use `{ error: "message" }` format
- Success responses use `{ message: "...", data: {...} }` format (varies per endpoint)

### Project Structure

```
cbt-backend/
├── index.js                    # Entry point, route mounting, scheduler start
├── package.json
├── API_DOCUMENTATION.md        # Full API reference (77 endpoints)
├── prisma/
│   ├── schema.prisma           # Database schema (14 models, 4 enums, all English)
│   ├── seed.js                 # Sample data seeder
│   └── migrations/             # Migration history
├── src/
│   ├── config/
│   │   └── db.js               # Prisma Client singleton
│   ├── controllers/
│   │   ├── authController.js         # Login, register, profile
│   │   ├── questionController.js     # Question bank CRUD + question CRUD
│   │   ├── examController.js         # Exam CRUD + assign questions/students
│   │   ├── studentController.js      # Student exam operations
│   │   ├── userController.js         # Admin user management + teacher grading
│   │   ├── activityController.js     # Admin exam monitoring
│   │   ├── activityLogController.js  # Activity log queries
│   │   ├── examResultController.js   # Exam results
│   │   ├── schoolProfileController.js # School profile (public/admin)
│   │   └── analyticsController.js    # Teacher/coordinator analytics endpoints
│   ├── middlewares/
│   │   ├── validationMiddleware.js   # JWT verify, role check, input validation
│   │   └── resolveRole.js           # Resolve teacher/student from JWT user
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── questionRoutes.js
│   │   ├── examRoutes.js
│   │   ├── studentRoutes.js
│   │   ├── userRoutes.js
│   │   ├── activityRoutes.js
│   │   ├── examResultRoutes.js
│   │   ├── activityLogRoutes.js
│   │   ├── schoolProfileRoutes.js
│   │   └── analyticsRoutes.js
│   └── services/
│       ├── activityLogService.js     # Activity log CRUD
│       ├── autoFinishService.js      # Auto-finish expired sessions
│       ├── autoExpireExamService.js  # Auto-expire exam status
│       ├── examService.js           # Exam business logic (guard, weights)
│       ├── scoreService.js          # Score calculation & grading
│       ├── userService.js           # User CRUD & profile management
│       └── analyticsService.js      # Analytics aggregations for dashboard/audit
└── tests/
    └── integration/
```

## Database Schema

### Models (14)

| Model | DB Table | Description |
|-------|----------|-------------|
| User | users | User accounts (username, password, role) |
| Admin | admins | Admin profile |
| Teacher | teachers | Teacher profile |
| Student | students | Student profile (classroom, grade_level, major) |
| QuestionBank | question_banks | Question bank (globally unique name) |
| Question | questions | Question (Single Choice, Multiple Choice, Essay) |
| AnswerOption | answer_options | MC answer options |
| Exam | exams | Exam (schedule, duration, status) |
| ExamQuestion | exam_questions | Question assigned to exam (weight, sequence) |
| ExamParticipant | exam_participants | Student participation (status, times, block) |
| Answer | answers | Student answer (MC option IDs or essay text) |
| ExamResult | exam_results | Final exam score |
| ActivityLog | activity_logs | System activity log |
| Migration | migrations | Laravel migration compatibility |

### Enums (4)

| Enum | Values |
|------|--------|
| Role | `admin`, `teacher`, `student` |
| ExamStatus | `SCHEDULED`, `ONGOING`, `ENDED` |
| ExamParticipantStatus | `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `GRADED` |
| Subject | `subject_id`, `name`, `color`, `sort_order`, `is_active` |
| GradeLevel | `grade_level_id`, `value`, `label`, `sort_order`, `is_active` |
| Major | `major_id`, `value`, `label`, `sort_order`, `is_active` |
| SchoolProfile | Singleton (`id = 1`), `school_name`, `npsn`, `address`, `phone`, `email`, `logo_url`, `principal_name`, `school_level`, `accreditation` |
| QuestionType | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `ESSAY` |

## Global Deadline System

All exam participants share the same deadline: **`exam.end_date`**.

When a teacher creates an exam, they set `start_date` (when students can begin) and `end_date` (when ALL students must finish). Every student must complete their exam by `end_date`, regardless of when they personally started.

### Auto-Finish Flow

1. Scheduler runs every 60 seconds
2. Queries all `ExamParticipant` with status `IN_PROGRESS`
3. For each: checks if `now > exam.end_date`
4. If expired:
   - Auto-grades MC answers (Single Choice: exact match, Multiple Choice: exact set match)
   - Essay questions are skipped (require manual teacher grading)
   - Creates `ExamResult` with calculated `final_score`
   - Updates status to `COMPLETED` (has essay) or `GRADED` (no essay)
   - Logs `AUTO_FINISH_UJIAN` activity

### Auto-Expire Flow

1. Scheduler runs every 60 seconds
2. Queries all `Exam` with status `SCHEDULED` or `ONGOING` where `end_date < now`
3. Updates exam status to `ENDED`
4. Logs `UJIAN_AUTO_EXPIRED` activity

### Activity Types

| Type | Description |
|------|-------------|
| `LOGIN`, `LOGOUT`, `CHANGE_PASSWORD` | Authentication events |
| `START_EXAM`, `FINISH_EXAM`, `EXAM_VIOLATION` | Student exam lifecycle |
| `AUTO_FINISH_UJIAN` | Exam auto-finished (past `end_date`) |
| `UJIAN_AUTO_EXPIRED`, `UJIAN_MANUAL_EXPIRED` | Exam status forced to `ENDED` |
| `CREATE_EXAM`, `UPDATE_EXAM`, `DELETE_EXAM` | Teacher exam CRUD |
| `REASSIGN_STUDENTS` | Exam participants reassigned after category change |
| `CREATE_QUESTION_BANK`, `UPDATE_QUESTION_BANK`, `DELETE_QUESTION_BANK` | Teacher bank CRUD |
| `CREATE_QUESTION`, `UPDATE_QUESTION`, `DELETE_QUESTION` | Teacher question CRUD |
| `CALCULATE_RESULT`, `UPDATE_MANUAL_SCORE` | Result computation + essay grading |
| `BLOCK_STUDENT`, `UNBLOCK_STUDENT`, `GENERATE_UNLOCK` | Admin anti-cheat actions |
| `BATCH_DELETE_USERS` | Admin bulk user deletion |
| `UPDATE_SCHOOL_PROFILE` | Admin updated school identity |

> The HTTP controllers create these via `activityLogService.logFromRequest(req, type, description, extras?)` — a thin wrapper that fills `user_id` / `ip_address` / `user_agent` from the request so callers stay focused on the event payload.

## API Documentation

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for the complete reference of all 77 endpoints with request/response examples.

## Super Admin

- **admin1** is the Super Admin (set in seed)
- Super Admin cannot be deleted, role-changed, or deactivated by other admins
- JWT payload includes `is_super_admin: true/false`
- Dashboard displays a special badge for Super Admin

## License

ISC
