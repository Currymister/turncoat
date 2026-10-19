// Game content: missions, secret objects, words and puzzles.
// Edit freely: add lines to any list and the game picks them up.

import crypto from 'node:crypto';

const pick = (a) => a[crypto.randomInt(a.length)];
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const MISSION_TYPES = ['photo', 'vault', 'scavenger', 'secretword'];

export const MISSION_INFO = {
  photo: { name: 'Photo hunt', blurb: 'Take a photo that matches the task.' },
  vault: { name: 'Vault code', blurb: 'Share your clues to crack the 4-digit code. You have 3 attempts.' },
  scavenger: { name: 'Scavenger hunt', blurb: 'Find your item and photograph it before time runs out.' },
  secretword: { name: 'Secret word', blurb: 'Slip your secret word into the round table without being caught. Spot other people’s words to earn points.' },
};

export const PHOTO_PROMPTS = {
  pub: [
    'You with something that has a crest or logo on it',
    'Your best innocent face, next to the bar',
    'You holding the oldest-looking thing in the room',
    'A dramatic close-up of your drink, like an advert',
    'You pointing at something red',
    'Recreate a famous painting pose at your table',
    'You with something that has a number on it',
    'You pretending to be a secret agent',
    'You with the most unusual thing on the menu',
    'A photo of you looking shocked at something completely ordinary',
  ],
  home: [
    'You with the oldest thing in your kitchen',
    'Your best impression of a portrait painting',
    'A dramatic close-up of your drink, like an advert',
    'You with something round',
    'Your pet, or a stand-in pet (a sock counts)',
    'You looking suspicious behind a curtain or door',
    'You with something that has a number on it',
    'You wearing the most ridiculous hat you can make',
    'You with something that makes a noise',
    'You looking shocked at something completely ordinary',
  ],
  outdoors: [
    'You with a sign that has a number on it',
    'Something that looks like a face',
    'You hugging a tree (or a lamp post)',
    'You with something red',
    'Your best explorer pose',
    'You with a door that is not your own',
    'A photo of the sky that looks like a painting',
    'You with something older than you',
  ],
};

export const SECRET_OBJECTS = {
  pub: [
    { object: 'a bottle cap', category: 'something from behind the bar' },
    { object: 'a beer mat', category: 'something made of card' },
    { object: 'a coin', category: 'something metal' },
    { object: 'a straw', category: 'something you drink with' },
    { object: 'a set of keys', category: 'something you carry every day' },
    { object: 'something with a clock face', category: 'something that tells the time' },
    { object: 'a slice of lemon or lime', category: 'something you might find in a drink' },
    { object: 'a receipt', category: 'something made of paper' },
    { object: 'a salt or pepper pot', category: 'something from a table' },
  ],
  home: [
    { object: 'a spoon', category: 'something from the kitchen' },
    { object: 'a sock', category: 'clothing' },
    { object: 'a remote control', category: 'electronics' },
    { object: 'a pen', category: 'stationery' },
    { object: 'a book', category: 'something you read' },
    { object: 'something green', category: 'a colour' },
    { object: 'a leaf from a houseplant', category: 'nature' },
    { object: 'a teabag', category: 'something from the kitchen' },
    { object: 'a phone charger', category: 'electronics' },
  ],
  outdoors: [
    { object: 'a leaf', category: 'nature' },
    { object: 'a stone', category: 'nature' },
    { object: 'a bin', category: 'street furniture' },
    { object: 'a bicycle', category: 'transport' },
    { object: 'a dog', category: 'an animal' },
    { object: 'something yellow', category: 'a colour' },
    { object: 'a car number plate', category: 'transport' },
  ],
};

export const SCAVENGER_ITEMS = {
  pub: [
    'a beer mat', 'a receipt', 'an empty glass', 'a menu', 'a napkin', 'a straw', 'a coin', 'a slice of lemon',
    'a pen', 'a bottle cap', 'a salt pot', 'a sugar sachet', 'a key', 'a lighter or matches', 'a hair tie',
    'a bank card (face down!)', 'a drinks list', 'a ketchup sachet', 'a phone charger', 'a watch', 'a tissue', 'a lip balm',
  ],
  home: [
    'a spoon', 'a sock', 'a book', 'a pen', 'a mug', 'a battery', 'a hairbrush', 'a key', 'a remote control',
    'a candle', 'a teabag', 'a plaster', 'a tin of food', 'a cushion', 'a toothbrush', 'a coin', 'a wooden spoon',
    'a charger', 'a towel', 'a plant', 'a jar', 'a hat',
  ],
  outdoors: [
    'a leaf', 'a stone', 'a feather', 'a stick', 'a flower', 'a pine cone', 'a bottle top', 'a receipt',
    'a conker or acorn', 'a blade of grass', 'a shell', 'a ticket', 'a petal', 'a twig with two branches',
    'something round', 'something blue', 'a smooth pebble', 'a piece of bark', 'a seed', 'moss', 'a clover', 'a lolly stick',
  ],
};

