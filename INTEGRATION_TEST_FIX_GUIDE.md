# 🔧 Integration Tests - Controller Matching Guide

**Purpose:** Panduan untuk menyesuaikan integration tests dengan actual controller implementations.

---

## 📋 Change Strategy

**Philosophy:** Tests harus **match controller behavior**, bukan sebaliknya.

**Reason:** Controller sudah digunakan oleh frontend/aplikasi. Mengubah controller berisiko break aplikasi yang ada.

---

## 🎯 Changes Needed by Endpoint

### 1. Auth Endpoints (FIXED ✅)

**Files:**
- `src/routes/authRoutes.js` - Added `validateLogin`
- `src/middlewares/validationMiddleware.js` - Added `loginSchema` & `validateLogin`
- `tests/integration/auth.test.js` - Changed "tidak aktif" → "dinonaktifkan"

**Status:** ✅ Ready to test once MySQL running

---

### 2. Soal Endpoints (NEED FIXES ⚠️)

**File:** `tests/integration/soal.test.js`

#### Issue #1: Create Soal Response

**Controller Returns:**
```javascript
// src/controllers/soalController.js:43
res.status(201).json({ message: 'Soal berhasil dibuat', soal_id: result.soal_id });
```

**Test Expects (WRONG):**
```javascript
expect(response.body.soal.soal_id).toBeDefined();  // ❌
```

**Fix To:**
```javascript
expect(response.status).toBe(201);
expect(response.body.message).toBe('Soal berhasil dibuat');
expect(response.body.soal_id).toBeDefined();  // ✅
```

**Lines to Change:** ~44, 63, 208, 243, 286

#### Issue #2: Get Soal Response

**Controller Returns:**
```javascript
// src/controllers/soalController.js:72
res.json({ soals });  // Array of soals

// src/controllers/soalController.js:86
res.json({ soal });   // Single soal object
```

**Test Expectations:** ✅ Already correct

---

### 3. Ujian Endpoints (NEED FIXES ⚠️)

**File:** `tests/integration/ujian.test.js`

#### Issue: Create Ujian Response

**Controller Returns:**
```javascript
// src/controllers/ujianController.js:33
res.status(201).json({ message: 'Ujian berhasil dibuat', ujian_id: ujian.ujian_id });
```

**Test Expects (WRONG):**
```javascript
expect(response.body.ujian.ujian_id).toBeDefined();  // ❌
```

**Fix To:**
```javascript
expect(response.status).toBe(201);
expect(response.body.message).toBe('Ujian berhasil dibuat');
expect(response.body.ujian_id).toBeDefined();  // ✅
```

**Lines to Change:** ~43, 121, 157, 190, 218, 281, 315

#### Get Ujian Response

**Controller Returns:**
```javascript
res.json({ ujians });  // Array
res.json({ ujian });   // Single object
```

**Test Expectations:** ✅ Already correct

---

### 4. Siswa Endpoints (NEED FIXES ⚠️)

**File:** `tests/integration/siswa.test.js`

#### Issue: Workflow Actions

**Controller:**
- `getMyUjians`: Returns `{ ujians: pesertaUjians }`
- `startUjian`: Returns `{ message, pesertaUjian, waktu_selesai }`
- `submitJawaban`: Returns `{ message, jawaban }`
- `finishUjian`: Returns `{ message, pesertaUjian }`
- `getHasilUjian`: Returns `{ hasilUjian }`

**Test Issues:**
1. Need to verify actual response structure from controller
2. Some endpoints may need try-catch for 500 errors
3. Check authorization logic

**Recommended Approach:**
1. Read `src/controllers/siswaController.js` completely
2. Update test expectations line by line
3. Test incrementally

---

### 5. Users Endpoints (NEED FIXES ⚠️)

**File:** `tests/integration/users.test.js`

#### Issue #1: Toggle Status Text

**Controller Returns:**
```javascript
// Line to verify in userController.js
res.json({ message: 'User dinonaktifkan', user });
// or
res.json({ message: 'User diaktifkan', user });
```

**Test Expects:**
```javascript
expect(response.body.message).toContain('status');  // ❌ Too generic
```

**Fix To:**
```javascript
expect(response.body.message).toMatch(/dinonaktifkan|diaktifkan/);  // ✅
```

#### Issue #2: Grading & Finalization

**Controller Logic May Differ:**
- Nilai essay endpoint authorization
- Finalization calculation logic
- HasilUjian creation timing

**Recommended:**
1. Read `src/controllers/userController.js` grading section
2. Understand actual finalization flow
3. Update test expectations accordingly

