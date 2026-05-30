# CBT Backend — Complete API Documentation

**77 endpoints** covering authentication, question management, exam administration, student exam operations, user management, activity monitoring, results grading, and analytics.

- **Backend Repo:** [cbt-backend](../cbt-backend/)  
- **Backend README:** [Backend Setup Guide](../cbt-backend/README.md)
- **Dashboard Repo:** [cbt-dashboard](../cbt-dashboard/)  
- **Mobile App Repo:** [cbt_app](../cbt_app/)

---

## Quick Start

### Base URL

```
http://localhost:3000/api
```

### Authentication

All endpoints (except `/auth/login`, `/auth/register`, and `/school-profile`) require JWT token:

```
Authorization: Bearer <token>
```

**JWT Payload:** `{ id, role, is_super_admin }`  
**Expiry:** 24 hours

### Response Format

**Success (2xx):**
```json
{ "message": "...", "data": {...}, ...other fields }
```

**Error (4xx/5xx):**
```json
{ "error": "Error description" }
```

---

## Endpoint Overview

| Group | Endpoints | Auth Required | Primary Users |
|-------|-----------|---------------|---------------|
| Auth | 6 | No/Yes | All |
| Questions | 11 | Yes | Teachers |
| Exams | 13 | Yes | Teachers |
| Student Exam | 5 | Yes (Student) | Students |
| User Management | 15 | Yes (Admin/Teacher) | Admin/Teachers |
| Activity Monitoring | 6 | Yes (Admin) | Admin |
| Exam Results | 9 | Yes | Students/Teachers |
| Activity Logs | 5 | Yes | Admin/Teachers |
| School Profile | 2 | No/Yes (Admin) | All/Admin |
| Analytics | 4 | Yes (Teacher) | Teachers |
| Taxonomy | 10 | No/Yes (Admin) | All/Admin |
| Upload | 2 | Yes (Admin/Teacher) | Admin/Teachers |
| Misc | 1 | No | All |
| **TOTAL** | **92** | — | — |

---

## Base URL

```
http://localhost:3000/api
```

## Authentication

All endpoints (except auth) require a JWT token in the header:

```
Authorization: Bearer <token>
```

JWT payload: `{ id, role, is_super_admin }` — expires in 24 hours.

---

## 1. Auth (`/api/auth`)

### POST `/api/auth/register`

Register a new user. **Admin-only** — requires authentication.

**Middleware:** `verifyToken`, `checkRole('admin')`, `validateRegister`

**Request Body:**

```json
{
  "username": "teacher1",
  "password": "password123",
  "role": "teacher",
  "full_name": "Budi Santoso",
  "classroom": "XII-IPA-1",
  "grade_level": "XII",
  "major": "IPA"
}
```

> `classroom`, `grade_level`, `major` are required only when `role = "student"`.

**Response (201):**

```json
{ "message": "User berhasil didaftarkan", "userId": 1 }
```

---

### POST `/api/auth/login`

Authenticate and receive a JWT token.

**Request Body:**

```json
{ "username": "teacher1", "password": "password123" }
```

**Response (200):**

```json
{
  "message": "Login berhasil",
  "token": "eyJhbG...",
  "user": {
    "id": 1,
    "role": "teacher",
    "is_super_admin": false,
    "profile": {
      "teacher_id": 1,
      "full_name": "Budi Santoso"
    }
  }
}
```

**Error Responses:** `401` Invalid credentials (same message for both wrong username and wrong password — timing-attack mitigation) · `403` Account deactivated

---

### POST `/api/auth/logout`

Log out the authenticated user. Stateless — clears session on client side. Logs the logout event.

**Middleware:** `verifyToken`

**Response (200):**

```json
{ "message": "Logout berhasil" }
```

---

### GET `/api/auth/me`

Get the authenticated user's profile.

**Middleware:** `verifyToken`

**Response (200):**

```json
{
  "message": "Profile fetched",
  "user": {
    "id": 1,
    "role": "teacher",
    "is_super_admin": false,
    "profile": { "teacher_id": 1, "full_name": "Budi Santoso" }
  }
}
```

---

### PATCH `/api/auth/profile`

Update the authenticated user's profile.

**Middleware:** `verifyToken`

**Request Body (role-dependent, all fields optional):**

- **Shared (all roles):** `username`
- **Student:** `full_name`, `nisn`
- **Teacher:** `full_name`, `nip`
- **Admin:** `full_name`

```json
{
  "full_name": "Budi S.",
  "nisn": "0012345678"
}
```

> Students can only update `full_name` and `nisn` — fields like `classroom`, `grade_level`, `major` are admin-managed. Teachers can update `full_name` and `nip`. Admins can only update `full_name`.

**Response (200):**

```json
{
  "message": "Profile updated",
  "user": { "id": 1, "role": "student", "profile": { "..." } }
}
```

**Error Responses:** `409` Username already exists

---

### PATCH `/api/auth/change-password`

Change password for the authenticated user.

**Middleware:** `verifyToken`

**Request Body:**

```json
{
  "current_password": "passwordlama123",
  "new_password": "PasswordBaru123"
}
```

**Password Policy:**

- Minimum 8 characters
- Must contain uppercase letter
- Must contain lowercase letter
- Must contain digit
- Must be different from current password

**Response (200):**

```json
{ "message": "Password berhasil diubah" }
```

---

## 2. Question Bank & Questions (`/api/questions`) — Teacher Only

All routes require `verifyToken` + `checkRole('teacher')`.

### POST `/api/questions/bank`

Create a question bank. Bank name must be **globally unique**.

**Request Body:**

```json
{
  "bank_name": "Matematika Kelas XII IPA - Integral",
  "description": "Soal-soal integral",
  "subject": "Matematika",
  "grade_level": "XII",
  "major": "IPA"
}
```

**Response (201):**

```json
{ "message": "Bank soal berhasil dibuat", "question_bank": { "question_bank_id": 1, "..." } }
```

**Error:** `409` Duplicate bank name

---

### GET `/api/questions/bank`

List all question banks owned by the authenticated teacher.

**Response (200):**

```json
{
  "question_bank": [
    {
      "question_bank_id": 1,
      "bank_name": "...",
      "description": "...",
      "subject": "Matematika",
      "grade_level": "XII",
      "major": "IPA",
      "total_questions": 10,
      "mc_count": 8,
      "essay_count": 2
    }
  ],
  "total_banks": 1,
  "total_questions": 10
}
```

---

### GET `/api/questions/bank/:questionBankId`

Get all questions in a specific bank.

**Response (200):**

```json
{
  "bankInfo": { "question_bank_id": 1, "bank_name": "...", "subject": "...", "grade_level": "...", "major": "..." },
  "questions": [{ "question_id": 1, "question_type": "SINGLE_CHOICE", "question_text": "...", "answer_options": [...] }],
  "stats": { "total_questions": 10, "total_pg_single": 5, "total_pg_multiple": 3, "total_essay": 2 }
}
```

---

### PUT `/api/questions/bank/:id`

Update a question bank. Ownership verified.

**Request Body:**

