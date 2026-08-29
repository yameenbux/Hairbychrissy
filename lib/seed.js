/**
 * Seed data for H A I R • B Y • C H R I S S Y.
 *
 * Everything in this file is editable — services and opening hours are also
 * editable live from the admin dashboard once the app has run once.
 *
 * NOTE FOR THE CLIENT: items marked DRAFT need Chrissy to confirm the real
 * values (prices, durations, review text). See CLIENT-NOTES.md.
 */

export const brand = {
  name: 'HAIR BY CHRISSY',
  handle: '@hairbychrissy_x',
  instagram: 'https://www.instagram.com/hairbychrissy_x',
  tagline: 'HAIR EXTENSION SPECIALIST',
  location: 'LONDON, UK',
  // DRAFT — confirm the studio address Chrissy wants shown publicly.
  addressLines: ['Private studio', 'London', 'Exact address sent on booking'],
  // DRAFT — confirm contact details.
  email: 'hello@hairbychrissy.co.uk',
  phone: '',
  notice: 'WE DO NOT USE FACEBOOK.',
  intro:
    'Nano rings, micro rings, tapes, weaves and invisi-wefts, fitted by hand in a private London studio. Every set is colour-matched, cut and blended to you.',
  methods: ['NANO RINGS', 'MICRO RINGS', 'TAPES', 'LA WEAVE', 'INVISI-WEFT'],
};

/**
 * Booking rules.
 * slotInterval  — how finely start times are offered, in minutes.
 * leadTimeHours — how far ahead of "now" the first bookable slot sits.
 * horizonDays   — how far into the future clients may book.
 * bufferMins    — clean-down gap enforced between two appointments.
 */
export const rules = {
  timezone: 'Europe/London',
  slotInterval: 30,
  leadTimeHours: 12,
  horizonDays: 90,
  bufferMins: 15,
  cancellationHours: 48,
};

