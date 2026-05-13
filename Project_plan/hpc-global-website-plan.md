# HPC Global — Hopepress Chapel
## Website Content & Technical Plan

> **Prepared for:** Prophet George Clottey & Lady Apostle Adelaide Clottey  
> **Ministry:** HPC Global — Hopepress Chapel, Klagon Junction, Accra, Ghana  
> **Domain (suggested):** hpcglobal.org  
> **Stack:** React JS (Frontend) · Node JS (Backend) · REST API

---

## Table of Contents

1. [Tech Stack & Architecture](#1-tech-stack--architecture)
2. [Design System](#2-design-system)
3. [Homepage](#3-homepage)
4. [About Us](#4-about-us)
5. [Leadership](#5-leadership)
6. [Our Services](#6-our-services)
7. [Sermons & Media](#7-sermons--media)
8. [Events & Calendar](#8-events--calendar)
9. [Give / Donate](#9-give--donate)
10. [Ministries](#10-ministries)
11. [New Here?](#11-new-here)
12. [Prayer Requests](#12-prayer-requests)
13. [Blog / Devotionals](#13-blog--devotionals)
14. [Gallery](#14-gallery)
15. [Contact & Location](#15-contact--location)
16. [Build Phases](#16-build-phases)

---

## 1. Tech Stack & Architecture

### Frontend — React JS

| Concern | Technology | Notes |
|---|---|---|
| Framework | React 18+ (Vite) | Fast dev server, optimised builds |
| Routing | React Router v6 | Client-side navigation, smooth page transitions |
| Styling | Tailwind CSS + CSS Variables | Utility-first, fully responsive |
| Icons | **Lucide React** (primary) + **React Icons** (brands) | High-quality SVG icons, tree-shakeable |
| Animations | **Framer Motion** | Smooth scroll reveals, hero carousel, page transitions |
| Smooth scroll | `react-scroll` + CSS `scroll-behavior: smooth` | Anchor navigation + section reveals on scroll |
| HTTP client | Axios | API calls to Node backend |
| YouTube embed | `react-youtube` or `@lite-youtube-embed/react` | Optimised YouTube player component |
| Calendar | `react-big-calendar` or `FullCalendar React` | Events calendar view |
| Forms | React Hook Form + Zod | Validation for giving, prayer, visitor forms |
| State | React Context + Zustand (if needed) | Global state for cart/prayer/events |
| SEO | React Helmet Async | Page titles, meta tags per route |
| Fonts | Google Fonts (Cormorant Garamond + Outfit) | Loaded via `@fontsource` npm packages |

### Backend — Node JS

| Concern | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20 LTS | |
| Framework | Express JS | REST API |
| Database | PostgreSQL | Primary data store |
| ORM | Prisma | Type-safe DB queries |
| Auth | JWT + bcrypt | Admin panel auth |
| Email | Nodemailer + SendGrid | Contact forms, receipts, visitor welcome |
| SMS / WhatsApp | Hubtel or Arkesel API | Ghana SMS, WhatsApp notifications |
| File uploads | Multer + Cloudinary | Gallery photo uploads |
| Payments | Paystack API | Mobile Money (MTN, Telecel, AirtelTigo) + card |
| YouTube API | Google YouTube Data API v3 | Auto-pull latest sermons / live stream status |
| Environment | dotenv | Secrets management |
| Hosting (suggested) | Railway / Render (backend) + Vercel (frontend) | Low-cost, scalable |

### Project Structure (Frontend)

```
hpc-global/
├── public/
├── src/
│   ├── assets/            # Fonts, images, brand assets
│   ├── components/
│   │   ├── layout/        # Navbar, Footer, PageWrapper
│   │   ├── ui/            # Button, Card, Badge, Modal, Carousel
│   │   ├── sections/      # Hero, ServiceBar, SermonStrip, GiveBand
│   │   └── forms/         # GiveForm, PrayerForm, VisitorForm, ContactForm
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── About.jsx
│   │   ├── Leadership.jsx
│   │   ├── Services.jsx
│   │   ├── Sermons.jsx
│   │   ├── Events.jsx
│   │   ├── Give.jsx
│   │   ├── Ministries.jsx
│   │   ├── NewHere.jsx
│   │   ├── Prayer.jsx
│   │   ├── Blog.jsx
│   │   ├── BlogPost.jsx
│   │   ├── Gallery.jsx
│   │   └── Contact.jsx
│   ├── hooks/             # useSermons, useEvents, useYouTube
│   ├── context/           # AppContext
│   ├── services/          # api.js, youtube.js, paystack.js
│   ├── utils/             # formatDate, timezone, scroll helpers
│   ├── styles/            # globals.css, tokens.css
│   ├── App.jsx
│   └── main.jsx
├── .env
├── vite.config.js
└── tailwind.config.js
```

### Backend API Structure (Node / Express)

```
hpc-backend/
├── src/
│   ├── routes/
│   │   ├── sermons.js     # GET /api/sermons
│   │   ├── events.js      # GET/POST /api/events
│   │   ├── giving.js      # POST /api/give (Paystack)
│   │   ├── prayer.js      # POST /api/prayer
│   │   ├── contact.js     # POST /api/contact
│   │   ├── visitor.js     # POST /api/visitor
│   │   ├── blog.js        # GET /api/blog
│   │   ├── gallery.js     # GET/POST /api/gallery
│   │   └── youtube.js     # GET /api/youtube/latest
│   ├── middleware/
│   │   ├── auth.js        # JWT verification
│   │   ├── upload.js      # Multer + Cloudinary
│   │   └── validate.js    # Request validation
│   ├── services/
│   │   ├── paystack.js    # Payment processing
│   │   ├── sms.js         # Hubtel/Arkesel SMS
│   │   ├── email.js       # Nodemailer
│   │   └── youtube.js     # YouTube Data API
│   ├── prisma/
│   │   └── schema.prisma
│   ├── app.js
│   └── server.js
├── .env
└── package.json
```

---

## 2. Design System

### Brand Colours

| Token | Hex | Usage |
|---|---|---|
| `--purple-deep` | `#210A4A` | Page backgrounds, hero, navbar |
| `--purple` | `#3B1278` | Section backgrounds, cards |
| `--purple-mid` | `#5A2DAF` | Hover states, secondary elements |
| `--gold` | `#C9A84C` | Primary accent, CTAs, headings |
| `--gold-light` | `#E2C46A` | Hover states on gold elements |
| `--gold-pale` | `#F5E9C4` | Subtle gold backgrounds |
| `--cream` | `#FBF7EE` | Light section backgrounds |
| `--white` | `#FFFFFF` | Card backgrounds, text on dark |

### Typography

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display / headings | Cormorant Garamond | 300, 400, 600 | H1–H3, hero titles, section headings |
| Body / UI | Outfit | 300, 400, 500, 600 | Body text, labels, nav, buttons |

```css
/* CSS Variables */
:root {
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'Outfit', sans-serif;
}

/* Type scale */
h1 { font-size: clamp(2.5rem, 6vw, 5rem); }
h2 { font-size: clamp(1.8rem, 4vw, 2.8rem); }
h3 { font-size: clamp(1.2rem, 2.5vw, 1.6rem); }
body { font-size: 15px; line-height: 1.8; }
```

### Icons

- **Lucide React** — all UI icons (navigation, actions, status, forms)
- **React Icons** — social media brand icons (YouTube, Facebook, Instagram, WhatsApp)
- Icon size standard: `20px` inline, `24px` standalone, `32px` feature icons
- All icons rendered as SVG — crisp at all screen sizes, no raster blur

```jsx
// Usage examples
import { MapPin, Clock, Heart, Play } from 'lucide-react';
import { FaYoutube, FaWhatsapp, FaFacebook, FaInstagram } from 'react-icons/fa';
```

### Responsive Breakpoints (Mobile First)

```css
/* Mobile first — base styles target 320px+ */
sm:  640px   /* Large phones */
md:  768px   /* Tablets */
lg:  1024px  /* Laptops */
xl:  1280px  /* Desktops */
2xl: 1536px  /* Wide screens */
```

All layouts are designed mobile-first. Stacked single-column on mobile, expanding to multi-column on tablet and desktop.

### Smooth Scrolling Implementation

```jsx
// 1. CSS level (globals.css)
html { scroll-behavior: smooth; }

// 2. React Router scroll restoration
// In App.jsx — scroll to top on every route change
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [pathname]);
  return null;
}

// 3. Section anchor scroll (react-scroll)
import { Link } from 'react-scroll';
<Link to="services" smooth={true} duration={600} offset={-64}>
  Our Services
</Link>

// 4. Framer Motion scroll-triggered reveals
import { motion } from 'framer-motion';
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
};
<motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
  {/* Content reveals as it enters viewport */}
</motion.div>
```

---

## 3. Homepage

**Route:** `/`  
**Purpose:** Digital front door. Must anchor identity for first-timers, surface live events for regulars, and direct every visitor to their next step.

### 3.1 Navigation Bar

- Fixed position, `backdrop-filter: blur(12px)` on scroll
- Logo left: HPC Global badge + "Hopepress Chapel" sub-label
- Nav links centre/right: About · Services · Sermons · Give · Connect · Find Us
- CTA button: "Plan a Visit" (gold)
- Mobile: hamburger menu → full-screen slide-in drawer with all links
- Icon: `<Menu />` (Lucide) for hamburger, `<X />` for close

**Content needed:** Final navigation labels approved by church.

---

### 3.2 Hero — Rotating Carousel

Three slides, auto-advancing every 6 seconds. Swipe-enabled on mobile. Dot navigation. Pause on hover.

#### Slide 1 — Identity (loads first, always)

| Element | Content |
|---|---|
| Eyebrow | "Welcome to HPC Global" |
| Headline | "Where Hope Meets Destiny" |
| Sub-headline | "Hopepress Chapel — Accra, Ghana" |
| Body | "An Apostolic Prophetic Word-based ministry bringing hope to the hopeless and raising Kingdom leaders." |
| CTA Primary | "I'm new here" → `/new-here` |
| CTA Secondary | "▷ Watch a sermon" → `/sermons` |
| Background | Deep purple `#210A4A` + geometric line overlay + radial gradient mesh |

#### Slide 2 — Upcoming Event

| Element | Content |
|---|---|
| Eyebrow | "Coming up at HPC Global" |
| Event graphic | Branded image (pulled from Events database) |
| Event name | Dynamic — next scheduled event |
| Date / Time | Dynamic with timezone |
| Venue | Dynamic — physical or "Online via Zoom" |
| CTA | "Register now" or "Get reminder" |
| Background | Purple mid `#5A2DAF` + event colour |

**Backend:** `GET /api/events?featured=true&upcoming=true` — returns next event.

#### Slide 3 — Latest YouTube Sermon

| Element | Content |
|---|---|
| Eyebrow | "Latest message" |
| Thumbnail | Pulled via YouTube Data API v3 |
| Sermon title | Dynamic from YouTube |
| Preacher | Dynamic (tag in video metadata) |
| Date | Upload date from YouTube |
| CTA | "Watch now" → opens YouTube video |
| Channel link | "@prophetclottey" → youtube.com/@prophetclottey |

**Backend:** `GET /api/youtube/latest` — caches YouTube API response every 30 min.

---

### 3.3 Event Ticker

Gold band, full-width, immediately below hero. Scrolling marquee of upcoming events and service reminders.

```
[ UPCOMING ]  |  🗓 Dominion Encounter — Every Sunday 9am GMT  ·  🎙 Prophetic & Miracle — Fridays 6:30pm GMT  ·  🌐 Global Prophetic Highway — Sundays 9pm GMT / 4pm EST / 10pm BST  ·  ✦ Next special event: [dynamic]
```

- Icon: `<Radio />` (Lucide) for the label
- Pulls from Events API, refreshes daily
- Tappable on mobile — opens Events page

---

### 3.4 Service Times Bar

Three columns (stacked on mobile, side-by-side on tablet+).

| Service | Day & Time | Notes |
|---|---|---|
| Dominion Encounter | Sundays · 9:00 AM – 11:30 AM GMT | Physical + YouTube Live |
| Prophetic & Miracle | Fridays · 6:30 PM – 9:00 PM GMT | Physical + YouTube Live |
| Global Prophetic Highway | Sundays · 9pm GMT / 4pm EST / 10pm BST | Zoom — Online only |

- Icon: `<Clock />` (Lucide) per service
- "Add to calendar" micro-link per service
- "Join Zoom" button on Prophetic Highway

---

### 3.5 About Snapshot

- Short paragraph: who HPC Global is
- Vision & Mission statements (2 cards, side by side)
- Stat row: weekly services, years in ministry, global reach
- CTA: "Our full story →" → `/about`

---

### 3.6 Featured Cards Grid

Eight cards in a 4×2 grid (2×2 on mobile). Each with a Lucide icon, title, and 1-line description.

| Card | Icon | Link |
|---|---|---|
| Sermons | `<Play />` | `/sermons` |
| Events | `<Calendar />` | `/events` |
| Give Online | `<Heart />` | `/give` |
| Prayer Request | `<HandHeart />` | `/prayer` |
| I'm New Here | `<UserPlus />` | `/new-here` |
| Join a Ministry | `<Users />` | `/ministries` |
| Devotionals | `<BookOpen />` | `/blog` |
| Contact Us | `<MessageCircle />` | `/contact` |

---

### 3.7 Latest Sermons Strip

- 3 most recent sermon cards (YouTube thumbnail, title, preacher, date)
- Pulled from `GET /api/youtube/latest?count=3`
- "View all sermons →" link to `/sermons`
- Each card: hover lifts with box-shadow, Framer Motion fade-up on scroll entry

---

### 3.8 Give / Partner Band

Full-width dark purple band.

- Headline: "Give to HPC Global"
- Short giving scripture (e.g. Malachi 3:10)
- Payment method pills: MTN MoMo · Telecel Cash · AirtelTigo · Bank Transfer
- CTA: "Give now →" → `/give`
- Icons: `<Smartphone />` for Mobile Money, `<Building2 />` for bank

---

### 3.9 Social & YouTube Follow

- YouTube subscribe button (@prophetclottey)
- Latest YouTube video embed (live if streaming, last video if not)
- Facebook, Instagram, WhatsApp icon links (React Icons: `FaYoutube`, `FaFacebook`, `FaInstagram`, `FaWhatsapp`)

---

### 3.10 Footer

Four-column layout (2-column on mobile, 1-column on small phones).

| Column | Content |
|---|---|
| Brand | Logo, 2-line mission summary, social icons |
| Services | Dominion Encounter, Prophetic & Miracle, Global Prophetic Highway, Live Stream |
| Ministry | About, Leadership, Ministries, Prayer |
| Connect | New Here, Cell Groups, Give Online, Find Us |

- Copyright line: "© 2025 HPC Global — Hopepress Chapel. All rights reserved."
- Privacy Policy link

---

## 4. About Us

**Route:** `/about`  
**Purpose:** Build trust and tell the story of HPC Global. This is where hearts are won.

### Sections

#### 4.1 Page Hero Banner
- Full-width purple gradient hero
- Page title: "About HPC Global"
- Breadcrumb: Home → About
- Background: congregation photo (when available) with dark overlay

#### 4.2 Who We Are — Narrative
- 3–4 paragraphs: founding story, heart of the ministry, Apostolic Prophetic identity
- Warm, accessible language — not overly formal
- Photo of the church or sanctuary alongside the text

**Content needed from church:** Founding story, year established, key moments.

#### 4.3 Vision Statement

> **THE HOPEPRESS CHAPEL IS AN APOSTOLIC PROPHETIC WORD BASED MINISTRY WHICH BRINGS HOPE TO THE HOPELESS BY THE PREACHING OF THE WORD OF HOPE AND BRING THEM TO A PLACE OF ACCEPTANCE.**

Displayed in Cormorant Garamond italic, large. Key phrase "a place of acceptance" highlighted in gold. Supporting scripture beneath.

#### 4.4 Mission Statement

> **TO ACCEPT THE REJECTED AND THE FRUSTRATED AND RAISE THEM AS KINGDOM LEADERS THROUGH THE TEACHING AND PREACHING OF THE WORD OF HOPE AND BIRTH THEM INTO THEIR ORIGINAL PLACE OF INFLUENCE.**

Displayed prominently. The three mission pillars pulled out as an icon-step flow:

```
[ Accept ] → [ Raise ] → [ Birth into Influence ]
```

Icons: `<UserCheck />` · `<TrendingUp />` · `<Star />` (Lucide)

#### 4.5 Core Values

6 values in a grid (2 cols on mobile, 3 cols on desktop). Each: icon, name, 1-sentence description.

**Suggested values (confirm with leadership):**

| Value | Icon |
|---|---|
| The Word of Hope | `<BookOpen />` |
| Prayer & Intercession | `<HandHeart />` |
| Prophetic Ministry | `<Mic />` |
| Signs & Wonders | `<Sparkles />` |
| Community & Belonging | `<Users />` |
| Kingdom Influence | `<Globe />` |

#### 4.6 Statement of Faith

Accordion-style expandable sections. Topics:
- The Holy Bible
- The Trinity (Father, Son, Holy Spirit)
- Salvation through Jesus Christ
- The Holy Spirit & Spiritual Gifts
- Water Baptism
- Divine Healing & Miracles
- The Second Coming of Christ
- Tithes & Offerings

Icon: `<ChevronDown />` (Lucide) for accordion toggle.

#### 4.7 Ministry Timeline

Vertical timeline of key milestones. Each node: year, event title, short description, photo (optional).

**Content needed from church:** Founding year, first service date, key milestones.

#### 4.8 Bottom CTA

Two buttons:
- "Plan your first visit →" → `/new-here`
- "Watch a sermon →" → `/sermons`

---

## 5. Leadership

**Route:** `/leadership`  
**Purpose:** Put faces to the ministry. People connect with people.

### 5.1 Senior Pastors — Feature Section

Two large cards (stacked on mobile, side-by-side on desktop).

#### Prophet George Clottey

| Field | Content |
|---|---|
| Photo | Professional portrait (required) |
| Title | Global Senior Pastor |
| Name | Prophet George Clottey |
| Bio | Calling, background, ministry history, focus areas |
| Signature quote | Personal scripture or quote |
| YouTube | @prophetclottey link + `FaYoutube` icon |
| Other links | Facebook, Instagram if applicable |

#### Lady Apostle Adelaide Clottey

| Field | Content |
|---|---|
| Photo | Professional portrait (required) |
| Title | Global Senior Pastor |
| Name | Lady Apostle Adelaide Clottey |
| Bio | Calling, ministry focus, teaching areas |
| Signature quote | Personal scripture or quote |

**Content needed:** Photos, full bios, personal scriptures.

### 5.2 Ministry Team Cards

Grid of team member cards (2 cols mobile, 3–4 cols desktop).

Each card:
- Photo (or avatar with initials if no photo)
- Name
- Role / title
- 2–3 sentence bio
- Contact link (WhatsApp or email)

**Content needed:** Full team list with names, roles, photos, bios.

**Suggested roles to include:**
- Worship Leader
- Youth Pastor
- Head of Women's Fellowship
- Head of Men's Fellowship
- Prayer Coordinator
- Head of Ushering & Protocol
- Children's Church Leader

### 5.3 Pastoral Contact CTA

> *"Would you like prayer or a pastoral word?"*

- Link to `/prayer` form
- WhatsApp direct link
- Icon: `<MessageCircle />` (Lucide)

---

## 6. Our Services

**Route:** `/services`  
**Purpose:** Full detail on every weekly gathering. High-traffic for first-timers — must be crystal clear.

### Per-Service Detail (×3 cards)

#### Dominion Encounter

| Field | Content |
|---|---|
| Day & Time | Sundays · 9:00 AM – 11:30 AM GMT |
| Duration | ~2.5 hours |
| Location | Klagon Junction, Behind K. Ofori Enterprise, Accra |
| What to expect | Worship, prophetic Word, altar call, prayer ministry |
| Dress code | Smart casual — come as you are |
| Children | Children's church available (confirm) |
| Live stream | YouTube @prophetclottey — link + `FaYoutube` icon |
| Add to calendar | Google / Apple / Outlook `.ics` download |

#### Prophetic & Miracle Service

| Field | Content |
|---|---|
| Day & Time | Fridays · 6:30 PM – 9:00 PM GMT |
| Duration | ~2.5 hours |
| Location | Klagon Junction, Behind K. Ofori Enterprise, Accra |
| What to expect | Healing, deliverance, prophetic declaration, miracles |
| Testimonies | Short 1–2 member testimonies (rotating) |
| Live stream | YouTube @prophetclottey |
| Add to calendar | Google / Apple / Outlook |

#### Global Prophetic Highway

| Field | Content |
|---|---|
| Day | Sundays |
| Time | 9:00 PM GMT · 4:00 PM EST · 10:00 PM BST |
| Platform | Zoom (online only) |
| What to expect | Global prayer, prophetic intercession, Word |
| How to join | Step-by-step Zoom guide (for non-tech users) |
| Zoom link | Button: "Get the Zoom link" (form or direct link) |
| WhatsApp reminder | Opt-in button |
| Add to calendar | All timezones auto-filled |

### First-Time Visitor Guide

Friendly accordion or step list:

```
When you arrive...
What we wear...
Our worship style...
During the message...
At the end of service...
For children...
```

Icon: `<HelpCircle />` (Lucide) per item.

---

## 7. Sermons & Media

**Route:** `/sermons`  
**Purpose:** The church's content library. Members return weekly; seekers binge. Extends the ministry 24/7.

### 7.1 Featured Sermon

- Large YouTube embed (most recent video from @prophetclottey)
- Sermon title, preacher, date, series name
- Pull quote from the message
- Share buttons: `FaWhatsapp` · `FaFacebook` · `<Link2 />` (copy link)

### 7.2 Live Stream Section

- YouTube embed showing **live stream when active**, or "Next live service" countdown when not
- Live indicator: pulsing red dot + "LIVE" badge when streaming
- YouTube Subscribe button
- Next service countdown timer (React countdown component)
- Icon: `<Radio />` (Lucide)

### 7.3 Sermon Library

#### Filters & Search

- Search bar: title, scripture reference, keyword
- Filter: Preacher dropdown
- Filter: Series dropdown
- Filter: Service type (Dominion Encounter / Prophetic & Miracle)
- Filter: Year / Month
- Icon: `<Filter />` (Lucide)

#### Sermon Card

- YouTube thumbnail
- Series badge (e.g. "Dominion Series")
- Sermon title (Cormorant Garamond)
- Preacher name + role
- Date preached
- Scripture reference
- Duration
- Watch button → opens YouTube video

### 7.4 Sermon Series

Grid of series groupings. Each series card:
- Cover graphic
- Series name
- Episode count
- Series description (1–2 lines)
- Click → opens playlist / series page

**Suggested series to create:**
- The Word of Hope
- Dominion Series
- Prophetic Foundations
- Kingdom Leaders

### 7.5 Podcast / Audio *(Phase 2)*

- Audio player component
- Spotify / Apple Podcasts links
- Download MP3 option

---

## 8. Events & Calendar

**Route:** `/events`  
**Purpose:** The programme board. Feeds homepage carousel and ticker. Covers upcoming, ongoing, and past events.

### 8.1 Featured Upcoming Event

Large hero card at top of page:
- Event banner graphic
- Event name (Cormorant Garamond, large)
- Date, time + all relevant timezones
- Location (or "Online — Zoom")
- Full description
- Speaker/minister name(s)
- Register / RSVP button
- Countdown timer to event
- Share: WhatsApp, Facebook

**Backend:** `GET /api/events?featured=true` — admin marks one event as featured.

### 8.2 Upcoming Events Grid

Card grid of all future events. Filter tabs: All · Conference · Special Service · Youth · Women's · Online.

Each card:
- Event image
- Category badge + icon
- Event name
- Date & time
- Venue
- 2-line description
- RSVP / Register button

**Icons per category:** `<Calendar />` · `<Mic2 />` · `<Star />` · `<Users />` · `<Globe />`

### 8.3 Monthly Calendar View

- `FullCalendar` or `react-big-calendar` component
- Colour coding:
  - Purple: regular services
  - Gold: special events
  - Blue/teal: online-only events
- Click a date → shows event details popover
- "Add to my calendar" per event (Google / Apple / Outlook)

### 8.4 Past Events Archive

Grid of completed events, reverse chronological.
- Each card links to event recap page
- Recap includes: photos, video highlights, sermon link
- "View photos →" links to Gallery album

### 8.5 Individual Event Page

**Route:** `/events/:slug`

| Section | Content |
|---|---|
| Banner | Full-width event graphic |
| Header | Title, date/time/timezone, location |
| Description | Full event details |
| Speakers | Minister profiles with photo |
| Register form | Name, email, phone, attendance type (in-person / online) |
| Countdown timer | Days, hours, minutes, seconds |
| Share | WhatsApp `<FaWhatsapp>`, Facebook `<FaFacebook>`, copy link `<Share2 />` |
| Post-event | Sermon recording link + photo gallery |

---

## 9. Give / Donate

**Route:** `/give`  
**Purpose:** The online offering plate. Simple, trustworthy, mobile-first. Mobile Money is primary.

### 9.1 Page Introduction

- Spiritual framing: short paragraph on the act of giving as worship
- Key scripture: Malachi 3:10 or 2 Corinthians 9:7
- Quote from Prophet Clottey on giving (if available)
- Icon: `<Heart />` (Lucide)

### 9.2 Giving Form

#### Quick-Select Amounts
```
[ GH₵ 20 ]  [ GH₵ 50 ]  [ GH₵ 100 ]  [ GH₵ 200 ]  [ GH₵ 500 ]  [ Custom ]
```

#### Form Fields
- Amount (GHS)
- Giving category (dropdown):
  - Tithes
  - Offering
  - First Fruits
  - Building Fund
  - Missions
  - Pastoral Support
- Payment method (radio / tab selector)
- Full name
- Phone number (for Mobile Money prompt)
- Email (optional — for receipt)

#### Payment Methods

| Method | Icon | Integration |
|---|---|---|
| MTN Mobile Money | `<Smartphone />` | Paystack MoMo API |
| Telecel Cash | `<Smartphone />` | Paystack / manual |
| AirtelTigo Money | `<Smartphone />` | Paystack / manual |
| Bank Transfer | `<Building2 />` | Account details shown on selection |
| Card *(Phase 2)* | `<CreditCard />` | Paystack card |
| PayPal / Wise *(Phase 2)* | `FaPaypal` | Diaspora givers (EST / BST audience) |

### 9.3 Giving Categories — Descriptions

Short 1-sentence explanation per category, shown when selected. Builds trust.

### 9.4 Recurring Giving *(Phase 2)*

- "Set up monthly giving" toggle
- Managed via Paystack subscription API
- Particularly useful for consistent tithers

### 9.5 Giving Confirmation

After successful payment:
- "Thank you for your generosity" page
- Transaction reference
- Optional email receipt (via Nodemailer)
- Share prompt: "Tell a friend about HPC Global"

---

## 10. Ministries

**Route:** `/ministries`  
**Purpose:** Directory of every ministry arm. Helps members find community and discover their calling.

### 10.1 Ministry Cards Grid

2 cols on mobile, 3–4 cols on desktop.

Each card:
- Ministry name
- Icon (Lucide)
- Leader name + photo
- Meeting day/time
- Short description (3–4 sentences)
- "Join this ministry" CTA → form or WhatsApp
- Contact: `<MessageCircle />` (WhatsApp link)

**Ministries to include (confirm with church):**

| Ministry | Icon |
|---|---|
| Youth Ministry | `<Zap />` |
| Women's Fellowship | `<Flower2 />` |
| Men's Fellowship | `<Shield />` |
| Children's Church | `<Star />` |
| Worship & Arts | `<Music />` |
| Intercessory Prayer | `<HandHeart />` |
| Evangelism & Outreach | `<Globe />` |
| Ushering & Protocol | `<DoorOpen />` |

### 10.2 Individual Ministry Pages *(Phase 2)*

**Route:** `/ministries/:slug`

Each ministry sub-page includes:
- Full description + vision for that arm
- Team photo
- Upcoming ministry events
- Photo gallery
- Member testimonies
- Join form

---

## 11. New Here?

**Route:** `/new-here`  
**Purpose:** The highest-value conversion page. A first-timer who lands here should leave feeling warmly welcomed and ready to attend.

### 11.1 Welcome Video / Message

- 60-second welcome video from Prophet George & Lady Apostle Adelaide Clottey
- If video not yet available: signed letter-style message with professional photos
- Warm, personal tone — "We've been waiting for you"
- Icon: `<Video />` (Lucide) as placeholder

**Content needed:** Welcome video recording or written message from pastors.

### 11.2 What to Expect

Two-column cards (stacked on mobile):

#### In-Person Visit
- Arrival: what happens at the door, welcome team
- Worship: expectant, Spirit-led
- The Word: prophetic, practical preaching
- Ministry time: altar call, prayer
- Dress: smart casual, come as you are
- Duration: ~2.5 hours
- Children: children's church details
- Getting there: directions, transport

#### Online Visit
- YouTube live stream: how to watch
- Zoom (Prophetic Highway): how to join step-by-step
- Chat participation: how to engage
- Receiving prayer online
- How to give online
- How to connect after the service

### 11.3 New Visitor Connect Card

Form fields:
- Full name *(required)*
- Phone number *(required — for WhatsApp follow-up)*
- Email *(optional)*
- Country / City *(for international members)*
- How did you find us? (dropdown: YouTube · Facebook · Friend · Google · Other)
- What are you hoping to find? *(optional free text)*
- Preferred service: Dominion Encounter · Prophetic & Miracle · Online

**On submission:**
- Automated WhatsApp welcome message via Hubtel/Arkesel
- Email confirmation (Nodemailer)
- Church welcome team notified for follow-up call within 48 hours

### 11.4 Next Steps Guide

Three-step visual flow (horizontal on desktop, vertical on mobile):

```
Step 1: Visit a service → Step 2: Connect with a ministry → Step 3: Get planted — join a cell group
```

Icons: `<Church />` · `<Users />` · `<Home />` (Lucide)

### 11.5 FAQ Accordion

Common questions:
- "Do I need to be a Christian to visit?"
- "What should I wear?"
- "Is there parking?"
- "What happens with my children?"
- "Can I watch online if I'm outside Ghana?"
- "How do I give?"

---

## 12. Prayer Requests

**Route:** `/prayer`  
**Purpose:** A ministry in itself. Submitting a prayer request is often the first act of trust a new member makes.

### 12.1 Prayer Request Form

Fields:
- Name *(optional — allow anonymous)*
- Contact *(phone / email — optional)*
- Prayer category (radio/chips):
  - Health & Healing
  - Family
  - Finance & Provision
  - Career & Business
  - Spiritual Growth
  - Relationships
  - Other
- Prayer request *(text area, 500 chars)*
- "I'd like someone to call me" *(checkbox)*
- "Keep this private" *(checkbox — not displayed publicly)*

On submit:
- Confirmation message: "Your request has been received. Our prayer team stands with you."
- Automated SMS/WhatsApp: "We've received your prayer request and are praying with you."
- Notification to prayer coordinator

### 12.2 Prayer Resources

- Daily / weekly prayer guide (PDF download)
- `<Download />` icon (Lucide)
- Scripture declarations for common needs
- Prayer points from Prophet Clottey

**Content needed:** Prayer guide PDF, declaration scriptures.

### 12.3 Testimony Wall *(Phase 2)*

- Members submit answered prayer testimonies
- Displayed publicly with permission
- Moderated before publishing
- Icon: `<Star />` (Lucide)

---

## 13. Blog / Devotionals

**Route:** `/blog`  
**Purpose:** The church's written voice. Keeps members fed through the week. Boosts SEO / Google discoverability.

### 13.1 Content Categories

| Category | Icon | Frequency |
|---|---|---|
| Daily Devotionals | `<Sun />` | Daily / weekly |
| Prophetic Words | `<Mic />` | As released |
| Sermon Notes | `<FileText />` | Weekly |
| Teaching Articles | `<BookOpen />` | Monthly |
| Testimonies | `<Star />` | As submitted |
| Event Recaps | `<Image />` | Post-event |
| Pastor's Message | `<MessageSquare />` | Monthly |

### 13.2 Blog Listing Page

- Featured post (large hero card at top)
- Filter tabs by category
- Search bar (`<Search />` Lucide icon)
- Post grid: featured image, category badge, title, excerpt, author, date, read time
- Pagination or "Load more" button

### 13.3 Individual Post Page

- Full article with typography optimised for reading
- Author bio at bottom (photo, name, role)
- Related posts (3 cards)
- Share buttons — **WhatsApp is primary** for Ghana: `FaWhatsapp` · `FaFacebook` · `<Twitter />` · copy link
- Reading progress bar (Framer Motion)
- Comment section *(Phase 2)*

---

## 14. Gallery

**Route:** `/gallery`  
**Purpose:** Visual evidence of a living, joyful community. Photos convert sceptics.

### 14.1 Photo Albums

- Albums by event: "Dominion Encounter — Nov 2025", "Prophetic Conference 2024", etc.
- Album card: cover photo, event name, date, photo count
- Click → lightbox gallery (react-image-lightbox or `yet-another-react-lightbox`)
- WhatsApp share button per album
- Download album *(Phase 2)*
- Icon: `<Images />` (Lucide)

### 14.2 Video Highlights

- Grid of short video clips: worship moments, testimonies, event highlights
- Embedded from YouTube or Cloudinary
- Thumbnail + title + duration
- Icon: `<Film />` (Lucide)

### 14.3 Submit a Photo *(Phase 2)*

- Member photo upload form
- Fields: name, event name, date, photo(s)
- Cloudinary upload via backend
- Moderated before publishing
- Icon: `<Upload />` (Lucide)

---

## 15. Contact & Location

**Route:** `/contact`  
**Purpose:** The practical page. Clear, fast, and mobile-optimised. WhatsApp is the primary contact channel.

### 15.1 Contact Details

| Channel | Detail | Icon |
|---|---|---|
| Physical address | Klagon Junction, Behind K. Ofori Enterprise, Accra, Ghana | `<MapPin />` |
| Google Maps | Embedded map at coordinates 5.6656744, -0.0471646 | `<Map />` |
| Directions | "Get directions" → opens Google Maps app | `<Navigation />` |
| WhatsApp | Direct link (primary — one tap) | `FaWhatsapp` |
| Phone | Church office number | `<Phone />` |
| Email | Church office email | `<Mail />` |
| YouTube | youtube.com/@prophetclottey | `FaYoutube` |
| Facebook | Facebook page link | `FaFacebook` |
| Instagram | Instagram link | `FaInstagram` |
| Zoom | Prophetic Highway Zoom link | `<Video />` |

**Content needed:** WhatsApp number, phone, email.

### 15.2 Google Maps Embed

```jsx
<iframe
  src="https://maps.google.com/maps?q=5.6656744,-0.0471646&z=16&output=embed"
  width="100%"
  height="350"
  title="HPC Global — Klagon Junction, Accra"
  loading="lazy"
/>
```

### 15.3 General Enquiry Form

Fields:
- Name *(required)*
- Email *(required)*
- Phone *(optional)*
- Enquiry type (dropdown): General · Pastoral · Event · Media / Press · Partnership · Other
- Message *(required)*

On submit:
- Auto-response email: "Thank you for reaching out. We'll respond within 24 hours."
- Notification to church office email (Nodemailer)

### 15.4 Service Times Summary

All three services listed with full timezone info — many users land on Contact looking for times.

---

## 16. Build Phases

### Phase 1 — Core Site *(Launch MVP)*

| Page | Priority |
|---|---|
| Homepage (full, with carousel + ticker) | 🔴 Must |
| About Us | 🔴 Must |
| Services | 🔴 Must |
| Sermons & Media | 🔴 Must |
| Give / Donate | 🔴 Must |
| New Here? | 🔴 Must |
| Contact & Location | 🔴 Must |

### Phase 2 — Full Site

| Page | Priority |
|---|---|
| Leadership | 🟡 High |
| Events & Calendar | 🟡 High |
| Prayer Requests | 🟡 High |
| Ministries | 🟡 High |
| Blog / Devotionals | 🟡 High |
| Gallery | 🟡 High |

### Phase 3 — Enhanced Features

| Feature | Priority |
|---|---|
| Admin dashboard (content management) | 🟢 Medium |
| Recurring giving (Paystack subscriptions) | 🟢 Medium |
| Podcast / audio archive | 🟢 Medium |
| Member portal (login, giving history) | 🟢 Medium |
| Individual ministry sub-pages | 🟢 Medium |
| Testimony wall | 🟢 Medium |
| Diaspora giving (PayPal / Wise) | 🟢 Medium |
| Member photo gallery submission | 🟢 Medium |

---

## Content Checklist (Items Needed from Church)

- [ ] Professional photos: Prophet George Clottey (portrait)
- [ ] Professional photos: Lady Apostle Adelaide Clottey (portrait)
- [ ] Full pastoral team list with names, roles, photos, bios
- [ ] Church founding story and key milestone dates
- [ ] Statement of Faith / Doctrinal statement
- [ ] Core values (confirm the 6 values)
- [ ] Welcome video from the senior pastors (60 seconds)
- [ ] WhatsApp number, phone number, email address
- [ ] Zoom link for Global Prophetic Highway
- [ ] Mobile Money numbers (MTN, Telecel, AirtelTigo)
- [ ] Bank account details for transfers
- [ ] Ministry arm names, leaders, meeting times
- [ ] Any existing sermon series names
- [ ] Prayer guide PDF (if available)
- [ ] Church / congregation photos
- [ ] Social media handles: Facebook, Instagram

---

*HPC Global Website Plan — Hopepress Chapel, Klagon Junction, Accra, Ghana*  
*Stack: React JS · Node JS · PostgreSQL · Paystack · YouTube Data API*
