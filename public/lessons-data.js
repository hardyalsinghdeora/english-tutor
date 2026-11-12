// All lessons live here. To add a lesson, copy one block and change it.
// video: paste a YouTube embed link (https://www.youtube.com/embed/VIDEO_ID)
//        or a file path like "/videos/lesson1.mp4". Leave "" to show a placeholder.
(function () {
  const LESSONS = [
    {
      id: "greetings",
      title: "Hello! Greetings & Introductions",
      level: "A1",
      minutes: 5,
      summary: "Say hello, goodbye, and introduce yourself.",
      video: "",
      vocab: [
        { word: "Hello", meaning: "a friendly way to start talking" },
        { word: "Goodbye", meaning: "what you say when you leave" },
        { word: "My name is…", meaning: "how you tell people your name" },
        { word: "Nice to meet you", meaning: "polite words when you meet someone new" },
      ],
      quiz: [
        { q: "Someone says “Nice to meet you.” You answer:", options: ["Nice to meet you too!", "Goodbye!", "I am fine."], answer: 0 },
        { q: "Which sentence is correct?", options: ["My name Emma.", "My name is Emma.", "Name my is Emma."], answer: 1 },
      ],
    },
    {
      id: "to-be",
      title: "I am, You are, He is",
      level: "A1",
      minutes: 6,
      summary: "Use the verb “to be”: am, is, are.",
      video: "",
      vocab: [
        { word: "I am", meaning: "I'm — talking about yourself" },
        { word: "You are", meaning: "you're — talking to someone" },
        { word: "He / She / It is", meaning: "he's, she's, it's — one other person or thing" },
        { word: "We / They are", meaning: "we're, they're — more than one" },
      ],
      quiz: [
        { q: "She ___ a teacher.", options: ["am", "is", "are"], answer: 1 },
        { q: "They ___ my friends.", options: ["is", "am", "are"], answer: 2 },
        { q: "I ___ happy.", options: ["am", "is", "are"], answer: 0 },
      ],
    },
    {
      id: "numbers",
      title: "Numbers 1–20 & Age",
      level: "A1",
      minutes: 5,
      summary: "Count from 1 to 20 and say how old you are.",
      video: "",
      vocab: [
        { word: "one, two, three", meaning: "1, 2, 3" },
        { word: "eleven, twelve", meaning: "11, 12" },
        { word: "twenty", meaning: "20" },
        { word: "I am … years old", meaning: "how you say your age" },
      ],
      quiz: [
        { q: "What is 12?", options: ["twenty", "twelve", "two"], answer: 1 },
        { q: "How do you say your age?", options: ["I have 15 years.", "I am 15 years old.", "I 15 old."], answer: 1 },
      ],
    },
    {
      id: "daily-routine",
      title: "My Day: Daily Routine",
      level: "A1",
      minutes: 7,
      summary: "Talk about what you do every day with the present simple.",
      video: "",
      vocab: [
        { word: "wake up", meaning: "stop sleeping" },
        { word: "have breakfast", meaning: "eat in the morning" },
        { word: "go to work / school", meaning: "travel to your job or class" },
        { word: "go to bed", meaning: "start sleeping at night" },
      ],
      quiz: [
        { q: "I ___ up at 7 o'clock.", options: ["wakes", "wake", "waking"], answer: 1 },
        { q: "She ___ breakfast at 8.", options: ["have", "has", "haves"], answer: 1 },
      ],
    },
    {
      id: "food",
      title: "Food & Ordering at a Café",
      level: "A2",
      minutes: 6,
      summary: "Name common foods and order politely with “Can I have…?”",
      video: "",
      vocab: [
        { word: "Can I have…, please?", meaning: "a polite way to ask for something" },
        { word: "a cup of coffee", meaning: "one coffee" },
        { word: "a sandwich", meaning: "bread with food inside" },
        { word: "How much is it?", meaning: "asking the price" },
      ],
      quiz: [
        { q: "The most polite way to order:", options: ["Give me coffee.", "Can I have a coffee, please?", "Coffee now."], answer: 1 },
        { q: "You want to know the price. You say:", options: ["How much is it?", "How many is it?", "What price you?"], answer: 0 },
      ],
    },
    {
      id: "directions",
      title: "Asking for Directions",
      level: "A2",
      minutes: 7,
      summary: "Ask where places are and understand left, right, and straight.",
      video: "",
      vocab: [
        { word: "Excuse me, where is…?", meaning: "a polite way to ask for a place" },
        { word: "turn left / turn right", meaning: "change direction" },
        { word: "go straight", meaning: "don't turn" },
        { word: "next to / opposite", meaning: "beside / on the other side" },
      ],
      quiz: [
        { q: "To ask politely:", options: ["Where bank?", "Excuse me, where is the bank?", "Bank is where?"], answer: 1 },
        { q: "“Go straight” means:", options: ["don't turn", "turn left", "stop"], answer: 0 },
      ],
    },
  ];

  if (typeof module !== "undefined" && module.exports) module.exports = LESSONS;
  else window.LESSONS = LESSONS;
})();
