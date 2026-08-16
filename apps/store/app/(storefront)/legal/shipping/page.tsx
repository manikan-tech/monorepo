export default function ShippingPolicy() {
  return (
    <div className="min-h-screen py-20 px-6 bg-white">
      <div className="max-w-[800px] mx-auto animate-fade-in-up">
        <h1 className="font-display text-4xl font-semibold text-forest-950 mb-8">Shipping Policy</h1>
        
        <div className="space-y-8 text-forest-800 leading-relaxed">
          <section>
            <p className="text-sm text-forest-500 mb-4">Last Updated: July 2026</p>
            <p>
              This shipping policy applies to physical products purchased directly through the Manikan Demo Storefront. 
              If you used the Manikan widget on a partner retailer's website, please refer to that specific retailer's shipping policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">Processing Time</h2>
            <p>
              All orders are processed within 1-2 business days. Orders are not shipped or delivered on weekends or holidays.
              If we are experiencing a high volume of orders, shipments may be delayed by a few days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">Shipping Rates & Delivery Estimates</h2>
            <p className="mb-4">Shipping charges for your order will be calculated and displayed at checkout.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-forest-100">
                    <th className="py-3 font-semibold text-forest-950">Shipping Method</th>
                    <th className="py-3 font-semibold text-forest-950">Estimated Delivery</th>
                    <th className="py-3 font-semibold text-forest-950">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-forest-50">
                    <td className="py-3">Standard Delivery</td>
                    <td className="py-3">3-5 business days</td>
                    <td className="py-3">Free</td>
                  </tr>
                  <tr className="border-b border-forest-50">
                    <td className="py-3">Express Delivery</td>
                    <td className="py-3">1-2 business days</td>
                    <td className="py-3">150 EGP</td>
                  </tr>
                  <tr>
                    <td className="py-3">Same Day Delivery (Cairo Only)</td>
                    <td className="py-3">Today (if ordered before 2 PM)</td>
                    <td className="py-3">250 EGP</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-forest-950 mb-3">Shipment Confirmation & Order Tracking</h2>
            <p>
              You will receive a Shipment Confirmation email once your order has shipped containing your tracking number(s). 
              The tracking number will be active within 24 hours.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
