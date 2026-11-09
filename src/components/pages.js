// About, Help ও Workspace-এর প্রাথমিক পেজ
export function renderAbout() {
  return `
    <h1>About</h1>
    <p class="lead">বাংলা OCR Studio একটি বিনামূল্যের, Browser-ভিত্তিক বাংলা ও ইংরেজি OCR অ্যাপ।</p>
    <div class="card">
      <h2>এটি কী করে</h2>
      <ul>
        <li><b>Text OCR:</b> ছবি ও PDF থেকে লেখা বের করে Edit ও Export করার সুবিধা।</li>
        <li><b>Document OCR:</b> সরকারি অফিসের রোস্টার, হিসাবের ছক ও বিলের মতো Document-এর টেবিল ও Layout পুনর্গঠন।</li>
      </ul>
    </div>
    <div class="card">
      <h2>গোপনীয়তা</h2>
      <ul>
        <li>সব OCR Processing আপনার Browser-এ হয়।</li>
        <li>PDF বা ছবি কোনো সার্ভারে পাঠানো হয় না।</li>
        <li>OCR-এর ফল স্বয়ংক্রিয়ভাবে কোথাও সংরক্ষিত হয় না।</li>
        <li>কোনো Tracking বা Analytics নেই।</li>
      </ul>
    </div>`;
}

export function renderHelp() {
  return `
    <h1>Help</h1>
    <p class="lead">শুরু করার সহজ নিয়ম।</p>
    <div class="card">
      <h2>কীভাবে ব্যবহার করবেন</h2>
      <ol>
        <li>Home পেজ থেকে <b>Text OCR</b> অথবা <b>Document OCR</b> বাছুন।</li>
        <li>ছবি বা PDF Upload করুন (পরের Phase-এ যোগ হচ্ছে)।</li>
        <li>OCR চালিয়ে ফল দেখুন, ভুল থাকলে নিজে সংশোধন করুন।</li>
        <li>প্রয়োজনীয় ফরম্যাটে Export করুন।</li>
      </ol>
    </div>
    <div class="card">
      <h2>কোনটি কখন?</h2>
      <ul>
        <li>শুধু লেখা দরকার হলে: <b>Text OCR</b></li>
        <li>টেবিল, ছক বা পুরো Document-এর মতো চেহারা দরকার হলে: <b>Document OCR</b></li>
      </ul>
    </div>
    <div class="card">
      <h2>মনে রাখুন</h2>
      <p>OCR ১০০% নির্ভুল নয়, বিশেষ করে যুক্তাক্ষরে। গুরুত্বপূর্ণ Document-এ ফল মূল ফাইলের সঙ্গে মিলিয়ে নিন।</p>
    </div>`;
}

const WORKSPACES = {
  'text-ocr': {
    title: 'Text OCR',
    desc: 'ছবি ও PDF থেকে বাংলা ও ইংরেজি লেখা বের করুন।',
    next: 'Phase 3 (File Upload ও Preview) এবং Phase 4 (Text OCR Engine)'
  },
  'document-ocr': {
    title: 'Document OCR',
    desc: 'টেবিল, বর্ডার এবং সম্পূর্ণ Document Layout পুনর্গঠন করুন।',
    next: 'Phase 3 (File Upload ও Preview) এবং Phase 7-10 (Document Analysis থেকে Editor)'
  }
};

export function renderWorkspace(key) {
  const w = WORKSPACES[key];
  return `
    <a class="crumb" href="#/">← Dashboard-এ ফিরুন</a>
    <h1>${w.title}</h1>
    <p class="lead">${w.desc}</p>
    <div class="card status-card">
      <h2>Workspace প্রস্তুত হচ্ছে</h2>
      <p>এই Workspace-এর Upload ও OCR সুবিধা এখনো যোগ হয়নি। এটি তৈরি হবে ${w.next}-এ।</p>
    </div>`;
}
