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
  /*
   * Design and build credit, shown in the footer legal bar. The renderer emits
   * a plain-text credit when url is empty and a link when it is not, so this
   * one value is the whole switch — no markup change was needed to turn it on.
   */
  credit: { name: 'YSB Designs', url: 'https://ysbdesigns.uk' },
  location: 'BERMONDSEY · LONDON',
  // DRAFT — confirm what she wants shown publicly before an appointment.
  addressLines: ['Private studio', 'Bermondsey, London', 'Exact address sent on booking'],
  /*
   * Blank until she gives a real one. This was hello@hairbychrissy.co.uk —
   * an address I invented, published on the page as a mailto link and
   * therefore a contact route for her business that bounces. An address that
   * does not work is worse than no address: the footer still carries her
   * Instagram and her Cece's Collection site, both of which reach her.
   */
  email: '',
  phone: '',
  notice: 'WE DO NOT USE FACEBOOK.',
  intro:
    'Nano rings, tapes, micro, weave and invisi, fitted by hand in a private London studio. Every set is colour-matched, cut and blended to you.',
  // Her own wording and order, straight from the bio. The same five carry a
  // descriptor each in `methods` below, which is what actually renders.
  methods: ['NANO RINGS', 'TAPES', 'MICRO', 'WEAVE', 'INVISI'],

  /*
   * From the sample site she built herself.
   *
   * `area` IS NOW PUBLIC, confirmed by Chrissy. It reads through `location`
   * and the footer's studio lines; the exact address still goes out only on
   * booking, which is the part that actually matters for somebody working
   * alone from a private studio. A borough is not an address.
   */
  area: 'Bermondsey',
  since: 2018,
  welcome:
    "Beautiful hair is more than a service — it's a feeling. Every strand is placed with care, every transformation crafted to make you feel like the most radiant version of yourself.",
  about:
    'I specialise in luxury hair extensions and styling tailored to you. From subtle volume to head-turning length, every appointment is a private, personal experience.',
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

  /*
   * Deposit, as a percentage rather than seven typed amounts.
   *
   * Chrissy asked for 20%. Storing that once and deriving each service's
   * figure means a price change cannot leave a deposit behind pointing at the
   * old one — which is exactly how a client ends up paying £10 towards a £30
   * service that is now £45.
   *
   * The booking flow already speaks in resolved pounds (`service.deposit`,
   * depositDue, balanceDue, the Stripe partial charge, the wording in both
   * emails). All of that was built and has only ever been switched off by a
   * deposit of 0, so this turns existing machinery on rather than adding any.
   */
  depositPercent: 20,
};

/** Her deposit rule applied to a price. Rounded to the pound. */
const depositFor = (price) => Math.round((price * rules.depositPercent) / 100);

/** 0 = Sunday … 6 = Saturday. DRAFT — Chrissy sets these herself in the admin. */
/**
 * Her week. Seven days, confirmed rather than guessed this time.
 *
 *   Monday to Friday   10:00 - 19:00
 *   Saturday           09:00 - 12:00
 *   Sunday             11:00 - 15:00
 *
 * Keys are JavaScript weekdays: 0 is Sunday.
 *
 * No breaks are set. The previous draft put a 13:00 lunch on the weekdays,
 * which was invented — inventing an unavailable hour in the middle of her
 * busiest days costs her real bookings. If she wants one she can set it in the
 * dashboard, where it takes effect immediately.
 *
 * This is the seed, which is to say the starting point for a fresh install.
 * Once the app has run, her own hours live in the database and the dashboard
 * is the place to change them.
 */
