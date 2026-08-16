import { getAdminSession } from "../../../lib/admin-auth";
import { prisma } from "../../../lib/prisma";
import { redirect } from "next/navigation";
import AdminPageHeader from "../components/AdminPageHeader";
import AdminStatCard from "../components/AdminStatCard";
import UsageChart from "./UsageChart";
import { SERVICES } from "../../../lib/service-keys";

export const metadata = {
  title: "Analytics | Manikan Admin",
};

export default async function AdminAnalyticsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  // Last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Queries
  const [
    dailyRollups,
    activeSubscriptions,
    totalSessions,
    totalProducts,
    retailersWithMostUsage
  ] = await Promise.all([
    prisma.serviceUsageDailyRollup.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' }
    }),
    prisma.subscription.groupBy({
      by: ['service'],
      where: { status: 'ACTIVE' },
      _count: { service: true }
    }),
    prisma.measurementSession.count(),
    prisma.product.count(),
    prisma.serviceUsageDailyRollup.groupBy({
      by: ['retailerId'],
      where: { date: { gte: thirtyDaysAgo } },
      _sum: { count: true },
      orderBy: { _sum: { count: 'desc' } },
      take: 5
    })
  ]);

  // Transform daily usage into Recharts format
  // We want a list of dates, and for each date, the count per service
  const dateMap: Record<string, any> = {};
  
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dStr = d.toISOString().substring(0, 10);
    dateMap[dStr] = { date: dStr, BODY_MODELING: 0, VTON_2D: 0, RECOMMENDATION: 0 };
  }

  for (const rollup of dailyRollups) {
    const dStr = new Date(rollup.date).toISOString().substring(0, 10);
    if (dateMap[dStr]) {
      dateMap[dStr][rollup.service] += rollup.count;
    }
  }

  const chartData = Object.values(dateMap);

  // Active subscriptions by service
  const subCounts = activeSubscriptions.reduce((acc, curr) => {
    acc[curr.service] = curr._count.service;
    return acc;
  }, {} as Record<string, number>);

  // Retailer details for top users
  const topRetailersIds = retailersWithMostUsage.map(r => r.retailerId);
  const topRetailersData = await prisma.retailer.findMany({
    where: { id: { in: topRetailersIds } },
    select: { id: true, storeName: true }
  });

  const donutData = topRetailersIds.map(id => {
    const retailer = topRetailersData.find(r => r.id === id);
    const usage = retailersWithMostUsage.find(r => r.retailerId === id)?._sum.count || 0;
    return { name: retailer?.storeName || 'Unknown', value: usage };
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <AdminPageHeader
        label="Platform Analytics"
        title="Service Usage"
        subtitle="Monitor platform-wide service consumption and metrics."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <AdminStatCard
          label="Total VTON Usage"
          value={chartData.reduce((acc, curr) => acc + curr.VTON_2D, 0).toLocaleString()}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          }
          delay={100}
        />
        <AdminStatCard
          label="Measurement Sessions"
          value={totalSessions.toLocaleString()}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          }
          delay={200}
          accent="gold"
        />
        <AdminStatCard
          label="Active Subscriptions"
          value={Object.values(subCounts).reduce((a, b) => a + b, 0).toLocaleString()}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          }
          delay={300}
          accent="green"
        />
        <AdminStatCard
          label="Products Indexed"
          value={totalProducts.toLocaleString()}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            </svg>
          }
          delay={400}
          accent="forest"
        />
      </div>

      <UsageChart chartData={chartData} donutData={donutData} />
    </div>
  );
}
