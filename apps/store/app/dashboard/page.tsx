export default function DashboardPage() {
  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1 style={{ color: "#1B3A4B", marginBottom: "16px" }}>Dashboard</h1>
      <div style={{ padding: "20px", background: "#E6FFFA", border: "1px solid #38A169", borderRadius: "8px", color: "#276749" }}>
        <strong>✅ Success!</strong> You have successfully logged in / signed up and have been redirected to the dashboard.
      </div>
      <p style={{ marginTop: "20px", color: "#4A5568" }}>
        Your authentication token is securely stored in an HTTP-only cookie.
      </p>
    </div>
  );
}
