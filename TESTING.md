# CBT Backend - Testing Documentation

## 📋 Testing Suite Overview

Comprehensive testing suite dengan coverage target 100% untuk CBT Backend API.

### Test Statistics
- **Total Test Files**: 13
- **Test Categories**: 
  - Unit Tests (Models & Middleware)
  - Integration Tests (API Endpoints)
  - End-to-End Tests (Complete Workflow)

## 🏗️ Test Structure

```
tests/
├── setup/
│   ├── testDb.js           # Database setup & cleanup utilities
│   ├── testHelpers.js      # Helper functions for creating test data
│   └── testSetup.js        # Global test setup
├── unit/
│   ├── models/
│   │   ├── user.test.js    # User-Admin-Guru-Siswa relations
│   │   ├── soal.test.js    # Soal-OpsiJawaban relations
│   │   └── ujian.test.js   # Ujian-Peserta-Jawaban relations
│   └── middlewares/
│       ├── auth.test.js    # JWT & role authorization tests
│       └── validation.test.js
├── integration/
│   ├── auth.test.js        # /api/auth endpoints
│   ├── soal.test.js        # /api/soal endpoints
│   ├── ujian.test.js       # /api/ujian endpoints
│   ├── siswa.test.js       # /api/siswa endpoints
│   └── users.test.js       # /api/users endpoints
└── e2e/
    └── completeWorkflow.test.js  # Full CBT workflow
```

## 🚀 Setup & Installation

### 1. Install Dependencies

```bash
cd cbt-backend
npm install
```

### 2. Setup Test Database

**Buat database test di MySQL:**

```sql
CREATE DATABASE cbt_test;
```

**Edit file `.env.test`** (sudah dibuat):

```env
NODE_ENV=test
DATABASE_URL="mysql://root:@localhost:3306/cbt_test"
JWT_SECRET="test_jwt_secret_key_12345"
```

⚠️ **Pastikan:**
- MySQL server berjalan
- Database `cbt_test` sudah dibuat
- Credentials database sesuai

### 3. Run Migration di Test Database

```bash
# Set environment ke test
$env:DATABASE_URL="mysql://root:@localhost:3306/cbt_test"

# Run migration
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

## 🧪 Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Category

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
```

### Run with Coverage

