/**
 * Maharashtra HSC syllabus used by StudyMantra.
 * Chapter lists follow the 2026–27 Balbharati / MSBSHSE structure
 * supplied for this tracker (board page reviewed 1 Sep 2026).
 *
 * English textbook units are `core`. Unseen passages and grammar are
 * separate language-study rows, not fake prose chapters.
 * Class 12 English is 26 textbook units (8 prose, 8 poetry, 6 writing, 4 novel).
 * The earlier "24" summary did not match that enumerated list.
 */

function numbered(year, subjectId, titles, section = null, core = true) {
  return titles.map((title, index) => ({
    id: `${year}-${subjectId}-${String(index + 1).padStart(2, "0")}`,
    year,
    subjectId,
    no: String(index + 1),
    title,
    section,
    core,
  }));
}

function units(year, subjectId, section, rows, core = true) {
  return rows.map(([no, title]) => ({
    id: `${year}-${subjectId}-${String(no).replace(/\./g, "-")}`,
    year,
    subjectId,
    no: String(no),
    title,
    section,
    core,
  }));
}

export const SUBJECTS = [
  { id: "m1", name: "Mathematics Part 1", short: "Maths Part 1", mark: "M1", pcm: true, math: true },
  { id: "m2", name: "Mathematics Part 2", short: "Maths Part 2", mark: "M2", pcm: true, math: true },
  { id: "phy", name: "Physics", short: "Physics", mark: "PHY", pcm: true, math: false },
  { id: "chem", name: "Chemistry", short: "Chemistry", mark: "CHM", pcm: true, math: false },
  { id: "cs1", name: "Computer Science 1", short: "CS Paper 1", mark: "CS1", pcm: false, math: false },
  { id: "cs2", name: "Computer Science 2", short: "CS Paper 2", mark: "CS2", pcm: false, math: false },
  { id: "eng", name: "English", short: "English", mark: "ENG", pcm: false, math: false },
];

export const SUBJECT_ORDER = SUBJECTS.map((subject) => subject.id);

export const BLURBS = {
  "11-m1": "Nine chapters. Angle measure through probability.",
  "11-m2": "Nine chapters. Complex numbers through differentiation.",
  "11-phy": "Fourteen chapters, from units and measurements to semiconductors.",
  "11-chem": "Sixteen chapters. Physical, inorganic, organic, and everyday chemistry.",
  "11-cs1": "Software paper. Number systems, program analysis, C++, Visual Basic, networks.",
  "11-cs2": "Hardware paper. Components, logic, the PC, and peripherals.",
  "11-eng": "Yuvakbharati. 22 textbook units, plus unseen work and grammar kept separate.",
  "12-m1": "Seven chapters. Logic, matrices, vectors, line and plane, linear programming.",
  "12-m2": "Eight chapters. Calculus through the binomial distribution.",
  "12-phy": "Sixteen chapters. Rotation through semiconductor devices.",
  "12-chem": "Sixteen chapters. Solid state through green chemistry and nanochemistry.",
  "12-cs1": "Software paper. Operating systems, data structures, C++, HTML.",
  "12-cs2": "Hardware paper. 8085, the x86 family, microcontrollers, networking.",
  "12-eng": "Yuvakbharati. 26 textbook units, plus unseen work and grammar kept separate.",
};

const LANGUAGE = [
  ["L1", "Unseen passage — prose"],
  ["L2", "Unseen passage — poetry"],
  ["L3", "Grammar and language study"],
];

