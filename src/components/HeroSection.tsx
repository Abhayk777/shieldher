'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Shield, ArrowRight, Sparkles } from 'lucide-react';
import styles from './HeroSection.module.css';

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <div className={styles.bgContainer}>
        <Image 
          src="/auratein.jpeg" 
          alt="Auratein Background" 
          fill 
          style={{ objectFit: 'cover' }} 
          priority 
        />
        <div className={styles.overlay} />
      </div>
      <div className={`container ${styles.content}`}>
        <div className={styles.badge}>
          <Sparkles size={14} />
          <span>AI-Powered Protection</span>
        </div>

        <h1 className={styles.title}>
          Your digital
          <br />
          <span className={styles.titleAccent}>safety shield.</span>
        </h1>

        <p className={styles.subtitle}>
          Upload chat screenshots and let our AI instantly analyze conversations
          for manipulation, threats, and harmful patterns. Stay informed, stay safe.
        </p>

        <div className={styles.actions}>
          <Link href="/auth" className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}>
            Start Analyzing
            <ArrowRight size={18} />
          </Link>
          <Link href="/#how-it-works" className={`${styles.heroBtn} ${styles.heroBtnSecondary}`}>
            How It Works
          </Link>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>10K+</span>
            <span className={styles.statLabel}>Screenshots Analyzed</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>98%</span>
            <span className={styles.statLabel}>Detection Accuracy</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>&lt;30s</span>
            <span className={styles.statLabel}>Analysis Time</span>
          </div>
        </div>
      </div>
    </section>
  );
}
