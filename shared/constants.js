// Shared constants used by both client and server

const GIVING_CATEGORIES = [
  { value: 'TITHE',         label: 'Tithes',            description: 'The first tenth of your income, returned to God as an act of worship.' },
  { value: 'OFFERING',      label: 'Offering',           description: 'A freewill gift to support the work of the ministry.' },
  { value: 'FIRST_FRUITS',  label: 'First Fruits',       description: 'Honouring God with the first and best of what He has blessed you with.' },
  { value: 'BUILDING_FUND', label: 'Building Fund',      description: 'Contributing to the expansion of our physical home.' },
  { value: 'MISSIONS',      label: 'Missions',           description: 'Supporting the spread of the Gospel to unreached communities.' },
  { value: 'PASTORAL',      label: 'Pastoral Support',   description: 'Blessing and honouring the ministry of our pastors.' },
  { value: 'OTHER',         label: 'Other',              description: 'Any other specific gift or pledge.' },
];

const PAYMENT_METHODS = [
  { value: 'MTN_MOMO',       label: 'MTN Mobile Money',  icon: 'Smartphone' },
  { value: 'TELECEL',        label: 'Telecel Cash',       icon: 'Smartphone' },
  { value: 'AIRTELTIGO',     label: 'AirtelTigo Money',  icon: 'Smartphone' },
  { value: 'BANK_TRANSFER',  label: 'Bank Transfer',      icon: 'Building2'  },
  { value: 'CARD',           label: 'Debit/Credit Card',  icon: 'CreditCard' },
];

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

const EVENT_CATEGORIES = [
  { value: 'SERVICE',    label: 'Service',         color: 'purple' },
  { value: 'CONFERENCE', label: 'Conference',      color: 'gold'   },
  { value: 'YOUTH',      label: 'Youth',           color: 'blue'   },
  { value: 'WOMENS',     label: "Women's",         color: 'pink'   },
  { value: 'MENS',       label: "Men's",           color: 'teal'   },
  { value: 'ONLINE',     label: 'Online',          color: 'green'  },
  { value: 'OTHER',      label: 'Other',           color: 'gray'   },
];

const BLOG_CATEGORIES = [
  { value: 'DEVOTIONAL',    label: 'Devotional',     icon: 'Sun'          },
  { value: 'PROPHETIC_WORD',label: 'Prophetic Word', icon: 'Mic'          },
  { value: 'SERMON_NOTES',  label: 'Sermon Notes',   icon: 'FileText'     },
  { value: 'TEACHING',      label: 'Teaching',       icon: 'BookOpen'     },
  { value: 'TESTIMONY',     label: 'Testimony',      icon: 'Star'         },
  { value: 'EVENT_RECAP',   label: 'Event Recap',    icon: 'Image'        },
  { value: 'ANNOUNCEMENT',  label: 'Announcement',   icon: 'MessageSquare'},
];

const PRAYER_CATEGORIES = [
  { value: 'HEALTH',        label: 'Health & Healing'      },
  { value: 'FAMILY',        label: 'Family'                },
  { value: 'FINANCE',       label: 'Finance & Provision'   },
  { value: 'CAREER',        label: 'Career & Business'     },
  { value: 'SPIRITUAL',     label: 'Spiritual Growth'      },
  { value: 'RELATIONSHIPS', label: 'Relationships'         },
  { value: 'OTHER',         label: 'Other'                 },
];

const VISITOR_SOURCES = [
  'YouTube', 'Facebook', 'Instagram', 'Friend', 'Google', 'Other',
];

const ADMIN_ROLES = [
  { value: 'SUPER_ADMIN',    label: 'Super Admin'     },
  { value: 'CONTENT_EDITOR', label: 'Content Editor'  },
  { value: 'MEDIA_MANAGER',  label: 'Media Manager'   },
];

const CHURCH = {
  name:    'HPC Global',
  full:    'Hopepress Chapel',
  tagline: 'Where Hope Meets Destiny',
  address: 'Klagon Junction, Behind K. Ofori Enterprise, Accra, Ghana',
  lat:     5.6656744,
  lng:     -0.0471646,
  youtube: '@prophetclottey',
};

module.exports = {
  GIVING_CATEGORIES,
  PAYMENT_METHODS,
  QUICK_AMOUNTS,
  EVENT_CATEGORIES,
  BLOG_CATEGORIES,
  PRAYER_CATEGORIES,
  VISITOR_SOURCES,
  ADMIN_ROLES,
  CHURCH,
};
