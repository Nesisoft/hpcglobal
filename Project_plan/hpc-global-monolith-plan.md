# HPC Global — Monolith Architecture & Admin Content Plan

> **Stack:** React JS (client) · Node JS / Express (server) · PostgreSQL · Prisma ORM  
> **Architecture:** API-based monolith — single project, single deployment  
> **Admin panel:** Protected React routes at `/admin` — JWT authenticated

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [How the Monolith Works](#2-how-the-monolith-works)
3. [Database Schema Overview](#3-database-schema-overview)
4. [Admin Panel — Modules & Content](#4-admin-panel--modules--content)
   - [4.1 Dashboard](#41-dashboard--overview)
   - [4.2 Hero & Homepage](#42-hero--homepage-content)
   - [4.3 Sermons](#43-sermons--media)
   - [4.4 Events](#44-events--calendar)
   - [4.5 Giving Records](#45-giving--donations)
   - [4.6 Prayer Requests](#46-prayer-requests)
   - [4.7 Visitors / New Members](#47-visitors--new-members)
   - [4.8 Blog & Devotionals](#48-blog--devotionals)
   - [4.9 Gallery](#49-gallery)
   - [4.10 Ministries](#410-ministries)
   - [4.11 Leadership & Team](#411-leadership--team)
   - [4.12 About Page Content](#412-about-page-content)
   - [4.13 Service Times](#413-service-times)
   - [4.14 Contact & Settings](#414-contact--settings)
   - [4.15 Admin Users](#415-admin-users)
5. [API Route Map](#5-api-route-map)
6. [Admin Role Permissions](#6-admin-role-permissions)
7. [Updated Project Structure (Monolith)](#7-updated-project-structure-monolith)
8. [Updated Content Checklist](#8-updated-content-checklist)

---

## 1. Project Structure

```
hpc-global/                          ← Single repo, single deployment
│
├── client/                          ← React frontend (Vite)
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── components/
│       │   ├── layout/              ← Navbar, Footer, PageWrapper
│       │   ├── ui/                  ← Button, Card, Badge, Modal, Carousel
│       │   ├── sections/            ← Hero, ServiceBar, SermonStrip, Ticker
│       │   └── forms/               ← GiveForm, PrayerForm, VisitorForm
│       ├── pages/
│       │   ├── public/              ← All public-facing pages
│       │   │   ├── Home.jsx
│       │   │   ├── About.jsx
│       │   │   ├── Leadership.jsx
│       │   │   ├── Services.jsx
│       │   │   ├── Sermons.jsx
│       │   │   ├── Events.jsx
│       │   │   ├── Give.jsx
│       │   │   ├── Ministries.jsx
│       │   │   ├── NewHere.jsx
│       │   │   ├── Prayer.jsx
│       │   │   ├── Blog.jsx
│       │   │   ├── BlogPost.jsx
│       │   │   ├── Gallery.jsx
│       │   │   └── Contact.jsx
│       │   └── admin/               ← Protected admin pages
│       │       ├── AdminLogin.jsx
│       │       ├── AdminDashboard.jsx
│       │       ├── AdminHero.jsx
│       │       ├── AdminSermons.jsx
│       │       ├── AdminEvents.jsx
│       │       ├── AdminGiving.jsx
│       │       ├── AdminPrayer.jsx
│       │       ├── AdminVisitors.jsx
│       │       ├── AdminBlog.jsx
│       │       ├── AdminGallery.jsx
│       │       ├── AdminMinistries.jsx
│       │       ├── AdminLeadership.jsx
│       │       ├── AdminAbout.jsx
│       │       ├── AdminServices.jsx
│       │       ├── AdminContact.jsx
│       │       └── AdminUsers.jsx
│       ├── hooks/
│       │   ├── useAuth.js           ← JWT auth hook
│       │   ├── useSermons.js
│       │   ├── useEvents.js
│       │   └── useApi.js            ← Generic API hook with Axios
│       ├── context/
│       │   └── AuthContext.jsx      ← Admin auth context
│       ├── services/
│       │   └── api.js               ← All Axios API calls, centralised
│       ├── utils/
│       │   ├── auth.js              ← Token storage / decode
│       │   ├── formatDate.js
│       │   └── timezone.js
│       ├── styles/
│       │   ├── globals.css
│       │   └── tokens.css
│       ├── App.jsx                  ← Routes (public + /admin/*)
│       └── main.jsx
│
├── server/                          ← Express backend
│   └── src/
│       ├── routes/
│       │   ├── auth.js              ← POST /api/auth/login, /refresh
│       │   ├── hero.js              ← GET/PUT /api/hero
│       │   ├── sermons.js           ← CRUD /api/sermons
│       │   ├── events.js            ← CRUD /api/events
│       │   ├── giving.js            ← POST /api/give, GET /api/giving (admin)
│       │   ├── prayer.js            ← POST /api/prayer, GET (admin)
│       │   ├── visitors.js          ← POST /api/visitors, GET (admin)
│       │   ├── blog.js              ← CRUD /api/blog
│       │   ├── gallery.js           ← CRUD /api/gallery
│       │   ├── ministries.js        ← CRUD /api/ministries
│       │   ├── leadership.js        ← CRUD /api/leadership
│       │   ├── about.js             ← GET/PUT /api/about
│       │   ├── services.js          ← GET/PUT /api/service-times
│       │   ├── contact.js           ← GET/PUT /api/contact, POST /api/contact/message
│       │   ├── youtube.js           ← GET /api/youtube/latest (cached)
│       │   └── settings.js          ← GET/PUT /api/settings
│       ├── middleware/
│       │   ├── auth.js              ← JWT verification middleware
│       │   ├── adminOnly.js         ← Role check middleware
│       │   ├── upload.js            ← Multer + Cloudinary
│       │   └── validate.js          ← Zod request validation
│       ├── services/
│       │   ├── paystack.js          ← Paystack payment processing
│       │   ├── sms.js               ← Hubtel / Arkesel SMS + WhatsApp
│       │   ├── email.js             ← Nodemailer
│       │   ├── youtube.js           ← YouTube Data API v3 (with cache)
│       │   └── cloudinary.js        ← Image upload helper
│       ├── prisma/
│       │   └── schema.prisma        ← All database models
│       ├── app.js                   ← Express app setup, routes mount
│       └── server.js                ← Entry point — serves API + React build
│
├── shared/                          ← Shared between client and server
│   ├── constants.js                 ← Enums, giving categories, etc.
│   └── types.js                     ← JSDoc types (or TypeScript interfaces)
│
├── .env                             ← All secrets (never committed)
├── .gitignore
├── package.json                     ← Root: scripts for dev, build, start
└── README.md
```

---

## 2. How the Monolith Works

### Development Mode

```bash
# Root package.json scripts
"dev": "concurrently \"npm run dev:server\" \"npm run dev:client\""
"dev:server": "nodemon server/src/server.js"
"dev:client": "vite client/"
"build": "vite build client/"
"start": "node server/src/server.js"
```

```
Browser → http://localhost:5173 (Vite dev server)
            ↓ /api/* requests proxied to →
         http://localhost:5000 (Express)
            ↓ reads/writes →
         PostgreSQL database
```

**Vite proxy config (`client/vite.config.js`):**

```js
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
}
```

### Production Mode

```
Browser → https://hpcglobal.org
            ↓ /* (React SPA) served by Express from client/dist
            ↓ /api/* handled by Express routes
         Express (single process, single port)
            ↓
         PostgreSQL (Railway / Supabase / Render)
```

**Express serves React in production (`server/src/server.js`):**

```js
const path = require('path');

// Serve React build
app.use(express.static(path.join(__dirname, '../../client/dist')));

// All API routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/sermons',    require('./routes/sermons'));
app.use('/api/events',     require('./routes/events'));
// ... all other routes

// React catch-all (must be LAST)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});
```

### Auth Flow

```
Admin logs in → POST /api/auth/login
              ← { accessToken (15min), refreshToken (7d) }

Every admin API request →
  Authorization: Bearer <accessToken>
  Middleware verifies JWT, checks role
  ← data or 401/403

Token expiry →
  POST /api/auth/refresh with refreshToken
  ← new accessToken
```

---

## 3. Database Schema Overview

```prisma
// server/src/prisma/schema.prisma

model AdminUser {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  role         AdminRole
  createdAt    DateTime @default(now())
  lastLogin    DateTime?
}

enum AdminRole {
  SUPER_ADMIN    // Full access
  CONTENT_EDITOR // No giving/prayer access
  MEDIA_MANAGER  // Gallery + sermons only
}

model SiteSettings {
  id              String  @id @default("singleton")
  churchName      String
  tagline         String
  phone           String
  email           String
  whatsapp        String
  address         String
  mapsLat         Float
  mapsLng         Float
  zoomLink        String
  youtubeHandle   String
  facebookUrl     String
  instagramUrl    String
  mtnMomoNumber   String
  telecelNumber   String
  airteltigo      String
  bankName        String
  bankAccount     String
  bankBranch      String
  updatedAt       DateTime @updatedAt
}

model HeroSlide {
  id          String    @id @default(uuid())
  type        SlideType // IDENTITY | EVENT | YOUTUBE
  isActive    Boolean   @default(true)
  order       Int
  headline    String
  subheadline String?
  body        String?
  ctaPrimary  String?
  ctaPrimaryUrl String?
  ctaSecondary  String?
  ctaSecondaryUrl String?
  imageUrl    String?
  eventId     String?   // if type = EVENT
  updatedAt   DateTime  @updatedAt
}

enum SlideType { IDENTITY EVENT YOUTUBE }

model ServiceTime {
  id          String  @id @default(uuid())
  name        String  // "Dominion Encounter"
  day         String  // "Sunday"
  timeGmt     String  // "9:00 AM"
  timeEst     String?
  timeBst     String?
  duration    String?
  isOnline    Boolean @default(false)
  platform    String? // "Zoom", "YouTube"
  joinLink    String?
  isStreamed  Boolean @default(false)
  youtubeUrl  String?
  order       Int
  isActive    Boolean @default(true)
}

model Event {
  id          String      @id @default(uuid())
  title       String
  slug        String      @unique
  description String
  startDate   DateTime
  endDate     DateTime?
  timeGmt     String
  timeEst     String?
  timeBst     String?
  venue       String?
  isOnline    Boolean     @default(false)
  joinLink    String?
  imageUrl    String?
  category    EventCategory
  isFeatured  Boolean     @default(false)
  isPublished Boolean     @default(false)
  speakers    String?     // JSON array of names
  rsvps       EventRsvp[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

enum EventCategory { SERVICE CONFERENCE YOUTH WOMENS MENS ONLINE OTHER }

model EventRsvp {
  id         String   @id @default(uuid())
  event      Event    @relation(fields: [eventId], references: [id])
  eventId    String
  name       String
  email      String?
  phone      String
  attendance String   // "in-person" | "online"
  createdAt  DateTime @default(now())
}

model Sermon {
  id            String   @id @default(uuid())
  title         String
  preacher      String
  youtubeId     String   @unique
  youtubeUrl    String
  thumbnailUrl  String
  duration      String?
  series        String?
  scripture     String?
  serviceType   String?  // "Dominion Encounter" | "Prophetic & Miracle"
  datePracticed DateTime
  isPublished   Boolean  @default(true)
  isFeatured    Boolean  @default(false)
  createdAt     DateTime @default(now())
}

model BlogPost {
  id          String      @id @default(uuid())
  title       String
  slug        String      @unique
  excerpt     String
  content     String      // Rich text / markdown
  category    BlogCategory
  authorId    String
  author      AdminUser   @relation(fields: [authorId], references: [id])
  featuredImage String?
  isPublished Boolean     @default(false)
  publishedAt DateTime?
  readTime    Int?        // minutes
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

enum BlogCategory {
  DEVOTIONAL PROPHETIC_WORD SERMON_NOTES TEACHING TESTIMONY EVENT_RECAP ANNOUNCEMENT
}

model GalleryAlbum {
  id          String        @id @default(uuid())
  name        String
  description String?
  eventDate   DateTime?
  coverImage  String?
  isPublished Boolean       @default(false)
  photos      GalleryPhoto[]
  createdAt   DateTime      @default(now())
}

model GalleryPhoto {
  id       String       @id @default(uuid())
  album    GalleryAlbum @relation(fields: [albumId], references: [id])
  albumId  String
  url      String
  caption  String?
  order    Int
}

model Ministry {
  id          String  @id @default(uuid())
  name        String
  slug        String  @unique
  description String
  vision      String?
  leader      String
  leaderPhoto String?
  meetingDay  String?
  meetingTime String?
  icon        String  // Lucide icon name e.g. "Users"
  whatsapp    String?
  email       String?
  order       Int
  isActive    Boolean @default(true)
}

model LeadershipProfile {
  id           String @id @default(uuid())
  name         String
  title        String
  role         String // "Global Senior Pastor" | "Youth Pastor" etc.
  bio          String
  photo        String?
  quote        String?
  scripture    String?
  youtubeUrl   String?
  facebookUrl  String?
  instagramUrl String?
  isSenior     Boolean @default(false)
  order        Int
  isActive     Boolean @default(true)
}

model AboutContent {
  id              String @id @default("singleton")
  vision          String
  mission         String
  story           String  // Rich text
  foundedYear     Int?
  coreValues      String  // JSON: [{icon, name, description}]
  beliefs         String  // JSON: [{title, content}]
  milestones      String  // JSON: [{year, title, description}]
  updatedAt       DateTime @updatedAt
}

model PrayerRequest {
  id          String          @id @default(uuid())
  name        String?         // optional — allow anonymous
  phone       String?
  email       String?
  category    PrayerCategory
  request     String
  wantsCall   Boolean         @default(false)
  isPrivate   Boolean         @default(true)
  status      PrayerStatus    @default(NEW)
  adminNotes  String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

enum PrayerCategory { HEALTH FAMILY FINANCE CAREER SPIRITUAL RELATIONSHIPS OTHER }
enum PrayerStatus   { NEW PRAYING ANSWERED CLOSED }

model Visitor {
  id           String   @id @default(uuid())
  name         String
  phone        String
  email        String?
  country      String?
  city         String?
  source       String?  // "YouTube" | "Facebook" | "Friend" | "Google" | "Other"
  message      String?
  preferredSvc String?
  status       VisitorStatus @default(NEW)
  adminNotes   String?
  followedUpAt DateTime?
  createdAt    DateTime @default(now())
}

enum VisitorStatus { NEW CONTACTED ATTENDING MEMBER }

model GivingRecord {
  id          String        @id @default(uuid())
  name        String
  phone       String
  email       String?
  amount      Float
  currency    String        @default("GHS")
  category    GivingCategory
  method      PaymentMethod
  reference   String?       // Paystack ref
  status      PaymentStatus @default(PENDING)
  createdAt   DateTime      @default(now())
}

enum GivingCategory { TITHE OFFERING FIRST_FRUITS BUILDING_FUND MISSIONS PASTORAL OTHER }
enum PaymentMethod  { MTN_MOMO TELECEL AIRTELTIGO BANK_TRANSFER CARD }
enum PaymentStatus  { PENDING COMPLETED FAILED }

model ContactMessage {
  id        String   @id @default(uuid())
  name      String
  email     String
  phone     String?
  type      String   // "General" | "Pastoral" | "Event" | "Media" | "Partnership"
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

---

## 4. Admin Panel — Modules & Content

All admin routes are protected. Login at `/admin/login`. All other `/admin/*` routes redirect to login if no valid JWT.

---

### 4.1 Dashboard — Overview

**Route:** `/admin`

A summary view. Gives the admin at-a-glance numbers without navigating.

| Widget | Data shown |
|---|---|
| New prayer requests | Count since last login, unread count |
| New visitors / connect cards | Count this week |
| Upcoming events | Next 3 events with dates |
| Latest sermon | Title, date, YouTube views |
| Giving summary | Total this month (GHS), transaction count |
| New contact messages | Unread count |
| Quick actions | "+ New sermon", "+ New event", "+ New blog post" |

**API:** `GET /api/admin/dashboard` — single endpoint aggregating all counts.

---

### 4.2 Hero & Homepage Content

**Route:** `/admin/hero`

The admin controls everything that appears on the homepage without touching code.

#### Hero Slides Manager

Three slides — each configurable:

**Slide 1 — Identity Slide**

| Field | Type | Notes |
|---|---|---|
| Headline | Text input | e.g. "Where Hope Meets Destiny" |
| Sub-headline | Text input | e.g. "Hopepress Chapel — Accra, Ghana" |
| Body text | Textarea | Short paragraph |
| CTA Primary label | Text input | e.g. "I'm new here" |
| CTA Primary URL | Text input | e.g. `/new-here` |
| CTA Secondary label | Text input | e.g. "Watch a sermon" |
| CTA Secondary URL | Text input | |
| Background image | Image upload | Optional over the gradient |
| Active | Toggle | Show/hide this slide |

**Slide 2 — Upcoming Event Slide**

| Field | Type | Notes |
|---|---|---|
| Link to event | Dropdown | Select from published Events |
| Override headline | Text input | Leave blank to use event title |
| Active | Toggle | Auto-hides when event date passes |

**Slide 3 — YouTube Sermon Slide**

| Field | Type | Notes |
|---|---|---|
| Mode | Radio | Auto (pulls from YouTube API) or Manual |
| Manual YouTube ID | Text input | Only if mode = Manual |
| Override title | Text input | Leave blank to use YouTube title |
| Active | Toggle | |

#### Event Ticker

| Field | Type |
|---|---|
| Custom ticker messages | Add / remove / reorder text items |
| Auto-include upcoming events | Toggle (on by default) |

**API:** `GET /api/hero` (public) · `PUT /api/hero` (admin only)

---

### 4.3 Sermons & Media

**Route:** `/admin/sermons`

**What the admin manages:**

#### Add a Sermon

| Field | Type | Notes |
|---|---|---|
| YouTube URL or ID | Text input | Paste the YouTube video link |
| Auto-fill from YouTube | Button | Fetches title, thumbnail, duration via YouTube API |
| Sermon title | Text input | Pre-filled from YouTube, editable |
| Preacher | Dropdown | Select from Leadership profiles |
| Date preached | Date picker | |
| Series | Text input / dropdown | Type or select existing series |
| Scripture reference | Text input | e.g. "Isaiah 61:1-3" |
| Service type | Dropdown | Dominion Encounter / Prophetic & Miracle |
| Featured | Toggle | Shows in homepage strip and hero |
| Published | Toggle | Hides from public if off |

#### Sermon List

- Table: title, preacher, date, series, featured toggle, published toggle, delete
- Search and filter by series, preacher, date

#### Sermon Series Manager

| Field | Type |
|---|---|
| Series name | Text input |
| Series description | Textarea |
| Cover image | Image upload |
| Order | Number |
| Active | Toggle |

**API:**
- `GET /api/sermons` — public (published only)
- `GET /api/admin/sermons` — all including drafts
- `POST /api/admin/sermons` — create
- `PUT /api/admin/sermons/:id` — update
- `DELETE /api/admin/sermons/:id` — delete

---

### 4.4 Events & Calendar

**Route:** `/admin/events`

**What the admin manages:**

#### Create / Edit Event

| Field | Type | Notes |
|---|---|---|
| Event title | Text input | |
| Slug | Auto-generated, editable | URL: `/events/slug` |
| Description | Rich text editor | Full event details |
| Category | Dropdown | Service / Conference / Youth / Women's / Men's / Online / Other |
| Start date & time | DateTime picker | |
| End date & time | DateTime picker | Optional |
| Timezone display | Multi-field | GMT, EST, BST — admin fills what's relevant |
| Venue | Text input | Physical address |
| Is online | Toggle | Shows Zoom/link field if on |
| Zoom / join link | Text input | |
| Event banner image | Image upload | Cloudinary |
| Speaker(s) | Dynamic add | Name + role per speaker |
| Featured | Toggle | Shows in hero carousel slide 2 |
| Published | Toggle | |

#### Event List

- Calendar view (month grid) + table list toggle
- Colour-coded by category
- Quick toggle: Published / Featured
- Past events auto-archived

#### RSVPs per Event

- Table: name, phone, email, attendance type, date
- Export as CSV
- Count badge per event

**API:**
- `GET /api/events` — public (upcoming + published)
- `GET /api/events/:slug` — public single
- `POST /api/events/:id/rsvp` — public RSVP
- `GET /api/admin/events` — all events
- `POST /api/admin/events` — create
- `PUT /api/admin/events/:id` — update
- `DELETE /api/admin/events/:id` — delete
- `GET /api/admin/events/:id/rsvps` — RSVP list

---

### 4.5 Giving & Donations

**Route:** `/admin/giving`

The admin **does not create giving records** — these come in through the public `/give` page via Paystack. The admin views, filters, and exports records.

#### Giving Records Table

| Column | Notes |
|---|---|
| Date | Transaction date |
| Name | Giver name |
| Phone | |
| Amount | GHS formatted |
| Category | Tithe / Offering / etc. |
| Method | MTN MoMo / Telecel / etc. |
| Status | Pending / Completed / Failed |
| Reference | Paystack transaction ref |

#### Filters

- Date range picker
- Category filter
- Payment method filter
- Status filter

#### Summary Cards

- Total received this month
- Total received this year
- Transaction count
- Average gift amount
- Breakdown by category (bar chart)
- Breakdown by payment method (pie chart)

#### Export

- Export filtered records as CSV
- Used for church accounting / bookkeeping

**API:**
- `POST /api/give` — public (triggers Paystack)
- `GET /api/admin/giving` — all records (admin only)
- `GET /api/admin/giving/summary` — aggregated stats
- `GET /api/admin/giving/export` — CSV download

---

### 4.6 Prayer Requests

**Route:** `/admin/prayer`

#### Prayer Request List

All submitted requests. Columns:

| Column | Notes |
|---|---|
| Date | Submission date |
| Name | "Anonymous" if blank |
| Category | Health / Family / etc. |
| Request | Truncated preview |
| Wants call | Yes / No badge |
| Status | New / Praying / Answered / Closed |
| Private | Lock icon if private |

#### Request Detail View

- Full prayer request text
- Contact details (phone / email)
- Status dropdown: New → Praying → Answered → Closed
- Admin notes field (private — for internal follow-up notes)
- "Mark as read" action

#### Filters

- Status filter
- Category filter
- Date range
- Search by name

> **Privacy note:** Prayer requests marked "private" are never shown publicly. Only admins with the correct role can view them.

**API:**
- `POST /api/prayer` — public submission
- `GET /api/admin/prayer` — list (admin only)
- `PUT /api/admin/prayer/:id` — update status / notes

---

### 4.7 Visitors / New Members

**Route:** `/admin/visitors`

All submissions from the "New Here?" connect card.

#### Visitor List

| Column | Notes |
|---|---|
| Date | Submission date |
| Name | |
| Phone | |
| Country / City | |
| Source | How they found HPC Global |
| Preferred service | |
| Status | New / Contacted / Attending / Member |

#### Visitor Detail

- Full profile: name, phone, email, location, source, message
- Status update dropdown
- Admin notes (follow-up log)
- "Followed up on" date field
- Quick action: "Send WhatsApp" (opens wa.me link)

#### Bulk Actions

- Export as CSV
- Mark selected as "Contacted"
- Filter by status, source, date

**API:**
- `POST /api/visitors` — public (new here form)
- `GET /api/admin/visitors` — list (admin)
- `PUT /api/admin/visitors/:id` — update status / notes

---

### 4.8 Blog & Devotionals

**Route:** `/admin/blog`

The admin creates and publishes all written content.

#### Post Editor

| Field | Type | Notes |
|---|---|---|
| Title | Text input | |
| Slug | Auto-generated, editable | |
| Category | Dropdown | Devotional / Prophetic Word / Sermon Notes / Teaching / Testimony / Event Recap / Announcement |
| Author | Dropdown | Select from admin users |
| Featured image | Image upload | Cloudinary — shown as header + card thumbnail |
| Excerpt | Textarea | 1–2 sentences, shown in card grid |
| Content | Rich text editor | Full WYSIWYG (TipTap or React Quill) — supports headings, bold, italics, scripture quotes, images |
| Published | Toggle | Draft vs live |
| Publish date | DateTime picker | Schedule future publish |
| Read time | Auto-calculated from word count | |

#### Post List

- Table: title, category, author, date, published toggle, edit, delete
- Filter by category, author, status

**API:**
- `GET /api/blog` — public (published only)
- `GET /api/blog/:slug` — public single
- `GET /api/admin/blog` — all posts
- `POST /api/admin/blog` — create
- `PUT /api/admin/blog/:id` — update
- `DELETE /api/admin/blog/:id` — delete

---

### 4.9 Gallery

**Route:** `/admin/gallery`

#### Create Album

| Field | Type |
|---|---|
| Album name | Text input (e.g. "Dominion Encounter — Nov 2025") |
| Description | Textarea |
| Event date | Date picker |
| Cover image | Image upload (or select from photos below) |
| Published | Toggle |

#### Upload Photos to Album

- Drag-and-drop multi-photo upload
- Cloudinary upload per photo
- Caption per photo (optional)
- Drag to reorder photos
- Delete individual photos

#### Album List

- Grid of album cards (cover + name + count + published badge)
- Edit / delete album
- Reorder albums (drag)

**API:**
- `GET /api/gallery` — public albums
- `GET /api/gallery/:id` — public album + photos
- `POST /api/admin/gallery/albums` — create album
- `PUT /api/admin/gallery/albums/:id` — update
- `POST /api/admin/gallery/albums/:id/photos` — upload photos
- `DELETE /api/admin/gallery/photos/:id` — delete photo

---

### 4.10 Ministries

**Route:** `/admin/ministries`

#### Create / Edit Ministry

| Field | Type | Notes |
|---|---|---|
| Ministry name | Text input | e.g. "Youth Ministry" |
| Slug | Auto-generated | |
| Icon | Icon picker | Select Lucide icon name from a visual grid |
| Leader name | Text input | |
| Leader photo | Image upload | |
| Meeting day | Text input | e.g. "Saturdays" |
| Meeting time | Text input | e.g. "4:00 PM GMT" |
| Description | Rich text | |
| Vision | Textarea | |
| WhatsApp link | Text input | `wa.me/233...` |
| Email | Text input | |
| Order | Number | Controls display order |
| Active | Toggle | |

#### Ministry List

- Drag-to-reorder list
- Active toggle per ministry
- Edit / delete

**API:** Full CRUD at `/api/admin/ministries` · `GET /api/ministries` public

---

### 4.11 Leadership & Team

**Route:** `/admin/leadership`

#### Create / Edit Profile

| Field | Type | Notes |
|---|---|---|
| Full name | Text input | |
| Title | Text input | e.g. "Prophet" / "Lady Apostle" |
| Role | Text input | e.g. "Global Senior Pastor" |
| Photo | Image upload | Professional portrait |
| Bio | Rich text | Full biography |
| Signature quote | Textarea | Personal quote or motto |
| Scripture | Text input | e.g. "Jeremiah 29:11" |
| YouTube URL | Text input | For Prophet Clottey |
| Facebook URL | Text input | |
| Instagram URL | Text input | |
| Is Senior Pastor | Toggle | Determines display prominence |
| Order | Number | Display order |
| Active | Toggle | |

#### Leadership List

- Cards preview with photo, name, title
- Drag to reorder
- Active toggle

**API:** Full CRUD at `/api/admin/leadership` · `GET /api/leadership` public

---

### 4.12 About Page Content

**Route:** `/admin/about`

The entire About page is content-managed — no content is hardcoded.

#### Sections to edit:

| Section | Field type |
|---|---|
| Vision statement | Large textarea |
| Mission statement | Large textarea |
| Church story | Rich text editor |
| Founded year | Number input |
| Core values | Dynamic list: icon picker + name + description (add / remove / reorder) |
| Statement of faith | Dynamic accordion items: title + content (add / remove / reorder) |
| Ministry timeline | Dynamic list: year + title + description + photo upload |

**API:** `GET /api/about` (public) · `PUT /api/admin/about` (admin only)

---

### 4.13 Service Times

**Route:** `/admin/services`

Controls what appears in the service times bar and Services page.

#### Per-Service Fields

| Field | Type |
|---|---|
| Service name | Text input |
| Day of week | Text input |
| Time (GMT) | Text input |
| Time (EST) | Text input (optional) |
| Time (BST) | Text input (optional) |
| Duration | Text input |
| Is online only | Toggle |
| Platform | Text input (e.g. "Zoom") |
| Join link | Text input |
| Is YouTube streamed | Toggle |
| YouTube channel URL | Text input |
| "Add to calendar" enabled | Toggle |
| Active | Toggle |
| Order | Number |

**API:** `GET /api/service-times` (public) · `PUT /api/admin/service-times/:id` (admin)

---

### 4.14 Contact & Site Settings

**Route:** `/admin/settings`

Single settings record — one form, one save.

#### Church Details

| Field | Notes |
|---|---|
| Church name | "HPC Global" |
| Tagline | "Where Hope Meets Destiny" |
| Phone number | Main office |
| Email address | Main office |
| WhatsApp number | `+233...` |
| Physical address | "Klagon Junction, Behind K. Ofori Enterprise, Accra" |
| Google Maps latitude | `5.6656744` |
| Google Maps longitude | `-0.0471646` |
| Zoom link | For Prophetic Highway |

#### Social Media

| Field |
|---|
| YouTube handle / URL |
| Facebook page URL |
| Instagram URL |

#### Payment Details

| Field | Notes |
|---|---|
| MTN MoMo number | Displayed on Give page |
| Telecel Cash number | |
| AirtelTigo number | |
| Bank name | |
| Bank account number | |
| Bank branch | |
| Paystack public key | For client-side init |
| Paystack secret key | Server-side only, never exposed |

#### Contact Form Messages

Sub-tab within Settings:

- Table of all contact form submissions
- Columns: date, name, email, type, preview, read status
- Click to view full message
- Mark as read
- Reply via email link

**API:** `GET /api/settings` (public — safe fields only) · `PUT /api/admin/settings` (admin)

---

### 4.15 Admin Users

**Route:** `/admin/users`

> Only accessible by `SUPER_ADMIN` role.

#### Create Admin User

| Field | Type |
|---|---|
| Full name | Text input |
| Email | Text input |
| Password | Text input (hashed on save) |
| Role | Dropdown: Super Admin / Content Editor / Media Manager |

#### User List

- Name, email, role, last login
- Edit role
- Reset password (sends email link)
- Deactivate / delete

---

## 5. API Route Map

### Public Routes (no auth required)

```
GET  /api/hero                    Hero slides + ticker config
GET  /api/service-times           All active service times
GET  /api/sermons                 Published sermons (paginated)
GET  /api/sermons/:id             Single sermon
GET  /api/events                  Upcoming published events
GET  /api/events/:slug            Single event detail
POST /api/events/:id/rsvp         RSVP to event
GET  /api/youtube/latest          Latest YouTube videos (cached 30min)
GET  /api/blog                    Published blog posts
GET  /api/blog/:slug              Single blog post
GET  /api/gallery                 Published albums
GET  /api/gallery/:id             Single album + photos
GET  /api/ministries              Active ministries
GET  /api/leadership              Active leadership profiles
GET  /api/about                   About page content
GET  /api/service-times           Service times
GET  /api/settings                Public settings (no secrets)
POST /api/prayer                  Submit prayer request
POST /api/visitors                Submit new here form
POST /api/contact/message         Submit contact form
POST /api/give                    Initiate giving (Paystack)
GET  /api/give/verify/:ref        Verify payment after redirect
```

### Admin Routes (JWT required)

```
POST /api/auth/login              Login → returns tokens
POST /api/auth/refresh            Refresh access token
POST /api/auth/logout             Invalidate refresh token

GET  /api/admin/dashboard         Dashboard summary stats

PUT  /api/admin/hero              Update hero slides + ticker

GET  /api/admin/sermons           All sermons
POST /api/admin/sermons           Create sermon
PUT  /api/admin/sermons/:id       Update sermon
DELETE /api/admin/sermons/:id     Delete sermon

GET  /api/admin/events            All events
POST /api/admin/events            Create event
PUT  /api/admin/events/:id        Update event
DELETE /api/admin/events/:id      Delete event
GET  /api/admin/events/:id/rsvps  RSVPs for event
GET  /api/admin/events/:id/rsvps/export  CSV export

GET  /api/admin/giving            All giving records
GET  /api/admin/giving/summary    Aggregated stats
GET  /api/admin/giving/export     CSV export

GET  /api/admin/prayer            All prayer requests
PUT  /api/admin/prayer/:id        Update status / notes

GET  /api/admin/visitors          All visitor submissions
PUT  /api/admin/visitors/:id      Update status / notes
GET  /api/admin/visitors/export   CSV export

GET  /api/admin/blog              All posts
POST /api/admin/blog              Create post
PUT  /api/admin/blog/:id          Update post
DELETE /api/admin/blog/:id        Delete post

GET  /api/admin/gallery/albums          All albums
POST /api/admin/gallery/albums          Create album
PUT  /api/admin/gallery/albums/:id      Update album
DELETE /api/admin/gallery/albums/:id    Delete album
POST /api/admin/gallery/albums/:id/photos  Upload photos
DELETE /api/admin/gallery/photos/:id       Delete photo

GET  /api/admin/ministries        All ministries
POST /api/admin/ministries        Create
PUT  /api/admin/ministries/:id    Update
DELETE /api/admin/ministries/:id  Delete

GET  /api/admin/leadership        All profiles
POST /api/admin/leadership        Create
PUT  /api/admin/leadership/:id    Update
DELETE /api/admin/leadership/:id  Delete

GET  /api/admin/about             About content
PUT  /api/admin/about             Update about content

GET  /api/admin/service-times     All service times
PUT  /api/admin/service-times/:id Update service time

GET  /api/admin/settings          Full settings (including secrets)
PUT  /api/admin/settings          Update settings

GET  /api/admin/contact/messages  Contact form messages
PUT  /api/admin/contact/messages/:id  Mark read

GET  /api/admin/users             All admin users (SUPER_ADMIN only)
POST /api/admin/users             Create admin user
PUT  /api/admin/users/:id         Update user / role
DELETE /api/admin/users/:id       Delete user
```

---

## 6. Admin Role Permissions

| Module | Super Admin | Content Editor | Media Manager |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ |
| Hero / Homepage | ✅ | ✅ | ❌ |
| Sermons | ✅ | ✅ | ✅ |
| Events | ✅ | ✅ | ❌ |
| Giving records | ✅ | ❌ | ❌ |
| Prayer requests | ✅ | ❌ | ❌ |
| Visitors / New members | ✅ | ✅ | ❌ |
| Blog / Devotionals | ✅ | ✅ | ❌ |
| Gallery | ✅ | ✅ | ✅ |
| Ministries | ✅ | ✅ | ❌ |
| Leadership profiles | ✅ | ✅ | ❌ |
| About page | ✅ | ✅ | ❌ |
| Service times | ✅ | ✅ | ❌ |
| Site settings | ✅ | ❌ | ❌ |
| Admin users | ✅ | ❌ | ❌ |

---

## 7. Updated Project Structure (Monolith)

```
hpc-global/
│
├── client/                    ← React (Vite) — built to client/dist/
├── server/                    ← Express — serves API + client/dist/
├── shared/                    ← Shared constants and types
│
├── package.json               ← Root workspace config
│   scripts:
│     "dev"   → concurrently runs Vite (port 5173) + Express (port 5000)
│     "build" → vite build → output to client/dist/
│     "start" → node server/src/server.js (serves both in production)
│
├── .env                       ← All environment variables
│     DATABASE_URL
│     JWT_SECRET
│     JWT_REFRESH_SECRET
│     PAYSTACK_SECRET_KEY
│     PAYSTACK_PUBLIC_KEY
│     CLOUDINARY_CLOUD_NAME
│     CLOUDINARY_API_KEY
│     CLOUDINARY_API_SECRET
│     YOUTUBE_API_KEY
│     SMTP_HOST / SMTP_USER / SMTP_PASS
│     HUBTEL_CLIENT_ID / HUBTEL_SECRET   ← SMS / WhatsApp
│     NODE_ENV
│
└── README.md
```

---

## 8. Updated Content Checklist

Items the church must supply before launch:

### People & Profiles
- [ ] Professional photo — Prophet George Clottey
- [ ] Professional photo — Lady Apostle Adelaide Clottey
- [ ] Full bio — Prophet George Clottey (400–600 words)
- [ ] Full bio — Lady Apostle Adelaide Clottey (400–600 words)
- [ ] Personal scripture — both pastors
- [ ] Full pastoral / ministry team list (names, roles, photos, short bios)

### Vision, Mission & Beliefs
- [ ] Confirm the Vision statement wording (final version)
- [ ] Confirm the Mission statement wording (final version)
- [ ] Church founding story (narrative, 300–500 words)
- [ ] Year the church was founded
- [ ] Key milestone dates / events for the timeline
- [ ] Core values (confirm the 6 values, names and descriptions)
- [ ] Statement of Faith / Doctrinal statement (per belief area)

### Services & Programmes
- [ ] Confirm all service times (day, start time, end time, timezone)
- [ ] Confirm Zoom link for Global Prophetic Highway
- [ ] Confirm YouTube channel URL (@prophetclottey — verified)
- [ ] Confirm whether children's church is available (and age range)
- [ ] Confirm dress code guidance wording

### Contact & Payments
- [ ] WhatsApp number (primary contact)
- [ ] Church office phone number
- [ ] Church office email address
- [ ] MTN MoMo number for giving
- [ ] Telecel Cash number for giving
- [ ] AirtelTigo Money number for giving
- [ ] Bank name, account number, branch (for transfers)
- [ ] Paystack account (if not set up, register at paystack.com)

### Media & Content
- [ ] Welcome video from pastors (60 seconds) — for New Here page
- [ ] Church / congregation photos (minimum 10, high resolution)
- [ ] Any existing sermon recordings to import initially
- [ ] Any existing event photos / albums
- [ ] Prayer guide PDF (if available)
- [ ] Ministry arm names, leaders, meeting times confirmed

### Admin Access
- [ ] Name and email for Super Admin account (primary content manager)
- [ ] Name and email for any additional Content Editor accounts
- [ ] Domain name confirmed (hpcglobal.org or alternative)

---

*HPC Global — Hopepress Chapel*
*Architecture: API-based monolith — React JS + Node JS/Express + PostgreSQL*
*Single repo · Single deployment · Admin-managed content throughout*
