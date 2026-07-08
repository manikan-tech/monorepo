import type { Metadata } from "next";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Manikan — Authentication",
  description:
    "Sign in or create your Manikan retailer account to access AI-powered virtual try-on and size recommendation tools.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.authContainer}>
      {/* ─── Left: Form Panel ──────────────────────────── */}
      <div className={styles.formPanel}>
        <div className={styles.formInner}>{children}</div>
      </div>

      {/* ─── Right: Hero Image Panel ───────────────────── */}
      <div className={styles.heroPanel}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <h2 className={styles.heroHeading}>
            Precision in every{" "}
            <span className={styles.heroAccent}>dimension</span>.
          </h2>
          <p className={styles.heroSubtext}>
            Experience the next generation of 3D virtual try-ons and body
            modeling.
          </p>
        </div>
      </div>
    </div>
  );
}
