const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seeding...');

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists, skipping...');
    return;
  }

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        status_aktif: true
      }
    });

    await tx.admin.create({
      data: {
        userId: newUser.id,
        nama_lengkap: 'Administrator'
      }
    });

    return newUser;
  });

  console.log('✅ Admin user created successfully!');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('   Role: admin');
  console.log(`   User ID: ${admin.id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
