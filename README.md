# CBT Backend API

Backend server for the Computer-Based Test (CBT) application built with Node.js, Express, and Prisma ORM.

## Features

- **JWT Authentication** — Login, register, profile management with token-based auth
- **Role-Based Access Control** — Admin, Teacher, Student with middleware protection
- **Super Admin** — Protected admin account that cannot be deleted or modified by other admins
- **Question Bank Management** — CRUD with globally unique bank names
- **Question Management** — Single Choice, Multiple Choice, and Essay with answer options
- **Exam Management** — Create exams, assign questions from banks, auto-assign students
- **Exam Taking** — Start exam, auto-save answers, finish exam with auto-grading
- **Global Deadline** — All students share the same `end_date` deadline regardless of start time
- **Auto-Finish Scheduler** — Automatically finishes exams past `end_date` every 60 seconds
- **Auto-Expire Scheduler** — Automatically changes exam status to ENDED after `end_date`
- **Grading** — Auto-grading for MC, manual grading for essay, score finalization
- **Auto-Reassign Students** — Reassign exam participants when category (grade_level/major) changes
- **Activity Logging** — Logs LOGIN, START_UJIAN, FINISH_UJIAN, AUTO_FINISH, etc.
- **Activity Monitoring** — Admin real-time exam monitoring, block/unblock participants
- **Active Users Tracking** — View users who logged in within N hours
- **School Profile** — Public read endpoint and admin update endpoint for school identity
- **Analytics for Teacher/Coordinator** — Dashboard summary, question stats, teacher performance, coordinator audit

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js v18+ |
| Framework | Express.js v5 |
| ORM | Prisma v6.19 |
| Database | MySQL (XAMPP) |
| Auth | JWT (jsonwebtoken) |
| Encryption | bcryptjs |
| Validation | Joi |

## Setup

### Prerequisites

- Node.js v18+
- MySQL database (XAMPP/WAMP or standalone)
- npm

### Installation

```bash
cd cbt-backend
npm install
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
# PowerShell
Copy-Item .env.example .env
```

or create `.env` manually:

```env
DATABASE_URL="mysql://username:password@localhost:3306/cbt_database"
PORT=3000
JWT_SECRET=your_secret_key_here
CORS_ORIGINS="http://localhost:3001,http://localhost:3000"
```

### Database Setup

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database (creates tables)
npx prisma db push

# Seed sample data (optional)
npx prisma db seed
```

If `prisma migrate dev` reports migration drift in local development, use `prisma db push` for schema sync, then run seed again.

**Seed data creates:** 3 Admins (1 Super Admin), 8 Teachers, 108 Students, 36 Question Banks, 720 Questions, 13 Exams, ~156 Exam Participants, ~510 Answers, 25 Exam Results, ~142 Activity Logs.

### Running the Server

```bash
# Development (auto-reload)
npm run dev

# Production
node index.js
```

Server runs at `http://localhost:3000`. On startup, two schedulers automatically activate:

- **Auto-Finish Scheduler** — Checks for expired sessions every 60 seconds, auto-finishes students past `end_date`
- **Auto-Expire Scheduler** — Checks for exams past `end_date`, changes status to ENDED

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
| `LOGIN` | User logged in |
| `START_UJIAN` | Student started an exam |
| `FINISH_UJIAN` | Student manually finished an exam |
| `AUTO_FINISH_UJIAN` | Exam auto-finished (past end_date) |
| `UJIAN_AUTO_EXPIRED` | Exam status changed to ENDED automatically |
| `UJIAN_MANUAL_EXPIRED` | Exam status changed to ENDED manually |
| `REASSIGN_STUDENTS` | Exam participants reassigned after category change |

## API Documentation

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for the complete reference of all 77 endpoints with request/response examples.

## Super Admin

- **admin1** is the Super Admin (set in seed)
- Super Admin cannot be deleted, role-changed, or deactivated by other admins
- JWT payload includes `is_super_admin: true/false`
- Dashboard displays a special badge for Super Admin

## License

ISC
