import Link from "next/link";
import { Button } from "@repo/ui/button";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>MANIKAN</div>
        <nav className={styles.nav}>
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a href="#contracts">API Docs</a>
        </nav>
        <Button className={styles.connectBtn}>
          Access Application
        </Button>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.title}>
            The Intelligent <span className={styles.highlight}>Virtual Try-On</span> Hub
          </h1>
          <p className={styles.description}>
            Empowering the future of fashion retail with accurate 3D body sizing, AI agents recommendation pipelines, and virtual fit previews.
          </p>
          <div className={styles.ctas}>
            <Link href="#services" className={styles.primary}>
              Explore Microservices
            </Link>
            <a href="/docs/api-contracts.md" className={styles.secondary}>
              Read API Contracts
            </a>
          </div>
        </section>

        <section id="services" className={styles.services}>
          <h2 className={styles.sectionTitle}>Our AI & 3D Core Services</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.icon}>🧍‍♂️</div>
              <h3>3D Body Service</h3>
              <p>Generates SMPL-compliant body models and outputs precise 3D body dimensions and mesh approximations.</p>
              <span className={styles.portLabel}>Port: 8001</span>
            </div>

            <div className={styles.card}>
              <div className={styles.icon}>🧠</div>
              <h3>Recommendation AI</h3>
              <p>LangGraph-driven intelligent agent that queries body dimensions and learns user fashion preferences.</p>
              <span className={styles.portLabel}>Port: 8002</span>
            </div>

            <div className={styles.card}>
              <div className={styles.icon}>👕</div>
              <h3>Virtual Try-On</h3>
              <p>Photorealistic generative virtual dressing room utilizing diffusion models backed by Replicate APIs.</p>
              <span className={styles.portLabel}>Port: 8003</span>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Manikan Graduation Project. All rights reserved.</p>
      </footer>
    </div>
  );
}
