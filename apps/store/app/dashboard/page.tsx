export default function DashboardPage() {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-manikan-border p-8">
      <h2 className="text-2xl font-display text-forest-900 mb-2">Welcome to Manikan.io</h2>
      <p className="text-manikan-text-secondary mb-6">
        Here you can manage your fashion catalog and view widget performance.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-forest-50 p-6 rounded-xl border border-forest-100">
          <h3 className="text-forest-800 font-medium mb-1">Total Products</h3>
          <p className="text-3xl font-display font-semibold text-forest-950">0</p>
        </div>
        <div className="bg-cream-50 p-6 rounded-xl border border-cream-100">
          <h3 className="text-forest-800 font-medium mb-1">Widget Views (30d)</h3>
          <p className="text-3xl font-display font-semibold text-forest-950">0</p>
        </div>
        <div className="bg-gold-50 p-6 rounded-xl border border-gold-100">
          <h3 className="text-gold-800 font-medium mb-1">Try-on Conversions</h3>
          <p className="text-3xl font-display font-semibold text-gold-900">0%</p>
        </div>
      </div>
    </div>
  );
}