---

## 🛠️ Step-by-Step Fix Process

### For Each Endpoint Test:

1. **Read Controller Implementation**
   ```javascript
   // Find in: src/controllers/<name>Controller.js
   const createX = async (req, res) => {
     // ...
     res.status(201).json({ message: '...', x_id: result.id });
   };
   ```

2. **Identify Response Format**
   - Status code (200, 201, 400, 403, 404, 500)
   - Response body structure
   - Error messages

3. **Update Test Expectations**
   ```javascript
   // Before
   expect(response.body.object.id).toBeDefined();
   
   // After
   expect(response.body.object_id).toBeDefined();
   ```

4. **Test Incrementally**
   ```powershell
   npm test -- tests/integration/soal.test.js
   ```

5. **Verify & Move to Next**

---

## 🎨 Common Patterns to Fix

### Pattern 1: Nested Object → Flat ID

```javascript
// ❌ Wrong expectation
expect(response.body.soal.soal_id).toBeDefined();
expect(response.body.ujian.ujian_id).toBeDefined();

// ✅ Correct expectation
expect(response.body.soal_id).toBeDefined();
expect(response.body.ujian_id).toBeDefined();
```

### Pattern 2: Exact Text Match → Flexible Match

```javascript
// ❌ Too specific
expect(response.body.message).toContain('tidak aktif');

// ✅ Match actual text
expect(response.body.message).toContain('dinonaktifkan');

// ✅ Or use regex for flexibility
expect(response.body.message).toMatch(/dinonaktifkan|tidak aktif/);
```

### Pattern 3: Authorization Checks

```javascript
// Verify expected role restrictions
// If controller requires 'guru', test should expect 403 for 'siswa'
expect(response.status).toBe(403);
expect(response.body.error).toMatch(/not authorized|akses ditolak/i);
```

---

## 📊 Estimated Time

| Endpoint | Tests | Time Estimate |
|----------|-------|---------------|
| Auth | 18 | ✅ Done |
| Soal | 16 | ~30 minutes |
| Ujian | 10 | ~20 minutes |
| Siswa | 12 | ~40 minutes |
| Users | 21 | ~60 minutes |
| **TOTAL** | **77** | **~2.5 hours** |

---

## 🚀 Quick Fix Template

```javascript
// For CREATE endpoints:
// ❌ Before
expect(response.body.object.id).toBeDefined();

// ✅ After
expect(response.status).toBe(201);
expect(response.body.message).toBe('Object berhasil dibuat');
expect(response.body.object_id).toBeDefined();

// For GET endpoints (usually correct):
expect(response.body.objects).toBeArray();
expect(response.body.object).toBeObject();

// For UPDATE/DELETE:
expect(response.body.message).toContain('berhasil');

// For ERROR responses:
expect(response.status).toBe(400);  // or 403, 404, 500
expect(response.body.error).toBeDefined();
```

---

## ✅ Testing Checklist

After fixing each endpoint:

- [ ] Read controller implementation
- [ ] Identify all response formats
- [ ] Update test expectations
- [ ] Run test: `npm test -- tests/integration/<file>.test.js`
- [ ] Verify all tests pass
- [ ] Commit changes
- [ ] Move to next endpoint

---

## 📚 Reference Files

**Controllers to Read:**
- `src/controllers/authController.js` ✅ Done
- `src/controllers/soalController.js` (175 lines)
- `src/controllers/ujianController.js` (274 lines)
- `src/controllers/siswaController.js` (252 lines)
- `src/controllers/userController.js` (316 lines)

**Tests to Fix:**
- `tests/integration/auth.test.js` ✅ Done
- `tests/integration/soal.test.js` (308 lines)
- `tests/integration/ujian.test.js` (340 lines)
- `tests/integration/siswa.test.js` (303 lines)
- `tests/integration/users.test.js` (397 lines)

---

## 💡 Best Practices

1. **Read First, Code Later**
   - Understand full controller before changing tests
   - Note all possible response formats
   - Check error handling

2. **Test Incrementally**
   - Fix one test at a time
   - Run after each fix
   - Don't batch all changes

3. **Keep Error Messages Flexible**
   - Use `.toMatch()` or `.toContain()` for partial matches
   - Avoid exact string matching unless critical
   - Consider i18n in the future

4. **Document Discrepancies**
   - If controller logic seems wrong, note it
   - Don't fix controller unless confirmed
   - Discuss with team

---

**Priority:** Fix integration tests AFTER verifying unit tests (already done ✅) and BEFORE running E2E test.

**Status:** Ready to proceed once MySQL is running.