export const workingHours = {
  0: { open: true, start: '11:00', end: '15:00', breakStart: '', breakEnd: '' },
  1: { open: true, start: '10:00', end: '19:00', breakStart: '', breakEnd: '' },
  2: { open: true, start: '10:00', end: '19:00', breakStart: '', breakEnd: '' },
  3: { open: true, start: '10:00', end: '19:00', breakStart: '', breakEnd: '' },
  4: { open: true, start: '10:00', end: '19:00', breakStart: '', breakEnd: '' },
  5: { open: true, start: '10:00', end: '19:00', breakStart: '', breakEnd: '' },
  6: { open: true, start: '09:00', end: '12:00', breakStart: '', breakEnd: '' },
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
    deposit: 0,   // quoted at the consultation — no price to take a share of
    /*
     * The one card raised above the rest. The original component called this
     * "Most Popular" — a claim about how often a thing sells, which nobody
     * here has the numbers for. This says what the site already says about
     * itself in the hero: extensions are her speciality. Set it on a different
     * service, or delete it, and the flag follows.
     */
    highlight: 'Her speciality',
    blurb: 'Custom extensions for length, volume and the hair of your dreams. All methods. Book a consultation and I will colour match you and quote for the fitting.',
  },
  {
    id: 'removals',
    name: 'Removals',
    category: 'EXTENSIONS',
    duration: 60,
    price: 50,
    deposit: depositFor(50),
    blurb: 'Safe, gentle and professional removal to protect your natural hair and keep it healthy.',
  },
  {
    id: 'hollywood-waves',
    name: 'Hollywood Waves',
    category: 'STYLING',
    duration: 60,
    price: 30,
    deposit: depositFor(30),
    blurb: 'The signature soft, glossy wave — set and brushed out to last the night.',
  },
  {
    id: 'hollywood-waves-clipins',
    name: 'Hollywood Waves with Clip-Ins',
    category: 'STYLING',
    duration: 75,
    price: 35,
    deposit: depositFor(35),
    blurb: 'The same set, with your clip-ins fitted and blended through first.',
  },
  {
    id: 'pinned-curls',
    name: 'Pinned Curls',
    category: 'STYLING',
    duration: 60,
    price: 35,
    deposit: depositFor(35),
    blurb: 'Pinned and set for a fuller, longer-lasting curl.',
  },
  {
    id: 'hair-ups',
    name: 'Hair Ups / Any Style',
    category: 'STYLING',
    duration: 60,
    price: 35,
    deposit: depositFor(35),
    blurb: 'From everyday glam to special occasions — bring a picture and we will work to it.',
  },
  {
    id: 'dry-style',
    name: 'Dry From Wet & Style',
    category: 'STYLING',
    duration: 60,
    price: 45,
    deposit: depositFor(45),
    blurb: 'Washed, dried and finished however you want it.',
  },
];

/**
 * Client reviews. EMPTY ON PURPOSE.
 *
 * Six sat here until now, and every one of them was written by me — invented
 * names, invented words, one of them putting an opinion in Chrissy's mouth
 * about talking a client out of the length she wanted. They were scaffolding
 * so the page was not empty during the build, and scaffolding that reads as
 * testimony has no business on a live site: the first person to spot it would
 * be her, and the second would be a client she never had.
 *
 * The section removes itself while this is empty, so the page reads as
 * finished rather than unfinished.
 *
 * To fill it, add entries in this shape — real words, with the client's
 * permission, first name and initial only:
 *
 *   { name: 'Sophie R.', service: 'Nano rings', text: '…', rating: 5 }
 */
export const reviews = [];

/**
 * Gallery slots. Drop matching .jpg files into public/images/ and they appear.
 * Missing files fall back to a styled placeholder panel — nothing breaks.
 * REPLACE with Chrissy's own Instagram photography.
 */
/**
 * Her work. Files live in public/images/ and are only rendered when the photo
 * manifest says they exist, so a missing one degrades rather than 404s.
 */