const RAW = [
  ...numbered(11, "m1", [
    "Angle and its Measurement",
    "Trigonometry – I",
    "Trigonometry – II",
    "Determinants and Matrices",
    "Straight Line",
    "Circle",
    "Conic Sections",
    "Measures of Dispersion",
    "Probability",
  ]),
  ...numbered(11, "m2", [
    "Complex Numbers",
    "Sequences and Series",
    "Permutations and Combination",
    "Methods of Induction and Binomial Theorem",
    "Sets and Relations",
    "Functions",
    "Limits",
    "Continuity",
    "Differentiation",
  ]),
  ...numbered(11, "phy", [
    "Units and Measurements",
    "Mathematical Methods",
    "Motion in a Plane",
    "Laws of Motion",
    "Gravitation",
    "Mechanical Properties of Solids",
    "Thermal Properties of Matter",
    "Sound",
    "Optics",
    "Electrostatics",
    "Electric Current Through Conductors",
    "Magnetism",
    "Electromagnetic Waves and Communication System",
    "Semiconductors",
  ]),
  ...numbered(11, "chem", [
    "Some Basic Concepts of Chemistry",
    "Introduction to Analytical Chemistry",
    "Basic Analytical Techniques",
    "Structure of Atom",
    "Chemical Bonding",
    "Redox Reactions",
    "Modern Periodic Table",
    "Elements of Group 1 and 2",
    "Elements of Group 13, 14 and 15",
    "States of Matter",
    "Adsorption and Colloids",
    "Chemical Equilibrium",
    "Nuclear Chemistry and Radioactivity",
    "Basic Principles of Organic Chemistry",
    "Hydrocarbons",
    "Chemistry in Everyday Life",
  ]),
  ...numbered(11, "cs1", [
    "Number Systems and Binary Arithmetic",
    "Program Analysis",
    "Introduction to C++",
    "Visual Basic",
    "Introduction to Networking and Internet",
  ]),
  ...numbered(11, "cs2", [
    "Study of Components and Circuits",
    "Logic Gates and Sequential Circuits",
    "Functional Hardware Parts of PC",
    "Peripheral Devices",
  ]),
  ...units(11, "eng", "Prose", [
    ["1.1", "Being Neighborly"],
    ["1.2", "On to the Summit: We Reach the Top"],
    ["1.3", "The Call of the Soil"],
    ["1.4", "Pillars of Democracy"],
    ["1.5", "Mrs. Adis"],
    ["1.6", "Tiger Hills"],
  ]),
  ...units(11, "eng", "Poetry", [
    ["2.1", "Cherry Tree"],
    ["2.2", "The Sower"],
    ["2.3", "There is Another Sky"],
    ["2.4", "Upon Westminster Bridge"],
    ["2.5", "Nose versus Eyes"],
    ["2.6", "The Planners"],
  ]),
  ...units(11, "eng", "Writing skills", [
    ["3.1", "Expansion of Ideas"],
    ["3.2", "Blog Writing"],
    ["3.3", "E-mails"],
    ["3.4", "Interview"],
    ["3.5", "Film Review"],
    ["3.6", "The Art of Compering"],
  ]),
  ...units(11, "eng", "Drama", [
    ["4.1", "History of English Drama"],
    ["4.2", "The Rising of the Moon"],
    ["4.3", "A Midsummer Night's Dream"],
    ["4.4", "An Enemy of the People"],
  ]),
  ...units(11, "eng", "Language study", LANGUAGE, false),

  ...numbered(12, "m1", [
    "Mathematical Logic",
    "Matrices",
    "Trigonometric Functions",
    "Pair of Straight Lines",
    "Vectors",
    "Line and Plane",
    "Linear Programming",
  ]),
  ...numbered(12, "m2", [
    "Differentiation",
    "Applications of Derivatives",
    "Indefinite Integration",
    "Definite Integration",
    "Application of Definite Integration",
    "Differential Equations",
    "Probability Distributions",
    "Binomial Distribution",
  ]),
  ...numbered(12, "phy", [
    "Rotational Dynamics",
    "Mechanical Properties of Fluids",
    "Kinetic Theory of Gases and Radiation",
    "Thermodynamics",
    "Oscillations",
    "Superposition of Waves",
    "Wave Optics",
    "Electrostatics",
    "Current Electricity",
    "Magnetic Fields due to Electric Current",
    "Magnetic Materials",
    "Electromagnetic Induction",
    "AC Circuits",
    "Dual Nature of Radiation and Matter",
    "Structure of Atoms and Nuclei",
    "Semiconductor Devices",
  ]),
  ...numbered(12, "chem", [
    "Solid State",
    "Solutions",
    "Ionic Equilibria",
    "Chemical Thermodynamics",
    "Electrochemistry",
    "Chemical Kinetics",
    "Elements of Groups 16, 17 and 18",
    "Transition and Inner Transition Elements",
    "Coordination Compounds",
    "Halogen Derivatives",
    "Alcohols, Phenols and Ethers",
    "Aldehydes, Ketones and Carboxylic Acids",
    "Amines",
    "Biomolecules",
    "Introduction to Polymer Chemistry",
    "Green Chemistry and Nanochemistry",
  ]),
  ...numbered(12, "cs1", [
    "Operating Systems",
    "Data Structures",
    "C++ Programming",
    "HTML",
  ]),
  ...numbered(12, "cs2", [
    "Introduction to Microprocessors and Organisation of 8085",
    "Instruction Set and Programming of 8085",
    "Introduction to Intel X-86 Family",
    "Introduction to Microcontroller",
    "Networking Technology",
  ]),
  ...units(12, "eng", "Prose", [
    ["1.1", "An Astrologer's Day"],
    ["1.2", "On Saying \"Please\""],
    ["1.3", "The Cop and the Anthem"],
    ["1.4", "Big Data – Big Insights"],
    ["1.5", "The New Dress"],
    ["1.6", "Into the Wild"],
    ["1.7", "Why We Travel"],
    ["1.8", "Voyaging Towards Excellence"],
  ]),
  ...units(12, "eng", "Poetry", [
    ["2.1", "Song of the Open Road"],
    ["2.2", "Indian Weavers"],
    ["2.3", "The Inchcape Rock"],
    ["2.4", "Have You Earned Your Tomorrow"],
    ["2.5", "Father Returning Home"],
    ["2.6", "Money"],
    ["2.7", "She Walks in Beauty"],
    ["2.8", "Small Towns and Rivers"],
  ]),
  ...units(12, "eng", "Writing skills", [
    ["3.1", "Summary Writing"],
    ["3.2", "Mind-Mapping – Do Schools Really Kill Creativity?"],
    ["3.3", "Note-Making"],
    ["3.4", "Statement of Purpose"],
    ["3.5", "Drafting a Virtual Message"],
    ["3.6", "Group Discussion"],
  ]),
  ...units(12, "eng", "Novel", [
    ["4.1", "History of Novel"],
    ["4.2", "To Sir, With Love"],
    ["4.3", "Around the World in Eighty Days"],
    ["4.4", "The Sign of Four"],
  ]),
  ...units(12, "eng", "Language study", LANGUAGE, false),
];

