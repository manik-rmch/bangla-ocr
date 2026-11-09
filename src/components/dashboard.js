// Dashboard: দুটি প্রধান Card
const ICON_TEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>`;
const ICON_DOC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg>`;

export function renderDashboard() {
  return `
    <section class="hero">
      <h1>ছবি ও PDF থেকে বাংলা-ইংরেজি লেখা ও টেবিল উদ্ধার করুন</h1>
      <p>সম্পূর্ণ বিনামূল্যে, আপনার Browser-এই কাজ হয়। কোনো ফাইল সার্ভারে যায় না।</p>
    </section>

    <section class="mode-grid" aria-label="OCR Mode">
      <a class="mode-card" href="#/text-ocr">
        <div class="mode-icon">${ICON_TEXT}</div>
        <h2>Text OCR</h2>
        <p>ছবি ও PDF থেকে বাংলা ও ইংরেজি লেখা বের করুন।</p>
        <span class="mode-go">Workspace খুলুন →</span>
      </a>
      <a class="mode-card" href="#/document-ocr">
        <div class="mode-icon">${ICON_DOC}</div>
        <h2>Document OCR</h2>
        <p>টেবিল, বর্ডার এবং সম্পূর্ণ Document Layout পুনর্গঠন করুন।</p>
        <span class="mode-go">Workspace খুলুন →</span>
      </a>
    </section>

    <div class="badges">
      <span class="badge">বাংলা + English</span>
      <span class="badge">JPG · PNG · WEBP · PDF</span>
      <span class="badge">কোনো Tracking নেই</span>
      <span class="badge">Mobile ও Desktop</span>
    </div>`;
}
