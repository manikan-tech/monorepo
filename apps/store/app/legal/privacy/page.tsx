export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen py-20 px-6 bg-white">
      <div className="max-w-[800px] mx-auto animate-fade-in-up">
        <h1 className="font-display text-4xl font-semibold text-forest-950 mb-8">Privacy Policy</h1>
        
        <div className="space-y-8 text-forest-800 leading-relaxed">
          <section>
            <p className="text-sm text-forest-500 mb-4">Last Updated: July 2026</p>
            <p>
              At Manikan, we take your privacy extremely seriously, particularly when it comes to the Virtual Try-On experience. 
              This policy explains how we collect, use, and protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">1. Virtual Try-On Photo Policy</h2>
            <p className="mb-2">This is our most important commitment to you:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Zero Permanent Storage:</strong> When you upload a photo for the Virtual Try-On, it is processed entirely in-memory.</li>
              <li><strong>Immediate Deletion:</strong> The moment the AI inference is complete, your raw photo is immediately and permanently deleted via API from our inference servers.</li>
              <li><strong>No AI Training:</strong> We strictly do not log, save, or use any user-uploaded photos to train our machine learning models.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">2. Data We Collect</h2>
            <p>
              We collect basic body measurements (height, weight, chest, waist) to generate your SMPL 3D body mesh. 
              These numeric values are stored securely to allow you to receive accurate size recommendations across all partner retailers without re-entering them.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">3. How We Use Your Data</h2>
            <p>We use your numeric measurement data exclusively to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Generate accurate 3D parametric representations of your body.</li>
              <li>Power our LangGraph recommendation agent to find your perfect size.</li>
              <li>Provide analytics to retailers strictly in an anonymized, aggregated format (e.g., "30% of your shoppers are Size M").</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">4. Your Rights</h2>
            <p>
              You have the right to request the deletion of all your numeric measurement data and account information at any time. 
              Please contact <a href="mailto:privacy@manikan.io" className="text-gold-600 hover:underline">privacy@manikan.io</a> for assistance.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