```json
{ "bank_name": "New Name", "description": "...", "subject": "...", "grade_level": "...", "major": "..." }
```

---

### DELETE `/api/questions/bank/:id`

Delete a question bank and **all its questions** (cascade). Ownership verified.

---

### POST `/api/questions/`

Create a question. Must belong to a question bank.

**Request Body:**

```json
{
  "question_bank_id": 1,
  "question_type": "SINGLE_CHOICE",
  "question_text": "What is 2 + 2?",
  "subject": "Matematika",
  "grade_level": "XII",
  "major": "IPA",
  "question_image": null,
  "question_explanation": "2 + 2 = 4",
  "answer_options": [
    { "label": "A", "option_text": "3", "is_correct": false },
    { "label": "B", "option_text": "4", "is_correct": true },
    { "label": "C", "option_text": "5", "is_correct": false },
    { "label": "D", "option_text": "6", "is_correct": false }
  ]
}
```

> `question_type` values: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `ESSAY`

**Response (201):**

```json
{ "message": "Soal berhasil dibuat", "question_id": 1 }
```

---

### GET `/api/questions/`

List questions owned by the teacher. Optional query filters: `subject`, `grade_level`, `major`, `question_type`, `page`, `limit`.

**Response (200):** Paginated response with `data` array and `pagination` object.

---

### GET `/api/questions/:id`

Get a question by ID with its answer options.

---

### PUT `/api/questions/:id`

Update a question. If `answer_options` provided, old options are **replaced entirely**.

---

### DELETE `/api/questions/:id`

Delete a question. Ownership verified.

---

### GET `/api/questions/exam/:exam_id/available`

