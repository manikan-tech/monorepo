export default function RefundPolicy() {
  return (
    <div className="min-h-screen py-20 px-6 bg-white">
      <div className="max-w-[800px] mx-auto animate-fade-in-up">
        <h1 className="font-display text-4xl font-semibold text-forest-950 mb-8">Refund & Return Policy</h1>
        
        <div className="space-y-8 text-forest-800 leading-relaxed">
          <section>
            <p className="text-sm text-forest-500 mb-4">Last Updated: July 2026</p>
            <p className="font-medium text-forest-900 text-lg border-l-4 border-gold-500 pl-4 bg-gold-50/50 py-3">
              Because you used the Manikan Virtual Try-On engine, we guarantee your fit. If the item you receive doesn't match the size recommended by our LangGraph AI agent, your return is 100% free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">1. The "Perfect Fit" Guarantee</h2>
            <p>
              Our mission at Manikan is to eliminate returns caused by poor fit. If you purchased the exact size 
              recommended by our AI agent and it does not fit your body correctly, we will cover all return shipping costs 
              and provide a full refund within 30 days of delivery.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">2. Standard Returns</h2>
            <p>
              If you wish to return an item for reasons other than fit (e.g., changed your mind, didn't like the color), 
              you have 14 days from the date of delivery to initiate a return.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Items must be unused, unwashed, and in the same condition that you received them.</li>
              <li>Items must be in the original packaging with all tags attached.</li>
              <li>A standard restocking fee of 50 EGP will be deducted from your refund for non-fit related returns.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">3. How to Initiate a Return</h2>
            <p>To start a return, please follow these steps:</p>
            <ol className="list-decimal pl-5 mt-2 space-y-2">
              <li>Log in to your Manikan account and navigate to your Order History.</li>
              <li>Select the item you wish to return and choose a reason.</li>
              <li>If the reason is "Incorrect AI Fit Recommendation", your return shipping label will be generated instantly for free.</li>
              <li>Drop the package off at any partner courier location.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">4. Refunds Process</h2>
            <p>
              Once your return is received and inspected, we will send you an email to notify you that we have received 
              your returned item. If approved, your refund will be processed, and a credit will automatically be applied 
              to your original method of payment within 5-7 business days.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
