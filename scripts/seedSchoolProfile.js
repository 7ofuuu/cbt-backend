const prisma = require('../src/config/db');

async function seedSchoolProfile() {
  const profile = await prisma.schoolProfile.upsert({
    where: { id: 1 },
    update: {
      school_name: 'SMAN 1 Parigi',
      npsn: '20211986',
      address: 'Jl. Raya Parigi No. 1, Kec. Parigi, Kab. Pangandaran',
      city: 'Pangandaran',
      province: 'Jawa Barat',
      postal_code: '46393',
      phone: '(0265) 641234',
      email: 'sman1parigi@sch.id',
      website: 'https://sman1parigi.sch.id',
      principal_name: 'Drs. H. Ahmad, M.Pd',
      school_level: 'SMA',
      accreditation: 'A',
    },
    create: {
      id: 1,
      school_name: 'SMAN 1 Parigi',
      npsn: '20211986',
      address: 'Jl. Raya Parigi No. 1, Kec. Parigi, Kab. Pangandaran',
      city: 'Pangandaran',
      province: 'Jawa Barat',
      postal_code: '46393',
      phone: '(0265) 641234',
      email: 'sman1parigi@sch.id',
      website: 'https://sman1parigi.sch.id',
      principal_name: 'Drs. H. Ahmad, M.Pd',
      school_level: 'SMA',
      accreditation: 'A',
    },
  });
  console.log('Seeded school profile:', profile.school_name);
  await prisma.$disconnect();
}

seedSchoolProfile().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
