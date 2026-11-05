/**
 * System-wide seed data.
 *
 * `DEFAULT_CATEGORIES` are created once with `isDefault: true` and no owner, so
 * every student sees them. Admins can add/edit/remove them from the control panel.
 *
 * `KEYWORD_MAP` is the cold-start vocabulary for the categorisation assistant.
 * It only matters until a student has corrected a few entries; after that the
 * per-user hints learned in `models/CategoryHint` carry most of the weight.
 */

const DEFAULT_CATEGORIES = [
  // --- income ---
  { name: 'Allowance', type: 'income', icon: 'wallet', color: '#3fbf8f' },
  { name: 'Part-time Job', type: 'income', icon: 'briefcase', color: '#2f9ed8' },
  { name: 'Scholarship', type: 'income', icon: 'award', color: '#7b6ef6' },
  { name: 'Gift', type: 'income', icon: 'gift', color: '#e4679b' },
  { name: 'Other Income', type: 'income', icon: 'coins', color: '#8a94a6' },

  // --- expense ---
  { name: 'Food', type: 'expense', icon: 'bowl', color: '#f0803c' },
  { name: 'Transport', type: 'expense', icon: 'bus', color: '#2f9ed8' },
  { name: 'Hostel/Rent', type: 'expense', icon: 'home', color: '#7b6ef6' },
  { name: 'Academics', type: 'expense', icon: 'book', color: '#3fbf8f' },
  { name: 'Subscriptions', type: 'expense', icon: 'repeat', color: '#e4679b' },
  { name: 'Entertainment', type: 'expense', icon: 'ticket', color: '#f2b705' },
  { name: 'Miscellaneous', type: 'expense', icon: 'dots', color: '#8a94a6' }
];

const KEYWORD_MAP = {
  Food: [
    'cafe', 'canteen', 'mess', 'restaurant', 'lunch', 'dinner', 'breakfast', 'snack',
    'pizza', 'burger', 'biryani', 'chai', 'tea', 'coffee', 'juice', 'grocery',
    'swiggy', 'zomato', 'foodpanda', 'kfc', 'mcdonald', 'dhaba', 'bakery', 'samosa'
  ],
  Transport: [
    'bus', 'metro', 'train', 'rickshaw', 'auto', 'taxi', 'uber', 'ola', 'careem',
    'fuel', 'petrol', 'diesel', 'fare', 'ticket', 'cab', 'bike', 'parking', 'toll'
  ],
  'Hostel/Rent': [
    'hostel', 'rent', 'room', 'mess bill', 'landlord', 'deposit', 'electricity',
    'water bill', 'gas bill', 'maintenance', 'utility', 'wifi', 'internet'
  ],
  Academics: [
    'book', 'books', 'textbook', 'notebook', 'stationery', 'pen', 'printout',
    'photocopy', 'tuition', 'fee', 'fees', 'course', 'exam', 'lab', 'library',
    'semester', 'admission', 'registration', 'assignment'
  ],
  Subscriptions: [
    'netflix', 'spotify', 'youtube', 'prime', 'subscription', 'plan', 'recharge',
    'mobile bill', 'data pack', 'icloud', 'github', 'canva', 'adobe', 'gym membership'
  ],
  Entertainment: [
    'movie', 'cinema', 'concert', 'game', 'gaming', 'outing', 'party', 'trip',
    'picnic', 'bowling', 'arcade', 'festival', 'event', 'club'
  ],
  Miscellaneous: [
    'gift', 'donation', 'repair', 'laundry', 'salon', 'haircut', 'medicine',
    'pharmacy', 'clothes', 'shopping', 'misc'
  ],
  Allowance: ['allowance', 'pocket money', 'from home', 'monthly money', 'parents'],
  'Part-time Job': ['salary', 'wage', 'freelance', 'gig', 'stipend', 'internship', 'tutoring', 'part time'],
  Scholarship: ['scholarship', 'grant', 'bursary', 'merit award', 'financial aid'],
  Gift: ['gift', 'eidi', 'birthday money', 'present', 'cash gift'],
  'Other Income': ['refund', 'cashback', 'sold', 'resale', 'prize', 'reward']
};

/** Starter tip templates an admin can edit from the control panel. */
const TIP_TEMPLATES = [
  {
    title: 'Set a weekly food cap',
    body: 'Pick one number you can spend on food each week and log every purchase the same day. Students who do this usually cut food spending by a fifth in the first month.'
  },
  {
    title: 'Review subscriptions every semester',
    body: 'List every recurring charge at the start of a semester and cancel the ones you did not open in the last 30 days.'
  },
  {
    title: 'Pay yourself first',
    body: 'The day your allowance arrives, move your savings goal amount out of your spending balance and budget with what is left.'
  }
];

module.exports = { DEFAULT_CATEGORIES, KEYWORD_MAP, TIP_TEMPLATES };