// Secret word: Faithful words come from NEUTRAL_WORDS, Traitor words all share one theme.
export const THEMES = {
  birds: ['pigeon', 'robin', 'falcon', 'sparrow', 'owl', 'swan', 'parrot', 'eagle'],
  weather: ['thunder', 'drizzle', 'hail', 'breeze', 'fog', 'rainbow', 'blizzard', 'sunshine'],
  fruit: ['mango', 'kiwi', 'plum', 'cherry', 'banana', 'peach', 'grape', 'melon'],
  tools: ['hammer', 'spanner', 'chisel', 'screwdriver', 'drill', 'saw', 'ladder', 'toolbox'],
  body: ['elbow', 'eyebrow', 'knuckle', 'ankle', 'shoulder', 'thumb', 'kneecap', 'earlobe'],
  space: ['planet', 'rocket', 'comet', 'galaxy', 'astronaut', 'moon', 'meteor', 'orbit'],
};

export const NEUTRAL_WORDS = [
  'umbrella', 'volcano', 'spreadsheet', 'pancake', 'lighthouse', 'trampoline', 'submarine', 'waffle', 'jigsaw',
  'carpet', 'wardrobe', 'pyjamas', 'lasagne', 'trombone', 'cactus', 'igloo', 'skateboard', 'passport', 'scarecrow',
  'marathon', 'kettle', 'puddle', 'sandcastle', 'lottery', 'karaoke', 'museum', 'bicycle', 'teapot', 'snorkel',
  'castle', 'popcorn', 'tractor', 'helicopter', 'calendar', 'doughnut', 'compass', 'magnet', 'pillow',
];

// ---------- Puzzles ----------

const ANAGRAM_WORDS = [
  'castle', 'dragon', 'secret', 'shadow', 'candle', 'whisper', 'dagger', 'mirror', 'garden', 'forest', 'turret',
  'traitor', 'faithful', 'banish', 'murder', 'shield', 'cloak', 'lantern', 'breakfast', 'puzzle', 'riddle', 'mystery',
  'clue', 'suspect', 'alibi', 'guilty', 'honest', 'betray', 'oath', 'vote', 'table', 'chalice', 'raven', 'tower',
  'goblet', 'scroll', 'potion', 'velvet', 'crimson', 'midnight', 'echo', 'thunder', 'silver', 'golden', 'hidden',
  'witness', 'motive', 'evidence', 'nervous', 'plotting', 'scheme', 'fortune', 'wizard', 'banquet', 'knight',
];