/** 0 = Sunday … 6 = Saturday. DRAFT — Chrissy sets these herself in the admin. */
export const workingHours = {
  0: { open: false, start: '10:00', end: '16:00', breakStart: '', breakEnd: '' },
  1: { open: false, start: '09:00', end: '18:00', breakStart: '', breakEnd: '' },
  2: { open: true, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '13:45' },
  3: { open: true, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '13:45' },
  4: { open: true, start: '09:00', end: '20:00', breakStart: '13:00', breakEnd: '13:45' },
  5: { open: true, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '13:45' },
  6: { open: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
};

/**
 * Services. DRAFT prices and durations — all confirmable in the admin dashboard.
 * price and deposit are in pounds. duration is in minutes.
 */
export const services = [
  {
    id: 'consultation',
    name: 'Consultation & Colour Match',
    category: 'CONSULTATION',
    duration: 30,
    price: 0,
    deposit: 0,
    blurb: 'Free 30-minute sit-down. We look at your hair, match your colour and plan the right method for you.',
  },
  {
    id: 'nano-full',
    name: 'Nano Rings — Full Head',
    category: 'EXTENSIONS',
    duration: 240,
    price: 550,
    deposit: 100,
    blurb: 'The lightest, most discreet fit. No heat, no glue, fully reusable hair.',
  },
  {
    id: 'nano-half',
    name: 'Nano Rings — Half Head',
    category: 'EXTENSIONS',
    duration: 180,
    price: 360,
    deposit: 75,
    blurb: 'Added length and thickness through the mid-section without a full set.',
  },
  {
    id: 'micro-full',
    name: 'Micro Rings — Full Head',
    category: 'EXTENSIONS',
    duration: 240,
    price: 500,
    deposit: 100,
    blurb: 'A slightly larger bead than nano — strong, secure and long-wearing.',
  },
  {
    id: 'tape-full',
    name: 'Tape-In Extensions — Full Head',
    category: 'EXTENSIONS',
    duration: 120,
    price: 320,
    deposit: 75,
    blurb: 'Fast to fit and completely flat to the head. Ideal for finer hair.',
  },
  {
    id: 'la-weave',
    name: 'LA Weave — Full Head',
    category: 'EXTENSIONS',
    duration: 180,
    price: 340,
    deposit: 75,
    blurb: 'Wefts sewn onto a micro-ring track. Big volume, no glue on the hair.',
  },
  {
    id: 'invisi-weft',
    name: 'Invisi-Weft — Full Head',
    category: 'EXTENSIONS',
    duration: 210,
    price: 620,
    deposit: 125,
    blurb: 'The flattest weft on the market. Genuinely undetectable in a ponytail.',
  },
  {
    id: 'maintenance',
    name: 'Maintenance / Refit',
    category: 'MAINTENANCE',
    duration: 150,
    price: 190,
    deposit: 50,
    blurb: 'Every 8–10 weeks. Hair taken down, washed, re-tinted if needed and refitted.',
  },
  {
    id: 'removal',
    name: 'Extension Removal',
    category: 'MAINTENANCE',
    duration: 60,
    price: 60,
    deposit: 20,
    blurb: 'Careful, damage-free take-down with a treatment finish.',
  },
  {
    id: 'cut-blowdry',
    name: 'Cut & Blow Dry',
    category: 'STYLING',
    duration: 75,
    price: 55,
    deposit: 15,
    blurb: 'Restyle, blend or a straight tidy-up — on your own hair or your extensions.',
  },
];

/**
 * DRAFT reviews — placeholder copy in the client's voice.
 * REPLACE with real testimonials pulled from Chrissy's Instagram comments/DMs
 * (with each client's permission) before this goes live.
 */
export const reviews = [
  { name: 'Sophie R.', service: 'Nano Rings — Full Head', text: 'Third set with Chrissy and I still get asked whose hair it is. The colour match is unreal.', rating: 5 },
  { name: 'Amira K.', service: 'Invisi-Weft', text: 'Completely flat, completely invisible. I can wear my hair up again without a second thought.', rating: 5 },
  { name: 'Leah M.', service: 'Maintenance / Refit', text: 'Been going every ten weeks for over a year. My own hair underneath is in better condition than when I started.', rating: 5 },
  { name: 'Danielle P.', service: 'LA Weave', text: 'Booked a consultation first and I am glad I did. She talked me out of the length I wanted and she was right.', rating: 5 },
  { name: 'Nicole T.', service: 'Tape-In Extensions', text: 'Two hours, in and out, and it looks like I have twice the hair. Studio is lovely and calm too.', rating: 5 },
  { name: 'Georgia W.', service: 'Nano Rings — Half Head', text: 'Fine hair and I was nervous about damage. Six months in, zero breakage.', rating: 5 },
];

/**
 * Gallery slots. Drop matching .jpg files into public/images/ and they appear.
 * Missing files fall back to a styled placeholder panel — nothing breaks.
 * REPLACE with Chrissy's own Instagram photography.
 */
export const gallery = [
  { file: 'work-01.jpg', label: 'NANO RINGS', caption: 'Full head, 20 inch, blended balayage' },
  { file: 'work-02.jpg', label: 'INVISI-WEFT', caption: 'Flat weft, root shadow, cut in' },
  { file: 'work-03.jpg', label: 'LA WEAVE', caption: 'Double weft for density' },
  { file: 'work-04.jpg', label: 'TAPES', caption: 'Fine hair, discreet placement' },
  { file: 'work-05.jpg', label: 'MAINTENANCE', caption: 'Ten-week refit and re-tint' },
  { file: 'work-06.jpg', label: 'MICRO RINGS', caption: 'Full head, 22 inch' },
];

export const faqs = [
  { q: 'HOW LONG DOES A SET LAST?', a: 'With maintenance every eight to ten weeks, good quality hair lasts nine to twelve months. The fitting itself needs moving up as your own hair grows.' },
  { q: 'IS THE HAIR INCLUDED IN THE PRICE?', a: 'Prices shown are for fitting. Hair is quoted separately at your consultation once we know the length, weight and colour you need.' },
  { q: 'WILL IT DAMAGE MY HAIR?', a: 'Fitted correctly and maintained on time, no. Every method offered here is heat-free and glue-free against your own hair.' },
  { q: 'DO I NEED A CONSULTATION FIRST?', a: 'For a first set, yes — it is free and takes thirty minutes. It lets us colour match properly and order the right hair in advance.' },
  { q: 'WHAT IF I NEED TO CANCEL?', a: 'Give at least 48 hours notice and your deposit moves to your new date. Inside 48 hours the deposit is retained.' },
];
