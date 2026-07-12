import { getAuthFromCookies } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import ConversionChart from "./ConversionChart";
import FunnelChart from "./FunnelChart";
import RevenueByDimensionChart from "./RevenueByDimensionChart";
import StockHealthChart from "./StockHealthChart";
import RatingVsConversionChart from "./RatingVsConversionChart";

export const metadata = {
  title: "Analytics | Manikan Dashboard",
};

export default async function AnalyticsPage() {
  const user = await getAuthFromCookies();
  if (!user) redirect("/login");

  const retailerId = user.sub;

  // Fetch products
  const products = await prisma.product.findMany({
    where: { retailerId },
    select: { id: true, name: true, category: true, brand: true, fabric: true, stock: true },
  });

  const productDict = Object.fromEntries(products.map(p => [p.id, p]));
  const productIds = products.map(p => p.id);

  if (productIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-2xl font-semibold text-forest-900">No Analytics Available</h2>
        <p className="text-forest-700/60 mt-2">You need to add products to see analytics.</p>
      </div>
    );
  }

  //  Try-on vs Purchase Conversion
  const sessionsTotal = await prisma.measurementSession.groupBy({
    by: ['productId'],
    where: { retailerId },
    _count: true,
  });

  const sessionsPurchased = await prisma.measurementSession.groupBy({
    by: ['productId'],
    where: { retailerId, isPurchased: true },
    _count: true,
  });

  const purchasedMap = Object.fromEntries(
    sessionsPurchased.map(s => [s.productId, s._count])
  );

  const conversionData = sessionsTotal.map(s => {
    const total = s._count;
    const purchased = purchasedMap[s.productId] || 0;
    const productName = productDict[s.productId]?.name || "Unknown Product";
    const conversion = total > 0 ? (purchased / total) * 100 : 0;
    return {
      productId: s.productId, 
      productName,
      total,
      purchased,
      conversion: parseFloat(conversion.toFixed(1)),
    };
  }).sort((a, b) => b.conversion - a.conversion);

  // Funnel by Product
  const [wishlistCounts, cartCounts, orderCounts] = await Promise.all([
    prisma.wishlist.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _count: true,
    }),
    prisma.cartItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _count: true,
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _count: true,
    }),
  ]);

  const funnelMap: Record<string, { wishlist: number; cart: number; order: number }> = {};
  for (const id of productIds) funnelMap[id] = { wishlist: 0, cart: 0, order: 0 };
  
  wishlistCounts.forEach(c => { funnelMap[c.productId]!.wishlist = c._count; });
  cartCounts.forEach(c => { funnelMap[c.productId]!.cart = c._count; });
  orderCounts.forEach(c => { funnelMap[c.productId]!.order = c._count; });

  const funnelData = productIds.map(id => ({
    productName: productDict[id]!.name,
    wishlist: funnelMap[id]!.wishlist,
    cart: funnelMap[id]!.cart,
    order: funnelMap[id]!.order,
  })).sort((a, b) => b.wishlist - a.wishlist).slice(0, 10); 

  // Revenue & Units Sold by Category / Brand / Fabric
  const orderItems = await prisma.orderItem.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, quantity: true, unitPriceEgp: true },
  });

  const revUnitsInit = () => ({ revenue: 0, units: 0 });
  const categoryAgg: Record<string, ReturnType<typeof revUnitsInit>> = {};
  const brandAgg: Record<string, ReturnType<typeof revUnitsInit>> = {};
  const fabricAgg: Record<string, ReturnType<typeof revUnitsInit>> = {};

  orderItems.forEach(item => {
    const p = productDict[item.productId];
    if (!p) return;
    const rev = item.quantity * item.unitPriceEgp;
    
    if (!categoryAgg[p.category]) categoryAgg[p.category] = revUnitsInit();
    categoryAgg[p.category]!.revenue += rev;
    categoryAgg[p.category]!.units += item.quantity;

    if (!brandAgg[p.brand]) brandAgg[p.brand] = revUnitsInit();
    brandAgg[p.brand]!.revenue += rev;
    brandAgg[p.brand]!.units += item.quantity;

    if (!fabricAgg[p.fabric]) fabricAgg[p.fabric] = revUnitsInit();
    fabricAgg[p.fabric]!.revenue += rev;
    fabricAgg[p.fabric]!.units += item.quantity;
  });

  const toChartData = (agg: typeof categoryAgg) => Object.entries(agg).map(([name, data]) => ({
    name,
    revenue: parseFloat(data.revenue.toFixed(2)),
    units: data.units,
  })).sort((a, b) => b.revenue - a.revenue);

  const revenueData = {
    category: toChartData(categoryAgg),
    brand: toChartData(brandAgg),
    fabric: toChartData(fabricAgg),
  };

  // Stock Health by Category
  const stockHealthAgg: Record<string, { outOfStock: number; lowStock: number; healthy: number }> = {};
  products.forEach(p => {
    if (!stockHealthAgg[p.category]) stockHealthAgg[p.category] = { outOfStock: 0, lowStock: 0, healthy: 0 };
    if (p.stock === 0) stockHealthAgg[p.category]!.outOfStock++;
    else if (p.stock < 10) stockHealthAgg[p.category]!.lowStock++;
    else stockHealthAgg[p.category]!.healthy++;
  });

  const stockHealthData = Object.entries(stockHealthAgg).map(([category, data]) => ({
    category,
    ...data,
  }));

  // Rating vs Conversion
  const reviewAgg = await prisma.review.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds } },
    _avg: { rating: true },
  });

  const ratingMap = Object.fromEntries(
    reviewAgg.map(r => [r.productId, r._avg.rating || 0])
  );

  const ratingData = conversionData.map(c => ({
    productName: c.productName,
    conversion: c.conversion,
    rating: ratingMap[c.productId] ? parseFloat((ratingMap[c.productId] as number).toFixed(1)) : 0,
  })).filter(d => d.rating > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/80">
          Retailer Insights
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-950 leading-tight">
          Analytics & Performance
        </h1>
        <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">
          Track try-on conversions, product funnels, and revenue metrics. Data is aggregated from real customer interactions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <ConversionChart data={conversionData} />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
          <FunnelChart data={funnelData} />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "300ms" }}>
          <RevenueByDimensionChart data={revenueData} />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "400ms" }}>
          <StockHealthChart data={stockHealthData} />
        </div>
      </div>

      {ratingData.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: "500ms" }}>
          <RatingVsConversionChart data={ratingData} />
        </div>
      )}
    </div>
  );
}
