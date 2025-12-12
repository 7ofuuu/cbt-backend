# CBT Backend API

Backend system for Computer-Based Test (CBT) application with user authentication and role-based access control.

## Features

- 🔐 User Authentication (Login/Register)
- 👥 Role-Based Access Control (Admin, Guru, Siswa)
- 🗄️ MySQL Database with Prisma ORM
- 🔒 Password Hashing with bcryptjs
- 🎯 JWT Token Authentication
- ✅ Request Validation with Joi

## Tech Stack

- **Node.js** & **Express.js** - Backend framework
- **Prisma** - Database ORM
- **MySQL** - Database
- **JWT** - Authentication tokens
- **bcryptjs** - Password encryption
- **Joi** - Validation

## Prerequisites

Before installation, make sure you have:

- Node.js (v14 or higher)
- MySQL Database
- npm or yarn package manager

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cbt-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="mysql://username:password@localhost:3306/database_name"
   PORT=3000
   JWT_SECRET=your_jwt_secret_key
   ```
   
   Replace:
   - `username` - your MySQL username
   - `password` - your MySQL password
   - `database_name` - your database name
   - `your_jwt_secret_key` - a secure random string for JWT

4. **Run Prisma migrations**
   ```bash
   npx prisma migrate dev
   ```

5. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

## Running the Application

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
node index.js
```

The server will start on `http://localhost:3000` (or the PORT specified in your .env file).

## Database Schema

The application uses the following user roles:

- **Admin** - Full system access
- **Guru** (Teacher) - Can manage tests and view student results
- **Siswa** (Student) - Can take tests

Each user has a profile table (admins, gurus, or siswas) linked to the main users table.

## API Endpoints

### Authentication Routes (`/api/auth`)

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - User login
- Additional auth endpoints available

## Project Structure

```
cbt-backend/
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── migrations/         # Migration files
├── src/
│   ├── config/
│   │   └── db.js          # Database configuration
│   ├── controllers/
│   │   └── authController.js
│   ├── middlewares/
│   │   └── validationMiddleware.js
│   └── routes/
│       └── authRoutes.js
├── index.js               # Application entry point
├── package.json
└── .env                   # Environment variables (create this)
```

## Useful Commands

```bash
# View database in Prisma Studio
npx prisma studio

# Reset database
npx prisma migrate reset

# Check Prisma migration status
npx prisma migrate status
```

## Development

To contribute or modify:

1. Make your changes
2. Test thoroughly
3. Update migrations if schema changes
4. Run `npx prisma generate` after schema changes

## License

ISC

## Support

For issues or questions, please create an issue in the repository.