export const gallery = [
  /*
   * Leads the strip deliberately. The carousel opens on index 0, and this is
   * the only photograph in the set taken from the front — every other one is
   * the back of a head, which is how the work is usually shot but makes for a
   * strip that opens on the least distinctive frame it has.
   *
   * The caption describes the frame and nothing more. Worth Chrissy replacing
   * it with what she actually did.
   */
  { file: 'work-waves-profile.jpg', label: 'Hollywood waves', caption: 'Warm brunette, wave set from the cheekbone down' },
  { file: 'work-blonde.jpg', label: 'Hollywood waves', caption: 'Platinum, waist length, waved and brushed out' },
  { file: 'work-braid.jpg', label: 'Hair up', caption: 'Pulled-through braid, softened at the front' },
  { file: 'work-brunette.jpg', label: 'Hollywood waves', caption: 'Deep brunette, glass-finish wave' },
  /*
   * Seven photos of her work that were sitting in public/images/ unreferenced
   * by any page. The portfolio is the place for them, and the strip needs more
   * than three to read as a strip.
   *
   * LABELS COME FROM THE FILENAMES — they are her service names, which is how
   * these were catalogued, not a description of what is in each frame. They
   * carry no caption for that reason: better a bare label than a confident
   * sentence about hair nobody here has confirmed. Worth Chrissy checking
   * them, service-pinned-curls.jpg especially, which reads as waves.
   */
  { file: 'service-extensions.jpg', label: 'Extensions & fittings', caption: '' },
  { file: 'service-hollywood-waves-clipins.jpg', label: 'Hollywood waves with clip-ins', caption: '' },
  { file: 'service-hair-ups.jpg', label: 'Hair ups', caption: '' },
  { file: 'service-dry-style.jpg', label: 'Dry from wet & style', caption: '' },
  { file: 'service-removals.jpg', label: 'Removals', caption: '' },
];

/*
 * TWO CARDS CAME OUT OF THE STRIP ABOVE, both because the same photograph was
 * in it twice:
 *
 *   - service-hollywood-waves.jpg is a tighter crop of work-brunette.jpg. Same
 *     client, same striped knit, same wave, same shadow on the wall.
 *   - service-pinned-curls.jpg is the blonde in the black top, which is also
 *     service-hollywood-waves-clipins.jpg — and it is not pinned curls at all.
 *     It is waves. That mislabel is still live on the SERVICES section, which
 *     builds its photo path from the service id, and it needs a real pinned
 *     curls photo rather than a guess from me.
 *
 * Both files stay on disk: they are the services section's photos and that is
 * a different job. What they were doing here was making a ten-card loop show
 * you the same head twice in four swipes.
 */

/**
 * Before and after pairs, and her reels. Both are drawn from her own footage,
 * so a caption she wrote herself carries where there is one.
 */
export const transformations = [
  { before: 'before.jpg', after: 'after.jpg', caption: 'One fitting, colour matched and cut in' },
  { before: 'ba2-before.jpg', after: 'ba2-after.jpg', caption: 'Probably needed a hug. Got hair extensions instead.' },
  { before: 'ba3-before.jpg', after: 'ba3-after.jpg', caption: 'Platinum, rebuilt through the ends' },
];

export const reels = [
  { mp4: 'reel-1.mp4', webm: 'reel-1.webm', poster: 'reel-1-poster.jpg', caption: 'Probably needed a hug. Got hair extensions instead.' },
  { mp4: 'reel-2.mp4', webm: 'reel-2.webm', poster: 'reel-2-poster.jpg', caption: 'Platinum, start to finish' },
];

/**
 * From her "4 Benefits of Hair Extensions" graphic, in her words.
 *
 * Two edits, both flagged in CLIENT-NOTES for her to overrule:
 *   - "go from from short to long" — a duplicated word, corrected.
 *   - Her heading read "Protection FROM natural hair", which says the opposite
 *     of her own body copy. Changed to "for your natural hair".
 * Exclamation marks are dropped to match the voice of the rest of the site.
 */