Get questions available to assign to an exam (filters by exam's subject/grade/major, excludes already-assigned).

---

### POST `/api/questions/assign-bank`

Assign all questions from a bank to an exam.

**Request Body:**

```json
{ "exam_id": 1, "question_bank_id": 1 }
```

**Response (201):**

```json
{ "message": "5 soal berhasil ditambahkan ke ujian", "question_bank_id": 1, "questions_added": 5 }
```

---

## 3. Exams (`/api/exams`) — Teacher Only

All routes require `verifyToken` + `checkRole('teacher')`.

### POST `/api/exams/`

Create an exam. Students matching `grade_level` + `major` are **automatically assigned** as participants.

**Request Body:**

```json
{
  "exam_name": "UTS Matematika XII IPA",
  "subject": "Matematika",
  "grade_level": "XII",
  "major": "IPA",
  "start_date": "2025-06-01T08:00:00.000Z",
  "end_date": "2025-06-01T10:00:00.000Z",
  "duration_minutes": 120,
  "is_shuffle_questions": false
}
```

> **Dual Timer System:** `end_date` is the global hard deadline — every participant must finish by this time. `duration_minutes` is the per-student timer — when a student starts, their effective deadline is `min(start_time + duration_minutes, end_date)`. Both fields are actively used for time enforcement.

**Response (201):**

```json
{
  "message": "Ujian berhasil dibuat",
  "exam": { "exam_id": 1, "exam_name": "UTS Matematika XII IPA", "..." : "..." },
  "auto_assigned_students": 30
}
```

---

### GET `/api/exams/`

List all exams owned by the teacher with pagination. Returns question/participant **counts** (not full records).

**Query Parameters:** `page` (default 1), `limit` (default 20)

**Response (200):**

```json
{
  "data": [ { "exam_id": 1, "exam_name": "...", "_count": { "exam_questions": 10, "exam_participants": 30 }, "..." : "..." } ],
  "pagination": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET `/api/exams/:id`

Get exam details including questions (with answer options) and participants (with results).

---

### PUT `/api/exams/:id`

Update an exam.

**Request Body:** Same fields as create (all optional).

---

### DELETE `/api/exams/:id`

Delete an exam and all related data.

---

### POST `/api/exams/assign-question`

Assign a single question to an exam. Sequence is auto-calculated.

**Request Body:**

```json
{ "exam_id": 1, "question_id": 5, "score_weight": 10 }
```

---

### POST `/api/exams/assign-bank`

Assign all questions from a bank to an exam (batch). Score weight is fixed at 10.

**Request Body:**

```json
{ "exam_id": 1, "question_bank_id": 1, "max_questions": 20, "shuffle": true }
```

> `max_questions` (optional): limit number of questions assigned from the bank. `shuffle` (optional): randomize question order before assigning.

---

### POST `/api/exams/assign-student`

Assign students matching criteria to an exam.

**Request Body:**

```json
{ "exam_id": 1, "grade_level": "XII", "major": "IPA" }
```

---

### DELETE `/api/exams/:examId/questions/:questionId`

Remove a single question from an exam.

---

### POST `/api/exams/remove-multiple-questions`

Remove multiple questions from an exam.

**Request Body:**

```json
{ "exam_id": 1, "exam_question_ids": [1, 2, 3] }
```

---

### POST `/api/exams/remove-bank`

Remove all questions from a specific bank from an exam.

**Request Body:**

```json
{ "exam_id": 1, "question_bank_id": 1 }
```

---

### DELETE `/api/exams/:id/clear-questions`

Remove ALL questions from an exam.

---

### POST `/api/exams/reassign-students`

Clear NOT_STARTED participants and re-assign students matching new grade/major criteria. Preserves participants with status IN_PROGRESS, COMPLETED, or GRADED.

**Request Body:**

```json
{ "exam_id": 1, "grade_level": "XII", "major": "IPA" }
```

> `major` is optional. Only participants with status `NOT_STARTED` are removed — active/completed participants are preserved.

**Response (200):**

```json
{
  "message": "Peserta berhasil di-reassign. 25 dihapus, 30 ditambahkan.",
  "removed": 25,
  "assigned": 30
}
```

---

### GET `/api/exams/:id/questions-by-bank`

Get exam questions grouped by their question bank.

---

### PUT `/api/exams/update-weight-multiple`

Update score weights for multiple questions.

**Request Body:**

```json
{
  "exam_id": 1,
  "updates": [
    { "exam_question_id": 1, "score_weight": 15 },
    { "exam_question_id": 2, "score_weight": 20 }
  ]
}
```

---

## 4. Student Exam (`/api/students`) — Student Only

All routes require `verifyToken` + `checkRole('student')`.

### GET `/api/students/exams`

Get exams assigned to the authenticated student (only `SCHEDULED` and `ONGOING` exams).

**Response (200):**

```json
{
  "exams": [
    {
      "exam_participant_id": 1,
      "exam_id": 1,
      "exam_name": "UTS Matematika",
      "subject": "Matematika",
      "grade_level": "XII",
      "major": "IPA",
      "start_date": "2025-06-01T08:00:00.000Z",
      "end_date": "2025-06-01T10:00:00.000Z",
      "duration_minutes": 120,
      "total_questions": 10,
      "exam_status": "NOT_STARTED",
      "is_blocked": false,
      "is_shuffle": false,
      "teacher_name": "Budi Santoso",
      "time_status": "Sedang Berlangsung"
    }
  ]
}
```

> `time_status` values: `"Belum Mulai"`, `"Sedang Berlangsung"`, `"Sudah Berakhir"`.

---

### POST `/api/students/exams/start`

Start an exam. Sets status to `IN_PROGRESS` and returns the question list.

**Request Body:**

```json
{ "exam_id": 1, "unlock_code": "A1B2C3" }
```

> `unlock_code` is only required if the student is blocked.

**Response (200):**

```json
{
  "exam_participant_id": 1,
  "exam": {
    "exam_id": 1,
    "exam_name": "UTS Matematika",
    "subject": "Matematika",
    "duration_minutes": 120,
    "end_date": "2025-06-01T10:00:00.000Z"
  },
  "remaining_seconds": 7140,
  "total_questions": 10,
  "questions": [
    {
      "exam_question_id": 1,
      "sequence": 1,
      "score_weight": 10,
      "question": {
        "question_id": 1,
        "question_type": "SINGLE_CHOICE",
        "question_text": "What is 2 + 2?",
        "question_image": null,
        "answer_options": [
          { "option_id": 1, "label": "A", "option_text": "3" },
          { "option_id": 2, "label": "B", "option_text": "4" }
        ]
      }
    }
  ],
  "existing_answers": [
    { "question_id": 1, "mc_option_ids": "2", "essay_answer_text": null }
  ]
}
```

> **Note:** `is_correct` is hidden from answer options. `existing_answers` contains previously saved answers (useful when resuming). `remaining_seconds` is the countdown to `min(start_time + duration_minutes, end_date)`.

**Error Responses:** `403` Blocked (needs unlock code) · `400` Already finished / Not started yet / Past end_date

---

### POST `/api/students/exams/answer`

Submit or update an answer for a single question (auto-save).

**Request Body (Single Choice):**

```json
{ "exam_participant_id": 1, "question_id": 5, "mc_option_ids": 12 }
```

**Request Body (Multiple Choice):**

```json
{ "exam_participant_id": 1, "question_id": 6, "mc_option_ids": [10, 12, 14] }
```

**Request Body (Essay):**

```json
{ "exam_participant_id": 1, "question_id": 7, "essay_answer_text": "The answer is..." }
```

> Sending null/empty `mc_option_ids` AND empty `essay_answer_text` deletes an existing answer (unselect behavior). The `is_correct` field is automatically computed and persisted for MC questions.

---

### POST `/api/students/exams/finish`

Finish an exam. Auto-grades MC questions, creates exam result.

**Request Body:**

```json
{ "exam_participant_id": 1 }
```

**Response (200):**

```json
{
  "message": "Ujian berhasil diselesaikan",
  "result": {
    "exam_participant_id": 1,
    "final_score": 85.71,
    "total_score": 60,
    "total_weight": 70,
    "has_essay": false,
    "status": "GRADED"
  }
}
```

> If the exam contains ungraded essay questions, `status` = `"COMPLETED"` until the teacher finalizes. If all questions are MC or all essays are graded, `status` = `"GRADED"`.

---

### POST `/api/students/exams/report-violation`

Student self-reports an app lifecycle violation (e.g., leaving the app during exam). Automatically blocks the participant.

**Request Body:**

```json
{
  "exam_participant_id": 1,
  "violation_type": "APP_BACKGROUNDED",
  "details": "Student left the app for 5 seconds"
}
```

> `violation_type` max 100 chars. `details` max 500 chars (optional). Logs `EXAM_VIOLATION` activity.

**Response (200):**

```json
{ "message": "Pelanggaran dilaporkan", "is_blocked": true }
```

---

## 5. User Management (`/api/users`) — Admin & Teacher

### GET `/api/users/` — Admin

List all users with pagination and search.

**Query Parameters:** `search` (searches username + full_name), `limit` (default 10), `page` (default 1)

**Response (200):**

```json
{
  "data": [
    {
      "id": 1, "username": "student1", "role": "student",
      "is_active": true, "is_super_admin": false,
      "created_at": "...", "updated_at": "...",
      "profile": {
        "student_id": 1, "full_name": "Ahmad",
        "classroom": "XII-IPA-1", "grade_level": "XII", "major": "IPA"
      }
    }
  ],
  "pagination": {
    "total": 50, "page": 1,
    "limit": 10, "totalPages": 5
  }
}
```

---

### GET `/api/users/admins` — Admin

List all admin users with pagination. Query: `limit`, `page`, `search`.

---

### GET `/api/users/teachers` — Admin

List all teacher users with pagination. Query: `limit`, `page`, `search`.

---

### GET `/api/users/students` — Admin

List all student users with pagination and search. Query: `limit`, `page`, `search`.

---

### GET `/api/users/count` — Admin

Count users by role.

**Response (200):**

```json
{ "admin": 2, "teacher": 8, "student": 90, "total": 100 }
```

---

### POST `/api/users/` — Admin

Create a new user.

**Request Body:**

```json
{
  "username": "student99",
  "password": "password123",
  "role": "student",
  "full_name": "Ahmad Rizki",
  "classroom": "XII-IPA-1",
  "grade_level": "XII",
  "major": "IPA"
}
```

> For students: `classroom`, `grade_level`, `major` are **required**. Valid `grade_level`: X, XI, XII. Valid `major`: IPA, IPS, Bahasa. Classroom format: `grade_level-major-number` (e.g., XII-IPA-1).

---

### POST `/api/users/batch` — Admin

Batch import users.

**Request Body:**

```json
{
  "users": [
    { "username": "s1", "password": "pass", "role": "student", "full_name": "A", "classroom": "XII-IPA-1", "grade_level": "XII", "major": "IPA" },
    { "username": "s2", "password": "pass", "role": "student", "full_name": "B", "classroom": "XII-IPA-1", "grade_level": "XII", "major": "IPA" }
  ]
}
```

**Response (200):**

```json
{
  "message": "2 user berhasil dibuat, 1 gagal",
  "success": [{ "username": "s1", "id": 10 }, { "username": "s2", "id": 11 }],
  "failed": ["s3"],
  "errors": [{ "username": "s3", "error": "Username sudah digunakan" }]
}
```

---

### POST `/api/users/batch-delete` — Admin

Batch delete users. Two modes: by explicit user IDs, or by grade/major/classroom filter (for graduating classes). Self and Super Admin are always excluded.

**Request Body (Mode 1 — by IDs):**

```json
{ "user_ids": [10, 11, 12] }
```

**Request Body (Mode 2 — by filter):**

```json
{ "grade_level": "XII", "major": "IPA", "classroom": "XII-IPA-1" }
```

> `major` and `classroom` are optional filters when using `grade_level`.

**Response (200):**

```json
{
  "message": "5 user berhasil dihapus",
  "deleted_count": 5,
  "skipped_count": 1,
  "skipped_users": ["admin1"]
}
```

---

### GET `/api/users/:id` — Admin

Get detailed user info.

---

### PUT `/api/users/:id` — Admin

Update a user. Super Admin can only be edited by themselves. Fields are **flat** (no nested `profile` object).

**Request Body:**

```json
{
  "username": "newname",
  "password": "newpass",
  "full_name": "New Name",
  "classroom": "XII-IPA-2",
  "grade_level": "XII",
  "major": "IPA",
  "nisn": "0012345678",
  "nip": "198501012010011001"
}
```

> All fields are optional. `classroom`, `grade_level`, `major`, `nisn` apply to students. `nip` applies to teachers. `username` and `password` apply to all roles.

---

### PUT `/api/users/:id/role` — Admin

Change a user's role. Creates new role-specific profile and deletes old one. Super Admin role cannot be changed.

**Request Body:**

```json
{ "new_role": "teacher" }
```

---

### PATCH `/api/users/:id/status` — Admin

Toggle user active/inactive. Super Admin status cannot be toggled.

---

### DELETE `/api/users/:id` — Admin

Delete a user. Super Admin cannot be deleted.

---

### POST `/api/users/score` — Teacher

Grade an essay answer manually.

**Request Body:**

```json
{ "answer_id": 15, "manual_score": 85 }
```

> Score must be 0–100. Teacher ownership of the exam is verified.

---

### POST `/api/users/finalize` — Teacher

Finalize scoring for a participant. Recalculates total: MC uses `is_correct`, essay uses `manual_score`. Sets status to `GRADED`.

**Request Body:**

```json
{ "exam_participant_id": 1 }
```

**Response (200):**

```json
{
  "message": "Nilai berhasil difinalisasi",
  "result": {
    "exam_participant_id": 1,
    "final_score": 85.71,
    "total_score": 60,
    "total_weight": 70,
    "has_essay": true,
    "status": "GRADED"
  }
}
```

---

## 6. Activity Monitoring (`/api/admin/activities`) — Admin Only

All routes require `verifyToken` + `checkRole('admin')`.

### GET `/api/admin/activities/`

List all exams with participant status overview.

**Query Parameters:** `major` ("all" or specific), `classroom` ("all" or grade_level), `jenis_ujian` ("all", contains "akhir" or "tengah")

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "exam_id": 1, "exam_name": "UTS Matematika", "subject": "Matematika",
      "major": "IPA", "grade_level": "XII",
      "exam_type": "Ujian Tengah Semester",
      "participant_count": 30,
      "status": "Sedang ONGOING",
      "start_date": "...", "end_date": "...", "duration_minutes": 120
    }
  ]
}
```

---

### GET `/api/admin/activities/:examId/participants`

Get participants for a specific exam.

**Query Parameters:** `major`, `classroom`, `status` ("BLOCKED", "ON_PROGRESS", "SUBMITTED", or "all")

---

### GET `/api/admin/activities/participant/:examParticipantId`

Get detailed info about a single participant.

---

### POST `/api/admin/activities/:examParticipantId/block`

Block a participant (e.g., suspected cheating).

**Request Body:**

```json
{ "block_reason": "Terdeteksi meninggalkan aplikasi" }
```

---

### POST `/api/admin/activities/:examParticipantId/generate-unlock`

Generate a **6-character** unlock code for a blocked participant.

**Response (200):**

```json
{ "success": true, "data": { "exam_participant_id": 1, "full_name": "Ahmad", "unlock_code": "A1B2C3" } }
```

---

### POST `/api/admin/activities/:examParticipantId/unblock`

Unblock a participant using the unlock code.

**Request Body:**

```json
{ "unlock_code": "A1B2C3" }
```

---

## 7. Exam Results (`/api/exam-results`) — Student & Teacher

### GET `/api/exam-results/my-results` — Student

Get the authenticated student's exam results.

**Response (200):**

```json
{
  "results": [
    {
      "exam_result_id": 1,
      "final_score": 85.71,
      "submit_date": "2026-02-26T12:00:00.000Z",
      "exam_participant": {
        "exam": { "exam_id": 1, "exam_name": "UTS Matematika", "subject": "Matematika", "grade_level": "XII", "major": "IPA" }
      }
    }
  ]
}
```

---

### GET `/api/exam-results/completed-exams` — Teacher

Get all completed exams (status `ENDED`) with score statistics. **All teachers see all ended exams** (no ownership filter).

**Query Parameters:** `page` (default: 1), `limit` (default: 10)

**Response (200):**

```json
{
  "data": [
    {
      "exam_id": 1,
      "exam_name": "UTS Matematika",
      "subject": "Matematika",
      "grade_level": "XII",
      "major": "IPA",
      "start_date": "...",
      "end_date": "...",
      "duration_minutes": 90,
      "exam_status": "ENDED",
      "teacher": { "teacher_id": 1, "full_name": "Budi Santoso" },
      "statistics": {
        "total_participants": 30,
        "total_completed": 28,
        "total_questions": 20,
        "highest_score": 100,
        "lowest_score": 45.5,
        "average_score": 72.35
      },
      "participant_results": [
        {
          "exam_participant_id": 1,
          "student": { "student_id": 1, "full_name": "Ahmad", "classroom": "XII-IPA-1" },
          "exam_status": "GRADED",
          "start_time": "...",
          "end_time": "...",
          "final_score": 85.71,
          "submit_date": "..."
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 9, "totalPages": 1 }
}
```

---

### GET `/api/exam-results/exam/:exam_id` — Teacher

Get results for all participants in an exam, ordered by score descending. **All teachers can view any exam** (no ownership check).

**Query Parameters:** `page` (default: 1), `limit` (default: 20)

**Response (200):**

```json
{
  "data": [
    {
      "exam_result_id": 1,
      "final_score": 85.71,
      "submit_date": "...",
      "exam_participant": {
        "student": { "student_id": 1, "full_name": "Ahmad", "classroom": "XII-IPA-1" }
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 28, "totalPages": 2 }
}
```

---

### GET `/api/exam-results/participant/:exam_participant_id` — Teacher

Get result for a single participant. **All teachers can view** (no ownership check).

**Response (200):**

```json
{
  "result": {
    "exam_result_id": 1,
    "final_score": 85.71,
    "submit_date": "...",
    "exam_participant": {
      "student": { "student_id": 1, "full_name": "Ahmad", "classroom": "XII-IPA-1" },
      "exam": { "exam_id": 1, "exam_name": "UTS Matematika", "subject": "Matematika" },
      "answers": [ { "answer_id": 1, "question": { "..." }, "is_correct": true, "manual_score": null } ]
    }
  }
}
```

---

### GET `/api/exam-results/detail/:exam_participant_id` — Teacher

Get detailed review: each question mapped to its answer, with `is_correct` and `score_obtained`. Returns `exam_status` from participant record. If no `ExamResult` exists yet (ungraded), falls back to `ExamParticipant` data and returns `exam_result: null`.

**Response (200) — with result:**

```json
{
  "exam_result": {
    "exam_result_id": 1,
    "final_score": 85.71,
    "submit_date": "2026-02-26T12:00:00.000Z"
  },
  "exam_status": "GRADED",
  "student": { "student_id": 1, "full_name": "Ahmad", "classroom": "XII-IPA-1" },
  "exam": { "exam_id": 1, "exam_name": "UTS Matematika", "subject": "Matematika" },
  "review": [
    {
      "sequence": 1,
      "question": { "question_id": 1, "question_type": "SINGLE_CHOICE", "question_text": "...", "answer_options": ["..."] },
      "score_weight": 10,
      "answer": { "answer_id": 1, "is_correct": true, "manual_score": null },
      "is_correct": true,
      "score_obtained": 10
    }
  ]
}
```

**Response (200) — without result (ungraded):**

```json
{
  "exam_result": null,
  "exam_status": "COMPLETED",
  "student": { "..." },
  "exam": { "..." },
  "review": [ { "sequence": 1, "question": { "..." }, "score_weight": 10, "answer": null, "is_correct": null, "score_obtained": 0 } ]
}
```

---

### POST `/api/exam-results/calculate` — Teacher

Calculate and save exam result. Auto-grades using `is_correct` for MC and `manual_score` for essay. Updates participant status to `GRADED` (all graded) or `COMPLETED` (has ungraded essay).

**Request Body:**

```json
{ "exam_participant_id": 1 }
```

**Response (200):**

```json
{
  "message": "Hasil ujian berhasil dihitung",
  "result": {
    "final_score": 85.71,
    "total_score": 60,
    "total_weight": 70,
    "status": "GRADED"
  }
}
```

---

### PUT `/api/exam-results/manual-score` — Teacher

Update manual score for an essay answer. **Automatically recalculates** `final_score` and updates participant status after saving.

**Request Body:**

```json
{ "answer_id": 15, "manual_score": 80 }
```

**Response (200):**

```json
{
  "message": "Nilai manual berhasil diupdate",
  "answer": { "answer_id": 15, "manual_score": 80, "..." },
  "recalculated": {
    "final_score": 85.71,
    "status": "GRADED"
  }
}
```

> `recalculated.status` will be `"GRADED"` when all essay answers have been scored, or `"COMPLETED"` when some essays remain unscored.

---

### POST `/api/exam-results/:examId/submit` — Teacher

Submit a completed exam to the archive. Used by the teacher Hasil Ujian page once grading is finalised — archived exams move from the **Aktif** tab to the **Arsip** tab.

**Middleware:** `verifyToken`, `checkRole('teacher')`, `resolveTeacher`

**Preconditions:**
- Exam must be in `ENDED` status (auto-set by the expiry scheduler once `end_date` passes)
- Exam must not already be archived (`teacher_submitted_at` must be null)

**Response (200):**

```json
{ "success": true, "message": "Ujian berhasil disubmit dan dipindahkan ke arsip" }
```

**Errors:**
- `400` — exam not yet `ENDED` or already archived
- `403` — teacher cannot access this subject

Internally sets `Exam.teacher_submitted_at = now()`, which excludes the exam from `GET /completed-exams` and includes it in `GET /archived-exams`.

---

### GET `/api/exam-results/archived-exams` — Teacher

List archived exams (those submitted via the endpoint above). Mirrors `GET /completed-exams` but filters on `teacher_submitted_at IS NOT NULL` and orders by archive timestamp descending.

**Query Parameters:**
- `page`, `limit` (optional, defaults `1` / `10`)

**Response (200):** Same paginated shape as `completed-exams`, with each row additionally carrying `teacher_submitted_at`. The statistics and participant breakdown payload come from the shared `formatExamForList` helper, so the two endpoints stay in sync.

---

## 8. Activity Logs (`/api/activity-logs`) — Admin & Teacher

All routes require `verifyToken` + `checkRole(['admin', 'teacher'])`.

### GET `/api/activity-logs/`

Get activity logs with optional filters.

**Query Parameters:** `user_id`, `activity_type`, `start_date`, `end_date`, `limit`

---

### GET `/api/activity-logs/active-users`

Get users who logged in within a time window.

**Query Parameters:** `hours` (default: 24)

**Response (200):**

```json
{
  "success": true,
  "hours_window": 24,
  "total_active": 15,
  "users": [
    {
      "user_id": 1, "username": "student1", "full_name": "Ahmad",
      "role": "student", "is_active": true,
      "last_login": "...", "ip_address": "...", "user_agent": "..."
    }
  ]
}
```

---

### GET `/api/activity-logs/user/:userId`

Get logs for a specific user. Query: `limit` (default: 50).

---

### GET `/api/activity-logs/exam-participant/:examParticipantId`

Get logs for a specific exam participant. Query: `limit` (default: 50).

---

### GET `/api/activity-logs/type/:activityType`

Get logs by activity type. Query: `limit` (default: 100).

**Activity Types:** `LOGIN`, `START_EXAM`, `FINISH_EXAM`, `AUTO_FINISH_UJIAN`, `UJIAN_AUTO_EXPIRED`, `UJIAN_MANUAL_EXPIRED`, `EXAM_VIOLATION`, `BLOCK_STUDENT`, `UPDATE_MANUAL_SCORE`, `CALCULATE_RESULT`

---

## 9. School Profile (`/api/school-profile`)

### GET `/api/school-profile/`

Get school profile used by login page, dashboard header, and Flutter app. Public endpoint.

**Auth:** Not required

**Response (200):**

```json
{
  "school_name": "SMA CBT Nusantara",
  "school_address": "Jl. Pendidikan No. 1",
  "school_phone": "021-1234567",
  "school_email": "info@smacbt.sch.id",
  "school_logo": null
}
```

---

### PUT `/api/school-profile/`

Update school profile. Admin only.

**Middleware:** `verifyToken`, `checkRole('admin')`

**Request Body (all fields optional):**

```json
{
  "school_name": "SMA CBT Nusantara",
  "school_address": "Jl. Pendidikan No. 1",
  "school_phone": "021-1234567",
  "school_email": "info@smacbt.sch.id",
  "school_logo": "https://.../logo.png"
}
```

**Response (200):**

```json
{
  "message": "Profil sekolah berhasil diperbarui",
  "data": { "school_name": "SMA CBT Nusantara", "...": "..." }
}
```

---

## 10. Analytics (`/api/analytics`) — Teacher Only

All routes require `verifyToken` + `checkRole('teacher')` + `resolveTeacher`.

### GET `/api/analytics/question-stats`

Get question-level statistics with filters and pagination.

**Query Parameters:**

- `exam_id` (optional)
- `question_bank_id` (optional)
- `subject` (optional, cross-subject only for coordinator)
- `question_type` (optional): `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `ESSAY`
- `sort_by` (optional): `correct_rate`, `incorrect_rate`, `total_attempts`, `avg_manual_score`
- `order` (optional): `asc`, `desc`
- `page`, `limit` (optional)

---

### GET `/api/analytics/dashboard-summary`

Get teacher dashboard summary cards (exam count, question bank count, question type distribution).

---

### GET `/api/analytics/teacher-performance`

Get interactive teacher performance insight for selected range/exam.

**Query Parameters:**

- `days` (optional, default 30, max 365)
- `exam_id` (optional)
- `subject` (optional; blocked for non-coordinator if not own subject)

**Response (200):**

```json
{
  "meta": {
    "days": 30,
    "from_date": "2026-03-01",
    "to_date": "2026-03-31",
    "subject": "Matematika",
    "selected_exam": { "exam_id": 10, "exam_name": "UTS Matematika" }
  },
  "summary": {
    "average_score": 82.5,
    "pass_rate": 78.2,
    "completion_rate": 91.3,
    "graded_rate": 85.4,
    "grading_backlog": 12
  },
  "recent_exams": [],
  "question_alerts": [
    {
      "question_id": 120,
      "question_bank_id": 9,
      "question_type": "SINGLE_CHOICE",
      "incorrect_rate": 100
    }
  ]
}
```

---

### GET `/api/analytics/coordinator-audit`

Get cross-subject audit overview for coordinator only.

**Access Rule:** teacher with `is_coordinator = true` only.

**Query Parameters:**

- `days` (optional, default 30, max 365)
- `limit` (optional, default 8, max 50)

**Error Response:** `403` when requester is not coordinator.

---

## 11. Taxonomy (`/api/taxonomy`)

Manages dynamic master data: **subjects**, **grade levels**, and **majors**. The dashboard `master-data` page writes here; dropdowns across dashboard and Flutter read from the public `GET` endpoint instead of hardcoded constants, so admin edits propagate without a redeploy.

Deletes are **soft** (`is_active = false`). Historical exam/student/teacher rows carry the value as a string snapshot and keep working even after a taxonomy entry is deactivated.

### GET `/api/taxonomy`

Combined fetch of all three taxonomies in one call. **Public** — no auth required.

**Query Parameters:**
- `include_inactive` (optional) — set to `true` to receive soft-deleted rows (used by the master-data UI)

**Response (200):**

```json
{
  "subjects": [
    { "subject_id": 1, "name": "Matematika", "color": "#3b82f6", "sort_order": 0, "is_active": true }
  ],
  "grade_levels": [
    { "grade_level_id": 1, "value": "X", "label": "Kelas 10", "sort_order": 0, "is_active": true }
  ],
  "majors": [
    { "major_id": 1, "value": "IPA", "label": "IPA", "sort_order": 0, "is_active": true }
  ]
}
```

---

### POST `/api/taxonomy/subjects` — Admin

**Request Body:**

```json
{ "name": "Bahasa Mandarin", "color": "#ec4899", "sort_order": 14 }
```

`color` accepts a HEX (`#rrggbb`) preferred, or a legacy Tailwind palette name for backward compat. Stored verbatim and resolved by the dashboard `useSubjectTheme` hook.

---

### PUT `/api/taxonomy/subjects/:id` — Admin

Supports an opt-in `cascade_rename: true` flag that rewrites the subject string snapshot wherever it appears on historical `Exam`, `QuestionBank`, `Question`, and `Teacher` rows. Returns a `cascade` summary so the dashboard can surface the affected count in a toast.

**Request Body:**

```json
{ "name": "Matematika Wajib", "color": "#3b82f6", "cascade_rename": true }
```

**Response (200):**

```json
{
  "subject": { "subject_id": 1, "name": "Matematika Wajib", "...": "..." },
  "cascade": { "exams": 4, "question_banks": 6, "questions": 120, "teachers": 1 }
}
```

When `cascade_rename` is omitted or `false`, `cascade` is `null` and only future dropdowns reflect the rename.

---

### DELETE `/api/taxonomy/subjects/:id` — Admin

Soft-deactivate (sets `is_active = false`).

---

### POST `/api/taxonomy/grade-levels` — Admin

```json
{ "value": "XIII", "label": "Kelas 13", "sort_order": 3 }
```

`value` is the snapshot stored on dependent rows; `label` is for display. Mirrors the Subject cascade behaviour on PUT.

---

### PUT `/api/taxonomy/grade-levels/:id` — Admin

Cascade targets when `cascade_rename: true`: `Exam`, `QuestionBank`, `Question`, `Student`.

---

### DELETE `/api/taxonomy/grade-levels/:id` — Admin

Soft-deactivate.

---

### POST `/api/taxonomy/majors` — Admin

```json
{ "value": "MIPA", "label": "MIPA", "sort_order": 0 }
```

---

### PUT `/api/taxonomy/majors/:id` — Admin

Cascade targets when `cascade_rename: true`: `Exam`, `QuestionBank`, `Question`, `Student`.

---

### DELETE `/api/taxonomy/majors/:id` — Admin

Soft-deactivate.

---

## 12. Upload (`/api/upload`)

Image upload pipeline backed by `multer` disk storage. Files land under `cbt-backend/uploads/<bucket>/` with a timestamp + random filename so collisions are impossible. The server serves these back as static files under `/uploads/...` with `Cross-Origin-Resource-Policy: cross-origin` so the dashboard (different port) can fetch them.

**Limits:**
- Max size: **5 MB** per file
- Allowed MIME: `image/png`, `image/jpeg`, `image/webp`, `image/gif`

### POST `/api/upload/logo` — Admin

Upload the school logo. Mounted before the school-profile PUT so the admin can upload, copy the returned URL into `logo_url`, and save.

**Headers:** `Content-Type: multipart/form-data`

**Form field:** `file` — the image binary

**Response (201):**

```json
{
  "url": "/uploads/logos/1780046533418-tcot3epi.png",
  "filename": "1780046533418-tcot3epi.png",
  "size": 24576,
  "mimetype": "image/png"
}
```

The returned `url` is **path-relative** (no host) so it stays correct on localhost, ngrok, and production. Clients prepend the API origin themselves when rendering (the dashboard `resolvePreviewUrl` helper and Flutter `Env.resolveAssetUrl` do this).

---

### POST `/api/upload/question-image` — Teacher or Admin

Upload an attachment for a question. Used by the teacher question authoring page; the returned URL is saved on `Question.question_image`.

Same request/response shape as logo upload, but files land under `/uploads/questions/`.

**Error responses:**
- `400` — wrong MIME type (`Format file tidak didukung`)
- `400` — over 5 MB (multer `LIMIT_FILE_SIZE`)

---

## 13. Misc

### GET `/api/time`

Returns trusted server time. Used by the Flutter app and dashboard to validate exam start/end windows and detect device clock tampering. No auth, no rate limit.

**Response (200):**

```json
{ "now": "2025-12-30T14:32:11.408Z" }
```

---

## Global Deadline System

Exam timing uses a **dual timer system**:

1. **Global deadline** (`end_date`): Hard cutoff for ALL participants
2. **Per-student timer** (`duration_minutes`): Individual countdown from when each student starts

Each student's effective deadline = `min(start_time + duration_minutes, end_date)`.

### Auto-Finish Scheduler

Runs every 60 seconds:

1. Queries all `ExamParticipant` with status `IN_PROGRESS`
2. Checks if `now > exam.end_date`
3. If expired: auto-grades MC answers, creates `ExamResult`, sets status to `COMPLETED`/`GRADED`, logs `AUTO_FINISH_UJIAN`

### Auto-Expire Scheduler

Runs every 60 seconds:

1. Queries all `Exam` with status `SCHEDULED` or `ONGOING` where `end_date < now`
2. Updates exam status to `ENDED`
3. Logs `UJIAN_AUTO_EXPIRED`

---

## Error Responses

All errors follow:

```json
{ "error": "Error message here" }
```

| Status | Description |
|--------|-------------|
| 400 | Bad request / Validation error |
| 401 | Invalid or missing token |
| 403 | Forbidden (wrong role, blocked, ownership) |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 500 | Server error |

---

## Endpoint Summary (92 total)

| # | Method | Route | Auth |
|---|--------|-------|------|
| 1 | POST | `/api/auth/register` | admin |
| 2 | POST | `/api/auth/login` | — |
| 3 | POST | `/api/auth/logout` | token |
| 4 | GET | `/api/auth/me` | token |
| 5 | PATCH | `/api/auth/profile` | token |
| 6 | POST | `/api/questions/bank` | teacher |
| 7 | GET | `/api/questions/bank` | teacher |
| 8 | GET | `/api/questions/bank/:questionBankId` | teacher |
| 9 | PUT | `/api/questions/bank/:id` | teacher |
| 10 | DELETE | `/api/questions/bank/:id` | teacher |
| 11 | POST | `/api/questions/` | teacher |
| 12 | GET | `/api/questions/` | teacher |
| 13 | GET | `/api/questions/:id` | teacher |
| 14 | PUT | `/api/questions/:id` | teacher |
| 15 | DELETE | `/api/questions/:id` | teacher |
| 16 | GET | `/api/questions/exam/:exam_id/available` | teacher |
| 17 | POST | `/api/questions/assign-bank` | teacher |
| 18 | POST | `/api/exams/` | teacher |
| 19 | GET | `/api/exams/` | teacher |
| 20 | GET | `/api/exams/:id` | teacher |
| 21 | PUT | `/api/exams/:id` | teacher |
| 22 | DELETE | `/api/exams/:id` | teacher |
| 23 | POST | `/api/exams/assign-question` | teacher |
| 24 | POST | `/api/exams/assign-bank` | teacher |
| 25 | POST | `/api/exams/assign-student` | teacher |
| 26 | DELETE | `/api/exams/:examId/questions/:questionId` | teacher |
| 27 | POST | `/api/exams/remove-multiple-questions` | teacher |
| 28 | POST | `/api/exams/remove-bank` | teacher |
| 29 | DELETE | `/api/exams/:id/clear-questions` | teacher |
| 30 | GET | `/api/exams/:id/questions-by-bank` | teacher |
| 31 | PUT | `/api/exams/update-weight-multiple` | teacher |
| 32 | POST | `/api/exams/reassign-students` | teacher |
| 33 | GET | `/api/students/exams` | student |
| 34 | POST | `/api/students/exams/start` | student |
| 35 | POST | `/api/students/exams/answer` | student |
| 36 | POST | `/api/students/exams/finish` | student |
| 37 | POST | `/api/students/exams/report-violation` | student |
| 38 | GET | `/api/users/` | admin |
| 39 | GET | `/api/users/admins` | admin |
| 40 | GET | `/api/users/teachers` | admin |
| 41 | GET | `/api/users/students` | admin |
| 42 | GET | `/api/users/count` | admin |
| 43 | POST | `/api/users/` | admin |
| 44 | POST | `/api/users/batch` | admin |
| 45 | POST | `/api/users/batch-delete` | admin |
| 46 | GET | `/api/users/:id` | admin |
| 47 | PUT | `/api/users/:id` | admin |
| 48 | PUT | `/api/users/:id/role` | admin |
| 49 | PATCH | `/api/users/:id/status` | admin |
| 50 | DELETE | `/api/users/:id` | admin |
| 51 | POST | `/api/users/score` | teacher |
| 52 | POST | `/api/users/finalize` | teacher |
| 53 | GET | `/api/admin/activities/` | admin |
| 54 | GET | `/api/admin/activities/:examId/participants` | admin |
| 55 | GET | `/api/admin/activities/participant/:examParticipantId` | admin |
| 56 | POST | `/api/admin/activities/:examParticipantId/block` | admin |
| 57 | POST | `/api/admin/activities/:examParticipantId/generate-unlock` | admin |
| 58 | POST | `/api/admin/activities/:examParticipantId/unblock` | admin |
| 59 | GET | `/api/exam-results/my-results` | student |
| 60 | GET | `/api/exam-results/completed-exams` | teacher |
| 61 | GET | `/api/exam-results/exam/:exam_id` | teacher |
| 62 | GET | `/api/exam-results/participant/:exam_participant_id` | teacher |
| 63 | GET | `/api/exam-results/detail/:exam_participant_id` | teacher |
| 64 | POST | `/api/exam-results/calculate` | teacher |
| 65 | PUT | `/api/exam-results/manual-score` | teacher |
| 66 | GET | `/api/activity-logs/` | admin/teacher |
| 67 | GET | `/api/activity-logs/active-users` | admin/teacher |
| 68 | GET | `/api/activity-logs/user/:userId` | admin/teacher |
| 69 | GET | `/api/activity-logs/exam-participant/:examParticipantId` | admin/teacher |
| 70 | GET | `/api/activity-logs/type/:activityType` | admin/teacher |
| 71 | PATCH | `/api/auth/change-password` | token |
| 72 | GET | `/api/school-profile/` | — |
| 73 | PUT | `/api/school-profile/` | admin |
| 74 | GET | `/api/analytics/question-stats` | teacher |
| 75 | GET | `/api/analytics/dashboard-summary` | teacher |
| 76 | GET | `/api/analytics/teacher-performance` | teacher |
| 77 | GET | `/api/analytics/coordinator-audit` | teacher (coordinator) |
| 78 | POST | `/api/exam-results/:examId/submit` | teacher |
| 79 | GET | `/api/exam-results/archived-exams` | teacher |
| 80 | GET | `/api/taxonomy` | — |
| 81 | POST | `/api/taxonomy/subjects` | admin |
| 82 | PUT | `/api/taxonomy/subjects/:id` | admin |
| 83 | DELETE | `/api/taxonomy/subjects/:id` | admin |
| 84 | POST | `/api/taxonomy/grade-levels` | admin |
| 85 | PUT | `/api/taxonomy/grade-levels/:id` | admin |
| 86 | DELETE | `/api/taxonomy/grade-levels/:id` | admin |
| 87 | POST | `/api/taxonomy/majors` | admin |
| 88 | PUT | `/api/taxonomy/majors/:id` | admin |
| 89 | DELETE | `/api/taxonomy/majors/:id` | admin |
| 90 | POST | `/api/upload/logo` | admin |
| 91 | POST | `/api/upload/question-image` | admin/teacher |
| 92 | GET | `/api/time` | — |


---

## Common Workflows

### 1. Admin Setup Flow

1. **Login** (POST `/api/auth/login`)
2. **Create Teachers** (POST `/api/users/` or POST `/api/users/batch`)
3. **Create Students** (POST `/api/users/` or POST `/api/users/batch`)
4. **Monitor Activity** (GET `/api/admin/activities/`)
5. **Block/Unblock** (POST `/api/admin/activities/{id}/block`, generate unlock code)

### 2. Teacher Exam Creation Flow

1. **Login** (POST `/api/auth/login` as teacher)
2. **Create Question Bank** (POST `/api/questions/bank`)
3. **Add Questions to Bank** (POST `/api/questions/` x N)
4. **Create Exam** (POST `/api/exams/`)
5. **Assign Questions** (POST `/api/exams/assign-bank` or POST `/api/exams/assign-question`)
6. **Assign Students** (POST `/api/exams/assign-student` — auto-happens on creation)
7. **Grade Essays** (POST `/api/users/score`)
8. **Finalize Scores** (POST `/api/users/finalize`)

### 3. Student Exam Taking Flow

1. **Login** (POST `/api/auth/login` as student)
2. **View Exams** (GET `/api/students/exams`)
3. **Start Exam** (POST `/api/students/exams/start`)
4. **Submit Answers** (POST `/api/students/exams/answer` x N)
5. **Finish Exam** (POST `/api/students/exams/finish`)
6. **View Results** (GET `/api/exam-results/my-results`)

### 4. Teacher Results Review Flow

1. **Login** (POST `/api/auth/login` as teacher)
2. **View Completed Exams** (GET `/api/exam-results/completed-exams`)
3. **View Participant Results** (GET `/api/exam-results/exam/:exam_id`)
4. **Grade Essays** (POST `/api/users/score`)
5. **Finalize Scores** (POST `/api/users/finalize`)
6. **View Detailed Review** (GET `/api/exam-results/detail/:exam_participant_id`)

---

## Timing & Deadlines

### Dual Timer System

Each exam has **two time limits**:

1. **Global Deadline** (`exam.end_date`)
   - Hard cutoff for ALL participants
   - No exceptions — all must finish by this time
   - Server auto-finishes at deadline

2. **Per-Student Duration** (`exam.duration_minutes`)
   - Individual countdown starting when student begins
   - Student effective deadline = `min(start_time + duration_minutes, end_date)`

### Scheduler Behavior

**Auto-Finish Scheduler** (runs every 60 seconds):
- Checks all `IN_PROGRESS` participants
- If `current_time > exam.end_date` → auto-finishes exam
- Auto-grades MC questions using answer keys
- Sets status to `COMPLETED` (has essay) or `GRADED` (all MC/graded)
- Logs `AUTO_FINISH_UJIAN` activity

**Auto-Expire Scheduler** (runs every 60 seconds):
- Checks all exams with `SCHEDULED` or `ONGOING` status
- If `current_time > exam.end_date` → changes status to `ENDED`
- Logs `UJIAN_AUTO_EXPIRED` activity

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Missing/invalid JWT token | Verify token in `Authorization` header, ensure not expired |
| `403 Forbidden` | Wrong role or insufficient permissions | Check user role and endpoint access level |
| `409 Conflict` | Duplicate username or question bank name | Ensure unique identifiers, check existing data |
| `400 Bad Request` | Invalid/missing request body fields | Review endpoint documentation, validate payload |
| `404 Not Found` | Resource doesn't exist | Verify ID exists and is correct |
| `500 Internal Server Error` | Server crash or unexpected error | Check server logs, restart backend if needed |

### Student Blocked / Anti-Cheat

**Issue:** Student sees "Exam Blocked" page

**Why:** App was backgrounded (not visible) for >10 seconds during exam

**Solution:**
1. Admin generates unlock code: POST `/api/admin/activities/{id}/generate-unlock`
2. Student provides code: POST `/api/students/exams/start` with `unlock_code` parameter
3. Exam resumes if code is valid

### Exam Not Showing Up

**Issue:** Student doesn't see exam in exam list

**Possible causes:**
- Exam status is not `SCHEDULED` or `ONGOING`
- Student's `grade_level` + `major` don't match exam criteria
- Student hasn't been assigned to exam

**Solution:**
1. Teacher: Verify exam status (POST `/api/exams/` creates as `SCHEDULED`)
2. Teacher: Verify student was assigned (check GET `/api/exams/:id` participants list)
3. Teacher: Manually assign if needed (POST `/api/exams/assign-student`)

### Answers Not Saving

**Issue:** Student submits answer but it doesn't persist

**Possible causes:**
- Network connection lost
- Invalid `exam_participant_id`
- Server timeout

**Solution:**
1. Check network connectivity
2. Retry submission via frontend retry logic
3. Verify participant ID is correct (from `/api/students/exams/start`)

### Scores Not Calculating

**Issue:** Results show 0 score or incorrect totals

**Possible causes:**
- Essays not graded yet (status is `COMPLETED`, not `GRADED`)
- Manual scores not saved (POST `/api/users/score` not called)
- Finalize not called (POST `/api/users/finalize` not called)

**Solution:**
1. Grade all essay answers (POST `/api/users/score`)
2. Call finalize endpoint (POST `/api/users/finalize`)
3. Verify in GET `/api/exam-results/detail/:exam_participant_id`

---

## Best Practices

### For Clients (Dashboard/Mobile App)

1. **Token Management**
   - Store JWT securely (HTTP-only cookies for web, SharedPreferences for mobile)
   - Auto-attach to all requests
   - Handle 401 → redirect to login

2. **Error Handling**
   - Always check `error?.response?.data?.error` for backend message
   - Show user-friendly error dialogs
   - Log errors for debugging

3. **Pagination**
   - Use `page` and `limit` query params
   - Cache results locally if possible
   - Show loading indicator while fetching

4. **Auto-Save (Mobile App)**
   - Submit answer immediately on selection
   - Handle network failures gracefully
   - Queue offline answers if needed

### For Developers

1. **Testing Endpoints**
   - Use Postman/Thunder Client with JWT tokens
   - Test with multiple roles (admin, teacher, student)
   - Verify ownership checks (e.g., teacher can't access other's questions)

2. **Data Validation**
   - Always validate required fields
   - Check min/max lengths (e.g., password policy)
   - Use consistent date formats (ISO 8601)

3. **Performance**
   - Use pagination to avoid huge responses
   - Index frequently-queried fields (user_id, exam_id, etc.)
   - Cache school profile and constants

4. **Security**
   - Never expose `is_correct` in answer options during exam
   - Verify Super Admin protections (can't delete/downgrade)
   - Use HTTPS in production
   - Rotate JWT secrets periodically

---

## Support & Resources

- **Backend Repository:** [cbt-backend/](../cbt-backend/)
- **Backend README:** [Setup & Configuration](../cbt-backend/README.md)
- **Dashboard Setup:** [cbt-dashboard/README.md](../cbt-dashboard/README.md)
- **Mobile App Setup:** [cbt_app/README.md](../cbt_app/README.md)
- **Database Schema:** [prisma/schema.prisma](../cbt-backend/prisma/schema.prisma)
- **Seed Data:** [prisma/seed.js](../cbt-backend/prisma/seed.js)

---

**Last Updated:** May 2026  
**API Version:** 1.0  
**Total Endpoints:** 77
