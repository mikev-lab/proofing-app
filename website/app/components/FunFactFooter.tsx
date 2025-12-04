'use client';

import React, { useState, useEffect } from 'react';

const FACTS = [
  "The MCE in MCE Printing actually stood for Main Character Energy. No seriously, check it out <a href='https://maincharacterenergy.com' target='_blank' class='underline hover:text-white'>maincharacterenergy.com</a>",
  "The oldest surviving printed book is the Diamond Sutra, printed in 868 AD.",
  "CMYK stands for Cyan, Magenta, Yellow, and Key (Black). 'Key' because it aligns the other colors.",
  "The smell of old books comes from the breakdown of compounds in paper, releasing hints of vanilla and almond.",
  "Before paper, people wrote on parchment made from animal skin. It took about 300 sheep to make one Bible.",
  "Glossy paper isn't actually smoother paper; it's paper coated with a fine layer of clay or polymer.",
  "The standard 'A4' paper size is based on the aspect ratio of the square root of 2, so it scales perfectly when folded.",
  "Johannes Gutenberg didn't just invent the printing press; he developed an oil-based ink that would stick to metal type.",
  "Offset printing gets its name because the ink is not transferred directly to paper, but 'offset' to a rubber blanket first."
];

export default function FunFactFooter() {
  const [fact, setFact] = useState<string | null>(null);

  useEffect(() => {
    // Pick a random fact
    const randomIndex = Math.floor(Math.random() * FACTS.length);
    setFact(FACTS[randomIndex]);
  }, []);

  if (!fact) return null;

  return (
    <div className="mt-12 pt-8 border-t border-slate-700/50 text-center">
        <p className="text-sm text-gray-500 italic">
            <span className="font-bold text-indigo-400 not-italic mr-2">Did you know?</span>
            <span dangerouslySetInnerHTML={{ __html: fact }} />
        </p>
    </div>
  );
}