export const benefits = [
  {
    title: 'Instant volume and length',
    text: 'Perfect for those wanting to go from short to long, or just to boost the thickness of their natural length.',
  },
  {
    title: 'Low maintenance',
    text: 'Good quality hair holds a style for a long time, which means gorgeous bouncy hair all day.',
  },
  {
    title: 'Protection for your natural hair',
    text: 'Extensions cut down the time you spend styling, and take direct heat off your own hair.',
  },
  {
    title: 'Confidence boost',
    text: 'Extensions tailored to your hair goals are the ultimate confidence boost, from the moment you wake up.',
  },
];

/**
 * From her "Hair Extension Maintenance Essentials" graphic, in her words.
 *
 * Set as text rather than shipped as the poster it came from. The poster was
 * a 3:4 image of small type: unreadable on a phone without pinching, invisible
 * to search, unreadable to a screen reader, and untranslatable. The words are
 * the valuable part, and this is the same treatment her 4 Benefits graphic got.
 *
 * Only the punctuation is touched — "&" spelled out, exclamation marks dropped
 * to match the voice of the rest of the site. The mark on each row names the
 * shape drawn beside it, echoing the icons she used.
 */
export const maintenance = {
  intro: 'Regular maintenance is the key to beautiful, long-lasting extensions. Here is what you need to know.',
  points: [
    {
      mark: 'calendar',
      title: 'Book every 6–8 weeks',
      text: 'Regular maintenance helps move up the bonds and keeps your extensions looking seamless.',
    },
    {
      mark: 'head',
      title: 'Prevents tension and damage',
      text: 'Moving up the extensions prevents unnecessary tension on your natural hair and reduces breakage.',
    },
    {
      mark: 'sparkle',
      title: 'Keeps hair looking flawless',
      text: 'Maintenance blends your extensions perfectly with your natural hair as it grows.',
    },
    {
      mark: 'clock',
      title: 'Stay on top of your appointments',
      text: 'Consistent care means less work over time and longer-lasting results.',
    },
    {
      mark: 'heart',
      title: 'Supports healthy hair growth',
      text: 'Proper maintenance helps your natural hair stay healthy, strong and able to grow.',
    },
  ],
};

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

/**
 * Aftercare — her own words, imported from the sample site she built herself.
 *
 * ALL EIGHT ITEMS ARE VERBATIM. Only the punctuation convention of the rest of
 * this file is applied. This is clinical advice about her own craft: she wrote
 * it, she is accountable for it, and paraphrasing it to fit a layout would be
 * me editing guidance I am not qualified to edit.
 *
 * Her sample paired this copy with stock photography of a salon that is not
 * hers. The words came across; the pictures did not.
 */
