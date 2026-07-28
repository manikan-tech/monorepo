export default function TermsOfService() {
  return (
    <div className="min-h-screen py-20 px-6 bg-white">
      <div className="max-w-[800px] mx-auto animate-fade-in-up">
        <h1 className="font-display text-4xl font-semibold text-forest-950 mb-8">Terms of Service</h1>
        
        <div className="space-y-8 text-forest-800 leading-relaxed">
          <section>
            <p className="text-sm text-forest-500 mb-4">Last Updated: July 2026</p>
            <p>
              Welcome to Manikan. By accessing our website, using our Virtual Try-On widget, or utilizing our 
              B2B integration services, you agree to comply with and be bound by the following terms and conditions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">1. Use of the Widget</h2>
            <p>
              The Manikan widget is provided "as is" for the purpose of generating AI-driven size recommendations 
              and 3D parametric garment previews. While we strive for 99.8% accuracy, Manikan is an approximation 
              engine and does not guarantee a perfect physical fit due to variations in manufacturing tolerances.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">2. Retailer Integration (B2B)</h2>
            <p>
              Retailers embedding the Manikan script agree not to reverse-engineer, decompile, or otherwise attempt 
              to extract the source code of our React bundle, LangGraph agents, or SMPL body mapping architecture. 
              API access is strictly rate-limited per your subscription tier.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">3. Intellectual Property</h2>
            <p>
              All content, including but not limited to text, graphics, logos, and 3D rendering algorithms, is the 
              property of Manikan Inc. The SMPL model used within our Body Service is licensed under a research 
              license for the ITI graduation project and may require a commercial license for real-world production use.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">4. Limitation of Liability</h2>
            <p>
              Manikan shall not be liable for any indirect, incidental, or consequential damages resulting from the 
              use or inability to use our services, including but not limited to return shipping costs incurred by 
              inaccurate size recommendations.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
