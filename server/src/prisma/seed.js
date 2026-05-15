const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Super admin account
  const passwordHash = await bcrypt.hash('hpc-admin-2025', 12);
  await prisma.adminUser.upsert({
    where:  { email: 'admin@hpcglobal.org' },
    update: {},
    create: { name: 'HPC Admin', email: 'admin@hpcglobal.org', passwordHash, role: 'SUPER_ADMIN' },
  });

  // Default site settings
  await prisma.siteSettings.upsert({
    where:  { id: 'singleton' },
    update: {},
    create: {
      id:            'singleton',
      churchName:    'HPC Global',
      tagline:       'Where Hope Meets Destiny',
      address:       'Klagon Junction, Behind K. Ofori Enterprise, Accra, Ghana',
      mapsLat:       5.6656744,
      mapsLng:       -0.0471646,
      youtubeHandle: '@prophetclottey',
    },
  });

  // Default hero slides
  await prisma.heroSlide.createMany({
    skipDuplicates: true,
    data: [
      {
        type:           'IDENTITY',
        order:          1,
        isActive:       true,
        headline:       'Where Hope Meets Destiny',
        subheadline:    'Hopepress Chapel — Accra, Ghana',
        body:           'An Apostolic Prophetic Word-based ministry bringing hope to the hopeless and raising Kingdom leaders.',
        ctaPrimary:     "I'm new here",
        ctaPrimaryUrl:  '/new-here',
        ctaSecondary:   'Watch a sermon',
        ctaSecondaryUrl: '/sermons',
      },
      {
        type:     'EVENT',
        order:    2,
        isActive: false,
        headline: 'Coming up at HPC Global',
      },
      {
        type:        'YOUTUBE',
        order:       3,
        isActive:    true,
        headline:    'Latest Message',
        youtubeMode: 'auto',
      },
    ],
  });

  // Default about content
  await prisma.aboutContent.upsert({
    where:  { id: 'singleton' },
    update: {},
    create: {
      id:      'singleton',
      vision:  'THE HOPEPRESS CHAPEL IS AN APOSTOLIC PROPHETIC WORD BASED MINISTRY WHICH BRINGS HOPE TO THE HOPELESS BY THE PREACHING OF THE WORD OF HOPE AND BRING THEM TO A PLACE OF ACCEPTANCE.',
      mission: 'TO ACCEPT THE REJECTED AND THE FRUSTRATED AND RAISE THEM AS KINGDOM LEADERS THROUGH THE TEACHING AND PREACHING OF THE WORD OF HOPE AND BIRTH THEM INTO THEIR ORIGINAL PLACE OF INFLUENCE.',
      story:   'HPC Global — Hopepress Chapel was founded by Prophet George Clottey and Lady Apostle Adelaide Clottey with a heart to bring hope to the nations.',
      coreValues: JSON.stringify([
        { icon: 'BookOpen', name: 'The Word of Hope', description: 'Grounded in the life-changing power of the Word of God.' },
        { icon: 'HandHeart', name: 'Prayer & Intercession', description: 'A house of prayer that stands in the gap for communities and nations.' },
        { icon: 'Mic', name: 'Prophetic Ministry', description: 'Flowing in the apostolic and prophetic dimension of the Spirit.' },
        { icon: 'Sparkles', name: 'Signs & Wonders', description: 'Believing for and experiencing the miraculous in every service.' },
        { icon: 'Users', name: 'Community & Belonging', description: 'A family where the rejected find acceptance and belonging.' },
        { icon: 'Globe', name: 'Kingdom Influence', description: 'Raising leaders to impact every sphere of society for God.' },
      ]),
      beliefs: JSON.stringify([
        { title: 'The Holy Bible', content: 'We believe the Bible is the inspired, infallible Word of God — the ultimate authority for faith and life.' },
        { title: 'The Trinity', content: 'We believe in one God, eternally existing in three persons: Father, Son, and Holy Spirit.' },
        { title: 'Salvation', content: 'We believe that salvation is by grace through faith in Jesus Christ alone.' },
        { title: 'The Holy Spirit', content: 'We believe in the present-day work of the Holy Spirit, including spiritual gifts and the baptism of the Spirit.' },
        { title: 'Divine Healing', content: 'We believe that healing is provided in the atonement of Christ and is available to all who believe.' },
        { title: 'The Second Coming', content: 'We believe in the personal, visible return of Jesus Christ to establish His Kingdom.' },
      ]),
      milestones: JSON.stringify([
        { year: 2010, title: 'HPC Global Founded', description: 'Prophet George Clottey and Lady Apostle Adelaide Clottey planted Hopepress Chapel in Accra, Ghana.' },
        { year: 2015, title: 'Online Ministry Launch', description: 'Expanded reach through YouTube and online services to the global diaspora.' },
        { year: 2020, title: 'Global Prophetic Highway', description: 'Launched the Global Prophetic Highway Zoom service to connect believers worldwide.' },
      ]),
    },
  });

  // Service times
  await prisma.serviceTime.createMany({
    skipDuplicates: true,
    data: [
      {
        name:       'Dominion Encounter',
        day:        'Sunday',
        timeGmt:    '9:00 AM – 11:30 AM',
        duration:   '2.5 hours',
        isOnline:   false,
        isStreamed: true,
        youtubeUrl: 'https://www.youtube.com/@prophetclottey',
        order:      1,
        isActive:   true,
      },
      {
        name:       'Prophetic & Miracle Service',
        day:        'Friday',
        timeGmt:    '6:30 PM – 9:00 PM',
        duration:   '2.5 hours',
        isOnline:   false,
        isStreamed: true,
        youtubeUrl: 'https://www.youtube.com/@prophetclottey',
        order:      2,
        isActive:   true,
      },
      {
        name:      'Global Prophetic Highway',
        day:       'Sunday',
        timeGmt:   '9:00 PM',
        timeEst:   '4:00 PM',
        timeBst:   '10:00 PM',
        isOnline:  true,
        platform:  'Zoom',
        joinLink:  '',
        order:     3,
        isActive:  true,
      },
    ],
  });

  // Leadership placeholders
  await prisma.leadershipProfile.createMany({
    skipDuplicates: true,
    data: [
      {
        name:     'Prophet George Clottey',
        title:    'Prophet',
        role:     'Global Senior Pastor',
        bio:      'Prophet George Clottey is the founder and Global Senior Pastor of HPC Global — Hopepress Chapel. Called to bring hope to the hopeless, he operates powerfully in the apostolic and prophetic dimensions of ministry.',
        quote:    'Hope is not wishful thinking — it is confident expectation in God.',
        scripture: 'Jeremiah 29:11',
        youtubeUrl: 'https://www.youtube.com/@prophetclottey',
        isSenior: true,
        order:    1,
        isActive: true,
      },
      {
        name:     'Lady Apostle Adelaide Clottey',
        title:    'Apostle',
        role:     'Global Senior Pastor',
        bio:      'Lady Apostle Adelaide Clottey co-leads HPC Global alongside her husband. Her ministry focuses on raising Kingdom leaders and bringing healing and restoration to lives.',
        quote:    'Every rejected soul has a place of acceptance in God.',
        scripture: 'Isaiah 61:1',
        isSenior: true,
        order:    2,
        isActive: true,
      },
    ],
  });

  // Ministry placeholders
  const ministries = [
    { name: 'Youth Ministry',         icon: 'Zap',       leader: 'TBC', description: 'Empowering young people to discover and fulfil their Kingdom destiny.',    order: 1 },
    { name: "Women's Fellowship",     icon: 'Flower2',   leader: 'TBC', description: 'A community of women growing in faith, purpose, and Godly character.',      order: 2 },
    { name: "Men's Fellowship",       icon: 'Shield',    leader: 'TBC', description: 'Raising men of integrity, purpose, and Kingdom influence.',                  order: 3 },
    { name: "Children's Church",      icon: 'Star',      leader: 'TBC', description: 'Nurturing the next generation in the love and knowledge of God.',            order: 4 },
    { name: 'Worship & Arts',         icon: 'Music',     leader: 'TBC', description: 'Leading the congregation into the presence of God through anointed worship.', order: 5 },
    { name: 'Intercessory Prayer',    icon: 'HandHeart', leader: 'TBC', description: 'Standing in the gap for the church, the city, and the nations.',             order: 6 },
    { name: 'Evangelism & Outreach',  icon: 'Globe',     leader: 'TBC', description: 'Taking the Gospel to the streets and beyond.',                              order: 7 },
    { name: 'Ushering & Protocol',    icon: 'DoorOpen',  leader: 'TBC', description: 'Creating a warm and welcoming atmosphere in every service.',                 order: 8 },
  ];

  for (const m of ministries) {
    const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await prisma.ministry.upsert({
      where:  { slug },
      update: {},
      create: { ...m, slug, isActive: true },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