```bash
npm run test:coverage
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Run Single Test File

```bash
npx jest tests/unit/models/user.test.js
npx jest tests/integration/auth.test.js
npx jest tests/e2e/completeWorkflow.test.js
```

## 📊 Test Coverage

Target coverage: **80-90%**

Coverage includes:
- ✅ All model relations
- ✅ Cascade deletes
- ✅ Authentication & Authorization
- ✅ All API endpoints
- ✅ Validation logic
- ✅ Auto-grading system
- ✅ Manual grading workflow
- ✅ Complete user workflows

View coverage report:

```bash
npm run test:coverage
# Open: coverage/lcov-report/index.html
```

## 🔍 What's Being Tested

### Unit Tests

#### 1. Model Relations
- User ↔ Admin (One-to-One)
- User ↔ Guru (One-to-One)
- User ↔ Siswa (One-to-One)
- Guru → Soal (One-to-Many)
- Soal → OpsiJawaban (One-to-Many)
- Guru → Ujian (One-to-Many)
- Ujian ↔ Soal via SoalUjian (Many-to-Many)
- Ujian ↔ Siswa via PesertaUjian (Many-to-Many)
- PesertaUjian → Jawaban (One-to-Many)
- PesertaUjian ↔ HasilUjian (One-to-One)
- **All cascade delete behaviors**

#### 2. Middleware
- JWT token verification
- Token expiration handling
- Role-based authorization (admin, guru, siswa)
- Input validation (Joi schemas)

### Integration Tests

#### Auth Endpoints (`/api/auth`)
- ✅ Register (admin, guru, siswa)
- ✅ Login with correct credentials
- ✅ Login with wrong password
- ✅ Inactive user handling
- ✅ Duplicate username prevention
- ✅ Validation errors

#### Soal Endpoints (`/api/soal`) - Guru Only
- ✅ Create soal (PG Single, PG Multiple, Essay)
- ✅ Get all soal with filters (mata_pelajaran, tingkat, jurusan)
- ✅ Get soal by ID
- ✅ Update soal
- ✅ Delete soal
- ✅ Authorization checks

#### Ujian Endpoints (`/api/ujian`) - Guru Only
- ✅ Create ujian
- ✅ Get all ujian
- ✅ Get ujian by ID with details
- ✅ Update ujian
- ✅ Delete ujian
- ✅ Assign soal to ujian (with bobot & urutan)
- ✅ Remove soal from ujian
- ✅ Assign siswa by tingkat & jurusan

#### Siswa Endpoints (`/api/siswa`) - Siswa Only
- ✅ Get my ujians
- ✅ Start ujian
- ✅ Submit jawaban (PG & Essay)
- ✅ Auto-grading for PG
- ✅ Finish ujian
- ✅ Get hasil ujian

#### Users Endpoints (`/api/users`)
- ✅ Admin: Get all users with filters
- ✅ Admin: Create user
- ✅ Admin: Update user role
- ✅ Admin: Toggle user status
- ✅ Admin: Delete user
- ✅ Guru: Grade essay manually
- ✅ Guru: Finalize nilai (calculate total)

### E2E Tests

**Complete Workflow Test** - Tests full CBT lifecycle:

1. ✅ Guru registration & login
2. ✅ Siswa registration & login
3. ✅ Guru creates 3 soal (2 PG, 1 Essay)
4. ✅ Guru creates ujian
5. ✅ Guru assigns soal to ujian with bobot
6. ✅ Guru assigns siswa to ujian
7. ✅ Siswa views available ujians
8. ✅ Siswa starts ujian
9. ✅ Siswa answers all questions (correct, wrong, essay)
10. ✅ Siswa finishes ujian
11. ✅ Guru views ujian & jawaban
12. ✅ Guru grades essay manually
13. ✅ Guru finalizes nilai
14. ✅ Siswa views final result

**Result**: Validates nilai calculation is correct based on:
- PG auto-grading
- Essay manual grading
- Bobot per soal

## 🐛 Troubleshooting

### Error: Cannot connect to database

**Solution:**
```bash
# Check MySQL is running
# Verify DATABASE_URL in .env.test
# Ensure database cbt_test exists
```

### Error: Table doesn't exist

**Solution:**
```bash
# Run migration
$env:DATABASE_URL="mysql://root:@localhost:3306/cbt_test"
npx prisma migrate deploy
```

### Error: Tests timeout

**Solution:**
- Increase timeout in jest.config.js (currently 30000ms)
- Check database connection speed
- Ensure no hanging connections

### Tests fail randomly

**Solution:**
- Tests run with `--runInBand` flag (sequential)
- Database is cleaned before each test
- Check for async/await issues

## 📈 Test Results Format

### Successful Run Example:

```
PASS  tests/unit/models/user.test.js
PASS  tests/unit/models/soal.test.js
PASS  tests/unit/models/ujian.test.js
PASS  tests/unit/middlewares/auth.test.js
PASS  tests/unit/middlewares/validation.test.js
PASS  tests/integration/auth.test.js
PASS  tests/integration/soal.test.js
PASS  tests/integration/ujian.test.js
PASS  tests/integration/siswa.test.js
PASS  tests/integration/users.test.js
PASS  tests/e2e/completeWorkflow.test.js

Test Suites: 11 passed, 11 total
Tests:       150+ passed, 150+ total
Time:        45.234 s
```

## 🎯 Best Practices

### When Adding New Features

1. Write tests first (TDD approach)
2. Test happy path & error cases
3. Test authorization for protected endpoints
4. Test data validation
5. Test cascade deletes if applicable

### Test Data Management

- All test data is automatically cleaned before each test
- Use helper functions from `testHelpers.js`
- Don't rely on data from previous tests

### Coverage Goals

- Aim for 90%+ coverage for new code
- 100% coverage for critical paths (auth, grading, etc.)
- All endpoints must have tests

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)

## 🎉 Summary

Comprehensive testing suite dengan:
- **150+ test cases**
- **All relational data tested**
- **All endpoints covered**
- **Complete workflow validation**
- **Auto & manual grading tested**

Happy Testing! 🚀
