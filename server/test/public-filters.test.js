/**
 * The public listings filter by what is in the query string — a sermon
 * series, an event or blog category. Express's query parser turns
 * ?series[not]=x into an object, and Prisma reads an object in a `where` as a
 * filter of its own. Only a plain string may be used; anything else is
 * ignored, as if no filter had been asked for.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, startServer } = require('./helpers');

const { app, prisma } = loadApp('public_filters');

let server;

const get = async (path) => {
  const response = await fetch(`${server.base}${path}`);
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

test.before(async () => {
  server = await startServer(app);
  const sermon = (n, series) => prisma.sermon.create({ data: {
    title: `Sermon ${n}`, preacher: 'Rev. Mensah', series, youtubeId: `yt${n}`, youtubeUrl: `https://youtu.be/yt${n}`,
    thumbnailUrl: 'https://img.youtube.com/x.jpg', datePracticed: new Date('2026-11-01'), isPublished: true,
  } });
  await sermon(1, 'Faith');
  await sermon(2, 'Hope');

  const event = (n, category) => prisma.event.create({ data: {
    title: `Event ${n}`, slug: `event-${n}`, description: 'x', category, timeGmt: '10:00',
    startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), isPublished: true,
  } });
  await event(1, 'YOUTH');
  await event(2, 'CONFERENCE');

  const author = await prisma.adminUser.create({ data: { email: 'author@hpcglobal.org', name: 'Author', role: 'CONTENT_EDITOR', passwordHash: 'x' } });
  const post = (n, category) => prisma.blogPost.create({ data: {
    title: `Post ${n}`, slug: `post-${n}`, excerpt: 'x', content: 'x', category, authorId: author.id, isPublished: true, publishedAt: new Date(),
  } });
  await post(1, 'TESTIMONY');
  await post(2, 'TEACHING');
});

test.after(async () => {
  await server?.close();
  await prisma.$disconnect();
});

test('a sermon series filter is a value, never a filter of its own', async () => {
  assert.deepEqual((await get('/sermons?series=Faith')).body.sermons.map((s) => s.series), ['Faith']);
  for (const q of ['series[not]=Faith', 'series[contains]=', 'series[]=Faith', 'preacher[not]=x']) {
    const res = await get(`/sermons?${q}`);
    assert.equal(res.status, 200, q);
    assert.equal(res.body.total, 2, `${q} is ignored, not obeyed`);
  }
});

test('an event category filter is a value, never a filter of its own', async () => {
  assert.deepEqual((await get('/events?category=YOUTH')).body.map((e) => e.category), ['YOUTH']);
  for (const q of ['category[not]=YOUTH', 'category[in][]=YOUTH', 'category[]=YOUTH']) {
    const res = await get(`/events?${q}`);
    assert.equal(res.status, 200, q);
    assert.equal(res.body.length, 2, `${q} is ignored, not obeyed`);
  }
});

test('a blog category filter is a value, never a filter of its own', async () => {
  assert.deepEqual((await get('/blog?category=TESTIMONY')).body.posts.map((p) => p.category), ['TESTIMONY']);
  for (const q of ['category[not]=TESTIMONY', 'category[]=TESTIMONY']) {
    const res = await get(`/blog?${q}`);
    assert.equal(res.status, 200, q);
    assert.equal(res.body.total, 2, `${q} is ignored, not obeyed`);
  }
});
