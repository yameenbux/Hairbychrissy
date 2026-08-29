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
  // From her Instagram bio. She also runs cecescollectionofficial.com.
  website: 'https://www.cecescollectionofficial.com',
  websiteLabel: "Cece's Collection",
  tagline: 'HAIR EXTENSION SPECIALIST + STYLIST',
  strapline: 'BEAUTY. CONFIDENCE. EVERY DAY.',
  signoff: "Let's create your next hair chapter.",
  // Design and build credit, shown in the footer legal bar.
  credit: { name: 'YSB Designs', url: '' },
  location: 'LONDON BASED',
  // DRAFT — confirm what she wants shown publicly before an appointment.
  addressLines: ['Private studio', 'London', 'Exact address sent on booking'],
  // DRAFT — confirm contact details.
  email: 'hello@hairbychrissy.co.uk',
  phone: '',
  notice: 'WE DO NOT USE FACEBOOK.',
  intro:
    'Nano rings, tapes, micro, weave and invisi, fitted by hand in a private London studio. Every set is colour-matched, cut and blended to you.',
  // Her own wording and order, straight from the bio.
  methods: ['NANO RINGS', 'TAPES', 'MICRO', 'WEAVE', 'INVISI'],
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
/**
 * Services and prices — taken from her own PRICE LIST and SERVICES I OFFER
 * graphics. These are her real figures, not estimates.
 *
 * Extensions are quoted, not listed: her price list says "EXTENSIONS &
 * FITTINGS — PRICE ON REQUEST", so that service is modelled as a consultation
 * that leads to a quote, rather than a fixed-price slot.
 *
 * DURATIONS are still mine — her graphics give prices but not timings, and
 * durations decide how many appointments fit in a day. Worth her confirming.
 */
export const services = [
  {
    id: 'extensions',
    name: 'Extensions & Fittings',
    category: 'EXTENSIONS',
    duration: 30,          // the consultation; the fitting is booked once quoted
    price: 0,
    priceOnRequest: true,
    deposit: 0,
    blurb: 'Custom extensions for length, volume and the hair of your dreams. All methods. Book a consultation and I will colour match you and quote for the fitting.',
  },
  {
    id: 'removals',
    name: 'Removals',
    category: 'EXTENSIONS',
    duration: 60,
    price: 50,
    deposit: 0,
    blurb: 'Safe, gentle and professional removal to protect your natural hair and keep it healthy.',
  },
  {
    id: 'hollywood-waves',
    name: 'Hollywood Waves',
    category: 'STYLING',
    duration: 60,
    price: 30,
    deposit: 0,
    blurb: 'The signature soft, glossy wave — set and brushed out to last the night.',
  },
  {
    id: 'hollywood-waves-clipins',
    name: 'Hollywood Waves with Clip-Ins',
    category: 'STYLING',
    duration: 75,
    price: 35,
    deposit: 0,
    blurb: 'The same set, with your clip-ins fitted and blended through first.',
  },
  {
    id: 'pinned-curls',
    name: 'Pinned Curls',
    category: 'STYLING',
    duration: 60,
    price: 35,
    deposit: 0,
    blurb: 'Pinned and set for a fuller, longer-lasting curl.',
  },
  {
    id: 'hair-ups',
    name: 'Hair Ups / Any Style',
    category: 'STYLING',
    duration: 60,
    price: 35,
    deposit: 0,
    blurb: 'From everyday glam to special occasions — bring a picture and we will work to it.',
  },
  {
    id: 'dry-style',
    name: 'Dry From Wet & Style',
    category: 'STYLING',
    duration: 60,
    price: 45,
    deposit: 0,
    blurb: 'Washed, dried and finished however you want it.',
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
  { file: 'work-01.jpg', label: 'NANO RINGS', caption: 'Full head, blended balayage, cut in' },
  { file: 'work-02.jpg', label: 'INVISI', caption: 'Flat weft, root shadow, undetectable up' },
  { file: 'work-03.jpg', label: 'WEAVE', caption: 'Double weft for density' },
  { file: 'work-04.jpg', label: 'TAPES', caption: 'Fine hair, discreet placement' },
  { file: 'work-05.jpg', label: 'OMBRÉ', caption: 'Colour melt through the lengths' },
  { file: 'work-06.jpg', label: 'MAINTENANCE', caption: 'Bonds moved up and re-blended' },
];

/** The three headline services, from her SERVICES I OFFER graphic. */
export const offers = [
  {
    title: 'Hair Extensions',
    kicker: 'All methods',
    text: 'Custom extensions for length, volume and the hair of your dreams. All methods.',
  },
  {
    title: 'Hair Extension Removals',
    kicker: 'Safe and gentle',
    text: 'Safe, gentle and professional removal to protect your natural hair and keep it healthy.',
  },
  {
    title: 'Hair Styling',
    kicker: 'Everyday to occasion',
    text: 'From everyday glam to special occasions — styled to make you feel your best.',
  },
];

export const faqs = [
  {
    q: 'HOW OFTEN DO I NEED MAINTENANCE?',
    a: 'Every 6 to 8 weeks. Your own hair grows, so the bonds need moving back up — that is what keeps a set sitting seamlessly and stops it looking like it is growing out.',
  },
  {
    q: 'WHY DOES MAINTENANCE MATTER SO MUCH?',
    a: 'Left too long, extensions start pulling on the hair they are attached to. Moving them up on time takes that tension off, protects against breakage and keeps your own hair growing healthily underneath.',
  },
  {
    q: 'WHAT IF I LEAVE IT LONGER THAN 8 WEEKS?',
    a: 'It becomes more work to put right, and the results do not last as well. Staying on top of your appointments genuinely means less time in the chair and longer-lasting hair.',
  },
  {
    q: 'HOW LONG DOES A SET LAST?',
    a: 'With maintenance on schedule, good quality hair lasts nine to twelve months. The hair is reusable — it is the fitting that gets moved up as your own hair grows.',
  },
  {
    q: 'IS THE HAIR INCLUDED IN THE PRICE?',
    a: 'Prices shown are for fitting. Hair is quoted separately at your consultation, once we know the length, weight and colour you need.',
  },
  {
    q: 'WILL IT DAMAGE MY HAIR?',
    a: 'Fitted correctly and maintained on time, no. Every method offered here is heat-free and glue-free against your own hair.',
  },
  {
    q: 'DO I NEED A CONSULTATION FIRST?',
    a: 'For a first set, yes — it is free and takes thirty minutes. It lets us colour match properly and order the right hair in advance.',
  },
  {
    q: 'WHAT IF I NEED TO CANCEL?',
    a: 'Give at least 48 hours notice and your deposit moves to your new date. Inside 48 hours the deposit is retained.',
  },
];