export const CHAPTERS = RAW.map((chapter, order) => ({ ...chapter, order }));

const BY_ID = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));
const SUBJECT_BY_ID = new Map(SUBJECTS.map((subject) => [subject.id, subject]));

export function subjectById(id) {
  return SUBJECT_BY_ID.get(id) || null;
}

export function chapterById(id) {
  return BY_ID.get(id) || null;
}

export function selectChapters({ year = "all", subjectId = null, core = null, pcm = null } = {}) {
  return CHAPTERS.filter((chapter) => {
    if (year !== "all" && year !== "both" && String(chapter.year) !== String(year)) return false;
    if (subjectId && chapter.subjectId !== subjectId) return false;
    if (core !== null && chapter.core !== core) return false;
    if (pcm !== null) {
      const subject = subjectById(chapter.subjectId);
      if (Boolean(subject?.pcm) !== pcm) return false;
    }
    return true;
  });
}

export function searchChapters(query, limit = 12) {
  const needle = String(query || "").trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits = [];
  for (const chapter of CHAPTERS) {
    const subject = subjectById(chapter.subjectId);
    const hay = `${chapter.no} ${chapter.title} ${subject?.name || ""} ${subject?.short || ""} class ${chapter.year}`.toLowerCase();
    if (!hay.includes(needle)) continue;
    hits.push(chapter);
    if (hits.length >= limit) break;
  }
  return hits;
}

export const ERROR_TYPES = [
  "Conceptual",
  "Formula",
  "Silly mistake",
  "Calculation",
  "Misread the question",
  "Time pressure",
  "Memory gap",
];

export const TEST_TYPES = [
  "Chapter test",
  "Unit test",
  "PYQ set",
  "School exam",
  "Full mock",
  "Other",
];

export const VIEWS = [
  { href: "#/dashboard", label: "Dashboard", key: "D" },
  { href: "#/pcm", label: "PCM board", key: "P" },
  { href: "#/backlog", label: "Backlog", key: "B" },
  { href: "#/revision", label: "Revision", key: "R" },
  { href: "#/tests", label: "Tests", key: "T" },
  { href: "#/errors", label: "Error log", key: "E" },
  { href: "#/log", label: "Study log", key: "L" },
  { href: "#/week", label: "Weekly", key: "W" },
  { href: "#/cards", label: "Flashcards", key: "F" },
  { href: "#/mocks", label: "CET mocks", key: "M" },
  { href: "#/settings", label: "Settings", key: "S" },
];