export const aftercare = {
  intro:
    'Your extensions are an investment in feeling your best. With a considered routine and regular professional care, you can preserve their softness, movement and immaculate finish between appointments.',
  note: 'Every head of hair is different. Your personalised aftercare recommendations will be discussed in detail at your appointment.',
  steps: [
    {
      title: 'Begin with a considered cleanse',
      text: 'After fitting, allow 24–48 hours before washing — particularly with bonded methods — so the connections can fully cure. When you do wash, cleanse twice using extension-friendly, sulphate-free products: the first wash lifts surface build-up, while the second ensures the scalp and connections are thoroughly clean. Always work in gentle downward motions from the scalp; never wash in circular motions, which can encourage tangling. Keep conditioner and nourishing treatments to the mid-lengths and ends, away from bonds and tapes.',
    },
    {
      title: 'Brush and position with care',
      text: 'Use a specialist extension brush and work upwards from the ends, supporting the root with your free hand. Take your time and never pull through tangles, particularly when the hair is wet. Check the connections regularly and make sure they remain correctly positioned; never allow them to flip or sit upside down, as this can create unnecessary tension and tangling.',
    },
    {
      title: 'Dry thoroughly',
      text: 'Pat gently with a soft towel, then dry the roots and attachment points fully on a warm, comfortable setting. Leaving the hair damp for long periods can encourage tangling and strain. Once dry, gently check that each connection is sitting neatly and comfortably in its intended direction.',
    },
    {
      title: 'Protect your finish',
      text: 'Apply heat protection before styling and keep heated tools away from the attachment points. Avoid tight hairstyles, including slick-back ponytails and high, tension-heavy styles, as prolonged pulling can place stress on the connections and natural hair. For swimming or holidays, tie the hair in a braid, rinse promptly afterwards and replenish with a light treatment.',
    },
    {
      title: 'Rest beautifully',
      text: 'Never sleep with wet extensions. Once completely dry, braid the hair or tie it low and secure it with a silk scrunchie. A silk or satin pillowcase helps reduce friction overnight. Treat the hair gently when dressing and undressing so the connections are never caught or pulled.',
    },
    {
      title: 'Keep your appointments',
      text: 'Regular professional maintenance protects both your extensions and your natural hair. Maintenance is advised every 6–8 weeks, with your exact refit or adjustment schedule tailored to your method, growth and lifestyle. Please do not miss or significantly delay appointments, as grown-out connections can place strain on the natural hair and become more difficult to maintain safely.',
    },
    {
      title: 'Choose your products wisely',
      text: 'Use only extension-friendly, sulphate-free products and avoid oils, serums and heavy treatments directly on the bonds or tapes. Apply nourishing products from the mid-lengths to the ends to keep the hair soft, polished and beautifully conditioned. Professional advice should always guide any colour service, as colouring the extensions can compromise their quality and finish.',
    },
    {
      title: 'Handle every strand with respect',
      text: 'Never pick at, pull on or twist the connections, even if one feels unfamiliar. Do not cut the extensions yourself: an incorrect cut can reach the natural hair beneath and cause avoidable damage. If you notice a loose connection, tangling or any concern, please contact Chrissy so it can be assessed and cared for professionally.',
    },
  ],
};

/**
 * The five methods, each with the line she wrote for it.
 *
 * `brand.methods` already held these names and rendered NOWHERE — only as
 * prose in the hero. These are the same five with her own descriptors, so the
 * question "what do you actually offer" has an answer on the page.
 *
 * ONE DISCREPANCY LEFT ALONE. Her sample calls the fifth "Discreet
 * Extensions"; the site has called it "Invisi" since she supplied the list.
 * Both are hers, they are the same method, and picking one is her call rather
 * than mine — so the name here is the one already live and the alternative is
 * flagged rather than quietly swapped.
 */
export const methods = [
  { name: 'Nano rings', note: 'Weightless, undetectable strands' },
  { name: 'Tape extensions', note: 'Seamless volume in a single sitting' },
  { name: 'Micro ring extensions', note: 'Heat-free, hand-placed length' },
  { name: 'Weave', note: 'Full, sculpted density' },
  { name: 'Invisi', note: 'The most discreet finish' },
];

/**
 * What a service's deposit actually is, at the moment it is asked for.
 *
 * DERIVED, NOT STORED — and that is the whole point. Her prices live in the
 * database and she edits them from her dashboard, so a deposit typed in
 * alongside a price goes stale the first time she changes that price: a £45
 * service becomes £60 and the deposit is still pointing at the old figure.
 * Deriving it from `rules.depositPercent` means a price change carries its
 * deposit with it.
 *
 * A per-service `deposit` above zero still wins, so she keeps the override if
 * one service ever needs a different arrangement.
 *
 * Quoted services get nothing, because there is no price to take a share of
 * until she has seen the hair.
 */
export function depositForService(service, depositPercent = rules.depositPercent) {
  if (!service || service.priceOnRequest || !(service.price > 0)) return 0;
  if (service.deposit > 0) return Math.min(service.deposit, service.price);
  return Math.min(Math.round((service.price * depositPercent) / 100), service.price);
}