const TRIVIA = [
  { q: 'How many sides does a hexagon have?', a: '6', o: ['5', '6', '8', '7'] },
  { q: 'What is the capital of Scotland?', a: 'Edinburgh', o: ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee'] },
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', o: ['Venus', 'Jupiter', 'Mars', 'Mercury'] },
  { q: 'How many players are on a football team on the pitch?', a: '11', o: ['10', '11', '12', '9'] },
  { q: 'What is the largest ocean on Earth?', a: 'Pacific', o: ['Atlantic', 'Indian', 'Pacific', 'Arctic'] },
  { q: 'Which gas do plants absorb from the air?', a: 'Carbon dioxide', o: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'] },
  { q: 'How many minutes are in a day?', a: '1,440', o: ['1,200', '1,440', '1,640', '960'] },
  { q: 'Which is the longest river in the UK?', a: 'Severn', o: ['Thames', 'Severn', 'Trent', 'Wye'] },
  { q: 'What is the chemical symbol for gold?', a: 'Au', o: ['Ag', 'Gd', 'Au', 'Go'] },
  { q: 'How many strings does a standard guitar have?', a: '6', o: ['4', '5', '6', '7'] },
  { q: 'Which animal is the tallest in the world?', a: 'Giraffe', o: ['Elephant', 'Giraffe', 'Camel', 'Moose'] },
  { q: 'In which country are the pyramids of Giza?', a: 'Egypt', o: ['Mexico', 'Egypt', 'Peru', 'Sudan'] },
  { q: 'What is 9 x 7?', a: '63', o: ['56', '63', '72', '61'] },
  { q: 'How many continents are there?', a: '7', o: ['5', '6', '7', '8'] },
  { q: 'Which is the smallest prime number?', a: '2', o: ['0', '1', '2', '3'] },
  { q: 'What colour do you get by mixing blue and yellow?', a: 'Green', o: ['Purple', 'Orange', 'Green', 'Brown'] },
  { q: 'Which month has the fewest days?', a: 'February', o: ['April', 'February', 'June', 'November'] },
  { q: 'How many hearts does an octopus have?', a: '3', o: ['1', '2', '3', '8'] },
  { q: 'What is the hardest natural substance?', a: 'Diamond', o: ['Gold', 'Iron', 'Diamond', 'Granite'] },
  { q: 'Which instrument has 88 keys?', a: 'Piano', o: ['Organ', 'Piano', 'Accordion', 'Harp'] },
  { q: 'What is the freezing point of water in Celsius?', a: '0', o: ['0', '32', '-10', '10'] },
  { q: 'Which bird is a symbol of peace?', a: 'Dove', o: ['Eagle', 'Dove', 'Swan', 'Robin'] },
  { q: 'How many sides does a 50p coin have?', a: '7', o: ['6', '7', '8', '9'] },
  { q: 'What is the capital of Wales?', a: 'Cardiff', o: ['Swansea', 'Cardiff', 'Newport', 'Bangor'] },
  { q: 'How many legs does a spider have?', a: '8', o: ['6', '8', '10', '12'] },
  { q: 'Which is the closest star to Earth?', a: 'The Sun', o: ['Sirius', 'The Sun', 'Polaris', 'Alpha Centauri'] },
  { q: 'How many weeks are in a year?', a: '52', o: ['48', '50', '52', '54'] },
  { q: 'Which shape has three sides?', a: 'Triangle', o: ['Square', 'Triangle', 'Pentagon', 'Circle'] },
  { q: 'What do bees make?', a: 'Honey', o: ['Milk', 'Honey', 'Silk', 'Wax only'] },
  { q: 'Which ocean lies between Europe and America?', a: 'Atlantic', o: ['Pacific', 'Indian', 'Atlantic', 'Southern'] },
  { q: 'How many hours are in two days?', a: '48', o: ['24', '36', '48', '72'] },
  { q: 'What is the main ingredient in guacamole?', a: 'Avocado', o: ['Pea', 'Avocado', 'Lime', 'Courgette'] },
  { q: 'Which is the largest planet?', a: 'Jupiter', o: ['Saturn', 'Jupiter', 'Neptune', 'Earth'] },
  { q: 'What is half of 250?', a: '125', o: ['115', '120', '125', '150'] },
  { q: 'Which language has the most native speakers?', a: 'Mandarin Chinese', o: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'] },
];

const SEQUENCES = [
  { q: '2, 4, 8, 16, ?', a: '32' },
  { q: '1, 3, 5, 7, ?', a: '9' },
  { q: '3, 6, 9, 12, ?', a: '15' },
  { q: '1, 1, 2, 3, 5, 8, ?', a: '13' },
  { q: '100, 90, 80, 70, ?', a: '60' },
  { q: '1, 4, 9, 16, ?', a: '25' },
  { q: '5, 10, 20, 40, ?', a: '80' },
  { q: '2, 3, 5, 7, 11, ?', a: '13' },
  { q: '64, 32, 16, 8, ?', a: '4' },
  { q: '1, 2, 4, 7, 11, ?', a: '16' },
  { q: '10, 9, 7, 4, ?', a: '0' },
  { q: '3, 5, 9, 17, ?', a: '33' },
  { q: '1, 8, 27, 64, ?', a: '125' },
  { q: '7, 14, 21, 28, ?', a: '35' },
  { q: '81, 27, 9, 3, ?', a: '1' },
];

function scramble(word) {
  let s = word;
  for (let i = 0; i < 10 && s === word; i++) s = shuffle(word.split('')).join('');
  return s.toUpperCase();
}

let puzzleSeq = 0;
// Makes a puzzle set of `count` items. Answers stay on the server.
export function makePuzzleSet(count) {
  const items = [];
  const words = shuffle(ANAGRAM_WORDS);
  const trivia = shuffle(TRIVIA);
  const seqs = shuffle(SEQUENCES);
  const kinds = shuffle(['anagram', 'trivia', 'sequence', 'anagram', 'trivia', 'sequence']).slice(0, count);
  kinds.forEach((kind, i) => {
    const id = `z${++puzzleSeq}`;
    if (kind === 'anagram') {
      const w = words[i];
      items.push({ id, type: 'anagram', prompt: `Unscramble: ${scramble(w)}`, answer: w, solvedAt: null });
    } else if (kind === 'trivia') {
      const t = trivia[i];
      items.push({ id, type: 'trivia', prompt: t.q, options: shuffle(t.o), answer: t.a, solvedAt: null });
    } else {
      const s = seqs[i];
      items.push({ id, type: 'sequence', prompt: `What comes next? ${s.q}`, answer: s.a, solvedAt: null });
    }
  });
  return items;
}

export function checkAnswer(item, answer) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(item.answer) === norm(answer);
}

export { pick, shuffle };
